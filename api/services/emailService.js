// api/services/emailService.js
const { Resend } = require("resend");
const { emailTemplate } = require("./emailTemplate");

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends a CarSaavy vehicle report email with both HTML and plain-text fallback.
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.vin - VIN used for the report
 * @param {string} params.reportUrl - Public Blob URL for the PDF
 */
async function sendEmail({ to, vin, reportUrl }) {
  console.log("📧 [EmailService] Preparing to send email to:", to);

  if (!to || !vin || !reportUrl) {
    console.error("❌ [EmailService] Missing required email fields:", { to, vin, reportUrl });
    throw new Error("Missing required email fields");
  }

  try {
    const htmlContent = emailTemplate({ vin, reportUrl });
    const textContent = `
Your CarSaavy vehicle report for VIN ${vin} is ready!

View your report:
${reportUrl}

If you have trouble accessing the link, please visit CarSaavy.com and log in to retrieve it.

- The CarSaavy Team
`;

    const fromAddress = process.env.FROM_EMAIL || "reports@carsaavy.com";

    const result = await resend.emails.send({
      from: `CarSaavy <${fromAddress}>`,
      to,
      subject: `Your CarSaavy Report for VIN ${vin} is Ready 🚗`,
      html: htmlContent,
      text: textContent,
    });

    console.log("✅ [EmailService] Email sent successfully:", result.data?.id || "OK");
    return { success: true, id: result.data?.id || null };
  } catch (error) {
    console.error("❌ [EmailService] Failed to send email:", error);
    return { success: false, error: error.message };
  }
}

module.exports = { sendEmail };