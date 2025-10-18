const { generateEmailTemplate } = require("./services/emailTemplate");

module.exports = async (req, res) => {
  try {
    const html = generateEmailTemplate(
      "1HGCM82633A004352",
      "https://carsaavy.com/reports/sample-report.pdf",
      false,
      "https://carsaavy.com/reports/sample-report.pdf"
    );
    res.setHeader("Content-Type", "text/html");
    res.status(200).send(html);
  } catch (err) {
    console.error("❌ test-email-template error:", err);
    res.status(500).json({ error: err.message });
  }
};