// --------- REQUIRED FOR STRIPE ON VERCEL ----------
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
// --------------------------------------------------

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const getRawBody = require("raw-body");

// Now that you flattened the structure:
const parseCarsDotCom = require("./carsDotCom");
const generateReport = require("./reportGenerator");

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  let event;
  let rawBody;

  try {
    // Capture raw request body for Stripe verification
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

  // ---- Handle successful payment ----
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;

    const metadata = {
      vin: paymentIntent.metadata?.vin || null,
      email: paymentIntent.metadata?.email || null,
      listingUrl: paymentIntent.metadata?.listingUrl || null,
    };

    console.log("📌 Extracted metadata:", metadata);

    if (!metadata.vin || !metadata.email || !metadata.listingUrl) {
      console.error("❌ Missing metadata in payment intent");
      return res.status(400).json({ error: "Missing metadata" });
    }

    try {
      // SCRAPE LISTING
      console.log("🔍 Scraping listing:", metadata.listingUrl);
      const scrapedData = await parseCarsDotCom(metadata.listingUrl);
      console.log("🧩 Parsed data:", scrapedData);

      // PDF GENERATION
      console.log("📄 Generating PDF report...");
      const pdfBuffer = await generateReport({
        vin: metadata.vin,
        email: metadata.email,
        listingUrl: metadata.listingUrl,
        scrapedData,
      });

      if (!pdfBuffer) {
        console.error("❌ generateReport returned empty buffer");
        return res.status(500).send("Report generation failed");
      }

      console.log("📄 PDF generated successfully!");

      // EMAIL LOGIC (your existing system)
      // If you want me to inspect this, upload your emailService or mailer file.

    } catch (err) {
      console.error("❌ Webhook handler error:", err);
      return res.status(500).json({ error: "Webhook internal error" });
    }
  }

  return res.status(200).json({ received: true });
};
