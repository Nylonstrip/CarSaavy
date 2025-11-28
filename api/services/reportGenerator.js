const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { put } = require("@vercel/blob");

/* ------------------------------------------------------------
   HELPER: Hybrid Paragraph Formatter
   (Left alignment + mild justification for long lines)
------------------------------------------------------------ */
function drawHybridParagraph(doc, text, options = {}) {
  const {
    x = 60,
    y,
    width = 475,
    lineHeight = 14.5,
    fontSize = 11.5,
  } = options;

  doc.fontSize(fontSize);

  const paragraphs = text.split("\n").filter((p) => p.trim() !== "");

  let cursorY = y;

  for (const paragraph of paragraphs) {
    // Break paragraph into lines using pdfkit measurement
    const words = paragraph.split(" ");
    let line = "";
    const lines = [];

    for (const word of words) {
      const testLine = line ? line + " " + word : word;
      const testWidth = doc.widthOfString(testLine, { fontSize });

      if (testWidth > width) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);

    // Render each line (left aligned unless it's a long line)
    for (let i = 0; i < lines.length; i++) {
      const isLongLine =
        doc.widthOfString(lines[i], { fontSize }) > width * 0.9;

      if (isLongLine && i !== lines.length - 1) {
        // Mild justification
        const wordsInLine = lines[i].split(" ");
        const gaps = wordsInLine.length - 1;

        if (gaps > 0) {
          const naturalWidth = doc.widthOfString(lines[i], { fontSize });
          const extraSpacePerGap = (width - naturalWidth) / gaps;

          let cursorX = x;
          for (const w of wordsInLine) {
            doc.text(w, cursorX, cursorY, { lineBreak: false });
            cursorX +=
              doc.widthOfString(w, { fontSize }) + extraSpacePerGap;
          }
        } else {
          doc.text(lines[i], x, cursorY);
        }
      } else {
        // Normal left-aligned line
        doc.text(lines[i], x, cursorY, { width });
      }

      cursorY += lineHeight;
    }

    cursorY += 8; // paragraph gap
  }

  return cursorY;
}

/* ------------------------------------------------------------
   HELPER: Section Title Bar (Medium Width)
------------------------------------------------------------ */
function drawSectionHeader(doc, title, y) {
  const xStart = 60;
  const width = 475;
  const barHeight = 22;

  // Top gap
  y += 14;

  // Bar
  doc.rect(xStart, y, width, barHeight)
    .fill("#000000");

  // Text
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(title, xStart + 10, y + 5);

  // Restore fill for body text
  doc.fillColor("#000000");

  // Bottom gap
  return y + barHeight + 20;
}

/* ------------------------------------------------------------
   PAGE BREAK HANDLER
------------------------------------------------------------ */
function ensureSpace(doc, y, needed = 120) {
  if (y + needed > doc.page.height - 70) {
    doc.addPage();
    return 120; // reset y for each new page
  }
  return y;
}

/* ------------------------------------------------------------
   HEADER (Style C)
------------------------------------------------------------ */
function drawHeader(doc, vin) {
  const headerHeight = 70;

  // Header bar
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

  // VIN + Date
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`VIN: ${vin}`, 400, 20, { align: "right", width: 150 });

  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 400, 38, {
    align: "right",
    width: 150,
  });

  // Reset fill
  doc.fillColor("#000");

  return headerHeight + 40; // spacing before first section
}

/* ------------------------------------------------------------
   MAIN REPORT GENERATOR
------------------------------------------------------------ */
async function generateVehicleReport(vehicleData, vin) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margin: 50,
      });

      const tempFilePath = `/tmp/report-${vin}-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.pdf`;
      const stream = fs.createWriteStream(tempFilePath);
      doc.pipe(stream);

      let y = drawHeader(doc, vin);

      /* ===== SECTION: EXECUTIVE SUMMARY ===== */
      y = drawSectionHeader(doc, "EXECUTIVE SUMMARY", y);
      y = ensureSpace(doc, y);

      const summary = `
This report provides a clear view of the current market position for the selected vehicle, using available sales data, estimated values, and historical trends. Prices shown represent estimates based on currently accessible API data; actual dealer pricing may vary.
      `;
      y = drawHybridParagraph(doc, summary, { y });

      /* ===== SECTION: VEHICLE OVERVIEW ===== */
      y = drawSectionHeader(doc, "VEHICLE OVERVIEW", y);
      y = ensureSpace(doc, y);

      const overviewText = `
Year: ${vehicleData?.year || "N/A"}
Make: ${vehicleData?.make || "N/A"}
Model: ${vehicleData?.model || "N/A"}
Trim: ${vehicleData?.trim || "N/A"}
Mileage: ${vehicleData?.mileage || "N/A"}
      `;
      y = drawHybridParagraph(doc, overviewText, { y });

      /* ===== SECTION: MARKET VALUE & RANGE ===== */
      y = drawSectionHeader(doc, "MARKET VALUE & NEGOTIATION RANGE", y);
      y = ensureSpace(doc, y);

      const priceText = `
Estimated Market Value: $${vehicleData?.price || "N/A"}
Expected Negotiation Range: $${vehicleData?.minPrice || "N/A"} - $${vehicleData?.maxPrice || "N/A"}
      `;
      y = drawHybridParagraph(doc, priceText, { y });

      /* ===== SECTION: COMPARABLES ===== */
      y = drawSectionHeader(doc, "COMPARABLE VEHICLES", y);
      y = ensureSpace(doc, y);

      if (!vehicleData?.comparables || vehicleData.comparables.length === 0) {
        y = drawHybridParagraph(
          doc,
          "No comparable vehicles were available at the time of this report.",
          { y }
        );
      } else {
        for (const comp of vehicleData.comparables) {
          const compText = `
${comp.year} ${comp.make} ${comp.model} — ${comp.mileage} mi — $${comp.price}
Location: ${comp.location}
          `;
          y = drawHybridParagraph(doc, compText, { y });
          y += 4;
        }
      }

      /* ===== SECTION: NEGOTIATION STRATEGY ===== */
      y = drawSectionHeader(doc, "NEGOTIATION STRATEGY", y);
      y = ensureSpace(doc, y);

      const strategy = `
Be polite but assertive. Start below your target price and let the dealer counter. Focus on items like mileage, time on market, and vehicle condition to justify your offer.
      `;
      y = drawHybridParagraph(doc, strategy, { y });

      /* ===== SECTION: SCRIPT ===== */
      y = drawSectionHeader(doc, "NEGOTIATION SCRIPT", y);
      y = ensureSpace(doc, y);

      const script = `
"Hi, I’m interested in this vehicle. Based on current market trends and comparable listings, it appears the fair purchase price should be around $${vehicleData.minPrice}. I’d like to move forward at that number if possible. What flexibility do you have on price?"
      `;
      y = drawHybridParagraph(doc, script, { y });

      /* ===== SECTION: DISCLAIMER ===== */
      y = drawSectionHeader(doc, "DISCLAIMER", y);
      y = ensureSpace(doc, y);

      const disclaimer = `
This report reflects estimates and information accessible through external automotive data sources. CarSaavy does not guarantee dealer participation, final pricing, or the availability of specific vehicles. All values are subject to change.
      `;
      y = drawHybridParagraph(doc, disclaimer, { y });

      /* Finish PDF */
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
