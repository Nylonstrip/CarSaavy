// api/test-scraperapi.js

const axios = require("axios");
const cheerio = require("cheerio");

// Helper: build ScraperAPI URL
function buildScraperUrl({ apiKey, targetUrl, render = false }) {
  const base = new URL("http://api.scraperapi.com/");
  base.searchParams.set("api_key", apiKey);
  base.searchParams.set("url", targetUrl);
  base.searchParams.set("country", "us");
  base.searchParams.set("device", "desktop");
  // You can experiment with autoparse later if you want:
  // base.searchParams.set("autoparse", "true");

  if (render) {
    base.searchParams.set("render", "true");
    base.searchParams.set("premium", "true"); // faster JS rendering nodes
  }

  return base.toString();
}

// Helper: run cheerio extractors on HTML
function extractFields(html) {
  const $ = cheerio.load(html);

  const extractors = {
    price: () =>
      $("[data-cmp='pricing']").first().text().trim() ||
      $("meta[itemprop='price']").attr("content") ||
      $("[class*='price']").first().text().trim() ||
      $("span:contains('$')").first().text().trim(),

    mileage: () =>
      $("[data-cmp='mileage']").first().text().trim() ||
      $("span:contains('miles')").first().text().trim(),

    vin: () =>
      $("span:contains('VIN')").next().text().trim() ||
      $("div:contains('VIN')").text().replace(/[^A-Z0-9]/g, "") ||
      "",

    dealerName: () =>
      $("[data-cmp='seller-name']").first().text().trim() ||
      $("div[class*='dealer']").first().text().trim(),

    dealerAddress: () =>
      $("[data-cmp='address']").first().text().trim() ||
      $("address").first().text().trim(),
  };

  const scraped = {};
  for (const [key, fn] of Object.entries(extractors)) {
    try {
      scraped[key] = fn() || "";
    } catch {
      scraped[key] = "";
    }
  }

  // Clean up values
  scraped.price = scraped.price.replace(/[^0-9$,.]/g, "");
  scraped.mileage = scraped.mileage.replace(/[^0-9]/g, "");
  scraped.vin = scraped.vin.replace(/[^A-Z0-9]/g, "");

  return scraped;
}

// Helper: decide if the result is "good enough" from fast mode
function isGoodEnough(scraped) {
  // For MVP we consider it "good" if we at least have price AND
  // one of (mileage, dealerName, vin)
  const hasPrice = !!scraped.price;
  const hasSomethingElse =
    !!scraped.mileage || !!scraped.dealerName || !!scraped.vin;

  return hasPrice && hasSomethingElse;
}

module.exports = async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing ?url parameter" });
    }

    const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
    if (!SCRAPER_API_KEY) {
      return res
        .status(500)
        .json({ error: "SCRAPER_API_KEY missing in env vars" });
    }

    console.log("🔍 Scraping:", targetUrl);

    // 1) FAST MODE: no render
    let mode = "fast";
    let html;
    try {
      const fastUrl = buildScraperUrl({
        apiKey: SCRAPER_API_KEY,
        targetUrl,
        render: false,
      });

      console.log("⚡ Fast mode URL:", fastUrl);

      const fastResponse = await axios.get(fastUrl, {
        timeout: 15000, // 15s for fast mode
        validateStatus: () => true,
      });

      if (typeof fastResponse.data === "string") {
        html = fastResponse.data;
      } else {
        console.log("⚠ Fast mode returned non-HTML data");
      }
    } catch (err) {
      console.log("⚠ Fast mode error:", err.message);
    }

    let scraped = html ? extractFields(html) : {
      price: "",
      mileage: "",
      vin: "",
      dealerName: "",
      dealerAddress: "",
    };

    const fastGood = isGoodEnough(scraped);
    console.log("🔎 Fast mode result:", scraped, "goodEnough:", fastGood);

    // 2) If fast mode is not good enough → fallback to render mode
    if (!fastGood) {
      mode = "render-fallback";
      console.log("🕒 Fast mode insufficient → trying render=true fallback...");

      const renderUrl = buildScraperUrl({
        apiKey: SCRAPER_API_KEY,
        targetUrl,
        render: true,
      });

      try {
        console.log("🧠 Render mode URL:", renderUrl);

        const renderResponse = await axios.get(renderUrl, {
          timeout: 60000, // 60s for render mode
          validateStatus: () => true,
        });

        if (typeof renderResponse.data === "string") {
          const renderedHtml = renderResponse.data;

          // TEMP PREVIEW: first 2000 chars of rendered HTML for debugging
          const preview = renderedHtml.substring(0, 2000);
          console.log(
            "\n\n🟦 ===== RENDERED HTML PREVIEW START =====\n" +
              preview +
              "\n🟦 ===== RENDERED HTML PREVIEW END =====\n"
          );

          scraped = extractFields(renderedHtml);
          console.log("📄 Render mode scraped:", scraped);
        } else {
          console.log("❌ Render mode returned non-HTML data");
        }
      } catch (err) {
        console.log("❌ Render mode error:", err.message);
      }
    }

    return res.json({
      success: true,
      modeUsed: mode,
      targetUrl,
      scraped,
    });
  } catch (err) {
    console.error("❌ Test scraper error:", err);
    return res.status(500).json({ error: err.message });
  }
};
