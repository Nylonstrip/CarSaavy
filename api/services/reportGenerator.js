// api/services/reportGenerator.js
const PDFDocument = require("pdfkit");
const fs = require("fs");
const { put } = require("@vercel/blob");

// Optional logger — safe to disable if not in use
// const { logEvent } = require("./logger");

async function createReport(vehicleData) {
  try {
    console.log("🧾 [ReportGenerator] Starting PDF generation...");

    const fileName = `report-${vehicleData.vin}.pdf`;
    const filePath = `/tmp/${fileName}`;

    // Initialize PDF document
    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // ---- HEADER ----
    doc.fontSize(20).text("CarSaavy Vehicle Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(`VIN: ${vehicleData.vin}`);
    doc.text(`Generated: ${vehicleData.generatedAt}`);
    doc.moveDown();

    // ---- VEHICLE DETAILS ----
    doc.fontSize(16).text("Vehicle Information", { underline: true });
    doc.moveDown(0.5);

    const sections = vehicleData.sections || {};
    for (const [sectionName, sectionData] of Object.entries(sections)) {
      doc.fontSize(14).text(sectionName.toUpperCase(), { bold: true });
      doc.fontSize(12).text(JSON.stringify(sectionData, null, 2));
      doc.moveDown(1);
    }

    doc.end();

    // Wait for PDF to finish writing
    await new Promise((resolve) => writeStream.on("finish", resolve));

    console.log("📦 [ReportGenerator] Uploading report to Vercel Blob...");

    // Upload to Vercel Blob for hosted access
    const { url } = await put(fileName, fs.createReadStream(filePath), {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: "application/pdf",
    });

    console.log(`✅ [ReportGenerator] Report uploaded successfully: ${url}`);

    // Optional: Log or store for analytics
    // await logEvent("report_generated", { vin: vehicleData.vin, url });

    return { pdfPath: filePath, hostedUrl: url };
  } catch (err) {
    console.error("❌ [ReportGenerator] Error generating report:", err);
    return { error: err.message };
  }
}

module.exports = { createReport };