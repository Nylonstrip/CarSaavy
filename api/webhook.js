// ---------- REQUIRED FOR STRIPE W/ VERCEL ------------
// Disable automatic body parsing so we can access rawBody
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

// -----------------------------------------------------
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const getRawBody = require("raw-body");

// Your modules - now flattened into /api/
const parseCarsDotCom = require("./carsDotCom");
const generateReport = require("./reportGenerator");

module.exports.handler = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  let event;
  let rawBody;

  try {
    // Get unparsed raw body from Vercel
    rawBody = await getRawBody(req);

    const signature = req.headers["stripe-signature"];

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("🔥 Webhook event received:", event.type);
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful payment
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;

    const vin = paymentIntent.metadata?.vin || null;
    const email = paymentIntent.metadata?.email || null;
    const listingUrl = paymentIntent.metadata?.listingUrl || null;

    console.log("📌 Extracted metadata:", { vin, email, listingUrl });

    if (!vin || !email || !listingUrl) {
      console.error("❌ Missing metadata in payment intent");
      return res.status(400).json({ error: "Missing required metadata" });
    }

    try {
      // 1. Scrape / Parse Cars.com Listing
      console.log("🔍 Scraping listing:", listingUrl);
      const scrapedData = await parseCarsDotCom(listingUrl);
      console.log("🧩 Parsed data:", scrapedData);

      // 2. Generate PDF Report
      console.log("📄 Generating PDF report...");
      const pdfBuffer = await generateReport({
        vin,
        email,
        listingUrl,
        scrapedData,
      });

      if (!pdfBuffer) {
        console.error("❌ PDF generation returned empty buffer");
        return res.status(500).send("Report failed to generate");
      }

      console.log("📄 PDF generated successfully!");

      // 3. Upload & Email (your existing logic here)
      // You likely call your email service here.
      // If you want, send me the email API and I’ll hard-patch it too.

    } catch (err) {
      console.error("❌ Webhook handler error:", err);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  }

  res.status(200).json({ received: true });
};
