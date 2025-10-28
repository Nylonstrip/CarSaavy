// /api/webhook.js
const logger = require("./services/logger");
const { getAllVehicleData } = require("./services/vehicleData");
const { generateVehicleReport } = require("./services/reportGenerator");
const { sendVehicleReportEmail, sendAdminAlert } = require("./services/emailService");

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
    // method guard
    if (req.method !== "POST") {
      logger.info(`[Webhook] ${req.method} ignored from ${ip}`);
      return res.status(200).json({ received: true });
    }

    // ip rate limit
    if (!checkIpRateLimit(ip)) {
      logger.warn(`[Webhook] IP rate limit exceeded: ${ip}`);
      // best-effort alert, don't block
      sendAdminAlert(ADMIN_EMAIL, "Webhook IP rate limit", `<p>IP: ${ip}</p>`).catch(() => {});
      return res.status(200).json({ received: true }); // 200 so Stripe doesn't retry storm
    }

    const event = req.body;
    if (!event || !event.type || !event.data || !event.data.object) {
      logger.warn("[Webhook] Malformed event body");
      sendAdminAlert(ADMIN_EMAIL, "Malformed Stripe webhook", `<pre>${JSON.stringify(event || {}, null, 2)}</pre>`).catch(() => {});
      return res.status(200).json({ received: true });
    }

    logger.info(`[Webhook] Event: ${event.type}`);

    if (event.type !== "payment_intent.succeeded") {
      logger.info(`[Webhook] Ignored type: ${event.type}`);
      return res.status(200).json({ received: true });
    }

    const paymentIntent = event.data.object;
    const vin = paymentIntent?.metadata?.vin;
    const email = paymentIntent?.metadata?.email;

    if (!vin || !email) {
      const msg = "Missing VIN or email in payment metadata";
      logger.warn(`[Webhook] ${msg}`);
      sendAdminAlert(ADMIN_EMAIL, "Missing metadata in payment", `<p>${msg}</p><pre>${JSON.stringify(paymentIntent?.metadata || {}, null, 2)}</pre>`).catch(() => {});
      return res.status(200).json({ received: true }); // 200 so Stripe doesn't hammer retries
    }

    logger.info(`[Webhook] Payment success → VIN ${vin} → ${email}`);

    // 1) vehicle data
    logger.info("[Webhook] Fetching vehicle data…");
    const data = await getAllVehicleData(vin);
    if (!data || data.error) {
      logger.error("[Webhook] Vehicle data fetch failed");
      sendAdminAlert(ADMIN_EMAIL, "Vehicle data fetch failed (webhook)", `<p>VIN: ${vin}</p>`).catch(() => {});
      return res.status(200).json({ received: true });
    }

    // 2) report
    logger.info("[Webhook] Generating report…");
    const reportUrl = await generateVehicleReport(vin, data);
    if (!reportUrl) {
      logger.error("[Webhook] Report generation returned no URL");
      sendAdminAlert(ADMIN_EMAIL, "Report generation failed", `<p>VIN: ${vin}</p>`).catch(() => {});
      return res.status(200).json({ received: true });
    }
    logger.info(`[Webhook] Report URL: ${reportUrl}`);

    // 3) email to user
    logger.info("[Webhook] Emailing user…");
    const emailResult = await sendVehicleReportEmail(email, vin, reportUrl);
    if (!emailResult?.success) {
      logger.warn(`[Webhook] Email delivery failed for ${email}`);
      sendAdminAlert(ADMIN_EMAIL, "Email delivery failed", `<p>VIN: ${vin}</p><p>To: ${email}</p>`).catch(() => {});
      // still return 200 to Stripe to avoid retries
    } else {
      logger.info(`[Webhook] Email sent → ${email}`);
    }

    return res.status(200).json({ success: true, vin, email, reportUrl });
  } catch (err) {
    logger.error(`[Webhook] Unhandled: ${err.message}`);
    sendAdminAlert(ADMIN_EMAIL, "Webhook unhandled error", `<pre>${(err && err.stack) || err}</pre>`).catch(() => {});
    // always 200 to Stripe—to prevent retry storms if issue is on our side
    return res.status(200).json({ received: true });
  }
};
