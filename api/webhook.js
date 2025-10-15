// /api/webhook.js

/**
 * Stripe Webhook - Triggers report generation when payment succeeds.
 * Securely validates Stripe's signature and auto-calls /api/generate-report.
 */

const Stripe = require('stripe');
const fetch = require('node-fetch');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  console.log("⚡ [Webhook] Stripe event received");

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ [Webhook] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 🔹 Handle successful payments
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const vin = paymentIntent.metadata?.vin;
    const email = paymentIntent.metadata?.email;

    console.log(`💰 [Webhook] Payment confirmed for VIN: ${vin}, Email: ${email}`);

    if (vin && email) {
      try {
        // ✅ Call your internal API to generate and send the report
        const response = await fetch(`${process.env.VERCEL_URL}/api/generate-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vin, email }),
        });

        if (!response.ok) {
          console.error("❌ [Webhook] Failed to trigger report API:", await response.text());
        } else {
          console.log(`✅ [Webhook] Report generation triggered for VIN ${vin}`);
        }
      } catch (error) {
        console.error("🔥 [Webhook] Error calling /api/generate-report:", error);
      }
    } else {
      console.warn("⚠️ [Webhook] Payment missing VIN or email metadata");
    }
  } else {
    console.log(`ℹ️ [Webhook] Ignored event type: ${event.type}`);
  }

  // Always acknowledge receipt of the event
  res.json({ received: true });
};

// 🔧 Helper: collect raw body for Stripe signature validation
async function buffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}