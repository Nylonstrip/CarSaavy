// api/webhook.js
const Stripe = require("stripe");
const { buffer } = require("micro");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Import your internal services directly
const { generateVehicleData } = require("./services/vehicleData");
const { createReport } = require("./services/reportGenerator");
const { sendEmail } = require("./services/emailService");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  // Disable body parsing in Vercel config (keep at bottom of file)
  try {
    const sig = req.headers["stripe-signature"];
    const buf = await buffer(req);
    const event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);

    console.log(`💳 [Webhook] Event received: ${event.type}`);

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      const vin = paymentIntent.metadata?.vin;
      const email = paymentIntent.metadata?.email;

      if (!vin || !email) {
        console.warn("⚠️ [Webhook] Missing VIN or email in metadata.");
        // respond 200 anyway so Stripe doesn't retry endlessly for bad metadata
        res.json({ received: true });
        return;
      }

      console.log(`🚀 [Webhook] Payment succeeded for VIN ${vin} -> scheduling report generation for ${email}`);

      // Respond immediately to Stripe to avoid retries/timeout
      res.json({ received: true });

      // Process in background (async, not awaited)
      (async () => {
        try {
          // 1) Fetch vehicle data
          const vehicleData = await generateVehicleData(vin);
          if (!vehicleData) throw new Error("Vehicle data retrieval failed");

          // 2) Create report (PDF + hosted link)
          const reportPaths = await createReport(vehicleData);
          const hostedUrl = reportPaths.hostedUrl || null;
          const pdfPath = reportPaths.pdfPath || null;

          // 3) Send email (sendEmail handles PDF attach vs link)
          const reportFile = hostedUrl || pdfPath;
          const isLink = Boolean(hostedUrl);
          const sendResult = await sendEmail(email, reportFile, isLink, vin, hostedUrl);

          console.log("✅ [Webhook] Background processing complete", { vin, email, sendResult });
        } catch (bgErr) {
          console.error("❌ [Webhook] Background processing error:", bgErr);
          // optionally: push to a retry queue or notify you by mail/slack
        }
      })();
      return; // early return after scheduling background work
    } else {
      console.log(`ℹ️ [Webhook] Ignored event type: ${event.type}`);
      return res.json({ received: true });
    }
  } catch (err) {
    console.error("❌ [Webhook] Error processing event:", err);
    // reply 400 to Stripe for signature/parse errors
    return res.status(400).json({ success: false, error: err.message });
  }
};

// Ensure Vercel doesn't parse the body (required for signature verify)
module.exports.config = {
  api: {
    bodyParser: false,
  },
};