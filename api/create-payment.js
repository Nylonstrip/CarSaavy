// api/create-payment.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

function normalizePrice(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(/[$,]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

module.exports = async (req, res) => {
  try {
    console.log("📩 Incoming create-payment request:", req.body);

    const { vin, email, askingPrice } = req.body;

    // ----------------------------
    // 1️⃣ Required checks (PIC_v1)
    // ----------------------------
    if (!vin || typeof vin !== "string") {
      return res.status(400).json({ error: "VIN is required." });
    }

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required." });
    }

    const normalizedAskingPrice = normalizePrice(askingPrice);

    // ----------------------------
    // 2️⃣ Single MVP price
    // ----------------------------
    const priceInCents = 1500; // $15.00 — one product, one price

    // ----------------------------
    // 3️⃣ Base URL
    // ----------------------------
    const baseUrl =
      process.env.NODE_ENV === "production"
        ? "https://www.carsaavy.com"
        : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

    // ----------------------------
    // 4️⃣ Create Stripe Checkout Session
    // ----------------------------
    console.log("💳 Creating Stripe Checkout Session...");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,

      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: priceInCents,
            product_data: {
              name: "CarSaavy Vehicle Market Report",
              description:
                "Market-based valuation and negotiation strategy for your vehicle",
            },
          },
          quantity: 1,
        },
      ],

      // 🔒 This metadata MUST match webhook expectations
      payment_intent_data: {
        metadata: {
          vin: vin.trim().toUpperCase(),
          email: email.trim().toLowerCase(),
          price:
            normalizedAskingPrice !== null
              ? String(normalizedAskingPrice)
              : "",
        },
      },

      // Optional: mirrored on session for debugging
      metadata: {
        vin: vin.trim().toUpperCase(),
        email: email.trim().toLowerCase(),
        price:
          normalizedAskingPrice !== null
            ? String(normalizedAskingPrice)
            : "",
      },

      success_url: `${baseUrl}/success`,
      cancel_url: `${baseUrl}/cancel`,
    });

    console.log("✅ Checkout session created:", session.id);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("❌ create-payment error:", err);
    return res.status(500).json({
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development"
          ? err.message
          : undefined,
    });
  }
};
