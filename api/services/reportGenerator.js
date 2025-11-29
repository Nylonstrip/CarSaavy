const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { put } = require("@vercel/blob");

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
        const summary = `
This report provides a structured overview of the selected vehicle’s pricing, market position, and negotiation guidance. Values shown represent estimates based on available automotive data sources; final pricing may vary between individual dealerships.
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
Mileage: ${t.mileage || "N/A"}
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
Estimated Market Value: $${t.price || "N/A"}
Expected Negotiation Range: $${t.minPrice || "N/A"} - $${t.maxPrice || "N/A"}
        `;

        return drawHybridParagraph(doc, valueText, {
          y: currentY,
          disableJustify: true,
          lineHeight: 15,
          paragraphGap: 10,
        });
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
${c.year || ""} ${c.make || ""} ${c.model || ""} — ${c.mileage || "N/A"} mi — $${c.price || "N/A"}
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
         QUICK MARKET HIGHLIGHTS (bullets, hybrid allowed if long)
      --------------------------------------------------------------- */
      drawSection("QUICK MARKET HIGHLIGHTS", (currentY) => {
        const highlights = (vehicleData && vehicleData.highlights) || [];
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
