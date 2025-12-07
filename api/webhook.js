// api/webhook.js
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const { getAllVehicleData } = require("./services/vehicleData");
const { generateReport } = require("./services/reportGenerator");
const { sendVehicleReportEmail } = require("./services/emailService");

// Vercel requires this to receive raw body for Stripe signature validation
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

// Helper to read raw body for Stripe verification
function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  let event;
  let rawBody;

  try {
    rawBody = await buffer(req);
  } catch (err) {
    console.error("❌ Failed to read raw request body:", err);
    return res.status(400).send(`Webhook Error: Invalid body`);
  }

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("❌ Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("🔥 Webhook event received:", event.type);

  // Only handle successful payments
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;

    // Extract metadata exactly as set in create-payment.js
    const vin = intent.metadata.vin || null;
    const email = intent.metadata.email || null;
    const listingUrl = intent.metadata.listingUrl || null;

    console.log("📌 Extracted metadata:", { vin, email, listingUrl });

    if (!vin || !email || !listingUrl) {
      console.error("❌ Missing metadata in payment intent");
      return res.status(400).send("Missing required metadata");
    }

    try {
      console.log("🚗 Fetching all vehicle data (scrape + inference)...");
      const vehicleData = await getAllVehicleData(vin, listingUrl);

      console.log("📄 Generating PDF report...");
      const reportUrl = await generateReport(vin, vehicleData);

      console.log("📧 Sending report email...");
      await sendVehicleReportEmail(email, reportUrl, vehicleData);

      console.log("✅ Webhook processing complete!");
      return res.status(200).send("Success");
    } catch (err) {
      console.error("❌ Webhook handler error:", err);
      return res.status(500).send("Internal webhook error");
    }
  }

  // Unhandled event
  return res.status(200).send("Event ignored");
};
