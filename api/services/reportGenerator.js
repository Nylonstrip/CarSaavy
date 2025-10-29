// /api/services/reportGenerator.js
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit"); // requires pdfkit in dependencies
const { put } = require("@vercel/blob");
const logger = require("./logger");

function line(doc) {
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor("#E5E7EB")
    .stroke()
    .moveDown(0.6);
}

function sectionTitle(doc, title, color = "#0A74DA") {
  doc
    .moveDown(0.8)
    .fillColor(color)
    .fontSize(14)
    .text(title, { underline: true })
    .fillColor("#111827")
    .moveDown(0.1);
}

function keyValue(doc, label, value) {
  doc
    .fontSize(11)
    .fillColor("#374151")
    .text(label, { continued: true })
    .fillColor("#111827")
    .text(` ${value ?? "N/A"}`);
}

function bulletList(doc, items) {
  if (!items || !items.length) {
    doc.fontSize(11).fillColor("#6B7280").text("— None —");
    return;
  }
  doc.fontSize(11).fillColor("#111827");
  items.forEach((t) => doc.text(`• ${t}`));
}

async function generateVehicleReport(vin, data) {
  try {
    logger.info(`[ReportGenerator] Starting PDF generation...`);

    const filePath = path.join("/tmp", `report-${vin}.pdf`);
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    doc
      .fillColor("#0A74DA")
      .fontSize(22)
      .text("CarSaavy Vehicle Negotiation Report", { align: "center" })
      .moveDown(0.4);
    doc
      .fontSize(11)
      .fillColor("#4B5563")
      .text(`VIN: ${vin}`, { align: "center" })
      .text(`Generated: ${new Date().toLocaleString()}`, { align: "center" })
      .moveDown(0.4);

    line(doc);

    // Summary
    sectionTitle(doc, "Summary", "#0A74DA");
    const make = data?.specs?.make || "N/A";
    const model = data?.specs?.model || "N/A";
    const year = data?.specs?.year || "N/A";
    const trim = data?.specs?.trim || "—";
    const asking = data?.pricing?.asking != null ? `$${data.pricing.asking}` : "N/A";
    const fair = data?.pricing?.estFair != null ? `$${data.pricing.estFair}` : "N/A";
    const variance =
      data?.pricing?.variance != null
        ? (data.pricing.variance > 0 ? `+$${data.pricing.variance}` : `-$${Math.abs(data.pricing.variance)}`)
        : "N/A";

    keyValue(doc, "Vehicle:", `${year} ${make} ${model} ${trim}`);
    keyValue(doc, "Dealer Asking:", asking);
    keyValue(doc, "Estimated Fair Price:", fair);
    keyValue(doc, "Variance vs. Fair:", variance);

    doc.moveDown(0.6);
    doc
      .fontSize(11)
      .fillColor("#111827")
      .text(
        "Use this summary as your quick reference when you’re at the dealership. If the asking price is above fair value, use the variance to push down, citing any recalls or maintenance gaps."
      );

    line(doc);

    // Quick Negotiation Pointers (static for MVP)
    sectionTitle(doc, "Negotiation Pointers", "#008037");
    bulletList(doc, [
      "Open with: “Based on similar listings and condition, I’m targeting fair market value.”",
      "Cite any open recalls and request resolution or a price reduction.",
      "Ask to see maintenance records. Missing history = leverage to lower price.",
      "If the offer is still firm above your target, politely walk away.",
    ]);

    // Vehicle Overview
    sectionTitle(doc, "Vehicle Overview", "#0A74DA");
    keyValue(doc, "Make/Model:", `${make} ${model}`);
    keyValue(doc, "Year/Trim:", `${year} ${trim}`);
    if (data?.specs) {
      const extra = { ...data.specs };
      delete extra.make;
      delete extra.model;
      delete extra.year;
      delete extra.trim;
      const extraKeys = Object.keys(extra);
      if (extraKeys.length) {
        doc.moveDown(0.3).fontSize(11).fillColor("#111827");
        extraKeys.forEach((k) => doc.text(`• ${k}: ${String(extra[k])}`));
      }
    }

    // Pricing Insights (MVP placeholders unless you have live data wired)
    sectionTitle(doc, "Pricing Insights", "#7C3AED");
    keyValue(doc, "Dealer Asking:", asking);
    keyValue(doc, "Estimated Fair:", fair);
    keyValue(doc, "Variance:", variance);
    doc.moveDown(0.3).fontSize(11).fillColor("#111827")
      .text(
        "Aim to bring the price within fair market range. If reconditioning or non-certified status applies, push below fair by $300–$800."
      );

    // Recalls
    sectionTitle(doc, "Recall History", "#D9534F");
    const recallLines =
      (data?.recalls || []).map((r) => `${r.title || r.name || "Recall"} (${r.status || "unknown"})`) || [];
    bulletList(doc, recallLines);

    // Repairs / Maintenance
    sectionTitle(doc, "Repair & Maintenance Notes", "#F59E0B");
    const repairLines =
      (data?.repairs || []).map((r) => `${r.type || "Service"} on ${r.date || "unknown"} (${r.miles || "N/A"} mi)`) ||
      [];
    bulletList(doc, repairLines);

    // Footer
    doc.moveDown(1);
    line(doc);
    doc
      .fontSize(9)
      .fillColor("#6B7280")
      .text(
        "This report provides negotiation-oriented guidance based on available data. Verify details with the seller and perform an independent inspection.",
        { align: "center" }
      );

    doc.end();

    // Wait for write to finish
    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    logger.info(`[ReportGenerator] PDF file written: ${filePath}`);

    // Upload to Vercel Blob as PDF
    const pdfBuffer = fs.readFileSync(filePath);
    const fileName = `reports/report-${vin}-${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
    const start = Date.now();
    logger.info(`[ReportGenerator] Uploading report to Vercel Blob...`);
    const upload = await put(fileName, pdfBuffer, {
      access: "public",
      contentType: "application/pdf",
    });
    logger.info(`[ReportGenerator] Blob uploaded in ${Date.now() - start}ms`);
    logger.info(`[ReportGenerator] Upload complete: ${upload.url}`);
    return upload.url;
  } catch (err) {
    logger.error(`[ReportGenerator] Error generating report: ${err.message}`);
    return null;
  }
}

module.exports = { generateVehicleReport };
