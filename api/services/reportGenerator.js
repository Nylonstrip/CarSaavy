const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { put } = require("@vercel/blob");

async function createReport(vehicleData) {
  console.log("🧾 [ReportGenerator] Starting PDF generation...");

  const doc = new PDFDocument();
  const fileName = `report-${vehicleData.vin}.pdf`;
  const filePath = path.join("/tmp", fileName);
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.fontSize(20).fillColor("#0a2540").text("CarSaavy Vehicle Report", { align: "center" });
  doc.moveDown();
  doc.fontSize(14).fillColor("black").text(`VIN: ${vehicleData.vin}`);
  doc.text(`Generated At: ${vehicleData.generatedAt}`);
  doc.moveDown();

  for (const [section, details] of Object.entries(vehicleData.sections || {})) {
    doc.fontSize(16).fillColor("#0a2540").text(section.toUpperCase());
    doc.fontSize(12).fillColor("black").text(JSON.stringify(details, null, 2));
    doc.moveDown();
  }

  doc.end();

  // Wait for PDF stream to finish writing
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  console.log("🖨️ [ReportGenerator] PDF file written:", filePath);
  console.log("📦 [ReportGenerator] Uploading report to Vercel Blob...");
  console.log("🔐 Blob token present:", !!process.env.BLOB_READ_WRITE_TOKEN);

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const { url } = await put(fileName, fileBuffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: "application/pdf",
    });

    console.log("✅ [ReportGenerator] Report uploaded successfully:", url);
    fs.unlinkSync(filePath); // clean up temp file
    return { success: true, url: blob.url };
  } catch (err) {
    console.error("❌ [ReportGenerator] Blob upload failed:", err);
    throw err;
  }
}

module.exports = { createReport };