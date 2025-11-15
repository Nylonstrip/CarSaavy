// /api/webhook.js
const logger = require("./services/logger");
const { getAllVehicleData } = require("./services/vehicleData");
const { generateVehicleReport } = require("./services/reportGenerator");
const { sendVehicleReportEmail, sendAdminAlert } = require("./services/emailService");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "carsaavy@gmail.com";

// basic in-memory IP rate limit for webhook: 60 hits / 10 min
const ipWindow = new Map();
function checkIpRateLimit(ip) {
  const WINDOW_MS = 10 * 60 * 1000;
  const LIMIT = 60;
  const now = Date.now();
  const entry = ipWindow.get(ip) || { count: 0, start: now };
  if (now - entry.start > WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  ipWindow.set(ip, entry);
  return entry.count <= LIMIT;
}

module.exports = async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";

  try {
    if (req.method !== "POST") {
      logger.info(`[Webhook] ${req.method} ignored from ${ip}`);
      return res.status(200).json({ received: true });
    }

    if (!checkIpRateLimit(ip)) {
      logger.warn(`[Webhook] IP rate limit exceeded: ${ip}`);
      sendAdminAlert(ADMIN_EMAIL, "Webhook rate limit triggered", `<p>IP: ${ip}</p>`).catch(() => {});
      return res.status(200).json({ received: true });
    }

    const event = req.body;

    if (!event || !event.type || !event.data?.object) {
      logger.warn("[Webhook] Malformed event body");
      sendAdminAlert(ADMIN_EMAIL, "Malformed webhook", `<pre>${JSON.stringify(event || {}, null, 2)}</pre>`).catch(() => {});
      return res.status(200).json({ received: true });
    }

    logger.info(`[Webhook] Event received: ${event.type}`);

    // 👉 NEW: Listen for checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // Stripe Checkout stores metadata on the session
      const vin = session.metadata?.vin;
      const email = session.customer_email || session.metadata?.email;
      const tier = session.metadata?.tier || "basic";

      if (!vin || !email) {
        const msg = `Missing VIN or email in Checkout Session metadata`;
        logger.warn(`[Webhook] ${msg}`);
        sendAdminAlert(ADMIN_EMAIL, msg, `<pre>${JSON.stringify(session, null, 2)}</pre>`).catch(() => {});
        return res.status(200).json({ received: true });
      }

      logger.info(`[Webhook] Checkout completed → VIN ${vin} → ${email}`);

      // 1) Fetch vehicle data
      logger.info("[Webhook] Fetching vehicle data…");
      const data = await getAllVehicleData(vin);
      if (!data || data.error) {
        logger.error("[Webhook] Vehicle data fetch failed");
        sendAdminAlert(ADMIN_EMAIL, "Vehicle data fetch failed", `<p>VIN: ${vin}</p>`).catch(() => {});
        return res.status(200).json({ received: true });
      }

      // 2) Generate PDF
      logger.info("[Webhook] Generating PDF report…");
      const reportUrl = await generateVehicleReport(vin, data);
      if (!reportUrl) {
        logger.error("[Webhook] Report generation failed");
        sendAdminAlert(ADMIN_EMAIL, "Report generation failed", `<p>VIN: ${vin}</p>`).catch(() => {});
        return res.status(200).json({ received: true });
      }

      logger.info(`[Webhook] Report uploaded: ${reportUrl}`);

      // 3) Email report
      logger.info("[Webhook] Sending email to user…");
      const emailResult = await sendVehicleReportEmail(email, vin, reportUrl);

      if (!emailResult?.success) {
        logger.warn(`[Webhook] Email failed → ${email}`);
        sendAdminAlert(ADMIN_EMAIL, "Email delivery failed", `<p>${email}</p><p>${vin}</p>`).catch(() => {});
      } else {
        logger.info(`[Webhook] Report emailed to ${email}`);
      }

      return res.status(200).json({ success: true });
    }

    // Ignore all other events
    logger.info(`[Webhook] Ignored event type ${event.type}`);
    return res.status(200).json({ received: true });

  } catch (err) {
    logger.error(`[Webhook] Unhandled Error: ${err.message}`);
    sendAdminAlert(ADMIN_EMAIL, "Webhook unhandled error", `<pre>${err.stack || err}</pre>`).catch(() => {});
    return res.status(200).json({ received: true });
  }
};
