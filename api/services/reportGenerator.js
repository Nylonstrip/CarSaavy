// api/services/reportGenerator.js
const { put } = require("@vercel/blob");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const log = require("./logger").scope("ReportGenerator");

async function generateReport(vehicleData) {
  try {
    log.info("Generating PDF…");

    const doc = new PDFDocument();
    const fileName = `report-${vehicleData.vin}.pdf`;
    const filePath = path.join("/tmp", fileName);

    const ws = fs.createWriteStream(filePath);
    doc.pipe(ws);

    // Minimal, readable MVP layout
    doc.fontSize(20).text("CarSaavy Vehicle Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`VIN: ${vehicleData.vin}`);
    doc.text(`Generated: ${vehicleData.generatedAt}`);
    doc.moveDown();

    for (const [section, details] of Object.entries(vehicleData.sections || {})) {
      doc.fontSize(14).text(section.toUpperCase(), { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(JSON.stringify(details, null, 2));
      doc.moveDown();
    }

    doc.end();
    await new Promise((res) => ws.on("finish", res));
    log.info("PDF ready:", filePath);

    // Unique key + retry-safe upload
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const uniqueKey = `reports/report-${vehicleData.vin}-${timestamp}.pdf`;
    const fileBuffer = fs.readFileSync(filePath);

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      log.error("Missing BLOB_READ_WRITE_TOKEN");
      return { success: false, error: "Missing blob token" };
    }

    const start = Date.now();
    let attempt = 0;
    const maxRetries = 3;
    const retryDelay = 1000;

    while (attempt < maxRetries) {
      try {
        attempt++;
        log.info(`Blob upload attempt ${attempt} → ${uniqueKey}`);
        const blob = await put(uniqueKey, fileBuffer, {
          access: "public",
          token: process.env.BLOB_READ_WRITE_TOKEN,
          contentType: "application/pdf",
        });
        log.info(`Blob uploaded in ${Date.now() - start}ms`);
        log.info("Blob URL:", blob.url);
        return { success: true, url: blob.url };
      } catch (err) {
        log.warn(`Blob upload failed (attempt ${attempt}):`, err.message);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, retryDelay));
        } else {
          log.error("Blob upload failed after 3 attempts");
          return { success: false, error: err.message };
        }
      }
    }
  } catch (err) {
    log.error("Report generation failed:", err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { generateReport };