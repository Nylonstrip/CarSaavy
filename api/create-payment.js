const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { vin, email, tier } = req.body || {};

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

    // Decide pricing based on tier (basic now, advanced later)
    const normalizedTier = (tier || 'basic').toLowerCase();

    let amount = 1500;         // default: $15.00 basic
    let productName = 'Basic CarSaavy Vehicle Report';
    let productMetadataTier = 'basic';

    if (normalizedTier === 'advanced') {
      amount = 2000;           // $20.00 advanced (when you’re ready to flip this on)
      productName = 'Advanced CarSaavy Negotiation Report';
      productMetadataTier = 'advanced';
    }

    const origin = req.headers.origin || process.env.SITE_URL || 'https://your-domain.com';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: {
              name: productName,
              metadata: {
                vin: vin.toUpperCase(),
                email,
                tier: productMetadataTier,
              },
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        vin: vin.toUpperCase(),
        email,
        tier: productMetadataTier,
      },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/vin?canceled=1`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Checkout Session Error:', error);
    return res.status(500).json({
      error: 'Failed to create checkout session',
      message: error.message,
    });
  }
};
