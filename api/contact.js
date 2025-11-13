// /api/contact.js
const { put } = require("@vercel/blob");
const { Resend } = require("resend");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { name, email, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 💾 Save message to Blob
    const filename = `contacts/contact-${Date.now()}.json`;
    await put(filename, JSON.stringify({ name, email, message, date: new Date() }), {
      access: "public"
    });

    // 📬 Send emails using Resend
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Notify support
    await resend.emails.send({
      from: "CarSaavy Support <support@carsaavy.com>",
      to: "support@carsaavy.com",
      subject: "New Contact Form Message",
      html: `
        <h2>New Contact Message</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, "<br>")}</p>
      `
    });

    // Auto-reply to customer
    await resend.emails.send({
      from: "CarSaavy Support <support@carsaavy.com>",
      to: email,
      subject: "We've Received Your Message",
      html: `
        <h2>Thanks for reaching out!</h2>
        <p>Hi ${name},</p>
        <p>We’ve received your message and a member of our team will reach out soon.</p>
        <p style="margin-top:20px;">- CarSaavy Support Team</p>
      `
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Contact form error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
