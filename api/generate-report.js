// api/generate-report.js
const { getAllVehicleData } = require("./services/vehicleData");
const { generateVehicleReport } = require("./services/reportGenerator");
const { sendVehicleReportEmail } = require("./services/emailService");

const { buildMvpAnalysis } = require("./mvpEngine");

function toNumberOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(/[$,]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

module.exports = async (req, res) => {
  const method = req.method || "GET";

  if (method !== "GET" && method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Accept both GET query params and POST body
    const vin = method === "GET" ? req.query.vin : (req.body && req.body.vin);
    const email = method === "GET" ? req.query.email : (req.body && req.body.email);

    // New: optional asking price (string like "$18,500" allowed)
    const askingPriceRaw =
      method === "GET" ? req.query.askingPrice : (req.body && req.body.askingPrice);
    const askingPrice = toNumberOrNull(askingPriceRaw);

    console.log("[GenerateReport] Incoming request", { vin, email, askingPrice, method });

    if (!vin) {
      return res.status(400).json({
        success: false,
        error: "VIN is required",
      });
    }

    // 1) Resolve vehicle profile / data (no scraping)
    // Keep this call for now so we don’t break your existing pipeline.
    // We’ll later simplify vehicleData.js to return only what PIC needs.
    console.log("[GenerateReport] Resolving vehicle data...");
    const vehicleData = await getAllVehicleData(vin);

    // 2) Build PIC_v1 analysis (model-first)
    // We try to read a vehicleProfile from vehicleData if you have it.
    // Otherwise, fall back to whatever year/make/model fields exist.
    const vehicleProfile =
      vehicleData && vehicleData.vehicleProfile
        ? vehicleData.vehicleProfile
        : {
            year: vehicleData?.year,
            make: vehicleData?.make,
            model: vehicleData?.model,
            trimBucket: vehicleData?.trimBucket || vehicleData?.trim || null,
            mileage: vehicleData?.mileage || null,
          };

    const analysis = buildMvpAnalysis({
      vin,
      vehicleProfile,
      askingPrice,
    });

    // 3) Generate PDF + upload (reportGenerator will be updated next to use `analysis`)
    console.log("[GenerateReport] Generating PDF report...");
    const reportUrl = await generateVehicleReport(
      {
        // Preferred input going forward
        analysis,

        // Temporary compatibility: keep old payload available until we refactor reportGenerator.js
        vehicleData,
      },
      vin
    );

    // 4) Optional email send
    if (email) {
      console.log("[GenerateReport] Email provided, sending report:", email);
      await sendVehicleReportEmail(email, vin, reportUrl);
    } else {
      console.log("[GenerateReport] No email provided, skipping email send.");
    }

    // 5) Return JSON (keep it dev-friendly, but don’t leak too much in prod)
    return res.status(200).json({
      success: true,
      vin,
      email: email || null,
      askingPrice,
      reportUrl,
      // Expose analysis because it’s what you’ll want to debug while building
      analysis,
      // Keep vehicleData for now since your existing tooling might expect it
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
