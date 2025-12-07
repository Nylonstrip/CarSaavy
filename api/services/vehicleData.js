// api/services/vehicleData.js

const cheerio = require("cheerio");
const axios = require("axios");

// ScraperAPI wrapper
async function fetchWithScraperAPI(url) {
  const apiKey = process.env.SCRAPER_API_KEY;
  const requestUrl = `http://api.scraperapi.com/?api_key=${apiKey}&url=${encodeURIComponent(
    url
  )}&country=us&device=desktop`;

  const response = await axios.get(requestUrl, {
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
    },
  });

  return response.data;
}

// Parse Cars.com HTML into structured data
function parseCarsCom(html) {
  const $ = cheerio.load(html);

  const title = $("h1.listing-title").text().trim() || null;

  // Extract price
  const priceText =
    $('span[data-test="listing-price"]').first().text().replace(/[^0-9]/g, "") ||
    null;
  const price = priceText ? parseInt(priceText, 10) : null;

  // Extract mileage
  const mileageText =
    $('div:contains("Mileage")')
      .next()
      .text()
      .replace(/[^0-9]/g, "") || null;
  const mileage = mileageText ? parseInt(mileageText, 10) : null;

  // Extract VIN
  let vin =
    $('div:contains("VIN")').next().text().trim() ||
    $('li:contains("VIN")').text().replace("VIN:", "").trim() ||
    null;

  // Extract dealer info
  const dealerName =
    $('[data-test="dealer-name"]').text().trim() ||
    $("h3.seller-name").text().trim() ||
    null;

  const dealerAddress =
    $('[data-test="dealer-address"]').text().trim() ||
    $("div.dealer-address").text().trim() ||
    null;

  return {
    title,
    price,
    mileage,
    vin,
    dealerName,
    dealerAddress,
  };
}

// Basic inference engine (lightweight)
function runInference(data) {
  const inferences = {};

  // Price confidence (very lightweight)
  if (data.price) {
    if (data.price < 15000) inferences.priceScore = "Excellent";
    else if (data.price < 22000) inferences.priceScore = "Good";
    else if (data.price < 30000) inferences.priceScore = "Fair";
    else inferences.priceScore = "Above Market";
  } else {
    inferences.priceScore = "Unknown";
  }

  // Mileage confidence
  if (data.mileage) {
    if (data.mileage < 30000) inferences.conditionScore = "Excellent";
    else if (data.mileage < 60000) inferences.conditionScore = "Good";
    else if (data.mileage < 90000) inferences.conditionScore = "Average";
    else inferences.conditionScore = "High Wear";
  } else {
    inferences.conditionScore = "Unknown";
  }

  // Summary
  inferences.summary = `Based on available pricing and mileage, this vehicle appears to be in ${inferences.conditionScore} condition with a ${inferences.priceScore} price point.`.trim();

  return inferences;
}

// Main entry: called by webhook
async function getAllVehicleData(vin, listingUrl) {
  try {
    console.log("🔍 Scraping Cars.com listing:", listingUrl);

    const html = await fetchWithScraperAPI(listingUrl);
    const parsed = parseCarsCom(html);

    console.log("🧩 Parsed data:", parsed);

    // VIN mismatch check
    const vinMatch =
      parsed.vin &&
      vin &&
      parsed.vin.replace(/\s+/g, "").toUpperCase() === vin.toUpperCase();

    // Add basic inference
    const inference = runInference(parsed);

    return {
      ...parsed,
      requestedVin: vin,
      vinMatch,
      inference,
    };
  } catch (err) {
    console.error("❌ Error scraping vehicle data:", err);
    return {
      error: "Failed to scrape Cars.com listing",
      requestedVin: vin,
      vinMatch: false,
    };
  }
}

module.exports = { getAllVehicleData };
