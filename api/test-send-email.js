const { sendEmail } = require("./services/emailService");

module.exports = async (req, res) => {
  try {
    const { to } = req.query; // you can also support POST later if you prefer
    if (!to) {
      return res.status(400).json({ success: false, message: "Please include ?to=email@example.com" });
    }

    const vin = "1HGCM82633A004352";
    const hostedLink = "https://carsaavy.com/reports/sample-report.pdf";

    console.log(`🚀 [TestSend] Sending test email to ${to}...`);

    const result = await sendEmail(
      to,
      hostedLink,   // reportFile (we’re just linking for the test)
      true,         // inline = true → shows “View Report” button
      vin,
      hostedLink    // pdfDownloadLink
    );

    console.log("✅ [TestSend] Email result:", result);
    return res.status(200).json({ success: true, message: "Test email sent.", result });
  } catch (error) {
    console.error("❌ [TestSend] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};