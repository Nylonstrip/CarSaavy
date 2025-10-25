// File: api/test-email.js
const fetch = require("node-fetch");

module.exports = async (req, res) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || "CarSaavy Reports <reports@carsaavy.com>";
  const to = req.query.to || "carsaavy@gmail.com";

  console.log("🔐 [TestEmail] RESEND_API_KEY present:", !!apiKey);

  if (!apiKey) {
    return res.status(500).json({ success: false, error: "Missing RESEND_API_KEY" });
  }

  const html = `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2>CarSaavy Test Email</h2>
      <p>This is a test email to verify your Resend integration.</p>
      <p>If you’re seeing this, your Vercel project can reach Resend's API successfully 🎉</p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "✅ CarSaavy Email Integration Test",
        html,
      }),
    });

    const result = await response.json();
    console.log("📬 [TestEmail] Resend response:", result);

    if (!response.ok) {
      throw new Error(`Resend API error: ${result.message || response.statusText}`);
    }

    return res.status(200).json({ success: true, message: "Test email sent", result });
  } catch (err) {
    console.error("🔥 [TestEmail] Error sending:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};