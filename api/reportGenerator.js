const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { put } = require("@vercel/blob");

// ===============================
// PDF Utilities (kept from your original)
// ===============================
function applyProtectiveSpacing(text) {
  if (!text || typeof text !== "string") return text;
  return text.replace(/([,.;!?])(\S)/g, "$1\u00A0$2");
}

function drawHybridParagraph(doc, text, opts = {}) {
  const {
    x = 60,
    y,
    width = 475,
    fontSize = 11,
    lineHeight = 14.5,
    paragraphGap = 10,
  } = opts;

  if (!text) return y;
  text = applyProtectiveSpacing(text);

  doc.fontSize(fontSize);
  const paragraphs = text.split("\n").map(p => p.trim()).filter(Boolean);

  let cursorY = y;
  paragraphs.forEach(p => {
    doc.text(p, x, cursorY, { width });
    cursorY += lineHeight + paragraphGap;
  });

  return cursorY;
}

function drawSectionHeader(doc, title, y) {
  const barX = 60;
  const barWidth = 475;
  const barHeight = 22;

  y += 14;
  doc.rect(barX, y, barWidth, barHeight).fill("#000000");
  doc.fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(title, barX + 10, y + 5);
  doc.fillColor("#000000");

  return y + barHeight + 20;
}

function ensureSpace(doc, y, needed = 120) {
  if (y + needed > doc.page.height - 70) {
    doc.addPage();
    return 120;
  }
  return y;
}

function drawHeader(doc, vinMasked) {
  doc.rect(0, 0, doc.page.width, 70).fill("#000000");
  doc.fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("CARSAAVY VEHICLE MARKET REPORT", 50, 20);

  doc.font("Helvetica").fontSize(10)
    .text(`VIN: ${vinMasked}`, 400, 24, { align: "right" })
    .text(`Generated: ${new Date().toLocaleDateString()}`, 400, 40, { align: "right" });

  doc.fillColor("#000000");
  return 110;
}

// ===============================
// MAIN REPORT GENERATOR (MVP)
// ===============================
async function generateVehicleReport({ analysis }, vin) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "LETTER", margin: 50 });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const tempFile = `/tmp/report-${timestamp}.pdf`;

      const stream = fs.createWriteStream(tempFile);
      doc.pipe(stream);

      let y = drawHeader(doc, analysis.vehicleProfile.vinMasked);

      // Helper wrapper
      const drawSection = (title, renderer) => {
        y = drawSectionHeader(doc, title, y);
        y = ensureSpace(doc, y);
        y = renderer(y);
        y += 24;
      };

      // 1. Executive Snapshot
      drawSection("EXECUTIVE SNAPSHOT", y0 => {
        const t = analysis;
        const text = `
This report provides a market-based value estimate and a practical negotiation strategy for the selected vehicle. 
The analysis is derived from static valuation models, ownership risk factors, and market context — not dealer listings or advertisements.
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 2. Vehicle Summary
      drawSection("VEHICLE SUMMARY", y0 => {
        const v = analysis.vehicleProfile;
        const text = `
Year: ${v.year || "N/A"}
Make: ${v.make || "N/A"}
Model: ${v.model || "N/A"}
Trim Category: ${v.trimBucket || "N/A"}
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 3. Estimated Vehicle Value
      drawSection("ESTIMATED VEHICLE VALUE", y0 => {
        const v = analysis.estimatedValue;
        const text = `
Estimated Market Range:
• Low: $${v.low.toLocaleString()}
• Typical: $${v.midpoint.toLocaleString()}
• High: $${v.high.toLocaleString()}
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 4. Market Position & Demand
      drawSection("MARKET POSITION & DEMAND", y0 => {
        const m = analysis.marketContext;
        const text = `
Market Position: ${m.position}
Demand Level: ${m.demandLevel}
Confidence Level: ${m.confidenceLevel}
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 5. Ownership Outlook
      drawSection("OWNERSHIP OUTLOOK", y0 => {
        const o = analysis.ownershipOutlook;
        const text = `
Reliability Assessment: ${o.reliability}
Maintenance Expectation: ${o.maintenance}
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 6. Negotiation Strategy & Buyer Leverage
      drawSection("NEGOTIATION STRATEGY & BUYER LEVERAGE", y0 => {
        const n = analysis.negotiationContext;
        const text = `
Buyer Leverage: ${n.buyerLeverage}
Recommended Tone: ${n.negotiationTone}

Suggested Approach:
1. Anchor the discussion around typical market value, not the asking price.
2. Test seller flexibility before committing to a number.
3. Introduce condition or history concerns prior to counteroffers.
4. Maintain your walk-away boundary if pricing exceeds fair value expectations.
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 7. Vehicle-Specific Factors
      drawSection("VEHICLE-SPECIFIC FACTORS TO CONSIDER", y0 => {
        const lines = analysis.conditionAdvisory || [];
        const text = lines.map(l => `• ${l}`).join("\n");
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 8. When to Walk Away
      drawSection("WHEN TO WALK AWAY", y0 => {
        const w = analysis.negotiationContext.walkAwayThreshold;
        const text = `
If negotiations exceed approximately $${w.toLocaleString()}, this vehicle is likely overpriced relative to its estimated market value.
Walking away at that point is generally the stronger financial decision unless additional value is introduced.
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 9. Methodology & Limitations
      drawSection("METHODOLOGY & LIMITATIONS", y0 => {
        const text = `
CarSaavy valuation models are based on static pricing frameworks, depreciation curves, and ownership risk indicators.
This report does not account for undisclosed damage, inspection findings, or dealer-specific incentives.
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      doc.end();

      stream.on("finish", async () => {
        const blob = await put(
          `reports/${path.basename(tempFile)}`,
          fs.readFileSync(tempFile),
          { access: "public" }
        );
        resolve(blob.url);
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateVehicleReport };
