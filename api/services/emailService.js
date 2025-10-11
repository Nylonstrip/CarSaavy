async function sendReportEmail({ to, vin, reportHTML, customerName }) {
    const emailService = process.env.EMAIL_SERVICE || 'resend';
  
    switch (emailService) {
      case 'resend':
        return await sendWithResend({ to, vin, reportHTML, customerName });
      case 'sendgrid':
        return await sendWithSendGrid({ to, vin, reportHTML, customerName });
      case 'console':
        // For testing - just log to console
        return await sendToConsole({ to, vin, reportHTML, customerName });
      default:
        throw new Error(Unknown email service: ${emailService});
    }
  }

  async function sendWithResend({ to, vin, reportHTML, customerName }) {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
  
    try {
      const data = await resend.emails.send({
        from: 'Car-Saavy <onboarding@resend.dev>', // Must be verified domain
        to: [to],
        subject: Your Car-Saavy Vehicle Report - VIN: ${vin},
        html: reportHTML,
      });
  
      console.log('Email sent successfully:', data.id);
      return { success: true, messageId: data.id };
    } catch (error) {
      console.error('Resend error:', error);
      throw error;
    }
  
    // For now, fall back to console logging
    // console.log('Resend not configured, using console output');
    // return await sendToConsole({ to, vin, reportHTML, customerName });
  }