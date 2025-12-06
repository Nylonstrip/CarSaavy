const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const fetchVehicleData = require("./services/vehicleData");
const generateReport = require("./services/reportGenerator");
const sendVehicleReportEmail = require("./services/emailService");

module.exports = async (req, res) => {
  let event;

  try {
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    console.error("❌ Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const eventType = event.type;
    console.log("🔥 Webhook event received:", eventType);

    if (eventType === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;

      const vin = paymentIntent.metadata?.vin;
      const email = paymentIntent.metadata?.email;
      const listingUrl = paymentIntent.metadata?.listingUrl;

      console.log("VIN:", vin, "| Email:", email, "| Listing URL:", listingUrl);

      if (!vin || !email || !listingUrl) {
        console.error(
          "❌ Missing metadata. VIN, email, and listingUrl are required in payment_intent.metadata."
        );
        // Acknowledge to Stripe but don't generate a report
        return res.json({
          received: true,
          status: "missing_metadata",
        });
      }

      // 🔍 Scrape + verify VIN
      const vehicleData = await fetchVehicleData(listingUrl, vin);

      if (vehicleData && vehicleData.error) {
        // Handle various verification / scrape errors
        if (vehicleData.error === "INVALID_CARS_URL") {
          console.error("❌ Invalid Cars.com URL in metadata:", listingUrl);
          return res.json({
            received: true,
            status: "invalid_cars_url",
          });
        }

        if (vehicleData.error === "VIN_MISMATCH") {
          console.error(
            "❌ VIN mismatch between user input and listing:",
            vehicleData
          );
          return res.json({
            received: true,
            status: "vin_mismatch",
            details: {
              inputVin: vehicleData.inputVin,
              scrapedVin: vehicleData.scrapedVin,
            },
          });
        }

        if (vehicleData.error === "VIN_NOT_FOUND_ON_PAGE") {
          console.error(
            "❌ VIN not found on Cars.com page for verification:",
            listingUrl
          );
          return res.json({
            received: true,
            status: "vin_not_found_on_page",
          });
        }

        if (vehicleData.error === "SCRAPE_FAILED") {
          console.error("❌ Failed to scrape listing:", listingUrl);
          return res.json({
            received: true,
            status: "scrape_failed",
          });
        }

        // Generic catch-all
        console.error("❌ VehicleData error:", vehicleData.error);
        return res.json({
          received: true,
          status: "vehicledata_error",
        });
      }

      // 📝 Generate PDF report
      const { reportUrl } = await generateReport(vin, vehicleData);
      console.log("📄 Report URL:", reportUrl);

      // ✉️ Email it
      await sendVehicleReportEmail(email, reportUrl);
      console.log("📨 Email sent successfully to:", email);

      return res.json({ received: true, status: "report_sent" });
    }

    if (eventType === "payment_intent.payment_failed") {
      console.error("❌ Payment failed");
      return res.json({ received: true, status: "payment_failed" });
    }

    // Other event types (if ever enabled)
    return res.json({ received: true, status: "ignored_event_type" });
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    // Return 200 so Stripe doesn't infinitely retry on a bug,
    // but log everything for debugging.
    return res.json({ received: true, status: "internal_error" });
  }
};
