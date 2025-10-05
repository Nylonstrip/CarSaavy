const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getAllVehicleData } = require('./services/vehicleData');
const { generateHTMLReport } = require('./services/reportGenerator');
const { sendReportEmail } = require('./services/emailService');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify the webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      
      console.log('Payment succeeded!');
      console.log('VIN:', paymentIntent.metadata.vin);
      console.log('Email:', paymentIntent.metadata.email);
      console.log('Amount:', paymentIntent.amount / 100);

      try {
        // Step 1: Fetch all vehicle data from APIs
        console.log('Fetching vehicle data...');
        const vehicleData = await getAllVehicleData(paymentIntent.metadata.vin);
        
        // Step 2: Generate HTML report
        console.log('Generating report...');
        const reportHTML = generateHTMLReport(vehicleData);
        
        // Step 3: Send email with report
        console.log('Sending email...');
        await sendReportEmail({
          to: paymentIntent.metadata.email,
          vin: paymentIntent.metadata.vin,
          reportHTML: reportHTML,
          customerName: paymentIntent.receipt_email || paymentIntent.metadata.email
        });
        
        console.log('Report successfully generated and sent!');
        
      } catch (error) {
        console.error('Error generating/sending report:', error);
        // Payment succeeded but report failed - log for manual follow-up
        // You could store this in a database or send an alert
      }