// /api/services/reportGenerator.js
// Redesigned PDF generator for CarSaavy
// Uses pdf-lib to produce a structured, branded, single-page report PDF
// Returns a public Blob URL, same behaviour as the previous implementation.

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const { put } = require('@vercel/blob');

function safe(val, fallback = 'N/A') {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string' && !val.trim()) return fallback;
  return String(val);
}

function numberOr(val, fallback = 'N/A') {
  if (typeof val === 'number') return val.toLocaleString('en-US');
  if (typeof val === 'string' && val.trim() && !isNaN(Number(val))) {
    return Number(val).toLocaleString('en-US');
  }
  return fallback;
}

function moneyOr(val, fallback = 'Not available') {
  if (typeof val === 'number') {
    return val.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  }
  if (typeof val === 'string' && val.trim() && !isNaN(Number(val))) {
    const n = Number(val);
    return n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  }
  return fallback;
}

// Extract a "normalized" view of the vehicle + market from whatever the
// upstream vehicleData service returns. This is defensive on purpose so
// changes in API shape don't break the report.
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

  // Optional market / negotiation fields — fill what you have, others
  // will gracefully render as "Not available".
  const market = raw.market || {};
  const negotiation = raw.negotiation || {};
  const comparables = Array.isArray(raw.comparables) ? raw.comparables : [];

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
    market,
    negotiation,
    comparables,
  };
}

