// api/webhook.js
const { buffer } = require("micro");
const Stripe = require("stripe");
const { getAllVehicleData } = require("./services/vehicleData");
const { generateReport } = require("./services/reportGenerator");
const { sendEmail } = require("./services/emailService"); // using your direct-fetch version
const log = require("./services/logger").scope("Webhook");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // Verify Stripe signature
  let event;
  try {
    const sig = req.headers["stripe-signature"];
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, endpointSecret);
  } catch (err) {
    log.error("Stripe signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  log.info("Event:", event.type);

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;
    const vin = pi.metadata?.vin || "UNKNOWN";
    const email = pi.metadata?.email || pi.receipt_email || "noreply@carsaavy.com";

    log.info(`Payment success → VIN ${vin} → ${email}`);

    try {
      // 1) Vehicle data
      const vehicleData = await getAllVehicleData(vin);
      log.info("Vehicle data ready");

      // 2) Report
      const report = await generateReport(vehicleData);
      if (!report.success) {
        log.error("Report failed:", report.error);
        return res.status(200).json({ received: true, report: "failed" }); // acknowledge to Stripe
      }
      log.info("Report URL:", report.url);

      // 3) Email
      const emailResult = await sendEmail({
        to: email,
        subject: `Your CarSaavy Report for VIN ${vin}`,
        vin,
        reportUrl: report.url,
      });

      if (!emailResult?.success) {
        log.warn("Email send reported failure:", emailResult?.error);
      } else {
        log.info("Email sent, id:", emailResult.id || "n/a");
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      log.error("Unhandled error:", err.message);
      // Always 200 to Stripe once signature is valid; we’ll fix downstream separately
      return res.status(200).json({ received: true });
    }
  }

  // Other events are acknowledged but ignored
  return res.status(200).json({ received: true });
}

// CommonJS export + raw body for Stripe
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };