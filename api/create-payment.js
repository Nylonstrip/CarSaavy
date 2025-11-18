// /api/create-payment.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // CORS headers (optional but okay)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { vin, email } = req.body;

    if (!vin || !email) {
      return res.status(400).json({ error: "VIN and email are required" });
    }

    // Validate VIN format
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
      return res.status(400).json({ error: "Invalid VIN format" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // ---- CREATE CHECKOUT SESSION ----
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],

      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: 2000, // $20
            product_data: {
              name: `VIN Report for ${vin.toUpperCase()}`,
            },
          },
          quantity: 1,
        },
      ],

      // This metadata MUST exist — your webhook depends on it
      metadata: { vin: vin.toUpperCase(), email },

      customer_email: email,

      success_url: "https://www.carsaavy.com/vin?status=success",
      cancel_url: "https://www.carsaavy.com/vin?status=cancel",
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Checkout Session Error:", error);
    return res.status(500).json({
      error: "Failed to create checkout session",
      message: error.message,
    });
  }
};
