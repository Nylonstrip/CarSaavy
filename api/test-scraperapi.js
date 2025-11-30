// api/test-scraperapi.js

const axios = require("axios");
const cheerio = require("cheerio");

module.exports = async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing ?url parameter" });
    }

    const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
    if (!SCRAPER_API_KEY) {
      return res.status(500).json({ error: "SCRAPER_API_KEY missing in env vars" });
    }

    console.log("🔍 Scraping:", targetUrl);

    // Build ScraperAPI request
    const scraperUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(
      targetUrl
    )}`;

    // Fetch page
    const response = await axios.get(scraperUrl, {
      timeout: 20000,
      validateStatus: () => true
    });

    if (!response.data) {
      return res.status(500).json({ error: "ScraperAPI returned no data" });
    }

    const html = response.data;
    const $ = cheerio.load(html);

    // --- GENERIC EXTRACTORS ---
    const extractors = {
      price: () =>
        $("meta[itemprop='price']").attr("content") ||
        $("[data-test='vehiclePrice']").text() ||
        $("[class*='price']").first().text() ||
        $("span:contains('$')").first().text(),

      mileage: () =>
        $("meta[itemprop='mileageFromOdometer']").attr("content") ||
        $("[data-test='mileage']").text() ||
        $("span:contains('miles')").first().text(),

      vin: () =>
        $("span:contains('VIN')").next().text() ||
        $("div:contains('VIN')").text()?.replace(/[^A-Z0-9]/g, "") ||
        "",

      dealerName: () =>
        $("[data-test='dealerName']").text() ||
        $("div[class*='dealer']").first().text() ||
        $("h3:contains('Dealer')").text(),

      dealerAddress: () =>
        $("address").text() ||
        $("div[class*='address']").first().text(),
    };

    // Execute extractors
    const scraped = {};
    for (const [key, fn] of Object.entries(extractors)) {
      scraped[key] = fn()?.trim() || "";
    }

    // Clean formatting
    scraped.price = scraped.price.replace(/[^0-9$,.]/g, "");
    scraped.mileage = scraped.mileage.replace(/[^0-9]/g, "");
    scraped.vin = scraped.vin.replace(/[^A-Z0-9]/g, "");

    // Response
    return res.json({
      success: true,
      targetUrl,
      scraped,
    });
  } catch (err) {
    console.error("❌ Test scraper error:", err);
    return res.status(500).json({ error: err.message });
  }
};
