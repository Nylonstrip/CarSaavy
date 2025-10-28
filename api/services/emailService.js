// api/services/emailService.js
const { Resend } = require("resend");
const { emailTemplate } = require("./emailTemplate");
const fetch = require("node-fetch");

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends a CarSaavy vehicle report email with both HTML and plain-text fallback.
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.vin - VIN used for the report
 * @param {string} params.reportUrl - Public Blob URL for the PDF
 */
async function sendEmail({ to, subject, vin, reportUrl }) {
  const from = process.env.FROM_EMAIL || "CarSaavy Reports <reports@carsaavy.com>";
  const apiKey = process.env.RESEND_API_KEY;

  console.log("🔐 RESEND_API_KEY present:", !!apiKey);

  if (!apiKey) {
    console.error("❌ Missing RESEND_API_KEY in environment variables");
    return { success: false, error: "Missing API key" };
  }

  const html = `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2>CarSaavy Report Ready</h2>
      <p>Your VIN report for <strong>${vin}</strong> is ready.</p>
      <p><a href="${reportUrl}" target="_blank">Click here to view your report</a>.</p>
      <p>Thank you for using CarSaavy!</p>
    </div>
  `;

  const payload = {
    from,
    to,
    subject: subject || `Your CarSaavy Report - ${vin}`,
    html,
  };

  console.log("📨 [EmailService] Sending payload:", payload);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("📬 [EmailService] Resend response:", result);

    if (!response.ok) {
      throw new Error(`Resend API Error: ${result.message || response.statusText}`);
    }

    return { success: true, id: result.id || null };
  } catch (err) {
    console.error("🔥 [EmailService] Error sending email:", err);
    return { success: false, error: err.message };
  }
}

async function sendSystemAlertEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
  if (!to) throw new Error("Missing alert recipient email");
  const resp = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });
  return resp?.id || null;
}

function buildSystemAlertHtml(title, lines = []) {
  const items = lines.map(l => `<li>${l}</li>`).join("");
  return `
    <div style="font-family:Arial,sans-serif;color:#111">
      <h2>🔔 ${title}</h2>
      <ul>${items}</ul>
      <p style="margin-top:16px;color:#555">— CarSaavy Monitor</p>
    </div>
  `;
}

module.exports = { sendEmail, 
  sendSystemAlertEmail,
  buildSystemAlertHtml };