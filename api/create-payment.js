import Stripe from "stripe";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { vin, email, listingUrl } = req.body;

    // ---------------------------
    // BASIC VALIDATION
    // ---------------------------
    if (!vin || !email || !listingUrl) {
      return res.status(400).json({
        error: "VIN, email, and Cars.com listing URL are required.",
      });
    }

    // Validate Cars.com URL format
    const carsUrlRegex = /^https:\/\/www\.cars\.com\/vehicledetail\/[A-Za-z0-9-]+\/?$/;
    if (!carsUrlRegex.test(listingUrl)) {
      return res.status(400).json({
        error: "Invalid listing URL. Only Cars.com vehicle detail links are allowed.",
      });
    }

    // ---------------------------
    // SERVER-SIDE URL CHECK (HEAD)
    // Prevents users submitting dead URLs
    // ---------------------------
    try {
      const check = await fetch(listingUrl, { method: "HEAD" });

      if (!check.ok) {
        return res.status(400).json({
          error: "Cars.com listing appears to be unavailable. Please verify the link.",
        });
      }
    } catch (err) {
      console.error("URL HEAD check failed:", err);
      return res.status(400).json({
        error:
          "Unable to reach the Cars.com listing. Please ensure the link is correct.",
      });
    }

    // ---------------------------
    // STRIPE SETUP
    // ---------------------------
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const priceInCents = 2000; // $20 for MVP scraping-based report

    // ---------------------------
    // CREATE STRIPE PAYMENT INTENT
    // ---------------------------
    const paymentIntent = await stripe.paymentIntents.create({
      amount: priceInCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },

      // 🔥 **METADATA MUST MATCH WEBHOOK**
      metadata: {
        vin,
        email,
        listingUrl,
      },
    });

    // ---------------------------
    // RETURN CLIENT SECRET TO VIN TOOL
    // ---------------------------
    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      message: "Payment initialized successfully.",
    });
  } catch (error) {
    console.error("❌ create-payment error:", error);
    return res.status(500).json({
      error: "An unexpected error occurred while starting checkout.",
    });
  }
}
