const fs = require("fs");
const path = require("path");
const { Blob } = require("@vercel/blob");
const PDFDocument = require("pdfkit");
const logger = require("./logger");
const { sendAdminAlert } = require("./emailService");

async function generateVehicleReport(vin, vehicleData) {
  logger.info(`[ReportGenerator] Starting PDF generation...`);

  try {
    const doc = new PDFDocument({ margin: 50 });
    const filePath = `/tmp/report-${vin}.pdf`;
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // === HEADER ===
    doc
      .fontSize(24)
      .fillColor("#0A74DA")
      .text("CarSaavy Vehicle Negotiation Report", { align: "center" })
      .moveDown(0.5);
    doc
      .fontSize(12)
      .fillColor("#444")
      .text(`VIN: ${vin}`, { align: "center" })
      .moveDown(1.5);

    // === SUMMARY SECTION ===
    doc
      .fontSize(16)
      .fillColor("#000")
      .text("📊 Summary", { underline: true })
      .moveDown(0.5);
    doc
      .fontSize(12)
      .fillColor("#333")
      .text(
        "This report summarizes critical insights and negotiation leverage points based on vehicle data and history. Use these notes to identify deal breakers, value trends, and smart negotiation angles.",
        { align: "left" }
      )
      .moveDown(1);

    // === DATA SECTIONS ===
    const sections = [
      {
        title: "Vehicle Overview",
        color: "#0056b3",
        content: JSON.stringify(vehicleData.specs || {}, null, 2),
      },
      {
        title: "Pricing Insights",
        color: "#008037",
        content: JSON.stringify(vehicleData.pricing || {}, null, 2),
      },
      {
        title: "Recall History",
        color: "#D9534F",
        content: JSON.stringify(vehicleData.recalls || {}, null, 2),
      },
      {
        title: "Repair / Maintenance Records",
        color: "#F0AD4E",
        content: JSON.stringify(vehicleData.repairs || {}, null, 2),
      },
    ];

    for (const section of sections) {
      doc
        .moveDown(0.8)
        .fontSize(14)
        .fillColor(section.color)
        .text(section.title, { underline: true })
        .moveDown(0.3)
        .fontSize(10)
        .fillColor("#000")
        .text(section.content || "No data available", { align: "left" });
    }

    doc.end();

    await new Promise((resolve) => writeStream.on("finish", resolve));
    logger.info(`[ReportGenerator] PDF file written: ${filePath}`);

    // === UPLOAD TO BLOB (with unique filename) ===
    const blobClient = new Blob({
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    const fileBuffer = fs.readFileSync(filePath);
    const blobName = `reports/report-${vin}-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.pdf`;

    const start = Date.now();
    logger.info(`[BlobUpload] Attempt 1 for ${blobName}`);

    const blob = await blobClient.put(blobName, fileBuffer, {
      access: "public",
      contentType: "application/pdf",
    });

    const duration = Date.now() - start;
    logger.info(`⏱️ [ReportGenerator] Blob upload took ${duration} ms`);
    logger.info(`✅ [ReportGenerator] Report uploaded successfully: ${blob.url}`);

    return blob.url;
  } catch (err) {
    logger.error(`[ReportGenerator] Error generating report: ${err.message}`);

    // Admin alert fallback
    try {
      await sendAdminAlert(
        process.env.ADMIN_EMAIL,
        "🚨 CarSaavy Report Generation Error",
        `<p>VIN: ${vin}</p><p>Error: ${err.message}</p>`
      );
    } catch (alertErr) {
      logger.error(
        `[ReportGenerator] Failed to send admin alert: ${alertErr.message}`
      );
    }

    throw err;
  }
}

module.exports = { generateVehicleReport };
