const { sendAdminAlert } = require("./services/emailService");
const logger = require("./services/logger");

module.exports = async (req, res) => {
  try {
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "carsaavy@gmail.com";
    const testSubject = "✅ CarSaavy Admin Alert Test";
    const testBody = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>CarSaavy Admin Alert Test</h2>
        <p>This is a test alert to confirm that the admin email pipeline is working correctly.</p>
        <p>If you received this, all alert functionality (webhook + API monitoring) is active.</p>
        <p>Timestamp: ${new Date().toLocaleString()}</p>
      </div>
    `;

    logger.info(`[TestAlert] Sending test alert to ${ADMIN_EMAIL}...`);
    const result = await sendAdminAlert(ADMIN_EMAIL, testSubject, testBody);
    logger.info(`[TestAlert] Alert sent: ${JSON.stringify(result)}`);

    res.status(200).json({
      success: true,
      message: `Test alert sent to ${ADMIN_EMAIL}`,
      result,
    });
  } catch (error) {
    logger.error(`[TestAlert] Failed: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
};