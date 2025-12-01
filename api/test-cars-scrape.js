// api/test-cars-scrape.js
// DEV-only endpoint to test Cars.com scraping by VIN or URL:
//   /api/test-cars-scrape?url=...cars.com...
//   /api/test-cars-scrape?vin=1G1FB1RS4J0122031

const { scrapeByURL, scrapeByVIN } = require('./services/sources/carsDotCom');

module.exports = async (req, res) => {
  try {
    const { url, vin } = req.query || {};

    if (!url && !vin) {
      return res.status(400).json({
        success: false,
        error: 'Provide either ?url=... or ?vin=...',
      });
    }

    let result;
    if (url) {
      console.info('[TestCarsScrape] Mode: URL');
      result = await scrapeByURL(url);
    } else {
      console.info('[TestCarsScrape] Mode: VIN');
      result = await scrapeByVIN(vin);
    }

    return res.status(200).json({
      success: true,
      modeUsed: result.mode,
      source: result.source,
      url: result.url,
      vehicle: result.vehicle,
    });
  } catch (err) {
    console.error('[TestCarsScrape] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Unknown error',
    });
  }
};
