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
  const paragraphs = text.split("\n").map((p) => p.trim()).filter(Boolean);

  let cursorY = y;
  paragraphs.forEach((p) => {
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
  doc
    .fillColor("#FFFFFF")
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
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("CARSAAVY NEGOTIATION READINESS REPORT", 50, 20);

  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`VIN: ${vinMasked || "N/A"}`, 400, 24, { align: "right" })
    .text(`Generated: ${new Date().toLocaleDateString()}`, 400, 40, { align: "right" });

  doc.fillColor("#000000");
  return 110;
}

function safeStr(v, fallback = "N/A") {
  const s = (v || "").toString().trim();
  return s ? s : fallback;
}

function safeJoinBullets(lines) {
  if (!Array.isArray(lines) || !lines.length) return "N/A";
  return lines.map((l) => `• ${l}`).join("\n");
}

// ===============================
// MAIN REPORT GENERATOR (NIC_v2)
// ===============================
async function generateVehicleReport({ analysis }, vin) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "LETTER", margin: 50 });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const tempFile = `/tmp/report-${timestamp}.pdf`;

      const stream = fs.createWriteStream(tempFile);
      doc.pipe(stream);

      // -------------------------------
// Compatibility adapter (NIC_v2)
// -------------------------------
    const vehicle = analysis?.vehicleSummary || {};
    const vp = {
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      segment: vehicle.segment,
      trimTier: vehicle.trimTier,
      mileage: vehicle.mileage,
      vinMasked: analysis?.vinMasked || null,
    };

   // -------------------------------
