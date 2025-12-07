// api/create-payment.js
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { vin, email, listingUrl } = req.body;

    console.log("📩 Incoming create-payment request:", { vin, email, listingUrl });

    // -----------------------------------------------------------
    // 1️⃣ Require VIN + email
    // -----------------------------------------------------------
    if (!vin || !email) {
      console.log("❌ Missing VIN or email");
      return res.status(400).json({
        error: "VIN and email are required."
      });
    }

    // -----------------------------------------------------------
    // 2️⃣ Require Cars.com URL
    // -----------------------------------------------------------
    if (!listingUrl) {
      console.log("❌ Missing Cars.com URL");
      return res.status(400).json({
        error: "A Cars.com listing URL is required."
      });
    }

    // -----------------------------------------------------------
    // 3️⃣ Validate Cars.com domain format
    // -----------------------------------------------------------
    const isCarsDotCom = /^https?:\/\/(www\.)?cars\.com\/vehicledetail\//i.test(listingUrl);

    if (!isCarsDotCom) {
      console.log("❌ Invalid listing domain:", listingUrl);
      return res.status(400).json({
        error: "Only Cars.com vehicle listing URLs are supported."
      });
    }

    // -----------------------------------------------------------
    // 4️⃣ Lightweight Cars.com URL check (GET with timeout)
    // -----------------------------------------------------------
    async function validateCarsUrl(url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      try {
        const response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36"
          }
        });

        clearTimeout(timeout);

        // Accept 200–399 as "alive"
        if (response.status >= 200 && response.status < 400) {
          return true;
        }

        console.log("⚠ Cars.com returned non-OK status:", response.status);
        return false;
      } catch (err) {
        console.error("❌ Cars.com URL validation failed:", err);
        return false;
      }
    }

    console.log("🔍 Validating Cars.com URL...");
    const urlIsValid = await validateCarsUrl(listingUrl);

    if (!urlIsValid) {
      return res.status(400).json({
        error: "Invalid or unreachable Cars.com listing. Please double-check the URL."
      });
    }

    console.log("✅ Cars.com URL validated successfully.");

    // -----------------------------------------------------------
    // 5️⃣ Create Stripe Checkout Session
    // -----------------------------------------------------------
    console.log("💳 Creating Stripe Checkout session...");

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "CarSaavy Vehicle Report"
            },
            unit_amount: 1000 // still $10 for MVP
          },
          quantity: 1
        }
      ],
      success_url: `${process.env.VERCEL_URL}/vin?success=true`,
      cancel_url: `${process.env.VERCEL_URL}/vin?canceled=true`,

      // The webhook relies on these EXACT metadata keys
      metadata: {
        vin,
        email,
        listingUrl
      }
    });

    console.log("✅ Stripe session created:", session.id);

    return res.status(200).json({ id: session.id });
  } catch (err) {
    console.error("🔥 Error in create-payment:", err);
    return res.status(500).json({
      error: "Something went wrong while creating your payment session."
    });
  }
};
