const path = require("path");
const fs = require("fs");

console.log("✅ test-email-template route loaded");

module.exports = async (req, res) => {
  try {
    console.log("✅ Route started");

    const emailTemplatePath = path.join(process.cwd(), "api", "services", "emailTemplate.js");
    const exists = fs.existsSync(emailTemplatePath);
    console.log("🔍 Checking for emailTemplate.js:", emailTemplatePath, "Exists:", exists);

    const { generateEmailTemplate } = require("../services/emailTemplate");
    console.log("✅ emailTemplate imported");

    const html = generateEmailTemplate(
      "1HGCM82633A004352",
      "https://carsaavy.com/reports/sample-report.pdf",
      false,
      "https://carsaavy.com/reports/sample-report.pdf"
    );
    console.log("✅ Template generated");

    res.setHeader("Content-Type", "text/html");
    res.status(200).send(html);
  } catch (err) {
    console.error("❌ test-email-template error:", err);
    res.status(500).json({ error: err.message });
  }
};