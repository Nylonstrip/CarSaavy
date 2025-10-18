const { generateEmailTemplate } = require('../services/emailTemplate');

export default async function handler(req, res) {
  const sampleVin = '1HGCM82633A004352';
  const sampleLink = 'https://carsaavy.com/reports/sample-report.pdf';
  const html = generateEmailTemplate(sampleVin, sampleLink, false, sampleLink);

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}