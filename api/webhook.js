// api/webhook.js
//
// FULLY PATCHED FOR:
// - Vercel’s new runtime (raw body requirement)
// - Stripe signature verification
// - VIN + URL match validation
// - Scraper-powered data fetching
// - Report generation + email sending
// --------------------------------------------------

import Stripe from "stripe";
import getRawBody from "raw-body";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Import your internal modules
const getAllVehicleData = require("./services/vehicleData.js");
const generateReport = require("./services/reportGenerator.js");
const sendVehicleReportEmail = require("./services/emailService.js");

// Required for Stripe webhooks in Vercel
export const config = {
  api: {
    bodyParser: false,
  },
};

module.exports = async (req, res) => {
  console.log("🔥 Webhook event received");

  let event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers["stripe-signature"];

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      endpointSecret
    );
  } catch (err) {
    console.error("❌ Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // We only care about payment success events
  if (event.type !== "payment_intent.succeeded") {
    return res.status(200).send("Ignored event");
  }

  const paymentIntent = event.data.object;

  const vin = paymentIntent.metadata?.vin || null;
  const url = paymentIntent.metadata?.url || null;
  const email = paymentIntent.metadata?.email || null;

  console.log("📌 Extracted metadata:", { vin, url, email });

  // Basic guard
  if (!vin || !url || !email) {
    console.error("❌ Missing metadata in payment intent");
    return res.status(400).json({
      error:
        "Required metadata missing (vin, url, email). Payment processed but cannot fulfill report.",
    });
  }

  // STEP 1 — Fetch & validate vehicle data (includes VIN verification)
  let vehicleData;

  try {
    vehicleData = await getAllVehicleData(url, vin);
  } catch (err) {
    console.error("❌ Vehicle data lookup failed:", err.message);

    // Email user about failure
    await sendVehicleReportEmail({
      to: email,
      subject: "CarSaavy Report Error",
      body: `
        We attempted to process your CarSaavy report, but the system could not
        retrieve data from the provided vehicle listing.

        Error: ${err.message}

        Please verify the URL and VIN and try again.
      `,
    });

    return res.status(500).json({ error: "Vehicle data lookup failed" });
  }

  // VIN mismatch
  if (vehicleData?.vinMismatch === true) {
    console.warn("⚠ VIN mismatch detected");

    await sendVehicleReportEmail({
      to: email,
      subject: "CarSaavy Verification Failed",
      body: `
        Your report could not be generated because the VIN you entered
        (${vin}) does not match the VIN listed on the provided vehicle page.

        This safety check ensures all reports remain accurate.

        Please double-check:

        • The VIN entered
        • The Cars.com URL you provided

        You may retry the report once corrected.
      `,
    });

    return res.status(200).json({ error: "VIN mismatch — report not generated" });
  }

  if (!vehicleData || !vehicleData.vin) {
    console.error("❌ Vehicle scrape returned empty or invalid data");

    await sendVehicleReportEmail({
      to: email,
      subject: "CarSaavy Report Error",
      body: `
        We were unable to extract vehicle data from the provided URL.

        Please verify the URL is a valid Cars.com listing and try again.
      `,
    });

    return res.status(200).json({ error: "Invalid scrape data" });
  }

  console.log("✅ Vehicle data verified:", vehicleData.vin);

  // STEP 2 — Generate PDF Report
  let reportUrl;
  try {
    reportUrl = await generateReport(vehicleData);
  } catch (err) {
    console.error("❌ Report generation failed:", err.message);

    await sendVehicleReportEmail({
      to: email,
      subject: "CarSaavy Report Error",
      body: `
        We attempted to generate your PDF report, but an internal error occurred.

        Please try again shortly.
      `,
    });

    return res.status(500).json({ error: "Report generation failed" });
  }

  console.log("📄 Report URL created:", reportUrl);

  // STEP 3 — Email the report
  try {
    await sendVehicleReportEmail({
      to: email,
      reportUrl,
      vin: vehicleData.vin,
      vehicle: vehicleData,
    });
  } catch (err) {
    console.error("❌ Email delivery failed:", err.message);
    return res.status(500).json({ error: "Email delivery failed" });
  }

  console.log("📨 Report sent successfully to:", email);

  return res.status(200).json({ success: true });
};
