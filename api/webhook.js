// api/webhook.js
const { buffer } = require("micro");
const Stripe = require("stripe");
const { getAllVehicleData } = require("./services/vehicleData");
const { generateReport } = require("./services/reportGenerator");
const { sendEmail } = require("./services/emailService");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  let event;
  try {
    const buf = await buffer(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(buf, sig, endpointSecret);
  } catch (err) {
    console.error("❌ [Webhook] Stripe signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("💳 [Webhook] Event received:", event.type);

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    const vin = paymentIntent.metadata?.vin || "UNKNOWN";
    const email = paymentIntent.receipt_email || "noreply@carsaavy.com";

    console.log(`🚀 [Webhook] Payment succeeded for VIN ${vin} → ${email}`);

    try {
      console.log("🛰️ [Webhook] Fetching vehicle data...");
      const vehicleData = await getAllVehicleData(vin);
      console.log("🛰️ [Webhook] Vehicle data fetch complete: Received ✅");

      console.log("🧾 [Webhook] Generating report...");
      const report = await generateReport(vehicleData);

      if (!report.success) {
        console.error("❌ [Webhook] Report generation returned error:", report.error);
        return res.status(500).json({ success: false, message: "Report generation failed" });
      }

      console.log("📦 [Webhook] Report result:", report.url);

      console.log("📧 [Webhook] Sending email...");
      const emailResult = await sendEmail({
        to: email,
        subject: `Your CarSaavy Report for VIN ${vin}`,
        vin,
        reportUrl: report.url,
      });

      console.log("✅ [Webhook] Email result:", emailResult);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("🔥 [Webhook] Unhandled error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  } else {
    console.log(`⚠️ [Webhook] Ignored event type: ${event.type}`);
  }

  return res.status(200).send("OK");
}

// ✅ CommonJS-compatible export
module.exports = handler;
module.exports.config = {
  api: { bodyParser: false },
};