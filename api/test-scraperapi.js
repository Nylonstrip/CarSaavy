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

    // FULL JS rendering enabled
    const scraperUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&render=true&device=desktop&url=${encodeURIComponent(
      targetUrl
    )}`;

    // Fetch rendered HTML
    const response = await axios.get(scraperUrl, {
      timeout: 25000,
      validateStatus: () => true,
    });

    const html = response.data;
    if (!html || typeof html !== "string") {
      console.log("❌ ScraperAPI returned invalid HTML");
      return res.status(500).json({ error: "Invalid HTML returned" });
    }

    // TEMPORARY DEBUG: Show the first 2,500 chars of rendered output
    const preview = html.substring(0, 2500);
    console.log("\n\n🟦 ===== RENDERED HTML PREVIEW START =====");
    console.log(preview);
    console.log("🟦 ===== RENDERED HTML PREVIEW END =====\n\n");

    const $ = cheerio.load(html);

    // --- Improved extractors (early stage) ---
    // AutoTrader-specific selectors (these will refine as we see real HTML)

    const extractors = {
      price: () =>
        $("[data-cmp='pricing']").first().text().trim() ||
        $("meta[itemprop='price']").attr("content") ||
        $("span:contains('$')").first().text(),

      mileage: () =>
        $("[data-cmp='mileage']").first().text().trim() ||
        $("span:contains('miles')").first().text(),

      vin: () =>
        $("span:contains('VIN')").next().text().trim() ||
        $("div:contains('VIN')").text().replace(/[^A-Z0-9]/g, "") ||
        "",

      dealerName: () =>
        $("[data-cmp='seller-name']").first().text().trim() ||
        $("div[class*='Dealer']").first().text().trim(),

      dealerAddress: () =>
        $("[data-cmp='address']").first().text().trim() ||
        $("address").first().text().trim(),
    };

    const scraped = {};
    for (const [key, fn] of Object.entries(extractors)) {
      try {
        scraped[key] = fn() || "";
      } catch (_) {
        scraped[key] = "";
      }
    }

    scraped.price = scraped.price.replace(/[^0-9$,.]/g, "");
    scraped.mileage = scraped.mileage.replace(/[^0-9]/g, "");
    scraped.vin = scraped.vin.replace(/[^A-Z0-9]/g, "");

    return res.json({
      success: true,
      targetUrl,
      scraped,
      note: "Check Vercel logs for HTML preview to refine selectors",
    });
  } catch (err) {
    console.error("❌ Test scraper error:", err);
    return res.status(500).json({ error: err.message });
  }
};
