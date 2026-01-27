// /api/services/emailService.js
const { Resend } = require("resend");
const postmark = require("postmark");
const resend = new Resend(process.env.RESEND_API_KEY);

const { buildVehicleReportEmailHtml } = require("./emailTemplate");

// Create Postmark client
const postmarkClient = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);

//--------------------------
// Primary Sender (Resend)
//--------------------------
async function sendViaResend(to, vin, reportUrl) {
  console.log("[EmailService] Using Resend as primary provider...");

  const html = buildVehicleReportEmailHtml(vin.toUpperCase(), reportUrl);

  await resend.emails.send({
    from: "CarSaavy <noreply@carsaavy.com>",
    to,
    subject: `Your CarSaavy Report for VIN ${vin.toUpperCase()}`,
    html,
  });

  console.log("[EmailService] Resend email request succeeded.");
}


//--------------------------
// Fallback Sender (Postmark)
//--------------------------
async function sendViaPostmark(to, vin, reportUrl) {
  console.log("[EmailService] Falling back to Postmark...");

  const html = buildVehicleReportEmailHtml(vin.toUpperCase(), reportUrl);

  await postmarkClient.sendEmail({
    From: "noreply@carsaavy.com",
    To: to,
    Subject: `Your CarSaavy Report for VIN ${vin.toUpperCase()}`,
    HtmlBody: html,
    MessageStream: "outbound",
  });

  console.log("[EmailService] Postmark fallback succeeded.");
}

//--------------------------
// Unified Sender
//--------------------------
async function sendVehicleReportEmail(to, vin, reportUrl) {
  try {
    console.log("[EmailService] Preparing to send report via Resend...");
    await sendViaResend(to, vin, reportUrl);
    console.log("[EmailService] Email sent successfully via Resend.");
  } catch (resendError) {
    console.error("❌ Resend failed:", resendError);

    try {
      console.log("[EmailService] Attempting fallback → Postmark...");
      await sendViaPostmark(to, vin, reportUrl);
      console.log("[EmailService] Email sent successfully via Postmark fallback.");
    } catch (postmarkError) {
      console.error("❌ Postmark fallback failed:", postmarkError);
      throw new Error("All email providers failed.");
    }
  }
}

//--------------------------
// Support Inbox
//--------------------------
async function sendSupportEmail(name, fromEmail, message) {
  const supportAddress = "support@carsaavy.com";
  const subject = `New Contact Form Message from ${name}`;

  const html = `
    <h2>New Contact Message</h2>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${fromEmail}</p>
    <p><strong>Message:</strong></p>
    <p>${message.replace(/\n/g, "<br>")}</p>
  `;

  try {
    console.log("[SupportEmail] Sending via Resend...");
    await resend.emails.send({
      from: "CarSaavy Support <noreply@carsaavy.com>",
      to: supportAddress,
      subject,
      html,
    });
  } catch (e) {
    console.error("[SupportEmail] Resend failed. Falling back to Postmark.");
    await postmarkClient.sendEmail({
      From: "noreply@carsaavy.com",
      To: supportAddress,
      Subject: subject,
      HtmlBody: html,
      MessageStream: "outbound",
    });
  }
}

//--------------------------
// Auto-Reply to Contact Sender
//--------------------------
async function sendCustomerAutoReply(name, toEmail) {
  const subject = "We've Received Your Message";

  const html = `
    <h2>Thanks for reaching out!</h2>
    <p>Hi ${name},</p>
    <p>We’ve received your message and a member of our team will reach out soon.</p>
    <p style="margin-top:20px;">- CarSaavy Support Team</p>
  `;

  try {
    console.log("[CustomerAutoReply] Sending via Resend...");
    await resend.emails.send({
      from: "CarSaavy Support <noreply@carsaavy.com>",
      to: toEmail,
      subject,
      html,
    });
  } catch (e) {
    console.error("[CustomerAutoReply] Resend failed. Falling back to Postmark.");
    await postmarkClient.sendEmail({
      From: "noreply@carsaavy.com",
      To: toEmail,
      Subject: subject,
      HtmlBody: html,
      MessageStream: "outbound",
    });
  }
}

  async function sendNprInlineEmail(to, vin, html) {
    try {
      await resend.emails.send({
        from: "CarSaavy <noreply@carsaavy.com>",
        to,
        subject: `Your Negotiation Positioning Report for VIN ${vin.toUpperCase()}`,
        html
      });
    } catch (e) {
      console.error("[NPR Email] Resend failed → trying Postmark", e);
      await postmarkClient.sendEmail({
        From: "noreply@carsaavy.com",
        To: to,
        Subject: `Your Negotiation Positioning Report for VIN ${vin.toUpperCase()}`,
        HtmlBody: html,
        MessageStream: "outbound",
      });
    }
  }

//--------------------------
// Admin Alerts (unchanged)
//--------------------------
async function sendAdminAlert(subject, message) {
  const adminEmail = "carsaavy@gmail.com";

  const html = `<p>${message}</p>`;

  try {
    // Try Resend first
    await resend.emails.send({
      from: "CarSaavy Admin <noreply@carsaavy.com>",
      to: adminEmail,
      subject,
      html,
    });
    console.log("[AdminAlert] Sent via Resend.");
  } catch (err) {
    console.error("[AdminAlert] Resend failed, using Postmark...", err);

    await postmarkClient.sendEmail({
      From: "noreply@carsaavy.com",
      To: adminEmail,
      Subject: subject,
      HtmlBody: html,
      MessageStream: "outbound",
    });

    console.log("[AdminAlert] Sent via Postmark fallback.");
  }
}

module.exports = {
  sendVehicleReportEmail,
  sendAdminAlert,
  sendSupportEmail,
  sendCustomerAutoReply,
  sendNprInlineEmail
};
