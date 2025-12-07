const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

/**
 * ScraperAPI Fast Validation:
 * - Confirms the Cars.com listing actually loads.
 * - Much faster & more reliable than direct fetch().
 * - Costs ~5 credits per validation (cheap + safe).
 */
async function validateCarsDotComListing(listingUrl) {
  console.log("🔍 [ScraperAPI] Validating listing...");

  const fastUrl =
    `http://api.scraperapi.com/?api_key=${SCRAPER_API_KEY}` +
    `&url=${encodeURIComponent(listingUrl)}` +
    `&country=us&device=desktop&timeout=10000`;

  try {
    const response = await fetch(fastUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
      },
    });

    const html = await response.text();

    // Basic sanity check: Cars.com listings always contain window.__PRELOADED_STATE__
    if (!html || html.length < 5000) {
      console.log("⚠ Listing HTML too small — likely invalid.");
      return false;
    }

    if (!html.includes("__PRELOADED_STATE__")) {
      console.log("⚠ Could not find Cars.com data block — invalid or removed listing.");
      return false;
    }

    console.log("✅ [ScraperAPI] Listing validated successfully.");
    return true;
  } catch (err) {
    console.log("❌ ScraperAPI validation error:", err.message);
    return false;
  }
}

module.exports = async function handler(req, res) {
  try {
    console.log("📩 Incoming create-payment request:", req.body);

    const { vin, email, listingUrl } = req.body;

    //-----------------------------------------------------------
    // 1️⃣ Required fields check
    //-----------------------------------------------------------
    if (!vin || !email || !listingUrl) {
      return res.status(400).json({
        error: "VIN, email, and Cars.com URL are required.",
      });
    }

    //-----------------------------------------------------------
    // 2️⃣ Domain enforcement (cheap + fast)
    //-----------------------------------------------------------
    if (!listingUrl.startsWith("https://www.cars.com/")) {
      return res.status(400).json({
        error: "Please provide a valid Cars.com listing URL.",
      });
    }

    const normalizedUrl = listingUrl.trim();

    //-----------------------------------------------------------
    // 3️⃣ Validate the Cars.com URL using ScraperAPI
    //-----------------------------------------------------------
    console.log("🔍 Validating Cars.com listing via ScraperAPI...");

    const isValidListing = await validateCarsDotComListing(normalizedUrl);

    if (!isValidListing) {
      console.log("❌ Listing failed validation.");
      return res.status(400).json({
        error:
          "This Cars.com listing could not be validated. The vehicle may be sold, removed, or unavailable.",
      });
    }

    console.log("✅ Cars.com listing passed validation.");

    //-----------------------------------------------------------
    // 4️⃣ Create Stripe PaymentIntent
    //-----------------------------------------------------------
    console.log("💳 Creating Stripe payment intent...");

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 2000, // $20 — adjust later if needed
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        vin,
        email,
        url: normalizedUrl, // required for webhook
      },
    });

    console.log("✅ Payment intent created:", paymentIntent.id);

    //-----------------------------------------------------------
    // 5️⃣ Return client secret to frontend
    //-----------------------------------------------------------
    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("❌ create-payment error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};
