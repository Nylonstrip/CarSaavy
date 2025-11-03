const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { put } = require('@vercel/blob');

async function generateVehicleReport(data, vin) {
  console.log('[ReportGenerator] Starting PDF generation...');

  // Create new PDF
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const { width, height } = page.getSize();

  // Fonts
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // --- HEADER SECTION ---
  try {
    const logoPath = path.join(process.cwd(), 'images', 'carsaavy_header.png');
    const logoBytes = fs.readFileSync(logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoWidth = 140;
    const logoHeight = (logoImage.height / logoImage.width) * logoWidth;
    const logoX = width / 2 - logoWidth / 2;
    const logoY = height - 100;
    page.drawImage(logoImage, { x: logoX, y: logoY, width: logoWidth, height: logoHeight });
  } catch (e) {
    console.error('[ReportGenerator] Could not load logo:', e.message);
  }

  const title = 'Vehicle Negotiation Report';
  page.drawText(title, {
    x: width / 2 - font.widthOfTextAtSize(title, 18) / 2,
    y: height - 130,
    size: 18,
    font,
    color: rgb(0, 0.705, 0.847), // CarSaavy Blue
  });

  // --- BODY CONTENT ---
  let cursorY = height - 170;
  const bodyText = [
    `VIN: ${vin}`,
    `Make: ${data.make || 'N/A'}`,
    `Model: ${data.model || 'N/A'}`,
    `Year: ${data.year || 'N/A'}`,
    '',
    'Negotiation Insights:',
    `${data.summary || 'Vehicle data successfully generated. Ready for negotiation insights.'}`,
    '',
    'Key Leverage Points:',
    '- Compare dealer pricing with regional averages.',
    '- Verify history and condition records.',
    '- Ask about recent maintenance or recalls.',
  ];

  bodyText.forEach((line) => {
    page.drawText(line, {
      x: 50,
      y: cursorY,
      size: 12,
      font: regular,
      color: rgb(0.1, 0.1, 0.1),
    });
    cursorY -= 20;
  });

  // --- FOOTER SECTION ---
  const footerText = '© 2025 CarSaavy – Negotiate Smarter';
  const footerWidth = regular.widthOfTextAtSize(footerText, 10);
  const footerX = width / 2 - footerWidth / 2;
  const footerY = 40;

  // Footer line
  page.drawLine({
    start: { x: 50, y: 60 },
    end: { x: width - 50, y: 60 },
    thickness: 0.5,
    color: rgb(0, 0.705, 0.847),
  });

  // Footer text
  page.drawText(footerText, {
    x: footerX,
    y: footerY,
    size: 10,
    font: regular,
    color: rgb(0.3, 0.3, 0.3),
  });

  // --- SAVE & UPLOAD ---
  const pdfBytes = await pdfDoc.save();
  const filename = `report-${vin}-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
  const filepath = `/tmp/${filename}`;
  fs.writeFileSync(filepath, pdfBytes);

  console.log(`[ReportGenerator] PDF file written: ${filepath}`);
  console.log('[ReportGenerator] Uploading report to Vercel Blob...');

  const { url } = await put(`reports/${filename}`, new Blob([pdfBytes]), { access: 'public' });
  console.log(`[ReportGenerator] Upload complete: ${url}`);

  return url;
}

module.exports = { generateVehicleReport };
