const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { buffer } = require("micro");

const { generateVehicleReport } = require("./reportGenerator");
const { buildMvpAnalysis } = require("./mvpEngine");
const { getAllVehicleData } = require("./services/vehicleData");

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const { incrementCounterForTier, logOrderRow } = require("./services/sheets");

module.exports.config = {
  api: { bodyParser: false },
};

async function assignSku(tier, sla, metadata) {
  const seq = await incrementCounterForTier(tier);
  const seqStr = seq.toString().padStart(4, "0");

  const sku = `${tier.toUpperCase()}-${sla}-${seqStr}`;

  // record vehicle or "N/A"
  const vehicle = metadata.vehicle || `${metadata.year || ""} ${metadata.make || ""} ${metadata.model || ""}`.trim();

  const orderAt = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });

  await logOrderRow({
    sku,
    tier,
    sla,
    email: metadata.email,
    vehicle,
    orderAt,
  });

  return sku;
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

async function notifyOpsOfManualOrder(md) {
  const subject = `Manual Order — ${md.sku} (${md.tier}${md.rush === "true" ? " — RUSH" : ""})`;

  const bodyText = `
NEW MANUAL ORDER RECEIVED

ORDER DETAILS
--------------
Order #: ${md.sku}
Tier: ${md.tier}
Rush: ${md.rush === "true" ? "24h" : "48h"}
SLA Hours: ${md.slaHours}
Email: ${md.email}
Phone: ${md.phone || "N/A"}

VEHICLE
--------
VIN: ${md.vin || "N/A"}
Listing: ${md.listingUrl || "N/A"}

PURPOSE CONTEXT
----------------
Purpose: ${md.purchasePurpose}
${md.purchasePurposeOther ? `Purpose Detail: ${md.purchasePurposeOther}` : ""}
Timeline: ${md.timelineContext || "N/A"}
Budget: ${md.budget || "N/A"}
Notes: ${md.additionalContext || "N/A"}

TIME
-----
Received: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}

NEXT STEPS
-----------
• Validate intake
• Approve / Request clarifications
• Begin research (starts SLA clock)
`;

  await resend.emails.send({
    from: "CarSaavy Ops <ops@carsaavy.com>",
    to: "carsaavy@gmail.com", // RECEIVING inbox for now
    subject,
    text: bodyText,
  });
}

async function sendManualQueuedEmail(md) {
  const sla = Number(md.slaHours || 48);
  const now = new Date();
  const deliveryDate = new Date(now.getTime() + sla * 60 * 60 * 1000);

  // Format for Eastern Time (matches your site)
  const deliveryStr = deliveryDate.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const subject = `Your CarSaavy Report is Being Prepared — Order ${md.sku}`;

  const bodyText = `
Your CarSaavy manual report is now being prepared.

Order: ${md.sku}
Tier: ${md.tier}${md.rush === "true" ? " (Rush 24h)" : " (48h)"}

Estimated Delivery:
→ by ${deliveryStr} Eastern Time

What happens now:
Our analysts are reviewing your vehicle details and preparing a negotiation-ready evaluation tailored to your purchase context.

Forgot to include something?
Just reply to this email and we’ll incorporate it.

Thank you for trusting CarSaavy — you're in good hands.
  `;

  const bodyHtml = `
  <div style="font-family: Arial, sans-serif; line-height:1.5; padding: 20px;">
    <h2 style="margin-bottom: 8px;">Your CarSaavy report is being prepared</h2>
    <p style="margin-top:0;color:#666;">Order ${md.sku}</p>

    <p><b>Tier:</b> ${md.tier}${md.rush === "true" ? " (Rush 24h)" : " (48h)"}</p>

    <p><b>Estimated Delivery:</b><br>
    by <b>${deliveryStr} Eastern Time</b></p>

    <h3 style="margin-top:24px;">What happens now</h3>
    <p>
      Our analysts are reviewing your vehicle details and preparing a negotiation-ready evaluation tailored to your purchase context.
    </p>

    <p>
      <b>Forgot to include something?</b><br>
      Just reply to this email and we’ll incorporate it.
    </p>

    <p style="margin-top:24px;">
      Thank you for trusting CarSaavy — you're in good hands.
    </p>
  </div>
  `;

  await resend.emails.send({
    from: "CarSaavy Reports <reports@carsaavy.com>",
    to: md.email, // CUSTOMER email
    subject,
    text: bodyText,
    html: bodyHtml,
  });
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

  const mode = metadata.mode || "auto-report";

  


  // 🧩 NEW: manual report branch – do NOT run the automated engine for these
  if (mode === "manual-report") {
    const orderNumber = metadata.orderNumber || "UNKNOWN";
    console.log("🧾 Manual report payment received:", {
      email: metadata.email,
      tier: metadata.tier,
      rush: metadata.rush,
      slaHours: metadata.slaHours,
      vin: metadata.vin,
      listingUrl: metadata.listingUrl,
      purchasePurpose: metadata.purchasePurpose,
    });

    // TODO: generate a job ID (for your internal queue tracking)
    const jobId = `MR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    console.log("Assigned manual job ID:", jobId);

    // TODO: send "queued" email to customer + internal notification to you
    // Example (pseudo code, match your existing email service):
    //
    // await sendManualQueuedEmail({
    //   to: metadata.email,
    //   jobId,
    //   tier: metadata.tier,
    //   rush: metadata.rush === "true",
    //   slaHours: metadata.slaHours,
    //   vin: metadata.vin,
    //   listingUrl: metadata.listingUrl,
    //   purchasePurpose: metadata.purchasePurpose,
    // });
    //
    console.log("SHEETS_CREDS_BASE64_PRESENT:", !!process.env.GOOGLE_SHEETS_CREDENTIALS_BASE64);
    console.log("SHEETS_CREDS_LENGTH:", process.env.GOOGLE_SHEETS_CREDENTIALS_BASE64?.length || 0);


    const sku = await assignSku(metadata.tier, metadata.slaHours, metadata);
    metadata.sku = sku;


    await notifyOpsOfManualOrder(metadata);

    await sendManualQueuedEmail(metadata);

    return res.status(200).send("Manual report queued");
  }


  const hasVin = !!metadata.vin;
  const hasYMM = !!(metadata.year && metadata.make && metadata.model);
  
  if (hasVin && hasYMM) {
    return {
      error: "Conflicting vehicle identifiers. Please provide either VIN or Year/Make/Model, not both."
    };
  }

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

    


    if (!hasVin && !hasYMM) {
      throw new Error("Insufficient vehicle data to generate report");
    }

    // -----------------------------
    // Build NIC_v2 analysis
    // -----------------------------
    const resolvedProfile = {
      year: vehicleData?.vehicleProfile?.year || year,
      make: vehicleData?.vehicleProfile?.make || make,
      model: vehicleData?.vehicleProfile?.model || model,
      segment: vehicleData?.vehicleProfile?.segment || segment || "general",
      trimTier: vehicleData?.vehicleProfile?.trimTier || trimTier || "mid",
      mileage: vehicleData?.vehicleProfile?.mileage || mileage || null,
      vin,
    };
    
    
    // ------------------------------------
// Identity validation (VIN vs Y/M/M)
// ------------------------------------
// ⚠️ If no VIN, we are in Y/M/M mode — do NOT apply VIN guards


    
    const hasResolvedYMM =
    resolvedProfile.year &&
    resolvedProfile.make &&
    resolvedProfile.model;

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