// Normalized Negotiation Profile (NIC_v2 → PDF)
// -------------------------------
const negotiationProfile = {
  categoryType: `Segment: ${vp.segment || "general"}`,

  demandVolatility:
    analysis?.segmentProfile?.demandVolatility || "medium",

  sellerFlexibility:
    analysis?.segmentProfile?.sellerFlexibility || "moderate",

  trimNegotiability:
    analysis?.trimLeverage?.negotiability || "moderate",

  leverageAngles:
    Array.isArray(analysis?.segmentProfile?.leverageAngles) &&
    analysis.segmentProfile.leverageAngles.length
      ? analysis.segmentProfile.leverageAngles
      : [],
};


    const ownershipOutlook = analysis?.ownership || {};

    // ---- Legacy key adapters (fill expected PDF fields) ----
    const depreciationLeverage = analysis?.depreciationLeverage || {
      timingPressure: "unknown",
      leveragePoints: [],
    };

    const conditionLeverage = analysis?.conditionLeverage || {
      ageTier: null,
      mileageTier: null,
      usageNotes: [],
      inspectionNotes: [],
    };

    const negotiationScripts = analysis?.negotiationScripts || {};
    const negotiationZones = analysis?.negotiationZones || {};

    // Build a legacy-style negotiation profile for the PDF
    const negotiationProfile = {
      categoryType: `Segment: ${vp.segment || "general"}`,
      demandVolatility: analysis?.segmentProfile?.demandVolatility || "medium",
      sellerFlexibility: analysis?.segmentProfile?.sellerFlexibility || "moderate",
      trimNegotiability: analysis?.trimLeverage?.negotiability || "moderate",
      leverageAngles:
        analysis?.segmentProfile?.leverageAngles && analysis.segmentProfile.leverageAngles.length
          ? analysis.segmentProfile.leverageAngles
          : [],
    };


      let y = drawHeader(doc, vp.vinMasked);

      // Helper wrapper
      const drawSection = (title, renderer) => {
        y = drawSectionHeader(doc, title, y);
        y = ensureSpace(doc, y);
        y = renderer(y);
        y += 24;
      };

      // 1. Executive Snapshot
      drawSection("EXECUTIVE SNAPSHOT", (y0) => {
        const text = `
This report is designed to help you negotiate more effectively by focusing on defensible leverage: timing pressure, inspection risk, and category behavior.
It is not based on live dealer listings, advertisements, or exact “true value” pricing—its purpose is to help you speak confidently and avoid overpaying through uncertainty.
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 2. Vehicle Summary
      drawSection("VEHICLE SUMMARY", (y0) => {
        const text = `
Year: ${vp.year || "N/A"}
Make: ${safeStr(vp.make)}
Model: ${safeStr(vp.model)}
Segment: ${safeStr(vp.segment)}
Trim Tier: ${safeStr(vp.trimTier)}
Mileage: ${vp.mileage === null || vp.mileage === undefined ? "N/A" : vp.mileage.toLocaleString()}
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 3. Negotiation Profile
      drawSection("NEGOTIATION PROFILE", (y0) => {
        const np = negotiationProfile || {};
        const text = `
Category Type: ${safeStr(np.segmentCategory)}
Demand Volatility: ${safeStr(np.demandVolatility)}
Expected Seller Flexibility: ${safeStr(np.sellerFlexibility)}
Trim Negotiability: ${safeStr(np.trimNegotiability)}

Primary Leverage Angles:
${safeJoinBullets(np.leverageAngles)}
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 4. Depreciation & Timing Leverage
      drawSection("DEPRECIATION & TIMING LEVERAGE", (y0) => {
        const dl = analysis?.depreciationLeverage || {};
        const points = Array.isArray(dl.leveragePoints) ? dl.leveragePoints : [];
        const text = `
Timing Pressure Tier: ${safeStr(dl.timingPressure)}

Key Leverage Points:
${safeJoinBullets(points)}
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 5. Condition & Mileage Leverage
      drawSection("CONDITION & MILEAGE LEVERAGE", (y0) => {
        const cl = analysis?.conditionLeverage || {};
        const points = Array.isArray(cl.leveragePoints) ? cl.leveragePoints : [];
        const known = Array.isArray(cl.knownIssues) ? cl.knownIssues : [];

        const ageTier = cl.ageTier?.label ? cl.ageTier.label : "N/A";
        const mileageTier = cl.mileageTier?.label ? cl.mileageTier.label : "N/A";

        const text = `
Age Tier: ${ageTier}
Mileage Tier: ${mileageTier}

How to use this:
${safeJoinBullets(points)}

Common model discussion points (use selectively):
${known.length ? safeJoinBullets(known) : "• N/A"}
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 6. Ownership Outlook
      drawSection("OWNERSHIP OUTLOOK", (y0) => {
        const o = ownershipOutlook || {};
        const notes = Array.isArray(o.notes) ? o.notes : [];
        const text = `
Reliability Outlook: ${safeStr(o.reliability)}
Maintenance Expectation: ${safeStr(o.maintenance)}

Notes:
${notes.length ? safeJoinBullets(notes) : "• N/A"}
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 7. What to Say in the Room
      drawSection("WHAT TO SAY IN THE ROOM", (y0) => {
        const s = analysis?.negotiationScripts || {};
        const text = `
Use these lines to stay calm, professional, and in control of the conversation:

Opening:
• ${safeStr(s.opener)}

Frame the category:
• ${safeStr(s.categoryFrame)}

Delay numbers until condition is confirmed:
• ${safeStr(s.inspectionDelay)}

Depreciation / timing framing:
• ${safeStr(s.ageFrame)}

Mileage framing:
• ${safeStr(s.mileageFrame)}

Trim-tier framing:
• ${safeStr(s.trimFrame)}

Asking price acknowledgement (if provided):
• ${safeStr(s.askingPriceFrame)}

Fees / add-ons pivot:
• ${safeStr(s.feesPivot)}

Transition into your counter:
• ${safeStr(s.softCounterSetup)}
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 8. Negotiation Zones
      drawSection("NEGOTIATION ZONES", (y0) => {
        const nz = analysis?.negotiationZones || {};
        const zones = Array.isArray(nz.zones) ? nz.zones : [];
        const bullets = zones.length
          ? zones.map((z) => `• ${safeStr(z.label)} — ${safeStr(z.meaning)}`).join("\n")
          : "• N/A";

        const text = `
These zones describe how negotiation typically progresses:

${bullets}

Note:
${safeStr(nz.note)}
        `;
        return drawHybridParagraph(doc, text, { y: y0 });
      });

      // 9. Methodology & Limitations (tight + honest)
      drawSection("METHODOLOGY & LIMITATIONS", (y0) => {
        const text = `
This report focuses on negotiation leverage derived from vehicle category behavior, depreciation timing, and inspection risk.
It does not use live dealer listings, regional comparables, or proprietary market feeds.

Final negotiated outcomes depend heavily on:
• Condition and inspection results
• Service history and ownership records
• Dealer fees, add-ons, and financing terms
• Local inventory and buyer urgency

Best practice: confirm condition and the full out-the-door price before committing to a final number.
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
