const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { put } = require("@vercel/blob");
const SECTION_GAP = 6;
const SUBSECTION_GAP = 4;


// ===============================
// Fallback Copy (MVP-Safe)
// ===============================
const FALLBACK_OPENING_SCRIPTS = [
  "I’m interested in the vehicle, but I want to make sure the price reflects its condition, age, and the alternatives I’m currently reviewing.",
  "Before committing, I’d like to understand how this price accounts for inspection risk and total ownership cost.",
];

const FALLBACK_CATEGORY_FRAMING = [
  "Vehicles in this category are often priced optimistically at first, with flexibility emerging once condition and alternatives are discussed.",
  "I’m comparing this vehicle against similar options to understand where pricing movement may exist.",
];

const FALLBACK_TIMING_LEVERAGE = [
  "Vehicles naturally face depreciation over time, regardless of condition.",
  "As listings remain on the market, sellers often become more flexible when buyers demonstrate readiness and alternatives.",
];

const FALLBACK_CONDITION_LEVERAGE = [
  "Final pricing should reflect inspection findings, wear items, and near-term maintenance considerations.",
  "Items like tires, brakes, and suspension components materially affect ownership cost and should be accounted for.",
];

const FALLBACK_OWNERSHIP_OUTLOOK = [
  "Ownership costs can vary significantly based on maintenance history and prior use.",
  "Service records and inspection results play a major role in determining fair final pricing.",
];

const FALLBACK_NEGOTIATION_ZONES = {
  discovery: [
    "Focus on gathering information before committing to a number.",
    "Let the seller explain pricing justification and included value.",
    "Avoid anchoring too early.",
  ],
  anchored: [
    "Shift discussion toward inspection risk, alternatives, and total out-the-door cost.",
    "Use condition findings and market comparisons to justify adjustments.",
    "Be prepared to pause or walk if terms don’t align.",
  ],
};


// ===============================
// PDF Utilities (unchanged styling)
// ===============================
function applyProtectiveSpacing(text) {
  if (!text || typeof text !== "string") return text;
  return text.replace(/([,.;!?])(\S)/g, "$1\u00A0$2");
}

function safeJoinBullets(lines) {
  return lines.map((l) => `• ${l}`).join("\n");
}

function ensureBullets(lines, fallback) {
  return Array.isArray(lines) && lines.length ? lines : fallback;
}

function drawHybridParagraph(doc, text, opts = {}) {
  const {
    x = 60,
    y,
    width = 475,
    fontSize = 11,
    lineGap = 2,       // tighter lines
    paragraphGap = 8,  // small gap after block
  } = opts;

  if (!text) return doc.y;

  text = applyProtectiveSpacing(String(text)).trim();
  if (!text) return doc.y;

  // Use doc.y as the single source of truth
  if (typeof y === "number") doc.y = y;

  doc.fontSize(fontSize);

  // IMPORTANT: render the entire block at once (handles \n internally)
  doc.text(text, x, doc.y, { width, lineGap });

  // Add a small gap after the block
  doc.y += paragraphGap;

  return doc.y;
}


function drawSectionHeader(doc, title) {
  const y = doc.y;

  // Black header bar
  doc
    .rect(40, y, 520, 24)
    .fill("#000");

  // Header text
  doc
    .fillColor("#fff")
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(title, 50, y + 7);

  // Reset text color for body
  doc.fillColor("#000");

  // Advance cursor
  doc.y = y + 32;
}



function ensureSpace(doc, bottomPadding = 120, topY = 110) {
  if (doc.y > doc.page.height - bottomPadding) {
    doc.addPage();
    doc.y = topY;
  }
}


function drawHeader(doc, vinMasked) {
  doc.rect(0, 0, doc.page.width, 70).fill("#000000");
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(18)
    .text("CARSAAVY NEGOTIATION READINESS REPORT", 50, 20);
  doc.font("Helvetica").fontSize(10)
    .text(`VIN: ${vinMasked || "N/A"}`, 400, 24, { align: "right" })
    .text(`Generated: ${new Date().toLocaleDateString()}`, 400, 40, { align: "right" });
  doc.fillColor("#000000");
  return 110;
}

