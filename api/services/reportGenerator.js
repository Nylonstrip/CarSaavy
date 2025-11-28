// /api/services/reportGenerator.js
// CarSaavy PDF generator — Premium Edition
// Header Style C + black theme + Option 2 subtitle
// Complete spacing fix + multi-page support

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const { put } = require("@vercel/blob");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safe(val, fallback = "N/A") {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string" && !val.trim()) return fallback;
  return String(val);
}

function numberOr(val, fallback = "N/A") {
  if (typeof val === "number") return val.toLocaleString("en-US");
  if (typeof val === "string" && val.trim() && !isNaN(Number(val))) {
    return Number(val).toLocaleString("en-US");
  }
  return fallback;
}

function moneyOr(val, fallback = "Not available") {
  if (typeof val === "number") {
    return val.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  }
  if (typeof val === "string" && val.trim() && !isNaN(Number(val))) {
    const n = Number(val);
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  }
  return fallback;
}

function asNumber(val) {
  if (typeof val === "number") return val;
  if (typeof val === "string" && val.trim() && !isNaN(Number(val))) {
    return Number(val);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Data normalization (unchanged except for cleanup)
// ---------------------------------------------------------------------------

function normalizeReportData(raw, vin) {
  const vehicle = raw.vehicle || raw.basic || raw;

  const year =
    vehicle.year ||
    vehicle.Year ||
    vehicle.vehicle_year ||
    raw.year ||
    raw.Year;

  const make =
    vehicle.make ||
    vehicle.Make ||
    vehicle.vehicle_make ||
    raw.make ||
    raw.Make;

  const model =
    vehicle.model ||
    vehicle.Model ||
    vehicle.vehicle_model ||
    raw.model ||
    raw.Model;

  const trim =
    vehicle.trim ||
    vehicle.Trim ||
    vehicle.series ||
    raw.trim ||
    raw.Trim;

  const mileage =
    vehicle.odometer ||
    vehicle.mileage ||
    vehicle.miles ||
    raw.mileage ||
    raw.miles;

  const bodyStyle =
    vehicle.body_style ||
    vehicle.bodyStyle ||
    vehicle.body_type ||
    raw.body_style ||
    raw.bodyStyle;

  const engine =
    vehicle.engine ||
    vehicle.engine_description ||
    raw.engine ||
    raw.engine_description;

  const drivetrain =
    vehicle.drivetrain ||
    vehicle.drive_train ||
    raw.drivetrain ||
    raw.drive_train;

  const transmission =
    vehicle.transmission ||
    vehicle.transmission_description ||
    raw.transmission ||
    raw.transmission_description;

  const fuelType =
    vehicle.fuel_type ||
    vehicle.fuelType ||
    raw.fuel_type ||
    raw.fuelType;

  const exteriorColor =
    vehicle.exterior_color ||
    vehicle.ext_color ||
    raw.exterior_color ||
    raw.ext_color;

  const interiorColor =
    vehicle.interior_color ||
    vehicle.int_color ||
    raw.interior_color ||
    raw.int_color;

  const listPrice =
    raw.listPrice ||
    raw.list_price ||
    vehicle.listPrice ||
    vehicle.list_price ||
    raw.price ||
    vehicle.price;

  const vinFromData =
    vehicle.vin ||
    vehicle.VIN ||
    raw.vin ||
    raw.VIN ||
    vin;

  return {
    vin: vinFromData,
    year,
    make,
    model,
    trim,
    mileage,
    bodyStyle,
    engine,
    drivetrain,
    transmission,
    fuelType,
    exteriorColor,
    interiorColor,
    listPrice,
    market: raw.market || {},
    negotiation: raw.negotiation || {},
    comparables: Array.isArray(raw.comparables) ? raw.comparables : [],
  };
}

// ---------------------------------------------------------------------------
// MAIN PDF BUILDER
// ---------------------------------------------------------------------------

async function generateVehicleReport(rawData, vin) {
  console.log("[ReportGenerator] Starting PDF generation...");

  const data = normalizeReportData(rawData || {}, vin);

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]); // Standard A4
  let { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Layout constants
  const marginX = 40;
  const bottomMargin = 50;
  const lineHeight = 13;

  // Timestamp
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  let y;

  // -----------------------------------------------------------------------
  // Draw Header (Style C + black)
  // -----------------------------------------------------------------------

  function drawHeader() {
    const headerHeight = 70; // increased from 50
    const headerY = height - 80;

    // Black bar
    page.drawRectangle({
      x: marginX,
      y: headerY,
      width: width - marginX * 2,
      height: headerHeight,
      color: rgb(0, 0, 0),
    });

    // Title
    page.drawText("CARSAAVY VEHICLE MARKET REPORT", {
      x: marginX + 14,
      y: headerY + headerHeight - 28,
      size: 17,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    // Subtitle (Option 2)
    page.drawText("Market Value • Comparable Listings • Negotiation Guidance", {
      x: marginX + 14,
      y: headerY + headerHeight - 44,
      size: 10,
      font: fontRegular,
      color: rgb(0.85, 0.85, 0.85),
    });

    // Metadata (placed *below* the header bar)
    const metaY = headerY - 20;

    page.drawText(`Generated: ${dateStr}`, {
      x: marginX,
      y: metaY,
      size: 9,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.25),
    });

    page.drawText(`VIN: ${safe(data.vin || vin).toUpperCase()}`, {
      x: marginX,
      y: metaY - 14,
      size: 9,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.25),
    });

    // Start content GOOD distance below header
    y = metaY - 35; // ~150px from top
  }

  function newPage() {
    page = pdfDoc.addPage([595.28, 841.89]);
    ({ width, height } = page.getSize());
    drawHeader();
  }

  function ensureSpace(lines = 3) {
    const needed = lines * lineHeight + bottomMargin;
    if (y - needed < 0) newPage();
  }

  function drawText(text, x, opts = {}) {
    const { size = 11, font = fontRegular, color = rgb(0.1, 0.1, 0.1) } = opts;
    ensureSpace(1);
    page.drawText(text, { x, y, size, font, color });
    y -= lineHeight;
  }

  function drawSectionTitle(title) {
    ensureSpace(4);
    y -= 6;
    const barHeight = 20;
    const barY = y;

    page.drawRectangle({
      x: marginX,
      y: barY,
      width: width - marginX * 2,
      height: barHeight,
      color: rgb(0, 0, 0),
    });

    page.drawText(title.toUpperCase(), {
      x: marginX + 8,
      y: barY + 5,
      size: 10,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    y = barY - 18;
  }

  function drawParagraph(text, opts = {}) {
    const { size = 10, color = rgb(0.1, 0.1, 0.1) } = opts;
    const maxWidth = width - marginX * 2;
    const words = text.split(" ");
    let line = "";

    words.forEach((word) => {
      const testLine = line + word + " ";
      const w = fontRegular.widthOfTextAtSize(testLine, size);

      if (w > maxWidth) {
        drawText(line.trim(), marginX + 4, { size, color });
        line = word + " ";
      } else {
        line = testLine;
      }
    });

    if (line.trim()) {
      drawText(line.trim(), marginX + 4, { size, color });
    }
  }

  // -----------------------------------------------------------------------
  // PAGE 1 HEADER
  // -----------------------------------------------------------------------
  drawHeader();

  // -----------------------------------------------------------------------
  // SECTION 1 — EXECUTIVE SUMMARY
  // -----------------------------------------------------------------------

  drawSectionTitle("Executive Summary");

  drawParagraph(
    "This report provides a data-driven look at your vehicle’s pricing position within the local market, including comparable listings, estimated market value, and negotiation guidance."
  );

  // -----------------------------------------------------------------------
  // SECTION 2 — VEHICLE OVERVIEW
  // -----------------------------------------------------------------------

  drawSectionTitle("Vehicle Overview");

  const col1 = marginX + 2;
  const col2 = marginX + (width - marginX * 2) / 2 + 4;

  function drawKV(label, value, x) {
    ensureSpace(2);
    page.drawText(label.toUpperCase(), {
      x,
      y,
      size: 8.5,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= lineHeight - 2;
    page.drawText(value, {
      x,
      y,
      size: 11,
      font: fontRegular,
      color: rgb(0.08, 0.08, 0.1),
    });
    y -= lineHeight;
  }

  drawKV(
    "Year / Make / Model / Trim",
    [data.year, data.make, data.model, data.trim]
      .filter(Boolean)
      .join(" "),
    col1
  );

  drawKV("VIN", safe((data.vin || vin).toUpperCase()), col2);
  drawKV("Body Style", safe(data.bodyStyle), col1);
  drawKV("Odometer", `${numberOr(data.mileage)} mi`, col2);

  drawKV(
    "Engine / Drivetrain",
    `${safe(data.engine)}${
      data.drivetrain ? " • " + safe(data.drivetrain) : ""
    }`,
    col1
  );

  drawKV("Transmission", safe(data.transmission), col2);

  drawKV("Fuel Type", safe(data.fuelType), col1);

  drawKV(
    "Exterior / Interior",
    `${safe(data.exteriorColor)} / ${safe(data.interiorColor)}`,
    col2
  );

  drawKV("Current Asking Price", moneyOr(data.listPrice), col1);

  // -----------------------------------------------------------------------
  // SECTION 3 — MARKET VALUE / NEGOTIATION RANGE
  // -----------------------------------------------------------------------

  drawSectionTitle("Market Value & Negotiation Range");

  const low = data.market.lowPrice;
  const high = data.market.highPrice;
  const avg = asNumber(data.market.avgPrice);
  const demand = data.market.demandLevel || "Not available";

  const listNum = asNumber(data.listPrice);
  const minSav = asNumber(data.negotiation.minSavings);
  const maxSav = asNumber(data.negotiation.maxSavings);

  let targetLow = null;
  let targetHigh = null;

  if (listNum !== null && minSav !== null && maxSav !== null) {
    targetLow = listNum - maxSav;
    targetHigh = listNum - minSav;
  }

  const marketVal = avg !== null ? avg : listNum;

  const estimatedMarketValueText = marketVal
    ? moneyOr(marketVal)
    : "Not available";

  const targetRangeText =
    targetLow && targetHigh
      ? `${moneyOr(targetLow)} – ${moneyOr(targetHigh)}`
      : "Not available";

  // Negotiation block: black box
  ensureSpace(10);

  const boxH = 90;
  const boxY = y - boxH + 8;

  page.drawRectangle({
    x: marginX,
    y: boxY,
    width: width - marginX * 2,
    height: boxH,
    color: rgb(0, 0, 0),
  });

  page.drawText("MARKET VALUE & SUGGESTED OFFER RANGE", {
    x: marginX + 12,
    y: boxY + boxH - 18,
    size: 9,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(`Estimated market value: ${estimatedMarketValueText}`, {
    x: marginX + 12,
    y: boxY + boxH - 36,
    size: 12,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(`Suggested offer range: ${targetRangeText} OTD`, {
    x: marginX + 12,
    y: boxY + boxH - 52,
    size: 10,
    font: fontRegular,
    color: rgb(0.9, 0.9, 0.9),
  });

  page.drawText(`Market demand: ${safe(demand)}`, {
    x: marginX + 12,
    y: boxY + 18,
    size: 9,
    font: fontRegular,
    color: rgb(0.85, 0.85, 0.85),
  });

  y = boxY - 20;

  // -----------------------------------------------------------------------
  // SECTION 4 — COMPARABLE VEHICLES
  // -----------------------------------------------------------------------

  drawSectionTitle("Comparable Vehicles");

  const comps = data.comparables || [];
  if (comps.length === 0) {
    drawText("No comparable listings available for this vehicle.", marginX + 4, {
      size: 10,
      color: rgb(0.4, 0.4, 0.4),
    });
  } else {
    const colVeh = marginX + 2;
    const colMi = marginX + 240;
    const colPr = marginX + 330;
    const colTag = marginX + 430;

    drawText("Vehicle", colVeh, { size: 8, font: fontBold });
    drawText("Mileage", colMi, { size: 8, font: fontBold });
    drawText("Price", colPr, { size: 8, font: fontBold });
    drawText("Position", colTag, { size: 8, font: fontBold });

    y -= 6;

    comps.slice(0, 5).forEach((c) => {
      ensureSpace(2);
      const veh = [c.year, c.make, c.model, c.trim]
        .filter(Boolean)
        .join(" ");

      drawText(veh || "N/A", colVeh, {});
      drawText(`${numberOr(c.mileage)} mi`, colMi, {});
      drawText(moneyOr(c.price), colPr, {});
      drawText(
        c.position || c.marketPosition || "—",
        colTag,
        { color: rgb(0.2, 0.2, 0.4) }
      );
    });
  }

  // -----------------------------------------------------------------------
  // SECTION 5 — MARKET HIGHLIGHTS
  // -----------------------------------------------------------------------

  drawSectionTitle("Quick Market Highlights");

  const highlights = [];

  if (demand !== "Not available") {
    highlights.push(
      `• Market demand for this model is ${demand.toLowerCase()} in your area.`
    );
  }
  if (listNum !== null && avg !== null) {
    if (listNum > avg) {
      highlights.push(
        "• Asking price is above the market average — strong negotiation room."
      );
    } else if (listNum < avg) {
      highlights.push(
        "• Asking price is below the market average — limited negotiation room."
      );
    } else {
      highlights.push("• Asking price closely matches the market average.");
    }
  }

  if (!highlights.length) {
    highlights.push(
      "• Limited comparable data available — use suggested range as general guidance."
    );
  }

  highlights.forEach((h) => {
    drawParagraph(h, { size: 10 });
  });

  // -----------------------------------------------------------------------
  // SECTION 6 — NEGOTIATION STRATEGY
  // -----------------------------------------------------------------------

  drawSectionTitle("Negotiation Strategy");

  if (targetLow && targetHigh) {
    drawParagraph(
      `Start near ${moneyOr(targetLow)} and aim to close around ${moneyOr(
        targetHigh
      )} out the door. These ranges are based on comparable listings and typical dealer adjustments.`
    );
  } else {
    drawParagraph(
      "Use comparable listings and the estimated market value as your negotiation anchor."
    );
  }

  // -----------------------------------------------------------------------
  // SECTION 7 — NEGOTIATION SCRIPT
  // -----------------------------------------------------------------------

  drawSectionTitle("Suggested Negotiation Script");

  const scriptLines = [
    `“I’ve reviewed similar listings in the area, and based on current market prices,`,
    `comparable models are landing around ${targetRangeText} out the door.`,
    `If we can get close to that range today, I’m ready to move forward.”`,
    "",
    "If they push back:",
    "“I understand. I’m basing my offer on real market data.",
    "If there’s a reason this vehicle should be valued higher, I’m open to hearing it.”",
    "",
    "If they say it’s too low:",
    "“That’s fair. What’s the best out-the-door number you can do?",
    "I’m comparing offers today but would prefer to work with you.”",
    "",
    "If they give a number:",
    `“Thanks for checking. If you can meet me closer to ${moneyOr(
      targetHigh || targetLow
    )}, we can wrap this up today.”`,
  ];

  scriptLines.forEach((line) => {
    drawText(line, marginX + 4, { size: 9 });
  });

  // -----------------------------------------------------------------------
  // SECTION 8 — DISCLAIMER
  // -----------------------------------------------------------------------

  drawSectionTitle("Disclaimer");

  drawParagraph(
    "CarSaavy provides this report using available market and listing data, which may be incomplete or contain inaccuracies. Pricing ranges are estimates only and do not guarantee that any dealer will agree to a specific price or outcome. This report is for informational purposes and is not financial, legal, or purchasing advice."
  );

  // Footer
  page.drawText(
    `© ${now.getFullYear()} CarSaavy — www.carsaavy.com`,
    {
      x: marginX,
      y: bottomMargin - 10,
      size: 8,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    }
  );

  // -----------------------------------------------------------------------
  // SAVE & UPLOAD
  // -----------------------------------------------------------------------

  const pdfBytes = await pdfDoc.save();
  const filename = `report-${vin}-${now.toISOString().replace(/[:.]/g, "-")}.pdf`;
  const filepath = `/tmp/${filename}`;
  fs.writeFileSync(filepath, pdfBytes);

  const { url } = await put(`reports/${filename}`, new Blob([pdfBytes]), {
    access: "public",
  });

  return url;
}

module.exports = { generateVehicleReport };
