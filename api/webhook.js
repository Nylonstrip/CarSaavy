const Stripe = require("stripe");
const { buffer } = require("micro");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const fetch = require("node-fetch");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    // 1️⃣ Verify Stripe signature
    const sig = req.headers["stripe-signature"];
    const buf = await buffer(req);
    const event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);

    console.log(`💳 [Webhook] Event received: ${event.type}`);

    // 2️⃣ Handle specific event types
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      const vin = paymentIntent.metadata?.vin;
      const email = paymentIntent.metadata?.email;

      if (!vin || !email) {
        console.warn("⚠️ [Webhook] Missing VIN or email in metadata, skipping report generation.");
        return res.status(400).json({ success: false, message: "Missing metadata" });
      }

      console.log(`🚀 [Webhook] Payment succeeded — generating report for VIN ${vin}, sending to ${email}`);

      // 3️⃣ Build absolute URL safely (prevents 307 redirects)
      const baseUrl =
        process.env.VERCEL_URL?.startsWith("http")
          ? process.env.VERCEL_URL
          : `https://${process.env.VERCEL_URL}`;

      const response = await fetch(`${baseUrl}/api/generate-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, email }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [Webhook] Report generation failed (${response.status}):`, errorText);
        return res.status(response.status).json({ success: false, message: "Report generation failed" });
      }

      console.log("✅ [Webhook] Report generation triggered successfully.");
    } else {
      console.log(`ℹ️ [Webhook] Ignored event type: ${event.type}`);
    }

    // 4️⃣ Always respond quickly to Stripe
    res.json({ received: true });
  } catch (err) {
    console.error("❌ [Webhook] Error processing event:", err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
};

// Disable default body parsing so we can verify signatures
export const config = {
  api: {
    bodyParser: false,
  },
};