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

    // --- Blob upload logic ---
    console.log("📦 [ReportGenerator] Uploading report to Vercel Blob...");
    console.log("🔐 Blob token present:", !!process.env.BLOB_READ_WRITE_TOKEN);

    const start = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const uniqueKey = `reports/report-${vehicleData.vin}-${timestamp}.pdf`;
    const fileBuffer = fs.readFileSync(filePath);

    let attempt = 0;
    const maxRetries = 3;
    const retryDelay = 1000;

    while (attempt < maxRetries) {
      try {
        console.log(`📦 [BlobUpload] Attempt ${attempt + 1} for ${uniqueKey}`);

        const blob = await put(uniqueKey, fileBuffer, {
          access: "public",
          token: process.env.BLOB_READ_WRITE_TOKEN,
          contentType: "application/pdf",
        });

        console.log(`⏱️ [ReportGenerator] Blob upload took ${Date.now() - start} ms`);
        console.log(`✅ [ReportGenerator] Report uploaded successfully: ${blob.url}`);
        return { success: true, url: blob.url };

      } catch (err) {
        attempt++;
        console.error(`❌ [BlobUpload] Upload failed on attempt ${attempt}:`, err.message);

        if (attempt < maxRetries) {
          console.log(`🔁 Retrying in ${retryDelay}ms...`);
          await new Promise((r) => setTimeout(r, retryDelay));
        } else {
          console.error("🔥 [BlobUpload] Failed after 3 attempts:", err.message);
          return { success: false, error: err.message };
        }
      }
    }
  } catch (err) {
    console.error("🔥 [ReportGenerator] Fatal error during report generation:", err);
    return { success: false, error: err.message };
  }
}

module.exports = { generateReport };