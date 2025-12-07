// api/carsDotCom.js

const axios = require("axios");
const cheerio = require("cheerio");

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
if (!SCRAPER_API_KEY) {
  console.warn("[CarsDotCom] SCRAPER_API_KEY is not set. Scraping will fail.");
}

const SCRAPER_BASE = "http://api.scraperapi.com";

/**
 * Build ScraperAPI URL for a target URL
 */
function buildScraperUrl(targetUrl, options = {}) {
  const params = new URLSearchParams({
    api_key: SCRAPER_API_KEY,
    url: targetUrl,
    country: "us",
    device: "desktop",
  });

  if (options.render) {
    params.set("render", "true");
    params.set("premium", "true");
  }

  return `${SCRAPER_BASE}/?${params.toString()}`;
}

/**
 * Small helper to try multiple selectors and return the first non-empty text.
 */
function firstText($, selectors) {
  for (const sel of selectors) {
    const txt = $(sel).first().text().trim();
    if (txt) return txt;
  }
  return null;
}

/**
 * Parse a Cars.com vehicle detail HTML page into a normalized object.
 *
 * Returns a hybrid object:
 *  - flat fields: title, year, make, model, trim, price, mileage, vin, dealerName, dealerAddress
 *  - structured: { basic, dealer, source, url }
 */
function parseVehicleDetailHtml(html, listingUrl = null) {
  const $ = cheerio.load(html);

  // -----------------------------
  // 1️⃣ Title
  // -----------------------------
  const title =
    firstText($, [
      "h1.listing-title",
      "h1[data-qa='vehicle-title']",
      ".vehicle-info__title",
      ".vdp-details-basics__heading",
    ]) || null;

  // -----------------------------
  // 2️⃣ Price
  // -----------------------------
  const rawPrice =
    firstText($, [
      "span.primary-price",
      "span[data-qa='primary-price']",
      "span[data-qa='price-value']",
      ".price-section .price",
      ".vehicle-info__price-display",
    ]) || null;

  let price = null;
  if (rawPrice) {
    const clean = rawPrice.replace(/[^0-9]/g, "");
    price = clean ? Number(clean) : null;
  }

  // -----------------------------
  // 3️⃣ Mileage
  // -----------------------------
  const rawMileage =
    firstText($, [
      "div.mileage",
      "span[data-qa='mileage']",
      "li:contains('mi')",
      "li:contains('miles')",
      ".vdp-details-basics__item:contains('mi')",
    ]) || null;

  let mileage = null;
  if (rawMileage) {
    const clean = rawMileage.replace(/[^0-9]/g, "");
    mileage = clean ? Number(clean) : null;
  }

  // -----------------------------
  // 4️⃣ VIN – safe subset only
  // -----------------------------
  let vin = null;

  const vinSelectors = [
    "li:contains('VIN')",
    "div:contains('VIN')",
    "[data-qa='vin']",
    ".vdp-details-basics__item:contains('VIN')",
  ];

  for (const selector of vinSelectors) {
    const txt = $(selector).first().text() || "";
    if (!txt.includes("VIN")) continue;

    const cleaned = txt.replace(/VIN[:\s]*/i, "").trim();

    // Strict VIN validation: 17 chars, uppercase, excludes I/O/Q.
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) {
      vin = cleaned;
      break;
    }
  }

  // -----------------------------
  // 5️⃣ Dealer name / address
  // -----------------------------
  const dealerName =
    firstText($, [
      "h3.seller-name",
      "div[data-qa='seller-name']",
      ".dealer-name",
      ".dealer-info__name",
      ".seller-info__name",
    ]) || null;

  const dealerAddress =
    firstText($, [
      "div.seller-address",
      "div[data-qa='seller-address']",
      ".dealer-address",
      ".dealer-info__address",
      ".seller-info__address",
    ]) || null;

  // -----------------------------
  // 6️⃣ Derive year / make / model / trim from title
  // -----------------------------
  let year = null;
  let make = null;
  let model = null;
  let trim = null;

  if (title) {
    const parts = title.split(/\s+/);
    if (parts.length >= 2 && /^\d{4}$/.test(parts[0])) {
      year = Number(parts[0]) || null;
      make = parts[1] || null;
      model = parts[2] || null;
      trim = parts.slice(3).join(" ").trim() || null;
    }
  }

  const flat = {
    title,
    year,
    make,
    model,
    trim,
    price,
    mileage,
    vin,
    dealerName,
    dealerAddress,
  };

  const structured = {
    basic: {
      title,
      year,
      make,
      model,
      trim,
      price,
      mileage,
      vin,
    },
    dealer: {
      name: dealerName,
      address: dealerAddress,
    },
    source: "cars.com",
    url: listingUrl,
  };

  return {
    ...flat,
    structured,
  };
}

/**
 * Scrape a Cars.com vehicle detail page given its URL.
 *
 * Returns:
 * {
 *   success: boolean,
 *   modeUsed: "fast" | "render" | "render-fallback",
 *   source: "cars",
 *   url: listingUrl,
 *   vehicle: { ...hybrid object from parseVehicleDetailHtml }
 * }
 */
async function scrapeByURL(listingUrl, options = {}) {
  if (!SCRAPER_API_KEY) {
    console.error("[CarsDotCom] SCRAPER_API_KEY is missing.");
    throw new Error("SCRAPER_API_KEY missing");
  }

  if (!listingUrl || typeof listingUrl !== "string") {
    throw new Error("listingUrl is required");
  }

  console.info("[CarsDotCom] 🔍 Scraping:", listingUrl);

  const useRender = options.render === true;

  const url = buildScraperUrl(listingUrl, { render: useRender });

  let html;
  try {
    const resp = await axios.get(url, {
      timeout: useRender ? 25000 : 15000,
    });
    html = resp.data;
  } catch (err) {
    console.error(
      "[CarsDotCom] ❌ ScraperAPI request failed:",
      err.message || err
    );
    throw new Error("ScraperAPI request failed");
  }

  if (!html || typeof html !== "string") {
    console.error("[CarsDotCom] ❌ Empty HTML from ScraperAPI");
    throw new Error("Empty HTML from ScraperAPI");
  }

  const vehicle = parseVehicleDetailHtml(html, listingUrl);

  console.info("[CarsDotCom] 🧩 Parsed vehicle:", {
    title: vehicle.title,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    price: vehicle.price,
    mileage: vehicle.mileage,
    vin: vehicle.vin,
    dealerName: vehicle.dealerName,
  });

  return {
    success: true,
    modeUsed: useRender ? "render" : "fast",
    source: "cars",
    url: listingUrl,
    vehicle,
  };
}

module.exports = {
  scrapeByURL,
  parseVehicleDetailHtml,
};
