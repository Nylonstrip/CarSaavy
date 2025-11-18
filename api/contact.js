// /api/contact.js
const { put } = require("@vercel/blob");
const { sendSupportEmail, sendCustomerAutoReply } = require("./services/emailService");

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
      access: "public",
    });

    // 📬 Send support notification (Resend → Postmark fallback)
    await sendSupportEmail(name, email, message);

    // 🤖 Auto-reply to the user
    await sendCustomerAutoReply(name, email);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Contact form error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
