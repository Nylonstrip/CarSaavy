const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  try {
    console.log("📩 Incoming create-payment request:", req.body);

    const { vin, email, listingUrl } = req.body;

    //-----------------------------------------------------------
    // 1️⃣ Validate required fields
    //-----------------------------------------------------------
    if (!vin || !email || !listingUrl) {
      return res.status(400).json({ error: "VIN, email, and Cars.com URL are required." });
    }

    //-----------------------------------------------------------
    // 2️⃣ Domain check (fast early rejection)
    //-----------------------------------------------------------
    if (!listingUrl.startsWith("https://www.cars.com/")) {
      return res.status(400).json({ error: "Please provide a valid Cars.com listing URL." });
    }

    //-----------------------------------------------------------
    // 3️⃣ Normalized user-friendly format check
    //-----------------------------------------------------------
    const normalizedUrl = listingUrl.trim();

    //-----------------------------------------------------------
    // 4️⃣ Cars.com URL validation (robust: retry + longer timeout)
    //-----------------------------------------------------------
    async function validateCarsUrl(url) {
      async function attempt() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000); // 7 sec timeout

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

          if (response.status >= 200 && response.status < 400) {
            return true;
          }

          console.log("⚠ Cars.com responded with status:", response.status);
          return false;
        } catch (err) {
          console.log("⚠ Cars.com validation attempt failed:", err.message);
          return false;
        }
      }

      const firstTry = await attempt();
      if (firstTry) return true;

      console.log("🔁 Retrying Cars.com validation...");
      return await attempt();
    }

    console.log("🔍 Validating Cars.com URL...");
    const validUrl = await validateCarsUrl(normalizedUrl);

    if (!validUrl) {
      return res.status(400).json({
        error: "Unable to reach this Cars.com listing. Please verify the URL or try again."
      });
    }

    console.log("✅ Cars.com URL validated successfully.");

    //-----------------------------------------------------------
    // 5️⃣ Create Stripe payment intent
    //-----------------------------------------------------------
    console.log("💳 Creating Stripe payment intent...");

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 2000, // $20 — adjust later if needed
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        vin,
        email,
        url: normalizedUrl
      }
    });

    console.log("✅ Payment intent created:", paymentIntent.id);

    //-----------------------------------------------------------
    // 6️⃣ Return client secret back to VIN tool
    //-----------------------------------------------------------
    return res.status(200).json({
      clientSecret: paymentIntent.client_secret
    });

  } catch (error) {
    console.error("❌ create-payment error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};
