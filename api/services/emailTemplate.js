// /api/services/emailTemplate.js

function buildVehicleReportEmailHtml(vin, reportUrl) {
  const safeVIN = vin || "N/A";
  const safeUrl = reportUrl || "#";

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your CarSaavy Report</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f6f9fc; font-family:Arial, sans-serif; color:#333;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding: 40px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:white; border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,0.05); overflow:hidden;">
            <tr>
              <td style="background-color:#0a2540; padding:20px; text-align:center;">
                <h1 style="color:white; margin:0; font-size:26px;">CarSaavy</h1>
              </td>
            </tr>

            <tr>
              <td style="padding:30px;">
                <h2 style="font-size:22px; color:#0a2540;">Your Vehicle Report is Ready 🚗</h2>
                <p style="font-size:16px; line-height:1.6;">
                  Hello! Your CarSaavy vehicle report for VIN <strong>${safeVIN}</strong> has been successfully generated.
                </p>

                <p style="font-size:16px; line-height:1.6;">
                  Click the button below to securely view and download your detailed report:
                </p>

                <p style="text-align:center; margin: 30px 0;">
                  <a href="${safeUrl}" target="_blank"
                    style="background-color:#0a2540; color:#fff; text-decoration:none; padding:14px 28px; border-radius:6px; font-size:16px; display:inline-block;">
                    📄 View Report
                  </a>
                </p>

                <p style="font-size:14px; color:#555;">
                  If the button above doesn’t work, you can access your report directly via this link:<br>
                  <a href="${safeUrl}" style="color:#0a2540;">${safeUrl}</a>
                </p>

                <hr style="border:none; border-top:1px solid #eee; margin:30px 0;">

                <p style="font-size:13px; color:#888; text-align:center;">
                  Generated securely by <strong>CarSaavy.com</strong><br>
                  © ${new Date().getFullYear()} CarSaavy. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

module.exports = { buildVehicleReportEmailHtml };
