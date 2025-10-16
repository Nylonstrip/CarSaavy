const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  try {
    const data = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'no-reply@carsaavy.com',
      to: req.query.to || 'youremail@example.com',
      subject: '🚗 CarSaavy Test Report Delivery',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>CarSaavy Test Email</h2>
          <p>This is a Resend test to confirm delivery configuration.</p>
          <p>If you're seeing this, your Resend integration works perfectly.</p>
          <hr/>
          <small>Sent from CarSaavy API at ${new Date().toLocaleString()}</small>
        </div>
      `,
    });

    console.log('✅ [Resend] Email sent:', data);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('❌ [Resend] Email failed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};