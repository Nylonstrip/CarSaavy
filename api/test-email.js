const { sendEmail } = require("../services/emailService");

module.exports = async (req, res) => {
  try {
    const to = process.env.TEST_EMAIL_TO || "carsaavy@gmail.com";
    const result = await sendEmail({
      to,
      subject: "CarSaavy Test Email",
      vin: "TESTVIN123456789",
      reportUrl: "https://carsaavy.com/test-report.pdf",
    });

    console.log("✅ [TestEmail] Sent result:", result);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error("🔥 [TestEmail] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};