function getInspectionGuidance(priority) {
  switch (priority) {
    case "critical":
      return {
        label: "Critical Inspection Priority",
        body: `This vehicle’s age places it in a high-risk inspection category.
A professional pre-purchase inspection should be completed before any price discussions or commitments.
Use inspection findings as primary leverage, and be prepared to pause or walk away if material issues surface.`,
      };

    case "elevated":
      return {
        label: "Elevated Inspection Priority",
        body: `Given the vehicle’s age, a pre-purchase inspection is strongly recommended.
Inspection findings should be used strategically during negotiation to justify price adjustments or concessions.`,
      };

    default:
      return {
        label: "Standard Inspection Priority",
        body: `A pre-purchase inspection is recommended to confirm overall condition.
While not urgent, inspection results can still be used to support negotiation if discrepancies are found.`,
      };
  }
}


// ===============================
// MAIN REPORT GENERATOR
// ===============================
async function generateVehicleReport({ analysis }) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "LETTER", margin: 50 });
      const tempFile = `/tmp/report-${Date.now()}.pdf`;
      const stream = fs.createWriteStream(tempFile);
      doc.pipe(stream);

      const vp = analysis?.vehicleSummary || {};
      let y = drawHeader(doc, vp.vinMasked);

      const drawSection = (title, renderer) => {
        // page break guard BEFORE header
        ensureSpace(doc);
      
        drawSectionHeader(doc, title);
      
        // renderer returns a y (because drawHybridParagraph returns y)
        const nextY = renderer(doc.y);
      
        if (typeof nextY === "number" && Number.isFinite(nextY)) {
          doc.y = nextY;
        }
      
        doc.y += SECTION_GAP;
      };
      
      
      doc.y += 18;


      // EXECUTIVE SNAPSHOT
      drawSection("EXECUTIVE SNAPSHOT", (y0) =>
        drawHybridParagraph(doc,
          "This report helps you negotiate effectively using defensible leverage such as timing pressure, inspection risk, and category behavior. It is designed to support confident, professional negotiation—not to provide exact market pricing.",
          { y: y0 }
        )
      );




      drawSection("YOUR NEGOTIATION POSTURE", (y0) =>
        drawHybridParagraph(
          doc,
          `Recommended stance: ${analysis?.negotiationStance || "balanced"}
      
      This stance defines how assertive you should be during discussions. Avoid emotional commitment early and let condition, inspection risk, and alternatives control the pace.`,
          { y: y0 }
        )
      );
      
      doc.y += SUBSECTION_GAP;

      if (!analysis?.hasAskingPrice) {
        drawHybridParagraph(
          doc,
          "Note: Adding the seller’s asking price allows for more precise negotiation posture, escalation timing, and pressure responses. Without it, the report defaults to a discovery-first strategy to avoid overcommitting.",
          { y: doc.y + 8 }
        );
      }
      

      // VEHICLE SUMMARY
      drawSection("VEHICLE SUMMARY", (y0) =>
        drawHybridParagraph(doc,
          `Year: ${vp.year}\nMake: ${vp.make}\nModel: ${vp.model}\nSegment: ${vp.segment}\nTrim Tier: ${vp.trimTier}\nMileage: ${vp.mileage}\nAsking Price (Seller): ${vp.askingPrice}
          
          Why this matters:
          • Vehicles in the ${vp.segment} segment tend to negotiate differently than necessity-based inventory
          • ${vp.trimTier} trims influence cross-shopping leverage and dealer flexibility`,
          { y: y0 }
        )
      );

      // NEGOTIATION SCRIPTS
        drawSection("NEGOTIATION MOVES", (y0) => {
          const moves = analysis?.negotiationMoves || {};
        
          const content = `
        OPENING MOVE
        • ${moves.openingMove || FALLBACK_OPENING_SCRIPTS[0]}
        
        PRESSURE RESPONSE
        • ${moves.pressureResponse || FALLBACK_CATEGORY_FRAMING[0]}
        
        WALK-AWAY LINE
        • ${moves.walkAwayLine || "I’m comfortable stepping back if the terms don’t align."}
        `;
        
          return drawHybridParagraph(doc, content, { y: y0 });
        });
    
        //IF THE DEALER PUSHES BACK
        drawSection("IF THE DEALER PUSHES BACK", (y0) => {
          const responses = analysis?.dealerPushbackResponses || [];
        
          if (!responses.length) {
            return drawHybridParagraph(
              doc,
              "Stay calm, avoid reacting emotionally, and anchor discussions around condition, inspection results, and alternatives.",
              { y: y0 }
            );
          }
        
          const formatted = responses
            .map(
              (r) =>
                `If they say:\n• "${r.dealerSays}"\nYou respond:\n• ${r.buyerResponse}`
            )
            .join("\n\n");
        
          return drawHybridParagraph(doc, formatted, { y: y0 });
        });



        //WHEN TO ESCALATE OR EXIT
        drawSection("WHEN TO ESCALATE OR EXIT", (y0) => {
          const guidance = analysis?.escalationGuidance;
        
          if (!guidance) {
            return drawHybridParagraph(
              doc,
              "Escalate when discussions stall or become repetitive. Exit when leverage is exhausted and alternatives remain.",
              { y: y0 }
            );
          }
        
          const content = `
        ESCALATE WHEN:
        ${safeJoinBullets(guidance.escalateWhen)}
        
        EXIT WHEN:
        ${safeJoinBullets(guidance.exitWhen)}
        `;
        
          return drawHybridParagraph(doc, content, { y: y0 });
        });
        

      // CATEGORY & TIMING
      drawSection("DEPRECIATION & TIMING LEVERAGE", (y0) => {
        drawHybridParagraph(
          doc,
          `• Vehicles depreciate over time regardless of condition.
      • Timing, inventory age, and dealer pressure influence flexibility.
      • Older or slower-moving inventory creates leverage without confrontation.`,
          { y: y0 }
        );
      });

      

      // CONDITION
      drawSection("CONDITION & OWNERSHIP CONSIDERATIONS", (y0) => {
        const condition = ensureBullets(
          analysis?.conditionLeverage?.notes,
          FALLBACK_CONDITION_LEVERAGE
        );
        const ownership = ensureBullets(
          analysis?.ownership?.notes,
          FALLBACK_OWNERSHIP_OUTLOOK
        );
        return drawHybridParagraph(
          doc,
          safeJoinBullets([...condition, ...ownership]),
          { y: y0 }
        );
      });

      // TRIM & CONFIGURATION LEVERAGE
      drawSection("TRIM & CONFIGURATION LEVERAGE", (y0) => {
        const trimNotes = ensureBullets(
          analysis?.trimLeverage?.notes,
          [
            "Trim level influences availability and cross-shopping leverage.",
            "Negotiation strength varies depending on configuration demand."
          ]
        );
        return drawHybridParagraph(doc, safeJoinBullets(trimNotes), { y: y0 });
      });

      //Inspection Guidance
      const inspection = getInspectionGuidance(analysis.inspectionPriority);

      drawSection("INSPECTION GUIDANCE", (y0) =>
        drawHybridParagraph(
          doc,
          `
      ${inspection.label}
      
      ${inspection.body}
      `,
          { y: y0 }
        )
      );
      

      // NEGOTIATION ZONES
      drawSection("NEGOTIATION ZONES", (y0) => {
        drawHybridParagraph(
          doc,
          `
      Discovery Phase:
      • Do NOT make an offer in this phase.
      • Focus on extracting pricing justification, condition details, and urgency.
      
      Anchored Phase:
      • Engage only after inspection or clear justification.
      • Apply pressure using condition, age, and alternatives.
      
      Pressure Phase:
      • Push for movement once leverage is established.
      • Be prepared to pause or exit if progress stalls.
      `,
          { y: y0 }
        );
      });

      

      // METHODOLOGY
      drawSection("METHODOLOGY & LIMITATIONS", (y0) =>
        drawHybridParagraph(doc,
          "This report does not use live listings or pricing APIs. It focuses on negotiation leverage derived from vehicle characteristics, timing pressure, and inspection risk. Final outcomes depend on dealer behavior, condition, and buyer discipline.",
          { y: y0 }
        )
      );

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
