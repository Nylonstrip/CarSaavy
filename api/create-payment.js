const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

function isValidCarsComUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url.trim());
    return (
      u.hostname.includes("cars.com") &&
      u.pathname.includes("/vehicledetail/")
    );
  } catch (e) {
    return false;
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { vin, email, listingUrl } = req.body || {};

    if (!vin || !email || !listingUrl) {
      return res
        .status(400)
        .json({ error: "VIN, email, and listing URL are required." });
    }

    const normalizedVin = String(vin).trim().toUpperCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      return res.status(400).json({ error: "Invalid email." });
    }

    if (!isValidCarsComUrl(listingUrl)) {
      return res.status(400).json({
        error:
          "Listing URL must be a valid Cars.com vehicle detail page (https://www.cars.com/vehicledetail/...).",
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],

      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: 2000, // $20.00
            product_data: {
              name: `VIN Report for ${normalizedVin}`,
            },
          },
          quantity: 1,
        },
      ],

      // Metadata on the SESSION itself
      metadata: {
        vin: normalizedVin,
        email,
        listingUrl,
      },

      // Metadata propagated to the INTERNAL PAYMENT INTENT
      payment_intent_data: {
        metadata: {
          vin: normalizedVin,
          email,
          listingUrl,
        },
      },

      customer_email: email,

      success_url: "https://www.carsaavy.com/vin?status=success",
      cancel_url: "https://www.carsaavy.com/vin?status=cancel",
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Checkout Session Error:", error);
    return res
      .status(500)
      .json({ error: "Failed", message: error.message || "Unknown error" });
  }
};
