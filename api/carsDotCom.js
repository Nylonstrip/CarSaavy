const cheerio = require("cheerio");
const axios = require("axios");

async function parseCarsDotCom(listingUrl) {
  console.log("[CarsDotCom] 🔍 Scraping:", listingUrl);

  let html;
  try {
    const response = await axios.get(listingUrl);
    html = response.data;
  } catch (err) {
    console.error("[CarsDotCom] ❌ Failed fetching HTML:", err.message);
    return fallbackVehicle();
  }

  const $ = cheerio.load(html);

  // Basic selectors (safe defaults)
  const title = $("h1.listing-title").text().trim() || null;
  const price = parsePrice($(".listing-price").text());
  const mileage = parseMileage($("div.listing-mileage").text());
  const vin = findVin($);
  const dealerName = $("div.seller-name").text().trim() || null;
  const dealerAddress = $("a[href*='maps.google']").text().trim() || null;

  const parsed = {
    title,
    year: extractYear(title),
    make: extractMake(title),
    model: extractModel(title),
    trim: extractTrim(title),
    price,
    mileage,
    vin,
    dealerName,
    dealerAddress,
    structured: {
      basic: {
        title,
        year: extractYear(title),
        make: extractMake(title),
        model: extractModel(title),
        trim: extractTrim(title),
        price,
        mileage,
        vin
      },
      dealer: {
        name: dealerName,
        address: dealerAddress
      },
      source: "cars.com",
      url: listingUrl
    }
  };

  console.log("[CarsDotCom] 🧩 Parsed vehicle:", parsed);

  return parsed;
}

// ========== HELPERS ==========

function parsePrice(text) {
  const match = text.replace(/[^\d]/g, "");
  return match ? Number(match) : null;
}

function parseMileage(text) {
  const match = text.replace(/[^\d]/g, "");
  return match ? Number(match) : null;
}

function extractYear(title) {
  if (!title) return null;
  const m = title.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

function extractMake(title) {
  if (!title) return null;
  const parts = title.split(" ");
  return parts.length > 1 ? parts[1] : null;
}

function extractModel(title) {
  if (!title) return null;
  const parts = title.split(" ");
  return parts.length > 2 ? parts[2] : null;
}

function extractTrim(title) {
  if (!title) return null;
  const parts = title.split(" ");
  return parts.slice(3).join(" ") || null;
}

function findVin($) {
  const text = $("body").text();
  const match = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
  return match ? match[0] : null;
}

function fallbackVehicle() {
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
    structured: {
      basic: {
        title: null,
        year: null,
        make: null,
        model: null,
        trim: null,
        price: null,
        mileage: null,
        vin: null
      },
      dealer: {
        name: null,
        address: null
      },
      source: "cars.com",
      url: null
    }
  };
}

// THIS LINE IS THE MOST IMPORTANT PART OF THIS ENTIRE FILE:
module.exports = { parseCarsDotCom };
