/**
 * VehicleData.js — MVP Engine Edition
 * Scrapes Cars.com + 3 Comparables + Generates Pricing Model + Highlights + DOM Estimate
 */

const axios = require("axios");
const cheerio = require("cheerio");

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

/* ========== ScraperAPI Helper ========== */
async function scraperGet(url, opts = {}) {
  const params = new URLSearchParams({
    api_key: SCRAPER_API_KEY,
    url,
    country: "us",
    device: "desktop",
    render: opts.render ? "true" : "false",
    premium: opts.render ? "true" : "false",
  });

  const fullUrl = `http://api.scraperapi.com/?${params.toString()}`;

  try {
    const response = await axios.get(fullUrl, { timeout: 15000 });
    return response.data;
  } catch (err) {
    console.error(`[ScraperAPI] Error for URL: ${url}`, err.message);
    return null;
  }
}

/* ========== Cars.com URL Validation ========== */
function isValidCarsComUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url.trim());
    return (
      u.hostname.includes("cars.com") &&
      u.pathname.includes("/vehicledetail/")
    );
  } catch (e) {
    return false;
  }
}

/* ========== Parse Vehicle Page ========== */
function parseVehicle(html) {
  const $ = cheerio.load(html);

  const title = $("h1").first().text().trim();
  const priceText = $('[data-test="vd-price"]').first().text().trim();
  const mileageText = $('[data-test="vd-mileage"]').first().text().trim();

  // This is a bit heuristic, but works for Cars.com:
  const vinText = $("div:contains('VIN')").last().text().trim();

  const price = parseInt(priceText.replace(/\D/g, "")) || null;
  const mileage = parseInt(mileageText.replace(/\D/g, "")) || null;
  const vin = vinText.replace("VIN", "").replace(":", "").trim() || null;

  let year = null,
    make = null,
    model = null,
    trim = null;
  if (title) {
    const parts = title.split(" ");
    year = parseInt(parts[0]) || null;
    make = parts[1] || null;
    model = parts[2] || null;
    trim = parts.slice(3).join(" ") || null;
  }

  return { title, year, make, model, trim, price, mileage, vin };
}

/* ========== Build Comparables Search URL ========== */
function buildSearchUrl(vehicle) {
  const { year, make, model } = vehicle;

  return (
    "https://www.cars.com/shopping/results/?" +
    `makes[]=${encodeURIComponent(make)}` +
    `&models[]=${encodeURIComponent((model || "").toLowerCase())}` +
    `&year_min=${year}&year_max=${year}` +
    "&stock_type=used" +
    "&maximum_distance=100"
  );
}

/* ========== Parse Search Results (Comparables) ========== */
function parseComparables(html) {
  const $ = cheerio.load(html);
  const results = [];

  $(".vehicle-card").each((i, card) => {
    if (results.length >= 3) return; // LIMIT: 3 comps

    const priceText = $(card)
      .find('[data-test="vehicleCardPrice"]')
      .text()
      .trim();
    const mileageText = $(card)
      .find('[data-test="vehicleMileage"]')
      .text()
      .trim();
    const title = $(card)
      .find('[data-test="vehicleCardTitle"]')
      .text()
      .trim();
    const linkEl = $(card).find("a.vehicle-card-link").attr("href");

    if (!priceText || !title) return;

    const price = parseInt(priceText.replace(/\D/g, "")) || null;
    const mileage = parseInt(mileageText.replace(/\D/g, "")) || null;

    // Title example: "2018 Chevrolet Camaro 1LT"
    const tParts = title.split(" ");
    const year = parseInt(tParts[0]) || null;
    const make = tParts[1] || null;
    const model = tParts[2] || null;
    const trim = tParts.slice(3).join(" ") || null;

    const sourceUrl = linkEl ? `https://www.cars.com${linkEl}` : null;

    results.push({ price, mileage, year, make, model, trim, sourceUrl });
  });

  return results;
}

/* ========== Pricing Model From Comparables ========== */
function computePricing(comps, listingPrice) {
  if (!comps || comps.length === 0)
    return {
      minPrice: null,
      maxPrice: null,
      avgPrice: null,
      priceRank: null,
    };

  const prices = comps.map((c) => c.price).filter(Boolean);
  if (prices.length === 0)
    return {
      minPrice: null,
      maxPrice: null,
      avgPrice: null,
      priceRank: null,
    };

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = Math.round(
    prices.reduce((a, b) => a + b, 0) / prices.length
  );

  // percentile rank
  const priceRank =
    listingPrice && prices.length > 1
      ? Math.round(
          (prices.filter((p) => p <= listingPrice).length / prices.length) *
            100
        )
      : null;

  return { minPrice, maxPrice, avgPrice, priceRank };
}

