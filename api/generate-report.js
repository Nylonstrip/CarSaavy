const fs = require('fs');
const path = require('path');
const { generateVehicleData } = require('./services/vehicleData');
const { createReport } = require('./services/reportGenerator');
const { sendEmail } = require('./services/emailService');
const { logEvent } = require('./services/logger'); // ✅ include logger

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    await logEvent('generate-report', 'Invalid method', { method: req.method });
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { vin, email } = req.body;
    if (!vin || !email) {
      await logEvent('generate-report', 'Missing VIN or email', { body: req.body });
      return res.status(400).json({ success: false, message: 'VIN and email are required.' });
    }

    console.log(`🧩 [GenerateReport] Starting for VIN: ${vin}`);
    await logEvent('generate-report', 'Start generation', { vin, email });

    // 1️⃣ Fetch vehicle data
    const vehicleData = await generateVehicleData(vin);
    if (!vehicleData) throw new Error('Vehicle data could not be retrieved.');
    await logEvent('generate-report', 'Vehicle data retrieved', { vin });

    // 2️⃣ Create report file
    const reportPaths = await createReport(vehicleData);
    // Expected: { pdfPath, hostedUrl }
    await logEvent('generate-report', 'Report created', { vin, reportPaths });

    // 3️⃣ Determine report mode
    const hasPdf = fs.existsSync(reportPaths.pdfPath);
    const reportFile = hasPdf ? reportPaths.pdfPath : reportPaths.hostedUrl;
    const pdfDownloadLink = reportPaths.hostedUrl || null;

    // 4️⃣ Send email
    const result = await sendEmail(
      email,
      reportFile,
      !hasPdf,        // inline if not PDF
      vin,
      pdfDownloadLink
    );
    await logEvent('generate-report', 'Email sent', { vin, email, result });

    console.log('✅ [GenerateReport] Report sent successfully:', result);
    return res.status(200).json({
      success: true,
      message: 'Report generated and emailed successfully.',
    });
  } catch (error) {
    console.error('❌ [GenerateReport] Error:', error);
    await logEvent('generate-report', 'Error', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};
