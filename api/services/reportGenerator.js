// /api/services/reportGenerator.js
const fs = require("fs");
const path = require("path");
const { put } = require("@vercel/blob");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const logger = require("./logger");
const { sendAdminAlert } = require("./emailService");

// Admin notifications
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "carsaavy@gmail.com";

// Helper: timestamped filename
function generateTimestampedFilename(vin) {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  return `reports/report-${vin}-${now}.pdf`;
}

// Main function
async function generateVehicleReport(vin, vehicleData) {
  logger.info(`[ReportGenerator] Starting PDF generation...`);
  const startTime = Date.now();
  const tempFilePath = path.join("/tmp", `report-${vin}.pdf`);

  try {
    // Create the PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const { width, height } = page.getSize();
    const margin = 50;
    let y = height - margin;

    // Title
    page.drawText("CarSaavy Vehicle Report", {
      x: margin,
      y,
      size: 20,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 30;

    // VIN Summary
    page.drawText(`VIN: ${vin}`, { x: margin, y, size: 12, font });
    y -= 20;
    page.drawText(`Generated: ${new Date().toLocaleString()}`, { x: margin, y, size: 12, font });
    y -= 30;

    // Summary header
    page.drawText("Summary Highlights:", { x: margin, y, size: 14, font });
    y -= 20;
    const highlights = [
      `Make: ${vehicleData?.specs?.make || "Unknown"}`,
      `Model: ${vehicleData?.specs?.model || "Unknown"}`,
      `Year: ${vehicleData?.specs?.year || "Unknown"}`,
      `Trim: ${vehicleData?.specs?.trim || "N/A"}`,
      `Estimated Price: ${vehicleData?.pricing?.asking || "N/A"}`,
    ];
    highlights.forEach((line) => {
      page.drawText(`• ${line}`, { x: margin + 10, y, size: 12, font });
      y -= 18;
    });
    y -= 10;

    // Recall section
    page.drawText("Recalls:", { x: margin, y, size: 14, font });
    y -= 20;
    if (vehicleData.recalls?.length) {
      vehicleData.recalls.forEach((recall) => {
        page.drawText(`• ${recall.title} (${recall.status})`, { x: margin + 10, y, size: 12, font });
        y -= 16;
      });
    } else {
      page.drawText("No recalls found.", { x: margin + 10, y, size: 12, font });
      y -= 16;
    }

    // Save PDF locally
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(tempFilePath, pdfBytes);
    logger.info(`[ReportGenerator] PDF file written: ${tempFilePath}`);

    // Upload to Vercel Blob
    const filePath = generateTimestampedFilename(vin);
    logger.info(`[ReportGenerator] Uploading report to Vercel Blob...`);

    const startUpload = Date.now();
    const blobData = Buffer.from(pdfBytes); // ✅ FIXED: Buffer instead of Blob

    const blob = await put(filePath, blobData, {
      access: "public",
      contentType: "application/pdf",
    });

    const uploadTime = Date.now() - startUpload;
    logger.info(`[ReportGenerator] Blob uploaded in ${uploadTime}ms`);
    logger.info(`[ReportGenerator] Blob URL: ${blob.url}`);

    const totalTime = Date.now() - startTime;
    logger.info(`[ReportGenerator] Report generated in ${totalTime}ms`);

    return blob.url;
  } catch (err) {
    logger.error(`[ReportGenerator] Error generating report: ${err.message}`);
    try {
      await sendAdminAlert(
        ADMIN_EMAIL,
        "Report generation failed",
        `<p>VIN: ${vin}</p><p>${err.message}</p>`
      );
    } catch (e) {
      logger.warn(`[ReportGenerator] Admin alert failed: ${e.message}`);
    }
    return null;
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch (cleanupErr) {
      logger.warn(`[ReportGenerator] Cleanup failed: ${cleanupErr.message}`);
    }
  }
}

module.exports = { generateVehicleReport };