/* ========== Highlights Engine ========== */
function buildHighlights(main, comps, pricing) {
  const highlights = [];

  // Mileage highlights
  if (main.mileage && comps.length > 0) {
    const avgMileage =
      comps.reduce((sum, c) => sum + (c.mileage || 0), 0) / comps.length;

    if (main.mileage > avgMileage * 1.15)
      highlights.push("Higher mileage than similar vehicles on the market.");
    else if (main.mileage < avgMileage * 0.85)
      highlights.push("Lower mileage than most similar listings.");
  }

  // Pricing highlights
  if (pricing.avgPrice && main.price) {
    if (main.price < pricing.avgPrice * 0.95)
      highlights.push("Price appears competitively below market average.");
    else if (main.price > pricing.avgPrice * 1.05)
      highlights.push("Price above market expectations; negotiation likely.");
  }

  // Price rank
  if (pricing.priceRank !== null) {
    if (pricing.priceRank <= 30)
      highlights.push("Priced aggressively compared to similar vehicles.");
    else if (pricing.priceRank >= 70)
      highlights.push("Listing is priced higher than most comparable vehicles.");
  }

  return highlights;
}

/* ========== Days-on-Market Estimation ========== */
function estimateDOM(main, comps, pricing) {
  if (!pricing.priceRank) return 28; // default average

  if (pricing.priceRank >= 80) return 60 + Math.floor(Math.random() * 20);
  if (pricing.priceRank >= 60) return 40 + Math.floor(Math.random() * 10);
  if (pricing.priceRank <= 30) return 12 + Math.floor(Math.random() * 5);

  return 28; // mid-market
}

/* ========== MAIN EXPORT FUNCTION ========== */
// Now accepts both URL + input VIN for verification
module.exports = async function fetchVehicleData(url, inputVinRaw) {
  console.log(`[VehicleData] Starting scrape for: ${url}`);

  if (!isValidCarsComUrl(url)) {
    console.error("[VehicleData] Invalid Cars.com URL:", url);
    return {
      error: "INVALID_CARS_URL",
      url,
    };
  }

  const normalizedInputVin = inputVinRaw
    ? String(inputVinRaw).trim().toUpperCase()
    : null;

  // Step 1: Scrape Main Listing
  const html = await scraperGet(url);
  if (!html) {
    return {
      error: "SCRAPE_FAILED",
      url,
    };
  }

  const main = parseVehicle(html);
  const scrapedVin = main.vin ? String(main.vin).trim().toUpperCase() : null;

  if (normalizedInputVin) {
    if (scrapedVin && scrapedVin !== normalizedInputVin) {
      console.error(
        `[VehicleData] VIN mismatch. Input: ${normalizedInputVin}, Scraped: ${scrapedVin}`
      );
      return {
        error: "VIN_MISMATCH",
        url,
        inputVin: normalizedInputVin,
        scrapedVin,
        vehicle: main,
      };
    }

    if (!scrapedVin) {
      console.warn(
        "[VehicleData] VIN not found on Cars.com page for verification."
      );
      return {
        error: "VIN_NOT_FOUND_ON_PAGE",
        url,
        inputVin: normalizedInputVin,
        vehicle: main,
      };
    }
  }

  // If key data missing -> mild fallback
  if (!main.year || !main.make || !main.model) {
    return {
      ...main,
      comparables: [],
      minPrice: null,
      maxPrice: null,
      avgPrice: null,
      priceRank: null,
      daysOnMarket: 28,
      highlights: ["Limited data available; basic report only."],
      url,
    };
  }

  // Step 2: Scrape Comparables
  const searchUrl = buildSearchUrl(main);
  const searchHtml = await scraperGet(searchUrl);

  let comps = [];
  if (searchHtml) {
    comps = parseComparables(searchHtml);
  }

  // Step 3: Pricing Model
  const pricing = computePricing(comps, main.price);

  // Step 4: Highlights
  const highlights = buildHighlights(main, comps, pricing);

  // Step 5: DOM Estimation
  const daysOnMarket = estimateDOM(main, comps, pricing);

  return {
    ...main,
    comparables: comps,
    minPrice: pricing.minPrice,
    maxPrice: pricing.maxPrice,
    avgPrice: pricing.avgPrice,
    priceRank: pricing.priceRank,
    daysOnMarket,
    highlights,
    url,
  };
};
