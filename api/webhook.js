const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { buffer } = require("micro");

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);


// Local imports (CommonJS, same folder)
const { parseCarsDotCom } = require("./carsDotCom");
const { generateVehicleReport } = require("./reportGenerator");

// Required for raw body (Stripe verification)
module.exports.config = {
  api: { bodyParser: false },
};

// -----------------------------
// MOCK DATA ENGINE
// -----------------------------
function mockVehicle(vin) {
  return {
    title: "Mock 2018 Chevrolet Camaro 1LT",
    year: 2018,
    make: "Chevrolet",
    model: "Camaro",
    trim: "1LT",
    price: 16797,
    mileage: 93567,
    vin: vin,
    dealerName: "Mock Dealer",
    dealerAddress: "123 Mock Street, Mock City, NY",
    structured: {
      basic: {
        title: "Mock 2018 Chevrolet Camaro 1LT",
        year: 2018,
        make: "Chevrolet",
        model: "Camaro",
        trim: "1LT",
        price: 16797,
        mileage: 93567,
        vin: vin
      },
      dealer: {
        name: "Mock Dealer",
        address: "123 Mock Street, Mock City, NY"
      },
      source: "mock",
      url: "https://mock.cars.com/listing/123"
    }
  };
}

async function sendReportEmail(toEmail, reportUrl, vin) {
  try {
    const subject = `Your CarSaavy Report for VIN ${vin}`;
    const html = `
      <div style="font-family: Arial; padding: 20px;">
        <h2>🚗 Your CarSaavy Vehicle Report is Ready</h2>
        <p>Thank you for using CarSaavy!</p>
        <p>Your report for <b>VIN ${vin}</b> is ready to download:</p>
        <p><a href="${reportUrl}" style="color:#007bff; font-size:16px;">Click here to download your report</a></p>
        <br>
        <p>If you have any questions, reply to this email.</p>
        <p>— CarSaavy Team</p>
      </div>
    `;

    await resend.emails.send({
      from: "CarSaavy Reports <reports@carsaavy.com>",
      to: toEmail,
      subject,
      html,
    });

    console.log("📧 Email successfully sent to:", toEmail);
    return true;

  } catch (err) {
    console.error("❌ Email sending failed:", err);
    return false; // Do NOT break webhook
  }
}


// -----------------------------
// MAIN HANDLER
// -----------------------------
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  let event;
  const sig = req.headers["stripe-signature"];

  // 1. Verify Stripe signature
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

  // 2. Handle successful payment
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;

    const vin = intent.metadata.vin || null;
    const email = intent.metadata.email || null;
    const listingUrl = intent.metadata.listingUrl || null;

    console.log("📌 Extracted metadata:", { vin, email, listingUrl });

    if (!vin || !email) {
      console.error("❌ Missing VIN or email in metadata");
      return res.status(400).send("Missing metadata");
    }

    // -----------------------------
    // 3. MOCK MODE OVERRIDE
    // -----------------------------
    let vehicleData;

    if (process.env.MOCK_SCRAPING === "true") {
      console.log("🟦 MOCK MODE ACTIVE — skipping real scraping.");
      vehicleData = mockVehicle(vin);
    } else {
      // -----------------------------
      // 4. REAL SCRAPING MODE
      // -----------------------------
      if (!listingUrl) {
        console.error("❌ Missing listing URL in metadata");
        return res.status(400).send("Missing listing URL");
      }

      console.log("🔍 Scraping listing:", listingUrl);

      try {
        vehicleData = await parseCarsDotCom(listingUrl);
      } catch (err) {
        console.error("❌ Scraper failure:", err);
        return res.status(500).send("Error scraping listing");
      }
    }

    console.log("🧩 Parsed data (summary):", {
      title: vehicleData.title,
      price: vehicleData.price,
      mileage: vehicleData.mileage,
      vin: vehicleData.vin,
      dealerName: vehicleData.dealerName,
    });

    // -----------------------------
    // 5. Generate PDF Report
    // -----------------------------
    console.log("📄 Generating PDF report...");

    let reportUrl;

    try {
      reportUrl = await generateVehicleReport(vehicleData, vin);
    } catch (err) {
      console.error("❌ PDF generation error:", err);
      return res.status(500).send("PDF generation failed");
    }

    console.log("📤 Report ready at:", reportUrl);

    // -----------------------------
    // 6. TODO: SEND EMAIL (Next Step)
    // -----------------------------

    console.log("📧 Sending email...");

await sendReportEmail(email, reportUrl, vin);

console.log("✅ Email step completed.");

    return res.status(200).send("Webhook processed.");
  }

  // Fallback for all other events
  return res.status(200).send("Unhandled event type.");
};
