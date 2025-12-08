/**
 * Cars.com parser with optional MOCK MODE for safe testing.
 *
 * If process.env.MOCK_SCRAPING === "true",
 * this file will return a stable fake vehicle dataset
 * without consuming credits or calling ScraperAPI.
 */

const axios = require("axios");
const cheerio = require("cheerio");

const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

// ----------------------
// 🔧 MOCK MODE
// ----------------------
function mockResult() {
  return {
    title: "2018 Chevrolet Camaro 1LT",
    year: 2018,
    make: "Chevrolet",
    model: "Camaro",
    trim: "1LT",
    price: 16797,
    mileage: 93567,
    vin: "1G1FB1RS4J0122031",
    dealerName: "Hardy Superstore",
    dealerAddress: "1249 Charles Hardy Pkwy, Dallas, GA 30157",
    structured: {
      basic: {
        title: "2018 Chevrolet Camaro 1LT",
        year: 2018,
        make: "Chevrolet",
        model: "Camaro",
        trim: "1LT",
        price: 16797,
        mileage: 93567,
        vin: "1G1FB1RS4J0122031",
      },
      dealer: {
        name: "Hardy Superstore",
        address: "1249 Charles Hardy Pkwy, Dallas, GA 30157",
      },
      source: "cars.com",
      url: "https://mock.cars.com/vehicledetail/123",
    },
  };
}

// ----------------------
// 📌 Main Parser Function
// ----------------------
async function parseCarsDotCom(listingUrl) {
  // ◆◆◆ MOCK MODE CHECK ◆◆◆
  if (process.env.MOCK_SCRAPING === "true") {
    console.log("🟦 MOCK MODE ACTIVE — Returning fake scrape data.");
    return mockResult();
  }

  console.log("[CarsDotCom] 🔍 Scraping:", listingUrl);

  const scraperUrl = `http://api.scraperapi.com/?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(
    listingUrl
  )}&country=us&device=desktop`;

  let html;

  try {
    const response = await axios.get(scraperUrl, { timeout: 25000 });
    html = response.data;
  } catch (err) {
    console.error("[CarsDotCom] ❌ Failed fetching HTML:", err.message);
    return emptyResult();
  }

  const $ = cheerio.load(html);

  // Extract information using very fault-tolerant selectors
  const title = $('h1.listing-title').text().trim() || null;

  const priceText = $('[data-test="vehicle-listing-price"]').text().trim();
  const price = priceText ? parseInt(priceText.replace(/[^0-9]/g, "")) : null;

  const mileageText = $('[data-test="mileage"]').text().trim();
  const mileage = mileageText ? parseInt(mileageText.replace(/[^0-9]/g, "")) : null;

  const vin = $('[data-test="vin"]').text().trim() || null;

  const dealerName = $('[data-test="dealer-name"]').text().trim() || null;

  const dealerAddress = $('[data-test="address"]').text().trim() || null;

  const parsed = {
    title,
    price,
    mileage,
    vin,
    dealerName,
    dealerAddress,
    structured: {
      basic: { title, price, mileage, vin },
      dealer: { name: dealerName, address: dealerAddress },
      source: "cars.com",
      url: listingUrl,
    },
  };

  console.log("[CarsDotCom] 🧩 Parsed vehicle:", parsed);
  return parsed;
}

// ----------------------
// 🧹 Empty fallback structure
// ----------------------
function emptyResult() {
  return {
    title: null,
    price: null,
    mileage: null,
    vin: null,
    dealerName: null,
    dealerAddress: null,
    structured: {
      basic: { title: null, price: null, mileage: null, vin: null },
      dealer: { name: null, address: null },
      source: "cars.com",
      url: null,
    },
  };
}

module.exports = { parseCarsDotCom };
