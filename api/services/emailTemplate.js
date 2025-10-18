// services/emailTemplate.js

function generateEmailTemplate(vin, reportLink, isAttachment = false, pdfDownloadLink = null) {
    const reportSection = isAttachment
      ? `
        <p style="font-size: 16px;">Your CarSaavy report for <strong>${vin}</strong> is attached to this email as a PDF file.</p>
        <p style="font-size: 16px;">You can download it directly or keep it handy for your dealership visit.</p>
      `
      : `
        <p style="font-size: 16px;">We’ve finished generating your <strong>CarSaavy Vehicle Report</strong> for VIN <strong>${vin}</strong>.</p>
        <p style="font-size: 16px;">Your report includes verified dealership data, ownership history, and insights to help you negotiate smarter.</p>
  
        <div style="text-align: center; margin: 32px 0;">
          <a href="${reportLink}" 
             style="background-color: #2563eb; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
            View Your Report
          </a>
        </div>
  
        ${
          pdfDownloadLink
            ? `
            <div style="text-align: center; margin: 16px 0;">
              <a href="${pdfDownloadLink}" 
                 style="background-color: #1e40af; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500; font-size: 15px;">
                Download PDF Copy
              </a>
            </div>`
            : ''
        }
  
        <p style="font-size: 14px; color: #64748b;">
          If the buttons above don’t work, you can also open your report directly using this link:
          <br/>
          <a href="${reportLink}" style="color: #2563eb;">${reportLink}</a>
        </p>
      `;
  
    return `
    <div style="font-family: Inter, Arial, sans-serif; background-color: #f8fafc; padding: 32px; color: #1e293b;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="background-color: #111827; padding: 24px;">
          <h1 style="margin: 0; color: #f9fafb; font-size: 22px;">🚗 Your CarSaavy Report is Ready</h1>
        </div>
  
        <div style="padding: 24px;">
          <p style="font-size: 16px;">Hey there,</p>
          ${reportSection}
  
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;"/>
  
          <p style="font-size: 13px; color: #94a3b8;">
            This report was automatically generated based on VIN data and dealership records.
            <br/>
            For any discrepancies or questions, please contact us at 
            <a href="mailto:support@carsaavy.com" style="color: #2563eb;">support@carsaavy.com</a>.
          </p>
        </div>
      </div>
  
      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 16px;">
        © 2025 CarSaavy Inc. | <a href="https://carsaavy.com" style="color: #2563eb;">carsaavy.com</a>
      </p>
    </div>
    `;
  }
  
  module.exports = { generateEmailTemplate };