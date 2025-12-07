const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { scrapeByURL } = require("./carsDotCom");
const { generateReport } = require("./reportGenerator");
const { sendReportEmail } = require("./emailService");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.info("🔥 Webhook event received:", event.type);

  // Only handle successful payments
  if (event.type !== "payment_intent.succeeded") {
    return res.status(200).send("Event ignored");
  }

  const intent = event.data.object;
  const { vin, email, listingUrl } = intent.metadata || {};

  console.info("📌 Extracted metadata:", { vin, email, listingUrl });

  // Validate required metadata
  if (!vin || !email || !listingUrl) {
    console.error("❌ Missing metadata in payment intent");
    return res.status(400).send("Missing metadata");
  }

  console.info("🚗 Fetching vehicle data via Cars.com scraper...");

  let scrapeResult;
  try {
    scrapeResult = await scrapeByURL(listingUrl);
  } catch (err) {
    console.error("❌ Cars.com scrape failed:", err);
    return res.status(500).send("Scrape failed");
  }

  if (!scrapeResult || !scrapeResult.vehicle) {
    console.error("❌ Scraper returned no vehicle data");
    return res.status(500).send("No vehicle data found");
  }

  const vehicle = scrapeResult.vehicle;

  console.info("🧩 Parsed vehicle data:", vehicle);

  console.info("📄 Generating PDF report...");

  let pdfBuffer;
  try {
    pdfBuffer = await generateReport(vehicle);
  } catch (err) {
    console.error("❌ PDF generation failed:", err);
    return res.status(500).send("PDF generation failed");
  }

  console.info("📧 Sending email with report...");

  try {
    await sendReportEmail(email, pdfBuffer, vin);
  } catch (err) {
    console.error("❌ Email sending failed:", err);
    return res.status(500).send("Email failed");
  }

  console.info("✅ Report successfully generated and emailed!");
  return res.status(200).send("Success");
};
