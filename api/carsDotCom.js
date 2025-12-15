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

    // 🔹 NEW: additional fields for Specified reports
    sellerNotes: "Mock seller notes: well-maintained vehicle with minor cosmetic wear.",
    description: "Mock overview: Clean CarFax, regular maintenance, no major accidents reported.",
    features: [
      "Leather seats",
      "Backup camera",
      "Blind spot monitoring",
      "Remote start",
    ],
    comparables: [],
    highlights: [],

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
// 🧹 Empty fallback structure
// ----------------------
function emptyResult() {
  return {
    title: null,
    year: null,
    make: null,
    model: null,
    trim: null,
    price: null,
    mileage: null,
    vin: null,
    dealerName: null,
    dealerAddress: null,

    sellerNotes: null,
    description: null,
    features: [],
    comparables: [],
    highlights: [],

    structured: {
      basic: {
        title: null,
        year: null,
        make: null,
        model: null,
        trim: null,
        price: null,
        mileage: null,
        vin: null,
      },
      dealer: {
        name: null,
        address: null,
      },
      source: "cars.com",
      url: null,
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

// Attempt to extract VIN from the listing
let scrapedVin = null;

// Cars.com often stores VIN inside a JSON blob in <script> tags
const scriptBlocks = $("script[type='application/ld+json']");
scriptBlocks.each((i, el) => {
  try {
    const json = JSON.parse($(el).html());
    if (json && json.vehicleIdentificationNumber) {
      scrapedVin = json.vehicleIdentificationNumber.trim();
    }
  } catch (e) {}
});

// Fallback 2: VIN sometimes appears in specs tables
if (!scrapedVin) {
  const vinRow = $("li:contains('VIN')").text();
  const match = vinRow.match(/VIN[:\s]+([A-HJ-NPR-Z0-9]{11,17})/i);
  if (match) scrapedVin = match[1].trim();
}

// Save it to output
out.scrapedVin = scrapedVin || null;


  const $ = cheerio.load(html);



  // Basic top-level info
  const title = $('h1.listing-title').text().trim() || null;

  const priceText = $('[data-test="vehicle-listing-price"]').text().trim();
  const price = priceText ? parseInt(priceText.replace(/[^0-9]/g, "")) : null;

  const mileageText = $('[data-test="mileage"]').text().trim();
  const mileage = mileageText ? parseInt(mileageText.replace(/[^0-9]/g, "")) : null;

  const vin = $('[data-test="vin"]').text().trim() || null;

  const dealerName = $('[data-test="dealer-name"]').text().trim() || null;
  const dealerAddress = $('[data-test="address"]').text().trim() || null;

  // ----------------------
  // 📝 Seller notes / description
  // ----------------------
  const sellerNotes =
    $('[data-test="seller-notes"]').text().trim() ||
    $(".seller-notes").text().trim() ||
    $('[data-test="description"]').text().trim() ||
    $(".description").text().trim() ||
    null;

  const description =
    $('[data-test="vehicle-overview"]').text().trim() ||
    $(".vehicle-overview").text().trim() ||
    null;

  // ----------------------
  // ⚙️ Features list (very fault-tolerant)
  // ----------------------
  const featureSelectors = [
    '[data-test="vehicle-feature-list"] li',
    '[data-test="features-list"] li',
    ".fancy-features-list li",
    ".vehicle-features li",
    '[data-test="key-features"] li',
  ];

  const features = [];

  for (const sel of featureSelectors) {
    $(sel).each((_, el) => {
      const txt = $(el).text().trim();
      if (txt && !features.includes(txt)) {
        features.push(txt);
      }
    });
  }

  const parsed = {
    title,
    price,
    mileage,
    vin,
    dealerName,
    dealerAddress,

    sellerNotes: sellerNotes || null,
    description: description || null,
    features,

    comparables: [],
    highlights: [],

    structured: {
      basic: {
        title,
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
    },
  };

  console.log("[CarsDotCom] 🧩 Parsed vehicle:", {
    title: parsed.title,
    price: parsed.price,
    mileage: parsed.mileage,
    vin: parsed.vin,
    dealerName: parsed.dealerName,
    featuresCount: parsed.features.length,
  });

  return parsed;
}

module.exports = { parseCarsDotCom };
