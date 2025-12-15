const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { put } = require("@vercel/blob");
const { buildMvpAnalysis } = require('./mvpEngine');

// ===============================
// PDF Formatting Utilities
// ===============================
function space(doc, units = 1) {
  doc.moveDown(units);
}

function sectionDivider(doc) {
  const y = doc.y + 2;
  doc.moveTo(40, y).lineTo(550, y).stroke();
  space(doc, 0.5);
}

function newSection(doc, title) {
  if (doc.y > 650) doc.addPage(); // avoid awkward split

  doc.font("Helvetica-Bold").fontSize(16).text(title, {
    underline: true,
  });

  space(doc, 0.5);
  sectionDivider(doc);
  space(doc, 0.5);
}

function subheader(doc, text) {
  doc.font("Helvetica-Bold").fontSize(12).text(text);
  space(doc, 0.3);
}

function bodyText(doc, text) {
  doc.font("Helvetica").fontSize(10).text(text, {
    width: 550,
    align: "left",
  });
  space(doc, 0.4);
}

function bullet(doc, text) {
  doc.font("Helvetica").fontSize(10).text(`• ${text}`, {
    width: 550,
    align: "left",
  });
  space(doc, 0.3);
}


/* =======================================================================
   PROTECTIVE SPACING (Option C - FULL)
   - Ensures spaces after punctuation can't be collapsed by PDF engine
   ======================================================================= */
function applyProtectiveSpacing(text) {
  if (!text || typeof text !== "string") return text;

  // Add non-breaking space after common punctuation if followed by a non-space
  return text
    .replace(/([,.;!?])(\S)/g, "$1\u00A0$2")
    .replace(/(\))(\S)/g, "$1\u00A0$2")
    .replace(/(")(\S)/g, "$1\u00A0$2");
}


/* =======================================================================
   HYBRID PARAGRAPH ENGINE
   - Hybrid justification ONLY for long, multi-line paragraphs
   - Short paragraphs / special sections stay left-aligned
   ======================================================================= */
function drawHybridParagraph(doc, text, opts = {}) {
  let {
    x = 60,
    y,
    width = 475,
    fontSize = 11.5,
    lineHeight = 14.5,
    paragraphGap = 8,
    disableJustify = false,
  } = opts;

  if (!text) return y;

  text = applyProtectiveSpacing(text);
  doc.fontSize(fontSize);

  const paragraphs = text
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  let cursorY = y;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(" ");
    let line = "";
    const lines = [];

    // Word wrapping
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (doc.widthOfString(candidate, { fontSize }) > width) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);

    // Render each line
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      const isLastLine = i === lines.length - 1;
      const wordsInLine = currentLine.split(" ");
      const wordCount = wordsInLine.length;
      const naturalWidth = doc.widthOfString(currentLine, { fontSize });

      let shouldJustify = false;

      if (!disableJustify) {
        shouldJustify =
          !isLastLine &&
          wordCount >= 10 &&
          naturalWidth >= width * 0.92 &&
          currentLine.length >= 90;
      }

      if (shouldJustify) {
        // Mild justification
        const gaps = wordCount - 1;
        const extra = (width - naturalWidth) / gaps;
        let cursorX = x;

        for (const w of wordsInLine) {
          doc.text(w, cursorX, cursorY, { lineBreak: false });
          cursorX += doc.widthOfString(w, { fontSize }) + extra;
        }
      } else {
        // Normal left-aligned
        doc.text(currentLine, x, cursorY, { width });
      }

      cursorY += lineHeight;
    }

    cursorY += paragraphGap;
  }

  return cursorY;
}

/* =======================================================================
   SECTION HEADER (Option B - Medium Width Black Bar)
   ======================================================================= */
function drawSectionHeader(doc, title, y) {
  const barX = 60;
  const barWidth = 475;
  const barHeight = 22;

  // Top padding before section
  y += 14;

  // Black bar
  doc.rect(barX, y, barWidth, barHeight).fill("#000000");

  // Title text
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(title, barX + 10, y + 5);

  // Reset fill
  doc.fillColor("#000000");

  // Space below bar
  return y + barHeight + 20;
}

/* =======================================================================
   PAGE SPACE CHECKER
   ======================================================================= */
function ensureSpace(doc, y, needed = 140) {
  const bottomLimit = doc.page.height - 70; // keep some margin at bottom
  if (y + needed > bottomLimit) {
    doc.addPage();
    // Start new page content a bit down from top
    return 120;
  }
  return y;
}

/* =======================================================================
   HEADER (Style C)
   ======================================================================= */
