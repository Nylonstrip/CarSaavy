// /api/create-payment.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // Enable CORS for safety (you already had this)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { vin, email } = req.body || {};

    // Basic presence checks
    if (!vin || !email) {
      return res.status(400).json({ error: 'VIN and email are required' });
    }

    // Validate VIN format (same pattern you’re already using)
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
      return res.status(400).json({ error: 'Invalid VIN format' });
    }

    // Validate email format (same as before)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Create a Stripe Checkout Session for $20
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,

      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: 2000, // $20.00
            product_data: {
              name: 'CarSaavy VIN Report',
              description: `Vehicle Report for VIN: ${vin.toUpperCase()}`
            }
          },
          quantity: 1
        }
      ],

      // Make sure the PaymentIntent that Stripe creates
      // carries the same metadata your webhook expects.
      payment_intent_data: {
        metadata: {
          vin: vin.toUpperCase(),
          email,
          product: 'VIN Report'
        },
        description: `Vehicle Report for VIN: ${vin.toUpperCase()}`
      },

      // Where Stripe should send the user after payment
      success_url: 'https://www.carsaavy.com/vin?status=success',
      cancel_url: 'https://www.carsaavy.com/vin?status=cancelled'
    });

    // This is what your VIN page expects:
    // { url: 'https://checkout.stripe.com/...' }
    return res.status(200).json({ url: session.url });

  } catch (error) {
    console.error('Checkout Session Error:', error);
    return res.status(500).json({
      error: 'Failed to initiate payment',
      message: error.message
    });
  }
};
