const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

/**
 * Cars.com validation using ScraperAPI "fast mode"
 * Multi-signature detection to avoid false negatives.
 */
async function validateCarsDotComListing(url) {
  console.log("🔍 [ScraperAPI] Validating Cars.com listing...");

  const scraperUrl =
    `http://api.scraperapi.com/?api_key=${SCRAPER_API_KEY}` +
    `&url=${encodeURIComponent(url)}` +
    `&country=us&device=desktop&timeout=10000`;

  try {
    const resp = await fetch(scraperUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
      },
    });

    const html = await resp.text();

    // --- Multi-signature validation rules ---
    const hasEnoughContent = html && html.length > 5000;
    const hasNextData = html.includes("__NEXT_DATA__");
    const hasVIN = /"vin"\s*:/i.test(html);
    const hasTitle = /<h1[^>]*>/i.test(html);

    if (!hasEnoughContent) {
      console.log("⚠ HTML response too small — likely invalid listing");
      return false;
    }

    if (hasNextData || hasVIN || hasTitle) {
      console.log("✅ Listing validated: Cars.com signatures found.");
      return true;
    }

    console.log("⚠ Listing loaded but no recognizable Cars.com signals found.");
    return false;
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
    // 1️⃣ Validate required fields
    //-----------------------------------------------------------
    if (!vin || !email || !listingUrl) {
      return res.status(400).json({
        error: "VIN, email, and Cars.com URL are required.",
      });
    }

    //-----------------------------------------------------------
    // 2️⃣ Fast domain validation
    //-----------------------------------------------------------
    if (!listingUrl.startsWith("https://www.cars.com/")) {
      return res.status(400).json({
        error: "Please provide a valid Cars.com listing URL.",
      });
    }

    const normalizedUrl = listingUrl.trim();

    //-----------------------------------------------------------
    // 3️⃣ Validate via ScraperAPI
    //-----------------------------------------------------------
    console.log("🔍 Validating Cars.com listing via ScraperAPI...");

    const valid = await validateCarsDotComListing(normalizedUrl);

    if (!valid) {
      console.log("❌ Listing failed validation.");
      return res.status(400).json({
        error:
          "This Cars.com listing could not be validated. It may be removed or unavailable.",
      });
    }

    console.log("✅ Cars.com listing passed validation.");

    //-----------------------------------------------------------
    // 4️⃣ Create Stripe Payment Intent
    //-----------------------------------------------------------
    console.log("💳 Creating Stripe payment intent...");

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 2000, // $20 — adjust anytime
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        vin,
        email,
        url: normalizedUrl,
      },
    });

    console.log("✅ Payment intent created:", paymentIntent.id);

    //-----------------------------------------------------------
    // 5️⃣ Return clientSecret to VIN tool
    //-----------------------------------------------------------
    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    console.error("❌ create-payment error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};
