const { sendEmail } = require("./services/emailService");

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.TEST_API_TOKEN;

  // 🔒 Require Bearer token for access
  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const { to } = req.query;
    if (!to) {
      return res.status(400).json({ success: false, message: "Missing ?to=email@example.com" });
    }

    const vin = "TESTVIN123456789";
    const hostedLink = "https://carsaavy.com/reports/sample-report.pdf";

    console.log(`🚀 [TestSend] Sending test email to ${to}...`);
    const result = await sendEmail(to, hostedLink, true, vin, hostedLink);

    return res.status(200).json({ success: true, message: "Test email sent.", result });
  } catch (error) {
    console.error("❌ [TestSend] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};