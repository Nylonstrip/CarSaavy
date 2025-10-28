// /api/services/reportGenerator.js
const fs = require("fs");
const path = require("path");
const { put } = require("@vercel/blob");
const logger = require("./logger");

async function generateVehicleReport(vin, data) {
  try {
    logger.info(`[ReportGenerator] Starting PDF generation...`);

    // Basic summary header
    const summary = `
CarSaavy Vehicle Negotiation Report
===================================

VIN: ${vin}
Generated: ${new Date().toLocaleString()}

Summary:
- Make: ${data?.specs?.make || "N/A"}
- Model: ${data?.specs?.model || "N/A"}
- Year: ${data?.specs?.year || "N/A"}
- Trim: ${data?.specs?.trim || "N/A"}
- Estimated Fair Price: $${data?.pricing?.estFair || "N/A"}
- Dealer Asking: $${data?.pricing?.asking || "N/A"}
- Variance: ${data?.pricing?.variance ? `$${data.pricing.variance}` : "N/A"}

Key Points:
- Recalls: ${data?.recalls?.length || 0}
- Recent Repairs: ${data?.repairs?.length || 0}

Negotiation Notes:
- Ask about open recalls before closing.
- Verify maintenance records for recurring issues.
- Compare nearby listings within ±5% of asking price.

---

Detailed Sections
-----------------
Recalls:
${(data.recalls || []).map(r => `• ${r.title} (${r.status})`).join("\n") || "No recalls found."}

Repairs:
${(data.repairs || []).map(r => `• ${r.type} on ${r.date} (${r.miles || "N/A"} mi)`).join("\n") || "No repairs logged."}

End of Report.
`;

    // Save locally first
    const fileName = `report-${vin}.txt`;
    const filePath = path.join("/tmp", fileName);
    fs.writeFileSync(filePath, summary);

    logger.info(`[ReportGenerator] Text report written: ${filePath}`);

    // Upload to Vercel Blob
    logger.info(`[ReportGenerator] Uploading report to Vercel Blob...`);
    const blobBuffer = Buffer.from(summary, "utf-8");
    const uniqueName = `reports/${fileName.replace(".txt", `-${Date.now()}.txt`)}`;

    const upload = await put(uniqueName, blobBuffer, {
      access: "public",
      contentType: "text/plain",
    });

    logger.info(`[ReportGenerator] Upload complete: ${upload.url}`);
    return upload.url;
  } catch (err) {
    logger.error(`[ReportGenerator] Error generating report: ${err.message}`);
    return null;
  }
}

module.exports = { generateVehicleReport };
