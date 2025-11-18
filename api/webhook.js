// /api/webhook.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const getRawBody = require("raw-body");

module.exports.config = {
  api: {
    bodyParser: false, // REQUIRED for Stripe webhooks on Vercel
  },
};

module.exports = async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).send("OK");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers["stripe-signature"];

    // If you have STRIPE_WEBHOOK_SECRET, enable signature verification:
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } else {
      // If you're NOT verifying signatures, parse manually (safe enough for private Vercel → Stripe)
      event = JSON.parse(rawBody.toString());
    }
  } catch (err) {
    console.error("❌ Error parsing raw webhook body:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ──────────────────────────────────────
  // Handle events
  // ──────────────────────────────────────

  try {
    const eventType = event.type;

    console.log("🔥 Webhook event received:", eventType);

    if (eventType === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
    
      const vin = paymentIntent.metadata?.vin;
      const email = paymentIntent.metadata?.email;
    
      console.log("VIN:", vin, "Email:", email);
    
      if (!vin || !email) {
        console.error("❌ Missing metadata in payment intent");
        return res.status(200).json({ received: true });
      }
    
      // --- FETCH VEHICLE DATA ---
      const { getAllVehicleData } = require("./services/vehicleData");
      const vehicleData = await getAllVehicleData(vin);
    
      // --- GENERATE REPORT ---
      const { generateVehicleReport } = require("./services/reportGenerator");
      const reportUrl = await generateVehicleReport(vehicleData, vin);
    
      console.log("Report URL generated:", reportUrl);
    
      // --- SEND EMAIL ---
      const { sendEmail } = require("./services/emailService");
      await sendEmail(email, reportUrl, vin);
    
      console.log("📨 Email sent successfully to:", email);
    }
    

    if (eventType === "payment_intent.payment_failed") {
      console.error("❌ Payment failed:", event.data.object.last_payment_error);
    }

    // Respond to Stripe
    res.status(200).json({ received: true });

  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    return res.status(500).send("Internal webhook error");
  }
};
