const { getAllVehicleData } = require('./services/vehicleData');
const { generateHTMLReport } = require('./services/reportGenerator');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get VIN from query parameter
    const vin = req.query.vin || '1HGBH41JXMN109186'; // Default test VIN
    
    console.log(`Generating test report for VIN: ${vin}`);
    
    // Validate VIN format
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
      return res.status(400).json({ 
        error: 'Invalid VIN format',
        message: 'VIN must be 17 characters (no I, O, or Q)' 
      });
    }
    
    // Fetch all vehicle data
    const vehicleData = await getAllVehicleData(vin);
    
    // Generate HTML report
    const reportHTML = generateHTMLReport(vehicleData);
    
    // Return the HTML report
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(reportHTML);
    
  } catch (error) {
    console.error('Test report error:', error);
    res.status(500).json({ 
      error: 'Failed to generate report',
      message: error.message 
    });
  }
};