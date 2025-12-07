// api/create-payment.js

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  try {
    console.log("📩 Incoming create-payment request:", req.body);

    const { vin, email, listingUrl } = req.body;

    // ----------------------------
    // 1️⃣ Basic required checks
    // ----------------------------
    if (!vin || !email || !listingUrl) {
      return res.status(400).json({ error: "VIN, email, and listing URL are required." });
    }

    // ----------------------------
    // 2️⃣ Validate Cars.com URL format
    // ----------------------------
    console.log("🔍 Validating Cars.com URL...");

    const carsRegex = /^https:\/\/www\.cars\.com\/vehicledetail\/[a-zA-Z0-9-]+\/*$/;

    if (!carsRegex.test(listingUrl)) {
      console.log("❌ URL failed lightweight validation:", listingUrl);
      return res.status(400).json({
        error: "Invalid Cars.com URL format. Please provide a direct Cars.com vehicle listing link.",
      });
    }

    console.log("✅ Cars.com URL passed lightweight validation.");

    // ----------------------------
    // 3️⃣ Create Stripe Checkout Session
    // ----------------------------
    console.log("💳 Creating Stripe Checkout Session...");

    const baseUrl = process.env.NODE_ENV === "production"
      ? "https://www.carsaavy.com"
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "CarSaavy Vehicle Report",
              description: "Full negotiation-ready vehicle analysis",
            },
            unit_amount: 1500, // $15.00
          },
          quantity: 1,
        },
      ],

      // ✅ CRITICAL — metadata MUST be put here for Stripe to pass to payment_intent
      payment_intent_data: {
        metadata: {
          vin,
          email,
          listingUrl,
        },
      },

      // Also include on session (optional but helps debugging)
      metadata: {
        vin,
        email,
        listingUrl,
      },

      success_url: `${baseUrl}/success`,
      cancel_url: `${baseUrl}/cancel`,
    });

    console.log("✅ Checkout session created:", session.id);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("❌ create-payment error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
};
