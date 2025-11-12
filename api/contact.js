// api/contact.js
import { Resend } from "resend";
import { put } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }

    // ✅ Store submission to Vercel Blob (archive)
    const blobData = JSON.stringify(
      { name, email, message, timestamp: new Date().toISOString() },
      null,
      2
    );
    await put(`contact/contact-${Date.now()}.json`, blobData, {
      access: "private",
      contentType: "application/json",
    });

    // ✅ Email notification to you
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: "CarSaavy Contact Form <no-reply@carsaavy.com>",
      to: "support@carsaavy.com",
      subject: `New Contact Form Message From ${name}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, "<br>")}</p>
        <hr/>
        <small>Stored securely in Vercel Blob archive</small>
      `,
    });

    // ✅ Auto-reply to the sender
    await resend.emails.send({
      from: "CarSaavy Support <support@carsaavy.com>",
      to: email,
      subject: "Thanks — we received your message!",
      html: `
        <h2>Message Received ✅</h2>
        <p>Hey ${name},</p>
        <p>Thanks for reaching out! We received your message and a member of the CarSaavy team will get back to you soon.</p>
        <br/>
        <p>Talk soon,</p>
        <strong>The CarSaavy Team</strong>
      `,
    });

    res.status(200).json({ success: true });

  } catch (error) {
    console.error("❌ Contact form error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
}