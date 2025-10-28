const logger = require("./logger");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || "CarSaavy Reports <reports@carsaavy.com>";

/**
 * Send the main vehicle report to a customer
 */
async function sendVehicleReportEmail(to, vin, reportUrl) {
  try {
    logger.info(`[EmailService] Preparing to send report to: ${to}`);

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Your CarSaavy Report for VIN ${vin}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2>CarSaavy Report Ready</h2>
          <p>Your VIN report for <strong>${vin}</strong> is ready.</p>
          <p><a href="${reportUrl}" target="_blank">Click here to view your report</a>.</p>
          <p>Thank you for using CarSaavy!</p>
        </div>
      `,
    });

    logger.info(`[EmailService] Email sent successfully: ${result.id || "OK"}`);
    return { success: true, id: result.id || null };
  } catch (err) {
    logger.error(`[EmailService] Failed to send email: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Send an admin alert email (for errors, usage limits, etc)
 */
async function sendAdminAlert(to, subject, html) {
  try {
    logger.info(`[EmailService] Sending admin alert → ${to}`);

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    logger.info(`[EmailService] Admin alert sent successfully: ${result.id || "OK"}`);
    return { success: true, id: result.id || null };
  } catch (err) {
    logger.error(`[EmailService] Failed to send admin alert: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendVehicleReportEmail,
  sendAdminAlert,
};