function drawHeader(doc, vin) {
  const headerHeight = 70;

  // Full-width black header bar
  doc.rect(0, 0, doc.page.width, headerHeight).fill("#000000");

  // Title
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("CARSAAVY VEHICLE MARKET REPORT", 50, 18);

  // Subtitle
  doc
    .font("Helvetica")
    .fontSize(11)
    .text("Market value • Comparables • Negotiation strategy", 50, 42);

  // Metadata
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`VIN: ${vin}`, 400, 20, { width: 150, align: "right" });

  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 400, 38, {
    width: 150,
    align: "right",
  });

  // Reset fill
  doc.fillColor("#000000");

  // Content starts below header
  return headerHeight + 40;
}
function buildNegotiationContext(t = {}) {
  // Helper to coerce to number or null
  const num = (v) => {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() && !isNaN(Number(v))) {
      return Number(v);
    }
    return null;
  };

  const price = num(t.price);
  const minPrice = num(t.minPrice);
  const maxPrice = num(t.maxPrice);
  const mileage = num(t.mileage);

  const comps = Array.isArray(t.comparables) ? t.comparables : [];

  // Compute average comparable price & mileage if available
  let compAvgPrice = null;
  let compAvgMileage = null;

  if (comps.length) {
    const priceVals = comps
      .map((c) => num(c.price))
      .filter((n) => n !== null);
    const milesVals = comps
      .map((c) => num(c.mileage))
      .filter((n) => n !== null);

    if (priceVals.length) {
      compAvgPrice =
        priceVals.reduce((sum, v) => sum + v, 0) / priceVals.length;
    }

    if (milesVals.length) {
      compAvgMileage =
        milesVals.reduce((sum, v) => sum + v, 0) / milesVals.length;
    }
  }

  // Basic price delta vs comps
  let priceDeltaPct = null;
  if (price !== null && compAvgPrice !== null && compAvgPrice > 0) {
    priceDeltaPct = ((price - compAvgPrice) / compAvgPrice) * 100;
  }

  // Mileage delta vs comps
  let mileageFlag = "normal";
  if (mileage !== null && compAvgMileage !== null && compAvgMileage > 0) {
    const mDelta = (mileage - compAvgMileage) / compAvgMileage;
    if (mDelta > 0.2) mileageFlag = "high";
    else if (mDelta < -0.15) mileageFlag = "low";
  }

  // Days on market (optional, future)
  const daysOnMarket = num(t.daysOnMarket);
  let domFlag = "unknown";
  if (daysOnMarket !== null) {
    if (daysOnMarket > 60) domFlag = "long";
    else if (daysOnMarket >= 30) domFlag = "medium";
    else domFlag = "short";
  }

  // Build leverage score
  let score = 0;

  // Price component
  if (priceDeltaPct !== null) {
    if (priceDeltaPct >= 8) score += 2;         // well overpriced
    else if (priceDeltaPct >= 3) score += 1;    // slightly overpriced
    else if (priceDeltaPct <= -3) score -= 2;   // underpriced vs comps
    else if (priceDeltaPct < 0) score -= 1;     // a bit under comps
  }

  // Mileage component
  if (mileageFlag === "high") score += 1;
  else if (mileageFlag === "low") score -= 1;

  // Days-on-market component
  if (domFlag === "long") score += 2;
  else if (domFlag === "medium") score += 1;
  else if (domFlag === "short") score -= 1;

  // Map score → leverageLevel
  let leverageLevel = "balanced";
  if (score >= 3) leverageLevel = "strong";
  else if (score >= 1) leverageLevel = "moderate";
  else if (score <= -2) leverageLevel = "weak";
  else if (score <= 0) leverageLevel = "balanced";

  if (priceDeltaPct === null && comps.length === 0) {
    leverageLevel = "unknown";
  }

  // Format helpers
  const fmtMoney = (v) =>
    typeof v === "number"
      ? v.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        })
      : "N/A";

  const targetBand =
    minPrice !== null && maxPrice !== null
      ? `${fmtMoney(minPrice)} – ${fmtMoney(maxPrice)}`
      : null;

  // --- Strategy text (changes with leverage) ---

  let strategyText = "";
  const reasons = [];

  if (priceDeltaPct !== null) {
    if (priceDeltaPct >= 3) {
      reasons.push("the asking price is above similar listings in your area");
    } else if (priceDeltaPct <= -3) {
      reasons.push("this vehicle is priced competitively against similar listings");
    }
  }

  if (mileageFlag === "high") {
    reasons.push("the mileage is higher than comparable vehicles");
  } else if (mileageFlag === "low") {
    reasons.push("the mileage is lower than comparable vehicles");
  }

  if (domFlag === "long") {
    reasons.push("the listing has been on the market for an extended period");
  } else if (domFlag === "medium") {
    reasons.push("the listing has been on the market for a moderate amount of time");
  } else if (domFlag === "short") {
    reasons.push("the listing appears relatively new to the market");
  }

  const reasonSentence = reasons.length
    ? "This is based on factors such as " +
      reasons.join(", ").replace(/,([^,]*)$/, " and$1") +
      "."
    : "";

  // Hybrid tone: assertive when leverage is strong, softer when low/unknown
  if (leverageLevel === "strong") {
    strategyText =
      `You have strong leverage to negotiate on this vehicle. ` +
      reasonSentence +
      (targetBand
        ? ` Start near the lower end of the suggested range (${targetBand}) and be prepared to move upward only if the dealer is responsive and transparent about reconditioning, history, and demand.`
        : ` Start with a firm offer meaningfully below the asking price and only move if the dealer provides clear justification for their number.`);
  } else if (leverageLevel === "moderate") {
    strategyText =
      `You have reasonable room to negotiate, but expect some pushback from the dealer. ` +
      reasonSentence +
      (targetBand
        ? ` Aim to begin closer to the lower half of the suggested range (${targetBand}) and gradually move upward if the dealer offers value such as service records, reconditioning, or favorable financing.`
        : ` Open with a respectful but firm offer below the asking price and be ready to meet the dealer partway if the vehicle condition and history support it.`);
  } else if (leverageLevel === "weak") {
    strategyText =
      `This vehicle appears to be priced competitively, which may limit how far a dealer is willing to move on price. ` +
      (reasonSentence
        ? reasonSentence + " "
        : "") +
      (targetBand
        ? `Focus your negotiation around the upper portion of the suggested range (${targetBand}), and look for savings in fees, add-ons, or trade-in value rather than expecting a large discount on the vehicle itself.`
        : `Focus on small but meaningful improvements—such as reduced fees, better trade-in value, or included services—rather than a large reduction off the advertised price.`);
  } else {
    // balanced or unknown
    strategyText =
      `You may have some room to negotiate, but outcomes will depend heavily on the specific dealer and local demand. ` +
      (reasonSentence
        ? reasonSentence + " "
        : "") +
      (targetBand
        ? `Use the suggested price range (${targetBand}) as your guardrail: start closer to the lower end and move carefully toward the middle if the dealer is cooperative.`
        : `Use available comparable listings and any online pricing tools as your reference, and position your offer as fair but open to discussion based on condition and history.`);
  }

  // --- Script text (also hybrid tone) ---

  let scriptText = "";

  const midTarget =
    minPrice !== null && maxPrice !== null
      ? Math.round((minPrice + maxPrice) / 2)
      : null;

  const midTargetText = midTarget !== null ? fmtMoney(midTarget) : null;

  if (leverageLevel === "strong") {
    scriptText = (
      `“I’ve been looking at similar vehicles in the area, and based on the pricing and mileage I’m seeing, this one looks a bit high. ` +
      (midTargetText
        ? `A fair number for me would be around ${midTargetText} out-the-door. `
        : `I’m targeting a fair number that’s meaningfully below the current asking price. `) +
      `If we can get close to that today, I’d be comfortable moving forward.”`
    );
  } else if (leverageLevel === "moderate") {
    scriptText = (
      `“From what I’m seeing in the market, this price is in the ballpark, but there is still some room for adjustment. ` +
      (midTargetText
        ? `If we can get this closer to ${midTargetText} out-the-door, I’d be very interested in moving ahead. `
        : `If we can bring the total number down a bit from the advertised price, I’d be very interested in moving ahead. `) +
      `What can you do on the price if I’m ready to buy today?”`
    );
  } else if (leverageLevel === "weak") {
    scriptText = (
      `“I can see this vehicle is priced pretty aggressively given its condition and the current market. ` +
      (midTargetText
        ? `If there’s any room to get closer to ${midTargetText} out-the-door, I’d appreciate it, but I understand if there’s limited flexibility. `
        : `If there’s any room to improve the total number a bit, I’d appreciate it, but I understand there may not be much flexibility. `) +
      `Are there any fees you can reduce or value you can add to help make this work?”`
    );
  } else {
    // balanced / unknown
    scriptText = (
      `“I’ve done some research on similar vehicles, and I’d like to make a fair offer based on what I’m seeing in the market. ` +
      (midTargetText
        ? `If we can get close to ${midTargetText} out-the-door, I’d feel good about moving forward. `
        : `If we can get the total price to a fair, market-based number, I’d feel good about moving forward. `) +
      `What’s the best number you can do if I’m ready to make a decision today?”`
    );
  }

  return {
    leverageLevel,
    priceDeltaPct,
    mileageFlag,
    domFlag,
    strategyText,
    scriptText,
  };
}

