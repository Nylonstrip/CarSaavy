// api/create-payment.js

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { vin, email, listingUrl } = req.body;

    console.log("📩 Incoming create-payment request:", { vin, email, listingUrl });

    // ===== 1) BASIC FIELD CHECK =====
    if (!vin || !email || !listingUrl) {
      console.log("❌ Missing fields");
      return res.status(400).json({
        error: "VIN, email, and Cars.com URL are required."
      });
    }

    // ===== 2) LIGHTWEIGHT URL PATTERN VALIDATION (Option B) =====
    const urlPattern = /^https?:\/\/(www\.)?cars\.com\/vehicledetail\/[a-zA-Z0-9-]+\/?$/;

    if (!urlPattern.test(listingUrl)) {
      console.log("❌ URL failed lightweight validation:", listingUrl);
      return res.status(400).json({
        error: "Invalid Cars.com listing URL format. Please verify and try again."
      });
    }

    console.log("✅ Cars.com URL passed lightweight pattern validation.");

    // ===== 3) STRIPE PAYMENT INTENT CREATION =====
    console.log("💳 Creating Stripe payment intent...");

    const intent = await stripe.paymentIntents.create({
      amount: 1000, // $10.00
      currency: "usd",
      metadata: {
        vin,
        email,
        listingUrl
      },
    });

    console.log("✅ Payment intent created:", intent.id);

    // Return client secret to front-end
    return res.json({
      clientSecret: intent.client_secret
    });

  } catch (err) {
    console.error("❌ Error in create-payment:", err);
    return res.status(500).json({
      error: "Internal server error creating payment."
    });
  }
};
