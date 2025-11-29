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
        const strategy = `
Be polite, clear, and confident during negotiation. Start slightly below your target figure, allow the dealer to counter, and rely on objective factors such as mileage, condition, and comparable listings to support your position.
        `;

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

        const script = `
"Hi, I'm interested in this vehicle. Based on similar listings and current market trends, it appears the fair purchasing value should be around $${t.minPrice || "N/A"}. I’d like to move forward near that number. What flexibility do you have on pricing today?"
        `;

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
