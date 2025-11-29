const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { put } = require("@vercel/blob");

/* =======================================================================
   HYBRID PARAGRAPH ENGINE
   - Hybrid justification ONLY for long, multi-line paragraphs.
   - Short paragraphs remain left-aligned always.
   ======================================================================= */
function drawHybridParagraph(doc, text, opts = {}) {
  const {
    x = 60,
    y,
    width = 475,
    fontSize = 11.5,
    lineHeight = 14.5,
  } = opts;

  doc.fontSize(fontSize);

  const paragraphs = text
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p !== "");

  let cursorY = y;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(" ");
    let line = "";
    const lines = [];

    // Word-wrap
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (doc.widthOfString(testLine, { fontSize }) > width) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);

    // Render lines properly
    for (let i = 0; i < lines.length; i++) {
      const isLastLine = i === lines.length - 1;
      const currentLine = lines[i];
      const wordsInLine = currentLine.split(" ");
      const wordCount = wordsInLine.length;
      const naturalWidth = doc.widthOfString(currentLine, { fontSize });

      const shouldJustify =
        !isLastLine &&
        wordCount >= 10 &&
        naturalWidth >= width * 0.92 &&
        currentLine.length >= 80;

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
        // Left aligned (default)
        doc.text(currentLine, x, cursorY, { width });
      }

      cursorY += lineHeight;
    }

    cursorY += 8; // paragraph gap
  }

  return cursorY;
}

/* =======================================================================
   SECTION HEADER (Option B — Medium Width)
   ======================================================================= */
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

/* =======================================================================
   PAGE SPACE CHECKER
   ======================================================================= */
function ensureSpace(doc, y, needed = 140) {
  const limit = doc.page.height - 70;
  if (y + needed > limit) {
    doc.addPage();
    return 120;
  }
  return y;
}

/* =======================================================================
   HEADER STYLE C
   ======================================================================= */
function drawHeader(doc, vin) {
  const headerHeight = 70;

  doc.rect(0, 0, doc.page.width, headerHeight).fill("#000000");

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("CARSAAVY VEHICLE MARKET REPORT", 50, 18);

  doc
    .font("Helvetica")
    .fontSize(11)
    .text("Market value • Comparables • Negotiation strategy", 50, 42);

  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`VIN: ${vin}`, 400, 20, { width: 150, align: "right" });

  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 400, 38, {
    width: 150,
    align: "right",
  });

  doc.fillColor("#000");

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

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

      const tempFilePath = `/tmp/report-${vin}-${timestamp}.pdf`;
      const stream = fs.createWriteStream(tempFilePath);
      doc.pipe(stream);

      let y = drawHeader(doc, vin);

      /* ---------------------------------------------------------------
         SECTION TEMPLATE: ALWAYS SHOW + FALLBACK MESSAGE
      --------------------------------------------------------------- */
      function drawSection(title, contentRenderer) {
        y = drawSectionHeader(doc, title, y);
        y = ensureSpace(doc, y);

        const beforeY = y;
        y = contentRenderer(y);

        // If renderer produced no content → fallback
        if (y === beforeY) {
          y = drawHybridParagraph(
            doc,
            "The necessary data for this section was not available at the time of this report.",
            { y }
          );
        }

        y += 18; // option B bottom spacing
      }

      /* ---------------------------------------------------------------
         EXECUTIVE SUMMARY
      --------------------------------------------------------------- */
      drawSection("EXECUTIVE SUMMARY", (y) => {
        const summary = `
This report provides a structured overview of the selected vehicle’s pricing, market position, and negotiation guidance. Values shown represent estimates based on available automotive data sources; final pricing may vary between individual dealerships.
        `;
        return drawHybridParagraph(doc, summary, { y });
      });

      /* ---------------------------------------------------------------
         VEHICLE OVERVIEW
      --------------------------------------------------------------- */
      drawSection("VEHICLE OVERVIEW", (y) => {
        const t = vehicleData;

        const text = `
Year: ${t?.year || "N/A"}
Make: ${t?.make || "N/A"}
Model: ${t?.model || "N/A"}
Trim: ${t?.trim || "N/A"}
Mileage: ${t?.mileage || "N/A"}
        `;

        return drawHybridParagraph(doc, text, { y });
      });

      /* ---------------------------------------------------------------
         MARKET VALUE & RANGE
      --------------------------------------------------------------- */
      drawSection("MARKET VALUE & NEGOTIATION RANGE", (y) => {
        const t = vehicleData;

        const text = `
Estimated Market Value: $${t?.price || "N/A"}
Expected Negotiation Range: $${t?.minPrice || "N/A"} - $${t?.maxPrice || "N/A"}
        `;

        return drawHybridParagraph(doc, text, { y });
      });

      /* ---------------------------------------------------------------
         COMPARABLE VEHICLES
      --------------------------------------------------------------- */
      drawSection("COMPARABLE VEHICLES", (y) => {
        const comps = vehicleData?.comparables || [];

        if (!comps.length) return y; // triggers fallback

        for (const c of comps) {
          const block = `
${c.year} ${c.make} ${c.model} — ${c.mileage} mi — $${c.price}
Location: ${c.location}
          `;
          y = drawHybridParagraph(doc, block, { y });
          y += 6;
          y = ensureSpace(doc, y);
        }

        return y;
      });

      /* ---------------------------------------------------------------
         QUICK MARKET HIGHLIGHTS
      --------------------------------------------------------------- */
      drawSection("QUICK MARKET HIGHLIGHTS", (y) => {
        const highlights = vehicleData?.highlights || [];

        if (!highlights.length) return y;

        for (const h of highlights) {
          y = drawHybridParagraph(doc, `• ${h}`, { y });
        }

        return y;
      });

      /* ---------------------------------------------------------------
         NEGOTIATION STRATEGY (NO JUSTIFICATION)
      --------------------------------------------------------------- */
      drawSection("NEGOTIATION STRATEGY", (y) => {
        const strategy = `
Be polite, clear, and confident during negotiation. Start slightly below your target figure, allow the dealer to counter, and rely on objective factors such as mileage, condition, and comparable listings to support your position.
        `;
        return drawHybridParagraph(doc, strategy, { y });
      });

      /* ---------------------------------------------------------------
         NEGOTIATION SCRIPT (NO JUSTIFICATION)
      --------------------------------------------------------------- */
      drawSection("SUGGESTED NEGOTIATION SCRIPT", (y) => {
        const t = vehicleData;

        const script = `
"Hi, I'm interested in this vehicle. Based on similar listings and current market trends, it appears the fair purchasing value should be around $${t?.minPrice ||
          "N/A"}. I’d like to move forward near that number. What flexibility do you have on pricing today?"
        `;

        return drawHybridParagraph(doc, script, { y });
      });

      /* ---------------------------------------------------------------
         DISCLAIMER (NO JUSTIFICATION)
      --------------------------------------------------------------- */
      drawSection("DISCLAIMER", (y) => {
        const disclaimer = `
This report summarizes available data retrieved from external automotive sources at the time of generation. CarSaavy does not guarantee vehicle availability, accuracy of third-party data, or that any dealership will agree to the estimated pricing or negotiation targets outlined in this report.
        `;
        return drawHybridParagraph(doc, disclaimer, { y });
      });

      /* ---------------------------------------------------------------
         FINALIZE DOCUMENT
      --------------------------------------------------------------- */
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