/* =======================================================================
   SPECIFIED REPORT INSIGHT ENGINE
   - Derives issues, premium features, dealer language & bullet highlights
   ======================================================================= */
   function deriveSpecifiedInsights(vehicleData = {}) {
    const features = Array.isArray(vehicleData.features)
      ? vehicleData.features
      : [];
  
    const year = vehicleData.year || null;
  
    const sellerNotesRaw = (vehicleData.sellerNotes || "").toString();
    const descriptionRaw = (vehicleData.description || "").toString();
  
    const sellerNotes = sellerNotesRaw.toLowerCase();
    const description = descriptionRaw.toLowerCase();
    const combinedText = [sellerNotes, description].filter(Boolean).join(" \n ");
  
    const issueFlags = [];
    const dealerLanguageInsights = [];
    const premiumFeatures = [];
    const missingFeatures = [];
    const bulletHighlights = [];
  
    function addUnique(arr, value) {
      if (!value) return;
      if (!arr.includes(value)) arr.push(value);
    }
  
    // ------------------------------
    // 🔴 Issue / condition keywords
    // ------------------------------
    const issueKeywordMap = {
      vibration: "Seller mentions vibration at speed — this is a leverage point and may indicate suspension or wheel issues.",
      alignment: "Alignment concerns are noted — you can request a price adjustment or alignment before purchase.",
      rust: "Rust is mentioned — cosmetic or structural rust can reduce long-term value.",
      salvage: "Salvage or rebuilt title language suggests major past damage — approach very cautiously and negotiate aggressively.",
      accident: "Accidents are mentioned — confirm repair quality and use this as leverage.",
      repaint: "Repaint or body work is referenced — verify the quality and check for hidden damage.",
      "check engine": "A 'check engine' light or engine warning is referenced — do not finalize a deal without a clear explanation and documentation.",
      transmission: "Transmission is mentioned as an issue — potential high-cost repair, a major negotiation point.",
      leak: "Fluid leaks are implied — insist on a proper inspection and factor repair cost into your offer.",
      noisy: "Noises or sounds are described — unusual mechanical noise should always be investigated.",
      "as-is": "Vehicle is sold 'as-is' — limited protection; factor in additional risk when negotiating.",
    };
  
    for (const [keyword, explanation] of Object.entries(issueKeywordMap)) {
      if (combinedText.includes(keyword)) {
        addUnique(issueFlags, explanation);
      }
    }
  
    // ------------------------------
    // 🟡 Dealer language / positioning
    // ------------------------------
    const dealerPhrases = [
      {
        match: "priced to sell",
        insight:
          "The dealer uses 'priced to sell' language — this often indicates they are expecting offers and may be flexible on price.",
      },
      {
        match: "must go",
        insight:
          "Language like 'must go' or 'must sell' suggests the dealership is motivated to move this unit — use that to push on price.",
      },
      {
        match: "won't last",
        insight:
          "Phrases like 'won't last long' are designed to create urgency — do not let this rush you into accepting a weak deal.",
      },
      {
        match: "recently reduced",
        insight:
          "A recent price reduction is mentioned — this can signal slow movement, giving you additional negotiation leverage.",
      },
      {
        match: "mechanic special",
        insight:
          "Terms like 'mechanic special' usually mean significant reconditioning is needed — budget for repairs and negotiate accordingly.",
      },
    ];
  
    for (const { match, insight } of dealerPhrases) {
      if (combinedText.includes(match)) {
        addUnique(dealerLanguageInsights, insight);
      }
    }
  
    // ------------------------------
    // 💎 Premium features
    // ------------------------------
    const premiumFeatureKeywords = [
      "leather",
      "blind spot",
      "lane keep",
      "adaptive cruise",
      "remote start",
      "heated seats",
      "ventilated seats",
      "sunroof",
      "moonroof",
      "panoramic",
      "premium audio",
      "bose",
      "harmon",
      "harmon kardon",
      "parking sensors",
      "360 camera",
      "navigation",
      "nav",
      "heads-up display",
    ];
  
    const featureText = features.join(" | ").toLowerCase();
    const combinedFeatureText = [featureText, combinedText].join(" \n ");
  
    for (const keyword of premiumFeatureKeywords) {
      if (combinedFeatureText.includes(keyword)) {
        addUnique(
          premiumFeatures,
          `Equipped with ${keyword} or a similar premium feature, which can justify stronger pricing but should still be weighed against condition and market comparables.`
        );
      }
    }
  
    // ------------------------------
    // ⚠️ Missing common features
    // (lightweight heuristic for now)
    // ------------------------------
    const hasCamera =
      combinedFeatureText.includes("camera") ||
      combinedFeatureText.includes("rearview") ||
      combinedFeatureText.includes("back-up");
  
    if (year && year >= 2016 && !hasCamera) {
      addUnique(
        missingFeatures,
        "A backup or rearview camera is not clearly mentioned — for many 2016+ vehicles this is a commonly expected feature, which can soften the price you are willing to pay."
      );
    }
  
    // ------------------------------
    // 📌 Bullet highlights for summary
    // ------------------------------
    if (issueFlags.length) {
      addUnique(
        bulletHighlights,
        "Listing language includes potential condition or maintenance flags — use these as specific leverage points during negotiation."
      );
    }
  
    if (premiumFeatures.length) {
      addUnique(
        bulletHighlights,
        "This vehicle appears to include notable premium features; these can support the asking price but should not erase your negotiation room."
      );
    }
  
    if (missingFeatures.length) {
      addUnique(
        bulletHighlights,
        "Some features that buyers often expect for this model year are not clearly listed, which can justify a more conservative offer."
      );
    }
  
    if (!bulletHighlights.length && combinedText) {
      addUnique(
        bulletHighlights,
        "Seller notes and description provide useful context on condition and equipment — review them closely and reference them directly when negotiating."
      );
    }
  
    return {
      premiumFeatures,
      missingFeatures,
      issueFlags,
      dealerLanguageInsights,
      bulletHighlights,
    };
  }
  

