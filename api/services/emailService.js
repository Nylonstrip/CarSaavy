/**
 * Handles emailing vehicle reports via Resend, SendGrid, or console fallback.
 * Works with /api/generate-report.js to deliver report files post-purchase.
 */

const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');
const { generateEmailTemplate } = require('./emailTemplate');

// ---------- Main function ----------
async function sendEmail(to, reportFile, inline = false, vin = 'Unknown VIN', pdfDownloadLink = null) {
  const emailService = process.env.EMAIL_SERVICE || 'resend';
  console.log(`📧 [EmailService] Preparing to send report for ${vin} via ${emailService}`);

  try {
    switch (emailService.toLowerCase()) {
      case 'resend':
        return await sendWithResend({ to, vin, reportFile, inline, pdfDownloadLink });
      case 'sendgrid':
        return await sendWithSendGrid({ to, vin, reportFile, inline });
      case 'console':
        return await sendToConsole({ to, vin, reportFile });
      default:
        throw new Error(`Unknown email service: ${emailService}`);
    }
  } catch (error) {
    console.error('❌ [EmailService] Failed to send report:', error);
    return { success: false, error: error.message };
  }
}

// ---------- Resend ----------
async function sendWithResend({ to, vin, reportFile, inline, pdfDownloadLink }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  console.log(`📤 [Resend] Sending report to ${to}`);

  try {
    const isPdf = reportFile.endsWith('.pdf');
    const reportLink = inline ? null : reportFile;

    const html = generateEmailTemplate(vin, reportLink, isPdf, pdfDownloadLink);

    const options = {
      from: process.env.FROM_EMAIL || 'CarSaavy Reports <reports@carsaavy.com>',
      to: [to],
      subject: `Your CarSaavy Report for VIN ${vin} is Ready`,
      html,
    };

    // Attach report file if it's a PDF
    if (isPdf) {
      const fileBuffer = fs.readFileSync(reportFile);
      const filename = path.basename(reportFile);
      options.attachments = [
        {
          filename,
          content: fileBuffer.toString('base64'),
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ];
    }

    const data = await resend.emails.send(options);
    console.log(`✅ [Resend] Email sent successfully: ${data.id}`);
    return { success: true, messageId: data.id };
  } catch (err) {
    console.error('❌ [Resend] Error sending email:', err);
    throw err;
  }
}

// ---------- SendGrid (future optional provider) ----------
async function sendWithSendGrid({ to, vin, reportFile, inline }) {
  console.log(`📤 [SendGrid] Would send to ${to} - (implementation optional)`);
  return sendToConsole({ to, vin, reportFile });
}

// ---------- Console fallback ----------
async function sendToConsole({ to, vin, reportFile }) {
  console.log(`🧾 [ConsoleEmail] Simulating email to ${to}`);
  console.log(`VIN: ${vin}`);
  console.log(`Report path: ${reportFile}`);
  return { success: true, simulated: true };
}

module.exports = { sendEmail };