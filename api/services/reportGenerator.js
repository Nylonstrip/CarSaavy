// /api/services/reportGenerator.js
// Redesigned PDF generator for CarSaavy (Version 2 copy)
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

function asNumber(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && val.trim() && !isNaN(Number(val))) {
    return Number(val);
  }
  return null;
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

    page.drawText(label.toUpperCase(), {
      x: colX,
      y,
      size: labelSize,
      font: fontBold,
      color: rgb(0.45, 0.51, 0.59),
    });
    y -= lineHeight - 3;

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
      // Single-page for now; can add multi-page support later if needed.
      // const newPage = pdfDoc.addPage([595.28, 841.89]);
      // y = height - marginTop;
    }
  }

  // ---------- HEADER ----------
  const headerTitle = 'CarSaavy — Vehicle Market & Negotiation Report';
  const headerSub = 'Personalized market data and negotiation guidance for your vehicle.';
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
  const metaX = width - marginX - 200;
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

  // ---------- EXECUTIVE SUMMARY ----------
  ensureSpace(4);
  drawSectionTitle('Executive summary');

  const summaryLines = [
    'This report gives you a clear, data-backed view of your vehicle’s',
    'current market value, competitive position, and recommended',
    'negotiation strategy, based on comparable listings in your area.'
  ];

  summaryLines.forEach((line) => {
    ensureSpace(1);
    drawText(line, marginX + 4, {
      size: 10,
      font: fontRegular,
      color: rgb(0.13, 0.16, 0.24),
    });
  });

  y -= 4;

  // ---------- VEHICLE OVERVIEW ----------
  ensureSpace(6);
  drawSectionTitle('Vehicle overview');

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

  // ---------- MARKET SNAPSHOT & NEGOTIATION RANGE ----------
  ensureSpace(8);
  drawSectionTitle('Market value & negotiation range');

  const lowPrice =
    data.market.lowPrice || data.market.low || data.market.minPrice;
  const highPrice =
    data.market.highPrice || data.market.high || data.market.maxPrice;
  const avgPrice =
    data.market.avgPrice || data.market.averagePrice || data.market.meanPrice;
  const demandLevel =
    data.market.demandLevel || data.market.demand || 'Not available';

  const minSavings = data.negotiation.minSavings || data.negotiation.min;
  const maxSavings = data.negotiation.maxSavings || data.negotiation.max;
  const targetPrice = data.negotiation.targetPrice || data.negotiation.target;

  const listPriceNum = asNumber(data.listPrice);
  const minSavingsNum = asNumber(minSavings);
  const maxSavingsNum = asNumber(maxSavings);
  const avgPriceNum = asNumber(avgPrice);
  const targetPriceNum = asNumber(targetPrice);

  let targetPriceLowNum = null;
  let targetPriceHighNum = null;

  if (asNumber(data.negotiation?.targetPriceLow) && asNumber(data.negotiation?.targetPriceHigh)) {
    targetPriceLowNum = asNumber(data.negotiation.targetPriceLow);
    targetPriceHighNum = asNumber(data.negotiation.targetPriceHigh);
  } else if (listPriceNum !== null && minSavingsNum !== null && maxSavingsNum !== null) {
    // Offer range = asking minus savings band
    targetPriceLowNum = listPriceNum - maxSavingsNum;
    targetPriceHighNum = listPriceNum - minSavingsNum;
  } else if (targetPriceNum !== null) {
    targetPriceLowNum = targetPriceNum;
    targetPriceHighNum = targetPriceNum;
  } else if (avgPriceNum !== null) {
    targetPriceLowNum = avgPriceNum;
    targetPriceHighNum = avgPriceNum;
  }

  const estimatedMarketValue =
    avgPriceNum !== null ? avgPriceNum : (listPriceNum !== null ? listPriceNum : null);

  const estimatedMarketValueText = estimatedMarketValue
    ? moneyOr(estimatedMarketValue)
    : 'Not available';

  const targetRangeText =
    targetPriceLowNum !== null && targetPriceHighNum !== null
      ? (targetPriceLowNum !== targetPriceHighNum
          ? `${moneyOr(targetPriceLowNum)} – ${moneyOr(targetPriceHighNum)}`
          : moneyOr(targetPriceHighNum))
      : 'Based on comparable vehicles';

  const confidenceText =
    data.negotiation.confidenceText ||
    'Range estimated from similar listings over the last 60–90 days when available.';

  const compCount =
    data.market.sampleSize ||
    (Array.isArray(data.comparables) ? data.comparables.length : null);

  // Negotiation / value block
  const negBoxX = marginX;
  const negBoxWidth = width - marginX * 2;
  const negBoxHeight = 80;
  const negBoxY = y - negBoxHeight + 10;

  page.drawRectangle({
    x: negBoxX,
    y: negBoxY,
    width: negBoxWidth,
    height: negBoxHeight,
    color: rgb(0.01, 0.04, 0.09),
  });

  y -= 4;
  page.drawText('MARKET VALUE & SUGGESTED OFFER RANGE', {
    x: negBoxX + 10,
    y: negBoxY + negBoxHeight - 16,
    size: 8,
    font: fontBold,
    color: rgb(0.74, 0.82, 0.9),
  });

  page.drawText(`Estimated market value: ${estimatedMarketValueText}`, {
    x: negBoxX + 10,
    y: negBoxY + negBoxHeight - 32,
    size: 11,
    font: fontBold,
    color: rgb(0.9, 0.97, 1),
  });

  page.drawText(`Suggested offer range: ${targetRangeText} out the door`, {
    x: negBoxX + 10,
    y: negBoxY + negBoxHeight - 46,
    size: 10,
    font: fontRegular,
    color: rgb(0.9, 0.97, 1),
  });

  const detailY = negBoxY + 22;

  page.drawText(
    `Based on${compCount ? ' ' + compCount + ' comparable vehicles' : ' available comparable vehicles'} in your area.`,
    {
      x: negBoxX + 10,
      y: detailY,
      size: 9,
      font: fontRegular,
      color: rgb(0.74, 0.82, 0.9),
    }
  );

  page.drawText(`Market demand: ${safe(demandLevel)}`, {
    x: negBoxX + 10,
    y: detailY - 12,
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
    compCount ? numberOr(compCount) : 'Not available',
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

  // ---------- COMPARABLE VEHICLES ----------
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

  // ---------- QUICK MARKET HIGHLIGHTS ----------
  ensureSpace(5);
  drawSectionTitle('Quick market highlights');

  const highlights = [];

  if (demandLevel && demandLevel !== 'Not available') {
    highlights.push(`• Market demand for this model is ${demandLevel.toLowerCase()} in your area.`);
  }
  if (listPriceNum !== null && avgPriceNum !== null) {
    if (listPriceNum > avgPriceNum) {
      highlights.push('• The asking price is above the estimated market average, giving room to negotiate.');
    } else if (listPriceNum < avgPriceNum) {
      highlights.push('• The asking price is below the estimated market average, which may limit negotiation room.');
    } else {
      highlights.push('• The asking price is close to the estimated market average.');
    }
  }
  if (compCount) {
    highlights.push(`• There are ${compCount} similar listings contributing to this estimate.`);
  }
  if (!highlights.length) {
    highlights.push('• Market and comparable data is limited for this vehicle. Use the suggested range as a general guide.');
  }

  highlights.forEach((line) => {
    ensureSpace(1);
    drawText(line, marginX + 4, {
      size: 9.5,
      font: fontRegular,
      color: rgb(0.13, 0.16, 0.24),
    });
  });

  // ---------- NEGOTIATION STRATEGY ----------
  ensureSpace(5);
  drawSectionTitle('Negotiation strategy');

  const strategyLines = [];

  if (targetPriceLowNum !== null || targetPriceHighNum !== null) {
    const startOfferText =
      targetPriceLowNum !== null ? moneyOr(targetPriceLowNum) : targetRangeText;
    const closeTargetText =
      targetPriceHighNum !== null ? moneyOr(targetPriceHighNum) : targetRangeText;

    strategyLines.push(`Start your negotiation near: ${startOfferText}`);
    strategyLines.push(`Aim to close the deal around: ${closeTargetText}`);
  } else {
    strategyLines.push('Use the estimated market value and comparable listings as your anchor.');
  }

  strategyLines.push('');
  strategyLines.push('These numbers are based on active local listings,');
  strategyLines.push('and frame you as an informed buyer with real data.');

  strategyLines.forEach((line) => {
    ensureSpace(1);
    drawText(line, marginX + 4, {
      size: 9.5,
      font: fontRegular,
      color: rgb(0.11, 0.15, 0.2),
    });
  });

  // ---------- NEGOTIATION SCRIPT ----------
  ensureSpace(5);
  drawSectionTitle('Suggested negotiation script');

  const scriptRangeLowText =
    targetPriceLowNum !== null ? moneyOr(targetPriceLowNum) : 'a fair market range';
  const scriptRangeHighText =
    targetPriceHighNum !== null && targetPriceHighNum !== targetPriceLowNum
      ? moneyOr(targetPriceHighNum)
      : null;

  const rangePhrase =
    scriptRangeHighText ? `${scriptRangeLowText} to ${scriptRangeHighText}` : scriptRangeLowText;

  const scriptLines = [
    `“Hi, I’m very interested in the vehicle. I’ve reviewed similar listings`,
    `in the area, and based on current market prices I’m seeing comparable`,
    `models landing around ${rangePhrase} out the door.`,
    '',
    `If we can get the numbers closer to that range today, I’m ready`,
    `to move forward.`,
    '',
    `Can you check with your sales manager and see what flexibility you have?”`,
    '',
    'If they push back:',
    '“I understand. I’m basing my offer on real listings in the market.',
    'If there’s a reason this vehicle should be valued higher than similar ones,',
    'I’m open to hearing it.”',
    '',
    'If they say “That’s too low”:',
    '“Totally fair. What’s the best out-the-door number you can do?',
    'I’m comparing offers today, but I’d prefer to work with you.”',
    '',
    'If they give you a number:',
    `“Thanks for checking. That’s higher than the market average I’m seeing.`,
    `If you can meet me closer to ${scriptRangeHighText || scriptRangeLowText},`,
    `we can wrap this up today.”`
  ];

  scriptLines.forEach((line) => {
    ensureSpace(1);
    drawText(line, marginX + 4, {
      size: 9,
      font: fontRegular,
      color: rgb(0.11, 0.15, 0.2),
    });
  });

  // ---------- DISCLAIMER ----------
  ensureSpace(5);
  const disclaimerY = y - 4;
  page.drawLine({
    start: { x: marginX, y: disclaimerY + 16 },
    end: { x: width - marginX, y: disclaimerY + 16 },
    thickness: 0.5,
    color: rgb(0.85, 0.89, 0.93),
  });

  const disclaimerText =
    'CarSaavy provides this report using available market and listing data, which may be incomplete ' +
    'or contain inaccuracies. Pricing ranges are estimates only and do not guarantee that any dealer ' +
    'will agree to a specific price or outcome. This report is for informational purposes and is not ' +
    'financial, legal, or purchasing advice. Vehicle history, condition, and final sale prices may vary. ' +
    'CarSaavy is not responsible for purchase decisions or outcomes related to the use of this report.';

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

  // ---------- FOOTER ----------
  page.drawText(
    `© ${now.getFullYear()} CarSaavy — Smarter Car Buying Starts Here — www.carsaavy.com`,
    {
      x: marginX,
      y: 40,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.62, 0.68, 0.76),
    }
  );

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
