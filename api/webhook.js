const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { buffer } = require("micro");

const { generateVehicleReport } = require("./reportGenerator");
const { buildMvpAnalysis } = require("./mvpEngine");
const { getAllVehicleData } = require("./services/vehicleData");

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

// Required for Stripe raw body verification
module.exports.config = {
  api: { bodyParser: false },
};

// -----------------------------
// Email helper (simple + safe)
// -----------------------------
async function sendReportEmail(toEmail, reportUrl, vin) {
  try {
    await resend.emails.send({
      from: "CarSaavy Reports <reports@carsaavy.com>",
      to: toEmail,
      subject: `Your CarSaavy Report for VIN ${vin}`,
      html: `
        <div style="font-family: Arial; padding: 20px;">
          <h2>🚗 Your CarSaavy Vehicle Report is Ready</h2>
          <p>Your report for <b>VIN ${vin}</b> is ready:</p>
          <p>
            <a href="${reportUrl}" style="font-size:16px; color:#007bff;">
              Download your report
            </a>
          </p>
          <p>Thanks for using CarSaavy.</p>
        </div>
      `,
    });

    console.log("📧 Email sent to:", toEmail);
  } catch (err) {
    // Email failure must NOT break webhook
    console.error("❌ Email send failed:", err);
  }
}

// -----------------------------
// MAIN WEBHOOK HANDLER
// -----------------------------
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
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
    console.error("❌ Stripe signature verification failed:", err.message);
    return res.status(400).send("Webhook signature error");
  }

  console.log("🔥 Stripe event received:", event.type);

  if (event.type !== "payment_intent.succeeded") {
    return res.status(200).send("Event ignored");
  }

  // -----------------------------
  // Extract metadata
  // -----------------------------
  const intent = event.data.object;
  const vin = intent.metadata?.vin;
  const email = intent.metadata?.email;
  const askingPrice = intent.metadata?.price
    ? Number(intent.metadata.price)
    : null;

  if (!vin || !email) {
    console.error("❌ Missing required metadata:", { vin, email });
    return res.status(400).send("Missing required metadata");
  }

  console.log("📌 Payment metadata:", { vin, email, askingPrice });

  try {
    // -----------------------------
    // Resolve VIN → vehicleProfile
    // -----------------------------
    const vehicleData = await getAllVehicleData(vin);

    if (!vehicleData || !vehicleData.vehicleProfile) {
      throw new Error("VIN resolution failed");
    }
    

    // -----------------------------
    // Build PIC_v1 analysis
    // -----------------------------
    const analysis = buildMvpAnalysis({
      vin,
      vehicleProfile: vehicleData.vehicleProfile,
      askingPrice,
    });

    // -----------------------------
    // Generate PDF
    // -----------------------------
    const reportUrl = await generateVehicleReport({ analysis }, vin);

    // -----------------------------
    // Email report
    // -----------------------------
    await sendReportEmail(email, reportUrl, vin);

    return res.status(200).send("Webhook processed successfully");
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
  
    // Attempt refund if payment succeeded but report failed
    try {
      await refundPaymentIfNeeded(intent.id, "requested_by_customer");
    } catch (_) {}
  
    return res.status(500).send("Webhook processing failed");
  }
};


async function refundPaymentIfNeeded(paymentIntentId) {
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status === "canceled" || intent.amount_refunded > 0) {
      console.log("💸 Refund already processed for:", paymentIntentId);
      return;
    }

    await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: "requested_by_customer"
    });

    console.log("💸 Refund issued for:", paymentIntentId);
  } catch (err) {
    if (err.code === "charge_already_refunded") {
      console.log("💸 Refund already processed (Stripe-safe):", paymentIntentId);
      return;
    }
    console.error("❌ Refund attempt failed:", err);
  }
}

