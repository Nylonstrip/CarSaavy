// api/services/reportGenerator.js
const { put } = require("@vercel/blob");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

async function generateReport(vehicleData) {
  console.log("🧾 [ReportGenerator] Starting PDF generation...");

  try {
    const doc = new PDFDocument();
    const fileName = `report-${vehicleData.vin}.pdf`;
    const filePath = path.join("/tmp", fileName);

    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Basic title/info for MVP
    doc.fontSize(20).text("CarSaavy Vehicle Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`VIN: ${vehicleData.vin}`);
    doc.text(`Generated At: ${vehicleData.generatedAt}`);
    doc.moveDown();

    for (const [section, details] of Object.entries(vehicleData.sections)) {
      doc.fontSize(14).text(section.toUpperCase(), { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(JSON.stringify(details, null, 2));
      doc.moveDown();
    }

    doc.end();

    await new Promise((resolve) => writeStream.on("finish", resolve));
    console.log("🖨️ [ReportGenerator] PDF file written:", filePath);

    console.log("📦 [ReportGenerator] Uploading report to Vercel Blob...");
    console.log("🔐 Blob token present:", !!process.env.BLOB_READ_WRITE_TOKEN);

    const start = Date.now();

    try {
      const blob = await put(`reports/${fileName}`, fs.readFileSync(filePath), {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      console.log("⏱️ [ReportGenerator] Blob upload took", Date.now() - start, "ms");
      console.log("✅ [ReportGenerator] Report uploaded successfully:", blob.url);
      return { success: true, url: blob.url };
    } catch (err) {
      console.error("❌ [ReportGenerator] Blob upload failed after", Date.now() - start, "ms:", err);
      return { success: false, error: err };
    }
  } catch (err) {
    console.error("🔥 [ReportGenerator] Failed to generate PDF:", err);
    return { success: false, error: err };
  }
}

module.exports = { generateReport };