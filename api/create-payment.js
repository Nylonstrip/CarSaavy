// api/create-payment.js
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Lightweight Cars.com URL validation
function isCarsComUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes("cars.com") &&
      /^\/vehicledetail\/[a-zA-Z0-9-]+\/?$/.test(parsed.pathname)
    );
  } catch (e) {
    return false;
  }
}

function getBaseUrl() {
  let url = process.env.VERCEL_URL || "";
  if (!url.startsWith("http")) {
    url = "https://" + url;
  }
  return url;
}

export default async function handler(req, res) {
  console.log("📩 Incoming create-payment request:", req.body);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { vin, email, listingUrl } = req.body;

  if (!vin || !email || !listingUrl) {
    return res
      .status(400)
      .json({ error: "VIN, email, and listing URL are required" });
  }

  console.log("🔍 Validating Cars.com URL...");
  if (!isCarsComUrl(listingUrl)) {
    console.log("❌ Failed: URL does not match Cars.com format.");
    return res.status(400).json({
      error:
        "Invalid Cars.com link. Please provide the exact full Cars.com listing URL.",
    });
  }

  console.log("✅ Cars.com URL passed lightweight validation.");

  try {
    console.log("💳 Creating Stripe Checkout Session...");

    const baseUrl = getBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "CarSaavy Vehicle Report",
              description: "Full negotiation-ready vehicle analysis",
            },
            unit_amount: 1500,
          },
          quantity: 1,
        },
      ],
      metadata: {
        vin,
        email,
        listingUrl,
      },
      success_url: `${baseUrl}/success`,
      cancel_url: `${baseUrl}/cancel`,
    });

    console.log("✅ Checkout session created:", session.id);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("❌ Stripe session creation failed:", err);
    return res.status(500).json({ error: "Stripe error", details: err.message });
  }
}