/* =======================================================================
   MAIN REPORT GENERATOR
   ======================================================================= */
async function generateVehicleReport(vehicleData, vin) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margin: 50,
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const tempFilePath = `/tmp/report-${vin}-${timestamp}.pdf`;
      const stream = fs.createWriteStream(tempFilePath);
      doc.pipe(stream);

      let y = drawHeader(doc, vin);
      const isGeneral = vin === "GENERAL-REPORT";

      let specifiedInsights = null;
      if (!isGeneral) {
        specifiedInsights = deriveSpecifiedInsights(vehicleData || {});
      }


      // Reusable section wrapper: always shows the section, with fallback
      function drawSection(title, contentRenderer) {
        y = drawSectionHeader(doc, title, y);
        y = ensureSpace(doc, y);

        const beforeY = y;
        y = contentRenderer(y);

        // If renderer didn't move y, show fallback text
        if (y === beforeY) {
          y = drawHybridParagraph(
            doc,
            "The necessary data for this section was not available at the time of this report.",
            {
              y,
              disableJustify: true,
              lineHeight: 15.5,
              paragraphGap: 16,
            }
          );
        }

        // Bottom spacing after section (slightly larger so sections don’t touch)
        y += 26;
      }

      /* ---------------------------------------------------------------
        EXECUTIVE SUMMARY (long paragraph, hybrid justification allowed)
      --------------------------------------------------------------- */
      drawSection("EXECUTIVE SUMMARY", (currentY) => {
        const summary = isGeneral
          ? `
      This report provides a general negotiation blueprint and market context that can be applied to most used-vehicle purchases. Because no specific VIN or listing was analyzed, the guidance focuses on universal tactics, risk checks, and pricing guardrails you can use when reviewing any candidate vehicle.
            `
          : `
      This report provides a structured overview of the selected vehicle’s pricing, equipment, condition signals from the listing, and negotiation guidance tailored to this specific case. Values and insights are based on available data from the vehicle listing and general market behavior; final pricing and dealer responses may vary.
            `;

        return drawHybridParagraph(doc, summary, {
          y: currentY,
          fontSize: 11.5,
          lineHeight: 14.5,
          paragraphGap: 10, // a bit more for first section
          disableJustify: false, // hybrid justification OK here
        });
      });


      /* ---------------------------------------------------------------
         VEHICLE OVERVIEW (short block, no justification)
      --------------------------------------------------------------- */
      drawSection("VEHICLE OVERVIEW", (currentY) => {
        const t = vehicleData || {};

        const overview = `
          Year: ${t.year || "N/A"}
          Make: ${t.make || "N/A"}
          Model: ${t.model || "N/A"}
          Trim: ${t.trim || "N/A"}
          Mileage: ${t.mileage?.toLocaleString() || "N/A"} miles
        `;

        return drawHybridParagraph(doc, overview, {
          y: currentY,
          disableJustify: true,
          lineHeight: 15,
          paragraphGap: 10,
        });
      });

      /* ---------------------------------------------------------------
         MARKET VALUE & NEGOTIATION RANGE (short block, no justification)
      --------------------------------------------------------------- */
      drawSection("MARKET VALUE & NEGOTIATION RANGE", (currentY) => {
        const t = vehicleData || {};

        const valueText = `
          Listed Price: $${t.price?.toLocaleString() || "N/A"}
          Expected Negotiation Range:
          • Low: $${t.minPrice?.toLocaleString() || "N/A"}
          • High: $${t.maxPrice?.toLocaleString() || "N/A"}
          `;


        return drawHybridParagraph(doc, valueText, {
          y: currentY,
          disableJustify: true,
          lineHeight: 15,
          paragraphGap: 10,
        });
      });

    /* ---------------------------------------------------------------
        NEGOTIATION GAMEPLAN (PRIMARY SECTION)
      --------------------------------------------------------------- */
      drawSection("NEGOTIATION GAMEPLAN", (currentY) => {
        const plan = vehicleData.negotiationPlan;

        if (!plan) return currentY;

        let yLocal = currentY;

        // Headline numbers
        yLocal = drawHybridParagraph(
          doc,
          `
      Opening Offer: $${plan.numbers.openingOffer?.toLocaleString() || "N/A"}
      Target Deal Price: $${plan.numbers.targetPrice?.toLocaleString() || "N/A"}
      Walk-Away Price: $${plan.numbers.walkAwayPrice?.toLocaleString() || "N/A"}
          `,
          {
            y: yLocal,
            disableJustify: true,
            lineHeight: 16,
            paragraphGap: 12,
          }
        );

        yLocal = ensureSpace(doc, yLocal, 120);

        // Angles
        yLocal = drawHybridParagraph(
          doc,
          `Primary Negotiation Angle: ${plan.primaryAngle}`,
          {
            y: yLocal,
            disableJustify: true,
            paragraphGap: 10,
          }
        );

        if (Array.isArray(plan.supportAngles) && plan.supportAngles.length) {
          plan.supportAngles.forEach((a) => {
            yLocal = drawHybridParagraph(doc, `• ${a}`, {
              y: yLocal,
              disableJustify: true,
              paragraphGap: 6,
            });
          });
        }

        yLocal = ensureSpace(doc, yLocal, 140);

        // Playbook
        yLocal = drawHybridParagraph(
          doc,
          "Recommended Negotiation Playbook:",
          {
            y: yLocal,
            disableJustify: true,
            paragraphGap: 8,
          }
        );

        plan.playbook.forEach((step) => {
          yLocal = drawHybridParagraph(
            doc,
            `${step.step}. ${step.goal}: ${step.say}`,
            {
              y: yLocal,
              disableJustify: true,
              paragraphGap: 6,
            }
          );
        });

        yLocal = ensureSpace(doc, yLocal, 160);

        // Scripts
        yLocal = drawHybridParagraph(
          doc,
          `
      What to Say:
      Opening: ${plan.scripts.opener}

      If They Push Back: ${plan.scripts.pushback}

      Close: ${plan.scripts.close}

      Walk Away: ${plan.scripts.walkAway}
          `,
          {
            y: yLocal,
            disableJustify: true,
            lineHeight: 15.5,
            paragraphGap: 14,
          }
        );

        return yLocal;
      });


      /* ---------------------------------------------------------------
         COMPARABLE VEHICLES (list, no justification)
      --------------------------------------------------------------- */
      drawSection("COMPARABLE VEHICLES", (currentY) => {
        const comps = (vehicleData && vehicleData.comparables) || [];
        let yLocal = currentY;

        if (!comps.length) {
          // Trigger fallback
          return yLocal;
        }

        comps.forEach((c) => {
          const block = `
          ${c.year || ""} ${c.make || ""} ${c.model || ""}
          Mileage: ${c.mileage?.toLocaleString() || "N/A"} miles
          Price: $${c.price?.toLocaleString() || "N/A"}
          Location: ${c.location || "N/A"}
          `;

          yLocal = drawHybridParagraph(doc, block, {
            y: yLocal,
            disableJustify: true,
            lineHeight: 14.5,
            paragraphGap: 10,
          });
          yLocal += 6;
          yLocal = ensureSpace(doc, yLocal, 80);
        });

        return yLocal;
      });

      /* ---------------------------------------------------------------
        VEHICLE FEATURES & EQUIPMENT (Specified only, no justification)
      --------------------------------------------------------------- */
      if (!isGeneral) {
        drawSection("VEHICLE FEATURES & EQUIPMENT", (currentY) => {
          const insights = specifiedInsights || {};
          const premium = insights.premiumFeatures || [];
          const missing = insights.missingFeatures || [];

          let yLocal = currentY;

          if (!premium.length && !missing.length) {
            // Trigger fallback text
            return yLocal;
          }

          if (premium.length) {
            yLocal = drawHybridParagraph(
              doc,
              "Notable equipment and premium features:",
              {
                y: yLocal,
                disableJustify: true,
                lineHeight: 15,
                paragraphGap: 8,
              }
            );

            premium.forEach((p) => {
              yLocal = drawHybridParagraph(doc, `• ${p}`, {
                y: yLocal,
                disableJustify: true,
                lineHeight: 14.5,
                paragraphGap: 6,
              });
            });

            yLocal += 10;
            yLocal = ensureSpace(doc, yLocal, 80);
          }

          if (missing.length) {
            yLocal = drawHybridParagraph(
              doc,
              "Potentially missing or not clearly listed features:",
              {
                y: yLocal,
                disableJustify: true,
                lineHeight: 15,
                paragraphGap: 8,
              }
            );

            missing.forEach((m) => {
              yLocal = drawHybridParagraph(doc, `• ${m}`, {
                y: yLocal,
                disableJustify: true,
                lineHeight: 14.5,
                paragraphGap: 6,
              });
            });
          }

          return yLocal;
        });

        /* ---------------------------------------------------------------
          CONDITION & ISSUE FLAGS (Specified only)
        --------------------------------------------------------------- */
        drawSection("CONDITION & ISSUE FLAGS", (currentY) => {
          const insights = specifiedInsights || {};
          const flags = insights.issueFlags || [];

          let yLocal = currentY;

          if (!flags.length) {
            // Trigger fallback text
            return yLocal;
          }

          flags.forEach((f) => {
            yLocal = drawHybridParagraph(doc, `• ${f}`, {
              y: yLocal,
              disableJustify: true,
              lineHeight: 14.5,
              paragraphGap: 8,
            });
            yLocal = ensureSpace(doc, yLocal, 80);
          });

          return yLocal;
        });

        /* ---------------------------------------------------------------
          DEALER LANGUAGE INSIGHTS (Specified only)
        --------------------------------------------------------------- */
        drawSection("DEALER LANGUAGE INSIGHTS", (currentY) => {
          const insights = specifiedInsights || {};
          const dealerLines = insights.dealerLanguageInsights || [];

          let yLocal = currentY;

          if (!dealerLines.length) {
            // Trigger fallback text
            return yLocal;
          }

          dealerLines.forEach((line) => {
            yLocal = drawHybridParagraph(doc, `• ${line}`, {
              y: yLocal,
              disableJustify: true,
              lineHeight: 14.5,
              paragraphGap: 8,
            });
            yLocal = ensureSpace(doc, yLocal, 80);
          });

          return yLocal;
        });
      }


      /* ---------------------------------------------------------------
          QUICK MARKET HIGHLIGHTS (bullets, hybrid allowed if long)
        --------------------------------------------------------------- */
        drawSection("QUICK MARKET HIGHLIGHTS", (currentY) => {
          const t = vehicleData || {};
          let highlights = Array.isArray(t.highlights) ? t.highlights : [];

          // If no explicit highlights set, fall back to insights for specified reports
          if (!highlights.length && specifiedInsights && Array.isArray(specifiedInsights.bulletHighlights)) {
            highlights = specifiedInsights.bulletHighlights;
          }

          let yLocal = currentY;

          if (!highlights.length) {
            // Trigger fallback
            return yLocal;
          }

          highlights.forEach((h) => {
            const line = `• ${h}`;
            yLocal = drawHybridParagraph(doc, line, {
              y: yLocal,
              disableJustify: false, // allow hybrid if lines get long
              lineHeight: 14.5,
              paragraphGap: 6,
            });
          });

          return yLocal;
        });


        // =========================================
        // MODEL RELIABILITY & OWNERSHIP RISK
        // =========================================
        const reliability = vehicleData.reliabilityScore;
        if (typeof reliability === "number") {
          doc.font("Helvetica-Bold").fontSize(14).text("Model Reliability & Ownership Risk", {
            underline: true,
          });
          doc.moveDown(0.5);

          let reliabilityText = "";

          if (reliability >= 8.5) {
            reliabilityText = `${vehicleData.modelKey} is widely regarded as a highly reliable vehicle, which generally supports long-term ownership stability and helps preserve resale value.`;
          } else if (reliability >= 7) {
            reliabilityText = `${vehicleData.modelKey} has above-average reliability. Maintenance needs are generally predictable, and ownership risk is moderate.`;
          } else if (reliability >= 5.5) {
            reliabilityText = `${vehicleData.modelKey} has mixed reliability ratings. While many owners report positive experiences, there are known areas where unexpected repairs may occur.`;
          } else {
            reliabilityText = `${vehicleData.modelKey} is considered below-average in reliability. Buyers often negotiate more aggressively due to potential long-term service costs.`;
          }

          doc.font("Helvetica").fontSize(10).text(reliabilityText, {
            width: 550,
            align: "left",
          });

          doc.moveDown(1.2);

          if (doc.y > 700) doc.addPage();
        }


        // =========================================
        // COMMON ISSUES FOR THIS MODEL
        // =========================================
        const knownIssues = vehicleData.modelKey
        ? require("./staticData").KnownIssueFlags[vehicleData.modelKey]
        : null;

        if (knownIssues && Array.isArray(knownIssues) && knownIssues.length > 0) {
        doc.font("Helvetica-Bold").fontSize(14).text("Common Issues for This Model", {
          underline: true,
        });
        doc.moveDown(0.5);

        knownIssues.forEach((issue) => {
          doc.font("Helvetica").fontSize(10).text(`• ${issue}`, {
            width: 550,
            align: "left",
          });

          if (doc.y > 700) {
            doc.addPage();
          }
        });

        doc.moveDown(1.2);
        }

        // =========================================
        // MARKET STRENGTH RATING
        // =========================================
        if (typeof vehicleData.marketStrengthScore === "number") {
          doc.font("Helvetica-Bold").fontSize(14).text("Market Strength Rating", {
            underline: true,
          });
          doc.moveDown(0.5);

          doc.font("Helvetica").fontSize(12).text(
            `Score: ${vehicleData.marketStrengthScore}/100`,
            { align: "left" }
          );

          let interpretation = "";
          const s = vehicleData.marketStrengthScore;

          if (s >= 85) interpretation = "This is a very strong market choice with excellent reliability and resale characteristics.";
          else if (s >= 70) interpretation = "A strong overall choice with good reliability and reasonable ownership costs.";
          else if (s >= 55) interpretation = "A fair choice with some considerations. Review maintenance history and pricing closely.";
          else interpretation = "Higher risk profile vehicle. Negotiate aggressively and review condition history carefully.";

          doc.font("Helvetica").fontSize(10).text(interpretation, {
            width: 550,
            align: "left",
          });

          doc.moveDown(1.2);
        }

        // =========================================
        // TRIM FEATURE EXPECTATIONS & EQUIPMENT CHECK
        // =========================================
        const fa = vehicleData.featureAnalysis;

        if (fa) {
          doc.font("Helvetica-Bold").fontSize(14).text(
            "Trim Feature Expectations & Equipment Check",
            { underline: true }
          );
          doc.moveDown(0.5);

          doc.font("Helvetica-Bold").fontSize(12).text("Expected Features for This Trim:");
          doc.moveDown(0.3);

          fa.expectedFeatures.forEach((ef) => {
            doc.font("Helvetica").fontSize(10).text(`• ${ef}`);
            if (doc.y > 700) doc.addPage();
          });

          doc.moveDown(0.5);

          if (fa.missingFeatures.length > 0) {
            doc.font("Helvetica-Bold").fontSize(12).text("Potentially Missing Features:");
            doc.moveDown(0.3);

            fa.missingFeatures.forEach((mf) => {
              doc.font("Helvetica").fontSize(10).text(`• ${mf} (not found in listing)`);
              if (doc.y > 700) doc.addPage();
            });

            doc.moveDown(1);

            doc.font("Helvetica").fontSize(10).text(
              "Missing expected equipment can provide **additional negotiation leverage**, especially if the dealer priced the vehicle using standard trim assumptions.",
              { width: 550 }
            );
          } else {
            doc.font("Helvetica").fontSize(10).text(
              "All expected trim features appear present based on the listing description."
            );
          }

          doc.moveDown(1.2);
        }



      /* ---------------------------------------------------------------
         NEGOTIATION STRATEGY (short paragraph, no justification, extra spacing)
      --------------------------------------------------------------- */
      drawSection("NEGOTIATION STRATEGY", (currentY) => {
        const t = vehicleData || {};
        const ctx = buildNegotiationContext(t);
      
        const strategy = ctx.strategyText;
      
        return drawHybridParagraph(doc, strategy, {
          y: currentY,
          disableJustify: true,
          lineHeight: 15.5,
          paragraphGap: 16,
        });
      });

      /* ---------------------------------------------------------------
         SUGGESTED NEGOTIATION SCRIPT (short script, no justification)
      --------------------------------------------------------------- */
      drawSection("SUGGESTED NEGOTIATION SCRIPT", (currentY) => {
        const t = vehicleData || {};
        const ctx = buildNegotiationContext(t);
      
        const script = ctx.scriptText;
      
        return drawHybridParagraph(doc, script, {
          y: currentY,
          disableJustify: true,
          lineHeight: 15.5,
          paragraphGap: 16,
        });
      });

      // =========================================
      // DEALERSHIP BEHAVIOR & NEGOTIATION STRATEGY
      // =========================================
      const dp = vehicleData.dealerProfile;

      if (dp) {
        doc.font("Helvetica-Bold").fontSize(14).text(
          "Dealership Behavior & Negotiation Strategy Adjustment",
          { underline: true }
        );
        doc.moveDown(0.5);

        doc.font("Helvetica-Bold").fontSize(12).text(`Dealer Type: ${dp.type}`);

        doc.moveDown(0.3);

        dp.notes.forEach((note) => {
          doc.font("Helvetica").fontSize(10).text(`• ${note}`, {
            width: 550,
          });

          if (doc.y > 700) doc.addPage();
        });

        doc.moveDown(1);

        // Negotiation leverage summary
        let leverageNote = "";
        if (dp.leverageFactor > 1) leverageNote = "This dealer type typically allows **strong negotiation leverage**.";
        else if (dp.leverageFactor === 1) leverageNote = "This dealer type offers **average negotiation flexibility**.";
        else leverageNote = "This dealer type is known for **reduced negotiation flexibility**.";

        doc.font("Helvetica").fontSize(10).text(leverageNote, { width: 550 });
        doc.moveDown(1.2);
      }

      // =========================================
      // PRICE POSITIONING AGAINST MARKET VALUE
      // =========================================
      const pp = vehicleData.pricePositioning;

      if (pp && pp.position !== "unknown") {
        doc.font("Helvetica-Bold").fontSize(14).text(
          "Price Positioning Against Market Value",
          { underline: true }
        );
        doc.moveDown(0.5);

        const listed = vehicleData.price
          ? `$${vehicleData.price.toLocaleString()}`
          : "N/A";
        const minP = vehicleData.minPrice
          ? `$${vehicleData.minPrice.toLocaleString()}`
          : "N/A";
        const maxP = vehicleData.maxPrice
          ? `$${vehicleData.maxPrice.toLocaleString()}`
          : "N/A";

        doc.font("Helvetica").fontSize(11).text(
          `• Listed Price: ${listed}\n• Expected Market Range: ${minP} - ${maxP}`
        );
        doc.moveDown(0.5);

        const dev = pp.deviationAmount;
        const pct = pp.deviationPercent;

        let analysisText = "";

        if (pp.position === "above-market") {
          analysisText = `This vehicle is priced **above market** by approximately **$${Math.abs(
            dev
          ).toLocaleString()}** (${pct}%). Dealers may anchor toward the listed price, but negotiation leverage is strong here.`;
        } else if (pp.position === "below-market") {
          analysisText = `This vehicle is priced **below market** by approximately **$${Math.abs(
            dev
          ).toLocaleString()}** (${Math.abs(pct)}%). This suggests high demand or competitive pricing — negotiate carefully.`;
        } else {
          analysisText = `This vehicle is priced **within normal market range**. Negotiation outcomes will depend on dealership behavior, vehicle condition, and local inventory pressures.`;
        }

        doc.font("Helvetica").fontSize(10).text(analysisText, {
          width: 550,
          align: "left",
        });

        doc.moveDown(1.2);
      }

      // =========================================
      // PRICING CONFIDENCE SCORE (DATA QUALITY)
      // =========================================
      if (typeof vehicleData.pricingConfidenceScore === "number") {
        doc.font("Helvetica-Bold").fontSize(14).text(
          "Pricing Confidence Score",
          { underline: true }
        );
        doc.moveDown(0.5);

        const pcs = vehicleData.pricingConfidenceScore;

        doc.font("Helvetica").fontSize(12).text(
          `Score: ${pcs}/100`,
          { align: "left" }
        );
        doc.moveDown(0.3);

        let pcsSummary = "";

        if (pcs >= 85) {
          pcsSummary = "This listing has **excellent data completeness**. The valuation for this vehicle is highly reliable and confidence is strong.";
        } else if (pcs >= 70) {
          pcsSummary = "This listing has **good data quality**. The valuation is solid and should closely reflect true market conditions.";
        } else if (pcs >= 55) {
          pcsSummary = "This listing has **moderate data completeness**. Confirm trim details and equipment with the dealer before finalizing negotiation.";
        } else {
          pcsSummary = "This listing has **low data reliability**. Important details may be missing. Verify VIN, trim, and equipment before negotiating.";
        }

        doc.font("Helvetica").fontSize(10).text(pcsSummary, {
          width: 550,
          align: "left",
        });

        doc.moveDown(1.2);
      }

      // =========================================
      // CONDITION & OWNERSHIP ADVISORY
      // =========================================
      const ca = vehicleData.conditionAdvisory;

      if (Array.isArray(ca) && ca.length > 0) {
        doc.font("Helvetica-Bold").fontSize(14).text(
          "Condition & Ownership Advisory",
          { underline: true }
        );
        doc.moveDown(0.5);

        ca.forEach((line) => {
          doc.font("Helvetica").fontSize(10).text(`• ${line}`, {
            width: 550,
            align: "left",
          });

          if (doc.y > 700) doc.addPage();
        });

        doc.moveDown(1.2);
      }


      /* ---------------------------------------------------------------
         DISCLAIMER (short block, no justification, extra spacing)
      --------------------------------------------------------------- */
      drawSection("DISCLAIMER", (currentY) => {
        const disclaimer = `
This report summarizes available data retrieved from external automotive sources at the time of generation. CarSaavy does not guarantee vehicle availability, accuracy of third-party data, or that any dealership will agree to the estimated pricing or negotiation targets outlined in this report.
        `;

        return drawHybridParagraph(doc, disclaimer, {
          y: currentY,
          disableJustify: true,
          lineHeight: 15.5,
          paragraphGap: 16,
        });
      });

      // Finalize PDF
      doc.end();

      stream.on("finish", async () => {
        const blob = await put(
          `reports/${path.basename(tempFilePath)}`,
          fs.readFileSync(tempFilePath),
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
