// api/webhook.js
const Stripe = require("stripe");
const { buffer } = require("micro");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Internal service imports
const { getAllVehicleData } = require("./services/vehicleData");
const { createReport } = require("./services/reportGenerator");
const { sendEmail } = require("./services/emailService");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const sig = req.headers["stripe-signature"];
    const buf = await buffer(req);

    const event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log(`💳 [Webhook] Event received: ${event.type}`);

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      const vin = paymentIntent.metadata?.vin;
      const email = paymentIntent.metadata?.email;

      if (!vin || !email) {
        console.warn("⚠️ [Webhook] Missing VIN or email in metadata.");
        return res.json({ received: true });
      }

      console.log(`🚀 [Webhook] Payment succeeded for VIN ${vin} → ${email}`);
      res.json({ received: true }); // respond immediately to Stripe

      // Background report + email processing
      (async () => {
        try {
          console.log("🛰️ [Webhook] Fetching vehicle data...");
          const vehicleData = await getAllVehicleData(vin);
          console.log(
            "🛰️ [Webhook] Vehicle data result:",
            vehicleData && Object.keys(vehicleData).length > 0 ? "Received ✅" : "Missing ❌"
          );

          if (!vehicleData || !vehicleData.sections) {
            throw new Error("Vehicle data retrieval returned empty or invalid data");
          }

          console.log("🧾 [Webhook] Generating report...");
          const reportResult = await createReport(vehicleData);
          console.log("📦 [Webhook] Report result:", reportResult);

          if (!reportResult || !reportResult.hostedUrl) {
            throw new Error("Report generation failed or no hosted URL returned");
          }

          console.log("📧 [Webhook] Sending email...");
          const isLink = Boolean(reportResult.hostedUrl);
          const sendResult = await sendEmail(
            email,
            reportResult.hostedUrl,
            isLink,
            vin,
            reportResult.hostedUrl
          );

          console.log("✅ [Webhook] Email sent successfully:", sendResult);
        } catch (err) {
          console.error("❌ [Webhook] Background processing failed:", err);
        }
      })();

      return;
    }

    console.log(`ℹ️ [Webhook] Ignored event type: ${event.type}`);
    return res.json({ received: true });
  } catch (err) {
    console.error("❌ [Webhook] Error processing event:", err);
    return res.status(400).json({ success: false, error: err.message });
  }
};

// Required for Stripe webhook signature verification
module.exports.config = {
  api: {
    bodyParser: false,
  },
};