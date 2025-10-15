// /api/services/emailService.js

/**
 * Handles emailing vehicle reports via Resend, SendGrid, or console fallback.
 * Works with /api/generate-report.js to deliver report files post-purchase.
 */

const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');

// ---------- Main function ----------
async function sendEmail(to, reportFile, inline = false, vin = 'Unknown VIN') {
  const emailService = process.env.EMAIL_SERVICE || 'resend';

  console.log(`📧 [EmailService] Preparing to send report for ${vin} via ${emailService}`);

  try {
    let htmlContent = '';
    if (inline) {
      htmlContent = fs.readFileSync(reportFile, 'utf8');
    }

    switch (emailService.toLowerCase()) {
      case 'resend':
        return await sendWithResend({ to, vin, reportFile, htmlContent, inline });
      case 'sendgrid':
        return await sendWithSendGrid({ to, vin, reportFile, htmlContent, inline });
      case 'console':
        return await sendToConsole({ to, vin, reportFile, htmlContent });
      default:
        throw new Error(`Unknown email service: ${emailService}`);
    }
  } catch (error) {
    console.error('❌ [EmailService] Failed to send report:', error);
    return { success: false, error: error.message };
  }
}

// ---------- Resend ----------
async function sendWithResend({ to, vin, reportFile, htmlContent, inline }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  console.log(`📤 [Resend] Sending report to ${to}`);

  try {
    const options = {
      from: 'CarSaavy Reports <reports@carsaavy.app>', // must be verified
      to: [to],
      subject: `Your CarSaavy Vehicle Report - VIN: ${vin}`,
      html: inline ? htmlContent : 'Please see attached vehicle report.',
    };

    // Attach report file if not inline
    if (!inline) {
      const fileBuffer = fs.readFileSync(reportFile);
      const filename = path.basename(reportFile);
      options.attachments = [
        {
          filename,
          content: fileBuffer.toString('base64'),
          type: 'text/html',
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
async function sendWithSendGrid({ to, vin, reportFile, htmlContent, inline }) {
  console.log(`📤 [SendGrid] Would send to ${to} - (implementation optional)`);
  return sendToConsole({ to, vin, reportFile, htmlContent });
}

// ---------- Console fallback ----------
async function sendToConsole({ to, vin, reportFile }) {
  console.log(`🧾 [ConsoleEmail] Simulating email to ${to}`);
  console.log(`VIN: ${vin}`);
  console.log(`Report path: ${reportFile}`);
  return { success: true, simulated: true };
}

module.exports = { sendEmail };