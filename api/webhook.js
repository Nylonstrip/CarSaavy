const logger = require("./services/logger");
const { getAllVehicleData } = require("./services/vehicleData");
const { generateVehicleReport } = require("./services/reportGenerator");
const { sendVehicleReportEmail, sendAdminAlert } = require("./services/emailService");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "carsaavy@gmail.com";

module.exports = async (req, res) => {
  try {
    const event = req.body;
    logger.info(`[Webhook] Event: ${event.type}`);

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      const vin = paymentIntent.metadata?.vin;
      const email = paymentIntent.metadata?.email;

      logger.info(`[Webhook] Payment success → VIN ${vin} → ${email}`);

      if (!vin || !email) {
        throw new Error("Missing VIN or email in payment metadata.");
      }

      // Step 1: Fetch vehicle data
      logger.info(`[Webhook] Fetching vehicle data...`);
      const vehicleData = await getAllVehicleData(vin);

      if (!vehicleData || vehicleData.error) {
        await sendAdminAlert(
          ADMIN_EMAIL,
          "CarSaavy Webhook Error: Vehicle Data",
          `Failed to retrieve vehicle data for VIN: ${vin}`
        );
        logger.error(`[Webhook] Vehicle data retrieval failed for VIN: ${vin}`);
        return res.status(500).json({ success: false, error: "Vehicle data fetch failed." });
      }

      // Step 2: Generate report
      logger.info(`[Webhook] Generating report...`);
      const reportResult = await generateVehicleReport(vin, vehicleData);

      if (!reportResult?.url) {
        await sendAdminAlert(
          ADMIN_EMAIL,
          "CarSaavy Webhook Error: Report Generation",
          `Report failed to generate for VIN: ${vin}`
        );
        throw new Error("Report generation failed.");
      }

      logger.info(`[Webhook] Report ready: ${reportResult.url}`);

      // Step 3: Email report to customer
      logger.info(`[Webhook] Sending report to user...`);
      const emailResult = await sendVehicleReportEmail(email, vin, reportResult.url);

      if (emailResult?.success) {
        logger.info(`[Webhook] Email sent successfully → ${email}`);
      } else {
        await sendAdminAlert(
          ADMIN_EMAIL,
          "CarSaavy Email Failure",
          `Email delivery failed for VIN: ${vin} → ${email}`
        );
        logger.warn(`[Webhook] Email failed for: ${email}`);
      }

      // Step 4: Return clean success
      res.status(200).json({
        success: true,
        vin,
        email,
        reportUrl: reportResult.url,
      });
    } else {
      logger.info(`[Webhook] Ignored event type: ${event.type}`);
      res.status(200).json({ received: true });
    }
  } catch (error) {
    logger.error(`[Webhook] Unhandled error: ${error.message}`);
    await sendAdminAlert(
      ADMIN_EMAIL,
      "CarSaavy Webhook Unhandled Error",
      `Unexpected error:\n\n${error.stack}`
    );
    res.status(500).json({ success: false, error: error.message });
  }
};