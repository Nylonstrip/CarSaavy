// api/create-payment.js

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  try {
    console.log("📩 Incoming create-payment request:", req.body);

    let { vin, email, listingUrl, reportType } = req.body;

    // Default reportType for safety
    reportType = reportType || "specified";

    // ----------------------------
    // 1️⃣ Basic required checks
    // ----------------------------
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    if (reportType === "specified") {
      if (!vin || !listingUrl) {
        return res.status(400).json({
          error: "VIN and listing URL are required for a specified report.",
        });
      }
    } else {
      // General report: normalize fields so backend is happy
      vin = "GENERAL-REPORT";
      listingUrl = "N/A";
    }

    // ----------------------------
    // 2️⃣ Validate Cars.com URL format (specified only)
    // ----------------------------
    console.log("🔍 Validating Cars.com URL...");

    const carsRegex = /^https:\/\/www\.cars\.com\/vehicledetail\/[a-zA-Z0-9-]+\/*$/;

    if (reportType === "specified") {
      if (!carsRegex.test(listingUrl)) {
        console.log("❌ URL failed lightweight validation:", listingUrl);
        return res.status(400).json({
          error:
            "Invalid Cars.com URL format. Please provide a direct Cars.com vehicle listing link.",
        });
      }

      console.log("✅ Cars.com URL passed lightweight validation.");
    }

    // ----------------------------
    // 3️⃣ Dynamic Pricing
    // ----------------------------
    let priceInCents;

    if (reportType === "general") {
      priceInCents = 1500; // $15.00
    } else if (reportType === "specified") {
      priceInCents = 1800; // $18.00
    } else {
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

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name:
                reportType === "general"
                  ? "CarSaavy General Market Report"
                  : "CarSaavy Specified Vehicle Report",
              description:
                reportType === "general"
                  ? "General negotiation strategy and market insights"
                  : "Vehicle-specific negotiation analysis with listing insights",
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        },
      ],

      // ✅ CRITICAL — metadata MUST be on the payment intent
      payment_intent_data: {
        metadata: { vin, email, listingUrl, reportType },
      },

      // Also include on session (optional but helpful for debugging)
      metadata: { vin, email, listingUrl, reportType },

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
