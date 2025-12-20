// api/create-payment.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

function normalizeStr(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function normalizePrice(v) {
  if (v === undefined || v === null) return "";
  const s = String(v).trim().replace(/[$,]/g, "");
  if (!s) return "";
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : "";
}

module.exports = async (req, res) => {
  try {
    console.log("📩 Incoming create-payment request:", req.body);

    const {
      email,
      vin,
      year,
      make,
      model,
      segment,
      trimTier,
      mileage,
      askingPrice,
    } = req.body;

    // ----------------------------
    // 1️⃣ Required checks (NIC_v2)
    // ----------------------------
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required." });
    }

    // At minimum, we need vehicle identity (VIN OR Y/M/M)
    const hasVin = typeof vin === "string" && vin.trim().length >= 6;
    const hasYMM = year && make && model;

    if (!hasVin && !hasYMM) {
      return res.status(400).json({
        error: "Vehicle information is required (VIN or Year/Make/Model).",
      });
    }

    // ----------------------------
    // 2️⃣ Normalize metadata
    // ----------------------------
    const metadata = {
      email: normalizeStr(email).toLowerCase(),
      vin: normalizeStr(vin).toUpperCase(),
      year: normalizeStr(year),
      make: normalizeStr(make),
      model: normalizeStr(model),
      segment: normalizeStr(segment),
      trimTier: normalizeStr(trimTier),
      mileage: normalizeStr(mileage),
      askingPrice: normalizePrice(askingPrice),
    };

    // ----------------------------
    // 3️⃣ Single MVP price
    // ----------------------------
    const priceInCents = 1500; // $15.00

    // ----------------------------
    // 4️⃣ Base URL
    // ----------------------------
    const baseUrl =
      process.env.NODE_ENV === "production"
        ? "https://www.carsaavy.com"
        : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

    // ----------------------------
    // 5️⃣ Create Stripe Checkout Session
    // ----------------------------
    console.log("💳 Creating Stripe Checkout Session...");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: metadata.email,

      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: priceInCents,
            product_data: {
              name: "CarSaavy Negotiation Readiness Report",
              description:
                "A negotiation-focused report to help you reduce overpricing and avoid costly mistakes",
            },
          },
          quantity: 1,
        },
      ],

      // 🔒 Canonical metadata (used by webhook)
      payment_intent_data: {
        metadata,
      },

      // Optional mirror for debugging
      metadata,

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
