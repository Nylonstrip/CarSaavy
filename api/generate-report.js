// /api/generate-report.js

/**
 * Generates a vehicle report after a successful Stripe payment.
 * Pulls VIN data, builds the report, and emails it to the user.
 */

const { getAllVehicleData } = require('./services/vehicleData');
const { generateReport } = require('./services/reportGenerator');
const { sendEmail } = require('./services/emailService');
const { logEvent } = require('./services/logger');
const DEV_BYPASS_TOKEN = process.env.DEV_BYPASS_TOKEN || '';

module.exports = async (req, res) => {
  console.log("🚀 [GenerateReport] Endpoint hit");

  // Quick method guard
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // parse body early so logs have context
  const { vin, email } = req.body || {};

  // Allow browser-origin requests (normal flow)
  const origin = req.headers.origin || '';

  // Accept if request comes from your site OR if a valid dev-bypass header is present
  const bypassHeader = req.headers['x-dev-bypass'] || req.headers['x-dev-bypass-token'] || '';

  if (!origin.includes('car-saavy.vercel.app') && bypassHeader !== DEV_BYPASS_TOKEN) {
    // Not from your site and no valid bypass token — block the request like Vercel does
    return res.status(401).json({ error: 'Authentication required (dev bypass).' });
  }

  try {
    await logEvent({ vin, email, status: 'started', message: 'Report generation started' });

    if (!vin || !email) {
      console.warn("⚠️ [GenerateReport] Missing VIN or email in request");
      await logEvent({ vin, email, status: 'failed', message: 'Missing VIN or email' });
      return res.status(400).json({ error: 'VIN and email are required.' });
    }

    console.log(`🛰️ [GenerateReport] Starting report generation for VIN: ${vin}`);

    // 1️⃣ Fetch comprehensive vehicle data
    const vehicleData = await getAllVehicleData(vin);
    console.log(`✅ [GenerateReport] Vehicle data fetched for ${vin}`);

    // 2️⃣ Generate the HTML report (returns a /tmp file path)
    const reportFile = await generateReport(vehicleData);
    console.log(`✅ [GenerateReport] Report generated: ${reportFile}`);

    // 3️⃣ Automatically decide whether to send inline or attached
    // For now: HTML-only reports = inline, PDF = attachment
    const inline = reportFile.endsWith('.html');

    // 4️⃣ Send the report via email
    const emailResponse = await sendEmail(email, reportFile, inline, vin);

    if (!emailResponse.success) {
      console.error("❌ [GenerateReport] Email failed:", emailResponse.error);
      await logEvent({ vin, email, status: 'failed', message: `Email failed: ${emailResponse.error || 'unknown'}` });
      return res.status(500).json({ error: 'Email delivery failed.' });
    }

    // success
    await logEvent({ vin, email, status: 'success', message: 'Report emailed successfully' });

    console.log(`✅ [GenerateReport] Report emailed successfully to ${email}`);
    return res.status(200).json({
      success: true,
      message: 'Vehicle report generated and emailed successfully.',
      vin,
      email
    });

  } catch (error) {
    await logEvent({ vin, email, status: 'error', error: error?.message || String(error) });
    console.error("🔥 [GenerateReport] Error:", error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
};