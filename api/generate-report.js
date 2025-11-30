// api/generate-report.js
const { getAllVehicleData } = require("./services/vehicleData");
const { generateVehicleReport } = require("./services/reportGenerator");
const { sendVehicleReportEmail } = require("./services/emailService");

module.exports = async (req, res) => {
  const method = req.method || "GET";

  if (method !== "GET" && method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const vin =
      method === "GET" ? req.query.vin : (req.body && req.body.vin);
    const email =
      method === "GET" ? req.query.email : (req.body && req.body.email);

    console.log("[GenerateReport] Incoming request", { vin, email, method });

    if (!vin) {
      return res.status(400).json({
        success: false,
        error: "VIN is required",
      });
    }

    // 1) Fetch full vehicle data (same as webhook)
    console.log("[GenerateReport] Fetching vehicle data...");
    const vehicleData = await getAllVehicleData(vin);

    // 2) Generate the PDF + upload to Blob (same as webhook)
    console.log("[GenerateReport] Generating PDF report...");
    const reportUrl = await generateVehicleReport(vehicleData, vin);

    // 3) Optionally send via email if provided
    if (email) {
      console.log(
        "[GenerateReport] Email provided, sending report:",
        email
      );
      await sendVehicleReportEmail(email, vin, reportUrl);
    } else {
      console.log(
        "[GenerateReport] No email provided, skipping email send."
      );
    }

    // 4) Return JSON for dev / tools
    return res.status(200).json({
      success: true,
      vin,
      email: email || null,
      reportUrl,
      vehicleData,
    });
  } catch (err) {
    console.error("[GenerateReport] Error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to generate report",
      details:
        process.env.NODE_ENV === "development"
          ? String(err && err.message)
          : undefined,
    });
  }
};
