// api/create-payment.js

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  try {
    console.log("📩 Incoming create-payment request:", req.body);

    let { email, year, make, model, trim, mileage, price } = req.body;

    // ----------------------------
    // 1️⃣ Basic required checks
    // ----------------------------
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    // ----------------------------
    // 3️⃣ Dynamic Pricing
    // ----------------------------
    let priceInCents;
    const reportType = "general";



    if (reportType === "general") {
      priceInCents = 1500; // $15.00
    }else {
      // Fallback safety (shouldn't normally hit)
      priceInCents = 1500;
    }

    // ----------------------------
    // 4️⃣ Create Stripe Checkout Session
    // ----------------------------
    console.log("💳 Creating Stripe Checkout Session...");

    const baseUrl =
      process.env.NODE_ENV === "production"
        ? "https://www.carsaavy.com"
        : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,

      name: "CarSaavy Market Negotiation Report",
      description: "Negotiation strategy and market insights based on your vehicle details",
      


      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "CarSaavy Market Negotiation Report",
              description: "Negotiation strategy and market insights based on your vehicle details",
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        },
      ],

      // ✅ CRITICAL — metadata MUST be on the payment intent
      payment_intent_data: {
        metadata: { email, year, make, model, trim, mileage, price },
      },

      // Also include on session (optional but helpful for debugging)
      metadata: { email, year, make, model, trim, mileage, price  },

      success_url: `${baseUrl}/success`,
      cancel_url: `${baseUrl}/cancel`,
    });

    console.log("✅ Checkout session created:", session.id);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("❌ create-payment error:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
};
