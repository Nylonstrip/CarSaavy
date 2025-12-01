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

    // ScraperAPI request
    const scraperUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(
      targetUrl
    )}`;

    // Fetch page
    const response = await axios.get(scraperUrl, {
      timeout: 20000,
      validateStatus: () => true,
    });

    if (!response.data) {
      console.log("❌ No response body from ScraperAPI");
      return res.status(500).json({ error: "ScraperAPI returned no data" });
    }

    const html = response.data;

    // 🟥 TEMPORARY DEBUG LOGGING — FIRST 2500 CHARACTERS
    const preview = html.substring(0, 2500);
    console.log("\n\n🟦 ===== HTML PREVIEW START =====");
    console.log(preview);
    console.log("🟦 ===== HTML PREVIEW END =====\n\n");

    // Load into Cheerio
    const $ = cheerio.load(html);

    // Simple extractors (we’ll replace these after analyzing the HTML)
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

    const scraped = {};
    for (const [k, fn] of Object.entries(extractors)) {
      scraped[k] = fn()?.trim() || "";
    }

    // Clean
    scraped.price = scraped.price.replace(/[^0-9$,.]/g, "");
    scraped.mileage = scraped.mileage.replace(/[^0-9]/g, "");
    scraped.vin = scraped.vin.replace(/[^A-Z0-9]/g, "");

    return res.json({
      success: true,
      debugMessage: "Check Vercel logs for HTML preview",
      targetUrl,
      scraped,
    });
  } catch (err) {
    console.error("❌ Test scraper error:", err);
    return res.status(500).json({ error: err.message });
  }
};