async function generateVehicleReport(rawData, vin) {
  console.log('[ReportGenerator] Starting PDF generation...');

  const data = normalizeReportData(rawData || {}, vin);

  // Create new PDF (A4: 595.28 x 841.89 pt)
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const marginX = 40;
  const marginTop = 60;
  const lineHeight = 14;

  let y = height - marginTop;

  function drawText(text, x, opts = {}) {
    const {
      size = 11,
      font = fontRegular,
      color = rgb(0.07, 0.09, 0.15),
    } = opts;

    page.drawText(text, { x, y, size, font, color });
    y -= lineHeight;
  }

  function drawSectionTitle(title) {
    y -= 6;
    // dark header bar
    const barHeight = 18;
    const barY = y;
    page.drawRectangle({
      x: marginX,
      y: barY,
      width: width - marginX * 2,
      height: barHeight,
      color: rgb(0.01, 0.04, 0.09),
    });
    page.drawText(title.toUpperCase(), {
      x: marginX + 8,
      y: barY + 4,
      size: 10,
      font: fontBold,
      color: rgb(0.82, 0.86, 0.91),
    });
    y = barY - 10;
  }

  function drawKeyValue(label, value, colX) {
    const labelSize = 8.5;
    const valueSize = 11;

    // label
    page.drawText(label.toUpperCase(), {
      x: colX,
      y,
      size: labelSize,
      font: fontBold,
      color: rgb(0.45, 0.51, 0.59),
    });
    y -= lineHeight - 3;

    // value
    page.drawText(value, {
      x: colX,
      y,
      size: valueSize,
      font: fontRegular,
      color: rgb(0.07, 0.09, 0.15),
    });
    y -= lineHeight + 2;
  }

  function ensureSpace(linesNeeded = 3) {
    if (y < 80 + linesNeeded * lineHeight) {
      // For now, we assume single page is enough. If you ever find this
      // overflowing, we can add proper multi-page support.
      // const newPage = pdfDoc.addPage([595.28, 841.89]);
      // y = height - marginTop;
    }
  }

  // HEADER
  const headerTitle = 'CarSaavy Vehicle Analysis Report';
  const headerSub = 'Automated market intelligence for informed negotiations.';
  const titleSize = 16;

  page.drawRectangle({
    x: marginX,
    y: y - 4,
    width: width - marginX * 2,
    height: 40,
    color: rgb(0.01, 0.04, 0.09),
  });

  page.drawText(headerTitle, {
    x: marginX + 10,
    y: y + 12,
    size: titleSize,
    font: fontBold,
    color: rgb(0.91, 0.96, 1),
  });

  page.drawText(headerSub, {
    x: marginX + 10,
    y: y,
    size: 9,
    font: fontRegular,
    color: rgb(0.68, 0.8, 0.95),
  });

  const rightMetaY = y + 18;
  const metaX = width - marginX - 180;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });

  page.drawText(`Generated: ${dateStr}`, {
    x: metaX,
    y: rightMetaY,
    size: 9,
    font: fontRegular,
    color: rgb(0.79, 0.84, 0.93),
  });
  page.drawText(`VIN: ${safe(data.vin || vin).toUpperCase()}`, {
    x: metaX,
    y: rightMetaY - 11,
    size: 9,
    font: fontRegular,
    color: rgb(0.79, 0.84, 0.93),
  });

  y -= 60;

  // VEHICLE OVERVIEW
  drawSectionTitle('Vehicle overview');
  ensureSpace(6);

  const col1X = marginX + 2;
  const col2X = marginX + (width - marginX * 2) / 2 + 4;

  drawKeyValue(
    'Year / Make / Model / Trim',
    [
      safe(data.year, ''),
      safe(data.make, ''),
      safe(data.model, ''),
      safe(data.trim, ''),
    ]
      .filter(Boolean)
      .join(' '),
    col1X
  );

  drawKeyValue('Vin', safe((data.vin || vin || '').toUpperCase()), col2X);

  drawKeyValue('Body style', safe(data.bodyStyle), col1X);
  drawKeyValue('Odometer', `${numberOr(data.mileage)} mi`, col2X);

  drawKeyValue(
    'Engine / Drivetrain',
    `${safe(data.engine)}${data.drivetrain ? ' • ' + safe(data.drivetrain) : ''}`,
    col1X
  );
  drawKeyValue('Transmission', safe(data.transmission), col2X);

  drawKeyValue('Fuel type', safe(data.fuelType), col1X);
  drawKeyValue(
    'Exterior / Interior',
    `${safe(data.exteriorColor)} / ${safe(data.interiorColor)}`,
    col2X
  );

  drawKeyValue('Current asking price', moneyOr(data.listPrice), col1X);

  y -= 6;

  // MARKET SNAPSHOT & NEGOTIATION RANGE
  ensureSpace(8);
  drawSectionTitle('Market snapshot & negotiation range');

  const lowPrice = data.market.lowPrice || data.market.low || data.market.minPrice;
  const highPrice = data.market.highPrice || data.market.high || data.market.maxPrice;
  const avgPrice = data.market.avgPrice || data.market.averagePrice || data.market.meanPrice;
  const demandLevel = data.market.demandLevel || data.market.demand || 'Not available';

  const minSavings = data.negotiation.minSavings || data.negotiation.min;
  const maxSavings = data.negotiation.maxSavings || data.negotiation.max;
  const targetPrice = data.negotiation.targetPrice || data.negotiation.target;

  const savingsRangeText =
    minSavings && maxSavings
      ? `${moneyOr(minSavings)} – ${moneyOr(maxSavings)} below asking`
      : 'Negotiation range not available';

  const targetPriceText = targetPrice ? moneyOr(targetPrice) : 'Based on comparable vehicles';
  const confidenceText =
    data.negotiation.confidenceText ||
    'Range estimated from similar listings over the last 60–90 days when available.';

  // Negotiation block
  const negBoxX = marginX;
  const negBoxWidth = width - marginX * 2;
  const negBoxHeight = 70;
  const negBoxY = y - negBoxHeight + 10;

  page.drawRectangle({
    x: negBoxX,
    y: negBoxY,
    width: negBoxWidth,
    height: negBoxHeight,
    color: rgb(0.01, 0.04, 0.09),
  });

  y -= 4;
  page.drawText('ESTIMATED NEGOTIATION RANGE', {
    x: negBoxX + 10,
    y: negBoxY + negBoxHeight - 16,
    size: 8,
    font: fontBold,
    color: rgb(0.74, 0.82, 0.9),
  });

  page.drawText(savingsRangeText, {
    x: negBoxX + 10,
    y: negBoxY + negBoxHeight - 32,
    size: 13,
    font: fontBold,
    color: rgb(0.9, 0.97, 1),
  });

  page.drawText(`Target price: ${targetPriceText}`, {
    x: negBoxX + 10,
    y: negBoxY + 18,
    size: 9,
    font: fontRegular,
    color: rgb(0.74, 0.82, 0.9),
  });

  page.drawText(`Market demand: ${safe(demandLevel)}`, {
    x: negBoxX + negBoxWidth / 2,
    y: negBoxY + 18,
    size: 9,
    font: fontRegular,
    color: rgb(0.74, 0.82, 0.9),
  });

  page.drawText(confidenceText, {
    x: negBoxX + 10,
    y: negBoxY + 4,
    size: 8,
    font: fontRegular,
    color: rgb(0.62, 0.72, 0.84),
    maxWidth: negBoxWidth - 20,
  });

  y = negBoxY - 18;

  // Market snapshot small card
  ensureSpace(6);
  const cardY = y;
  const cardHeight = 64;
  page.drawRectangle({
    x: marginX,
    y: cardY - cardHeight,
    width: width - marginX * 2,
    height: cardHeight,
    color: rgb(0.97, 0.98, 0.99),
  });

  const cardInnerY = cardY - 12;
  const cardCol1 = marginX + 10;
  const cardCol2 = marginX + (width - marginX * 2) / 2 + 10;

  page.drawText('TYPICAL PRICE RANGE', {
    x: cardCol1,
    y: cardInnerY,
    size: 8,
    font: fontBold,
    color: rgb(0.45, 0.51, 0.59),
  });
  page.drawText(
    lowPrice && highPrice
      ? `${moneyOr(lowPrice)} – ${moneyOr(highPrice)}`
      : 'Not available',
    {
      x: cardCol1,
      y: cardInnerY - 12,
      size: 10,
      font: fontRegular,
      color: rgb(0.07, 0.09, 0.15),
    }
  );

  page.drawText('ESTIMATED MARKET AVERAGE', {
    x: cardCol2,
    y: cardInnerY,
    size: 8,
    font: fontBold,
    color: rgb(0.45, 0.51, 0.59),
  });
  page.drawText(avgPrice ? moneyOr(avgPrice) : 'Not available', {
    x: cardCol2,
    y: cardInnerY - 12,
    size: 10,
    font: fontRegular,
    color: rgb(0.07, 0.09, 0.15),
  });

  page.drawText('LISTINGS ANALYZED', {
    x: cardCol1,
    y: cardInnerY - 28,
    size: 8,
    font: fontBold,
    color: rgb(0.45, 0.51, 0.59),
  });
  page.drawText(
    data.market.sampleSize
      ? numberOr(data.market.sampleSize)
      : 'Not available',
    {
      x: cardCol1,
      y: cardInnerY - 40,
      size: 10,
      font: fontRegular,
      color: rgb(0.07, 0.09, 0.15),
    }
  );

  page.drawText('DEMAND INDICATOR', {
    x: cardCol2,
    y: cardInnerY - 28,
    size: 8,
    font: fontBold,
    color: rgb(0.45, 0.51, 0.59),
  });
  page.drawText(safe(demandLevel), {
    x: cardCol2,
    y: cardInnerY - 40,
    size: 10,
    font: fontRegular,
    color: rgb(0.07, 0.09, 0.15),
  });

  y = cardY - cardHeight - 24;

  // Comparable vehicles (if any)
  ensureSpace(6);
  drawSectionTitle('Comparable vehicles');

  if (data.comparables && data.comparables.length) {
    const tableHeaderY = y;
    const colVehicle = marginX + 2;
    const colMiles = marginX + 230;
    const colPrice = marginX + 320;
    const colTag = marginX + 430;

    page.drawText('Vehicle', {
      x: colVehicle,
      y: tableHeaderY,
      size: 8,
      font: fontBold,
      color: rgb(0.45, 0.51, 0.59),
    });
    page.drawText('Mileage', {
      x: colMiles,
      y: tableHeaderY,
      size: 8,
      font: fontBold,
      color: rgb(0.45, 0.51, 0.59),
    });
    page.drawText('Dealer price', {
      x: colPrice,
      y: tableHeaderY,
      size: 8,
      font: fontBold,
      color: rgb(0.45, 0.51, 0.59),
    });
    page.drawText('Position', {
      x: colTag,
      y: tableHeaderY,
      size: 8,
      font: fontBold,
      color: rgb(0.45, 0.51, 0.59),
    });

    y = tableHeaderY - lineHeight;

    data.comparables.slice(0, 5).forEach((c) => {
      ensureSpace(2);
      const label =
        c.position || c.marketPosition || c.label || 'Market';

      const vehicleLabel = [
        c.year,
        c.make,
        c.model,
        c.trim,
      ]
        .map((v) => safe(v, ''))
        .filter(Boolean)
        .join(' ');

      page.drawText(vehicleLabel || 'N/A', {
        x: colVehicle,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.07, 0.09, 0.15),
      });
      page.drawText(`${numberOr(c.mileage)} mi`, {
        x: colMiles,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.07, 0.09, 0.15),
      });
      page.drawText(moneyOr(c.price), {
        x: colPrice,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.07, 0.09, 0.15),
      });

      // simple tag
      page.drawText(label, {
        x: colTag,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.18, 0.29, 0.42),
      });

      y -= lineHeight;
    });

    y -= 8;
  } else {
    drawText(
      'Comparable vehicle data is not available for this report.',
      marginX + 2,
      { size: 10, font: fontRegular, color: rgb(0.35, 0.39, 0.42) }
    );
  }

  // Negotiation script
  ensureSpace(5);
  drawSectionTitle('Suggested negotiation script');

  const targetPriceText = targetPrice
    ? moneyOr(targetPrice)
    : 'a fair market price';

  const scriptLines = [
    `“I’ve taken a look at similar ${safe(data.year, '')} ${safe(
      data.make,
      ''
    )} ${safe(data.model, '')} listings in this area,`,
    `and most of them are priced${
      lowPrice && highPrice
        ? ' between ' + moneyOr(lowPrice) + ' and ' + moneyOr(highPrice)
        : ' in a competitive range'
    } for comparable mileage and trim.`,
    '',
    `Based on that, and factoring in this vehicle’s mileage and features, I’m comfortable`,
    `at around ${targetPriceText} out the door.`,
    '',
    'Can you work with me on the price and get closer to that range?”',
  ];

  scriptLines.forEach((line) => {
    ensureSpace(1);
    drawText(line, marginX + 4, {
      size: 9.5,
      font: fontRegular,
      color: rgb(0.11, 0.15, 0.2),
    });
  });

  // Disclaimer
  ensureSpace(5);
  const disclaimerY = y - 4;
  page.drawLine({
    start: { x: marginX, y: disclaimerY + 16 },
    end: { x: width - marginX, y: disclaimerY + 16 },
    thickness: 0.5,
    color: rgb(0.85, 0.89, 0.93),
  });

  const disclaimerText =
    'CarSaavy provides automated analysis based on public and third-party automotive data sources. ' +
    'Information may be incomplete or contain inaccuracies and is provided for informational purposes only. ' +
    'CarSaavy does not inspect vehicles, does not participate in your transaction, and does not guarantee any specific ' +
    'negotiation outcome, price reduction, financing terms, or dealer behavior. Market conditions change over time and ' +
    'can vary by region and individual vehicle condition. By using this report, you agree that CarSaavy is not responsible ' +
    'for purchase decisions, vehicle condition, title issues, or any direct or indirect losses related to the use of this information. ' +
    'For full legal terms and detailed disclaimers, please visit www.carsaavy.com/disclaimer.';

  const words = disclaimerText.split(' ');
  let line = '';
  const maxWidth = width - marginX * 2;

  y = disclaimerY;

  words.forEach((word) => {
    const testLine = line + word + ' ';
    const lineWidth = fontRegular.widthOfTextAtSize(testLine, 8);

    if (lineWidth > maxWidth) {
      page.drawText(line.trim(), {
        x: marginX,
        y,
        size: 8,
        font: fontRegular,
        color: rgb(0.45, 0.51, 0.59),
      });
      line = word + ' ';
      y -= 9;
    } else {
      line = testLine;
    }
  });

  if (line.trim()) {
    page.drawText(line.trim(), {
      x: marginX,
      y,
      size: 8,
      font: fontRegular,
      color: rgb(0.45, 0.51, 0.59),
    });
  }

  // Footer
  page.drawText(`© ${now.getFullYear()} CarSaavy — Automated Vehicle Market Intelligence`, {
    x: marginX,
    y: 40,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.62, 0.68, 0.76),
  });

  // Finalize PDF
  const pdfBytes = await pdfDoc.save();

  const filename = `report-${vin}-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
  const filepath = `/tmp/${filename}`;
  fs.writeFileSync(filepath, pdfBytes);

  console.log(`[ReportGenerator] PDF file written: ${filepath}`);
  console.log('[ReportGenerator] Uploading report to Vercel Blob...');

  const { url } = await put(`reports/${filename}`, new Blob([pdfBytes]), {
    access: 'public',
  });
  console.log(`[ReportGenerator] Upload complete: ${url}`);

  return url;
}

module.exports = { generateVehicleReport };
