const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { vin, email } = req.body;

    if (!vin || !email) {
      return res.status(400).json({ error: 'VIN and email are required' });
    }

    // Validate VIN format
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
      return res.status(400).json({ error: 'Invalid VIN format' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 2000, // $20.00 USD
      currency: 'usd',
      receipt_email: email,
      metadata: {
        vin: vin.toUpperCase(),
        email,
        product: 'VIN Report'
      },
      description: `Vehicle Report for VIN: ${vin.toUpperCase()}`,
      automatic_payment_methods: { enabled: true }
    });

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('Payment Intent Error:', error);
    return res.status(500).json({
      error: 'Failed to create payment intent',
      message: error.message
    });
  }
};