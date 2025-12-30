const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { buffer } = require("micro");

const { generateVehicleReport } = require("./reportGenerator");
const { buildMvpAnalysis } = require("./mvpEngine");
const { getAllVehicleData } = require("./services/vehicleData");

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);


module.exports.config = {
  api: { bodyParser: false },
};

const hasVin = !!metadata.vin;
const hasYMM = !!(metadata.year && metadata.make && metadata.model);

if (hasVin && hasYMM) {
  return {
    error: "Conflicting vehicle identifiers. Please provide either VIN or Year/Make/Model, not both."
  };
}


// -----------------------------
// Email helper
// -----------------------------
async function sendReportEmail(toEmail, reportUrl, vin) {
  try {
    await resend.emails.send({
      from: "CarSaavy Reports <reports@carsaavy.com>",
      to: toEmail,
      subject: "Your CarSaavy Negotiation Report is Ready",
      html: `
        <div style="font-family: Arial; padding: 20px;">
          <h2>🚗 Your CarSaavy Vehicle Report is Ready</h2>
          ${vin ? `<p><b>VIN:</b> ${vin}</p>` : ""}
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

  const intent = event.data.object;
  const metadata = intent.metadata || {};

  // -----------------------------
  // Extract metadata (THIS WAS MISSING)
  // -----------------------------
  const vin = metadata.vin || null;
  const email = metadata.email || null;
  
  const year = metadata.year || null;
  const make = metadata.make || null;
  const model = metadata.model || null;
  const segment = metadata.segment || null;
  const trimTier = metadata.trimTier || null;
  const mileage = metadata.mileage || null;

  const askingPrice = metadata.askingPrice
    ? Number(metadata.askingPrice)
    : null;

  if (!email) {
    console.error("❌ Missing required email metadata");
    return res.status(400).send("Missing required metadata");
  }

  console.log("📌 Payment metadata:", {
    vin,
    email,
    year,
    make,
    model,
    segment,
    trimTier,
    mileage,
    askingPrice,
  });

  try {
    // -----------------------------
    // Resolve vehicle data (VIN or dropdown)
    // -----------------------------
    let vehicleData = null;

    try {
      vehicleData = await getAllVehicleData({
        vin,
        year,
        make,
        model,
        segment,
        trimTier,
        mileage,
      });
    } catch (err) {
      console.warn("⚠️ Vehicle resolution failed:", err);
    }

    const hasVin = typeof vin === "string" && vin.trim().length >= 6;
    const hasYMM =
      vehicleData &&
      vehicleData.vehicleProfile &&
      vehicleData.vehicleProfile.year &&
      vehicleData.vehicleProfile.make &&
      vehicleData.vehicleProfile.model;

    if (!hasVin && !hasYMM) {
      throw new Error("Insufficient vehicle data to generate report");
    }

    // -----------------------------
    // Build NIC_v2 analysis
    // -----------------------------
    const resolvedProfile = {
      year: vehicleData?.vehicleProfile?.year || decodedVin?.year,
      make: vehicleData?.vehicleProfile?.make || decodedVin?.make,
      model: vehicleData?.vehicleProfile?.model || decodedVin?.model,
      segment: vehicleData?.vehicleProfile?.segment || segment || "general",
      trimTier: vehicleData?.vehicleProfile?.trimTier || trimTier || "mid",
      mileage: vehicleData?.vehicleProfile?.mileage || mileage || null,
      vin,
    };
    
    if (!resolvedProfile.year || !resolvedProfile.make || !resolvedProfile.model) {
      throw new Error("Critical vehicle identity missing after VIN resolution");
    }
    
    
    const analysis = buildMvpAnalysis({
      vehicleProfile: resolvedProfile,
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

    try {
      await refundPaymentIfNeeded(intent.id);
    } catch (_) {}

    return res.status(500).send("Webhook processing failed");
  }
};

// -----------------------------
// Refund helper
// -----------------------------
async function refundPaymentIfNeeded(paymentIntentId) {
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status === "canceled" || intent.amount_refunded > 0) {
      console.log("💸 Refund already processed for:", paymentIntentId);
      return;
    }

    await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: "requested_by_customer",
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
