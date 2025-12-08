const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { buffer } = require("micro");
const { parseCarsDotCom } = require("./carsDotCom");
const { generateVehicleReport } = require("./reportGenerator");  // ✅ CORRECT IMPORT

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  let event;
  const sig = req.headers["stripe-signature"];

  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("🔥 Webhook event received:", event.type);

  // Only respond to successful payments
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const vin = intent.metadata.vin || null;
    const listingUrl = intent.metadata.listingUrl || null;
    const email = intent.metadata.email || null;

    console.log("📌 Extracted metadata:", { vin, email, listingUrl });

    if (!vin || !listingUrl || !email) {
      console.error("❌ Missing metadata in payment intent");
      return res.status(400).send("Missing metadata");
    }

    // Scrape
    console.log("🔍 Scraping listing:", listingUrl);
    const parsed = await parseCarsDotCom(listingUrl);

    console.log("🧩 Parsed data (summary):", {
      title: parsed.title,
      price: parsed.price,
      mileage: parsed.mileage,
      vin: parsed.vin,
      dealerName: parsed.dealerName
    });

    // Generate PDF
    console.log("📄 Generating PDF report...");
    let reportUrl;

    try {
      reportUrl = await generateVehicleReport(parsed, vin);  // ✅ CORRECT FUNCTION NAME
    } catch (err) {
      console.error("❌ PDF generation error:", err);
      return res.status(500).send("Failed generating PDF");
    }

    console.log("📤 Report ready at:", reportUrl);

    // TODO: Send email with report URL (your existing Resend code still works)

    return res.status(200).send("Webhook handled");
  }

  res.status(200).send("Unhandled event type");
};
