/**
 * vehicleData.js (Basic Tier Optimized)
 *
 * Uses ONLY ONE MarketCheck Basic endpoint:
 *   /v2/listings?vin={vin}&radius=100
 *
 * Extracts:
 *  - Specs (make/model/year/trim)
 *  - Pricing (avg/median/low/high)
 *  - Mileage (avg)
 *  - Dealer info
 *  - Days on Market (derived)
 *  - Sample size
 *  - Derived negotiation pricing metrics
 *
 * Fully MVP compatible. Safe to upgrade later for Standard/Advanced API.
 */

const fetch = require("node-fetch");

const MARKETCHECK_API_KEY = process.env.MARKETCHECK_API_KEY;
const MOCK_MODE = process.env.MOCK_MODE === "true";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const log = (msg, ...args) => {
  if (LOG_LEVEL === "debug" || LOG_LEVEL === "info") {
    console.log(`[VehicleData] ${msg}`, ...args);
  }
};

async function getAllVehicleData(vin) {
  log(`Start for VIN: ${vin}`);

  // Mock mode (for dev safety)
  if (MOCK_MODE) {
    log(`MOCK_MODE active for VIN ${vin}`);
    return mockResponse(vin);
  }

  try {
    const url =
      `https://api.marketcheck.com/v2/listings?` +
      `vin=${vin}&radius=100&include_recommendations=true&api_key=${MARKETCHECK_API_KEY}`;

    log("Fetching MarketCheck listings:", url);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`MarketCheck failed: ${res.statusText}`);
    }

    const json = await res.json();

    const listings = Array.isArray(json.listings) ? json.listings : [];

    if (listings.length === 0) {
      log("No listings found for VIN. Returning partial data.");
      return {
        vin,
        specs: extractSpecs(json),
        pricing: {},
        mileage: null,
        comparables: [],
        marketStats: {
          sampleSize: 0,
          domAvg: null,
        },
      };
    }

    // Extract comps-based metrics
    const compsPricing = extractPricingFromListings(listings);
    const mileage = extractMileage(listings);
    const domAvg = extractDaysOnMarket(listings);
    const specs = extractSpecs(listings[0]);

    const final = {
      vin,
      specs,
      pricing: compsPricing,
      mileage,
      comparables: listings.map(cleanComparable),
      marketStats: {
        sampleSize: listings.length,
        domAvg,
      },
    };

    log("Completed for VIN:", final);
    return final;

  } catch (err) {
    console.error("[VehicleData] ERROR:", err);
    return {
      vin,
      specs: {},
      pricing: {},
      mileage: null,
      comparables: [],
      marketStats: {
        sampleSize: 0,
        domAvg: null,
      },
      error: err.message,
    };
  }
}

/* ----------------------------- Extraction Helpers ----------------------------- */

function extractSpecs(source) {
  if (!source) return {};

  return {
    make: source.build?.make || source.make || null,
    model: source.build?.model || source.model || null,
    year: source.build?.year || source.year || null,
    trim: source.build?.trim || source.trim || null,
  };
}

function extractMileage(listings) {
  const miles = listings
    .map((l) => l.miles)
    .filter((m) => typeof m === "number" && m > 0);

  if (miles.length === 0) return null;

  return Math.round(miles.reduce((a, b) => a + b, 0) / miles.length);
}

function extractDaysOnMarket(listings) {
  const dom = listings
    .map((l) => l.dom)
    .filter((d) => typeof d === "number" && d > 0);

  if (dom.length === 0) return null;

  return Math.round(dom.reduce((a, b) => a + b, 0) / dom.length);
}

function extractPricingFromListings(listings) {
  const prices = listings
    .map((l) => l.price)
    .filter((p) => typeof p === "number" && p > 500); // filter nonsense

  if (prices.length === 0) {
    return {
      average: null,
      median: null,
      low: null,
      high: null,
      target: null,
      deltaToMedian: null,
    };
  }

  const sorted = prices.slice().sort((a, b) => a - b);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  const average = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Derived negotiation target — soft formula for MVP
  const target = Math.round(median - Math.min(1200, median * 0.05));

  return {
    average,
    median,
    low,
    high,
    target,
    deltaToMedian: null, // filled in PDF stage if needed
  };
}

function cleanComparable(l) {
  return {
    price: l.price || null,
    miles: l.miles || null,
    dom: l.dom || null,
    dealer: l.dealer?.name || null,
    city: l.dealer?.city || null,
    state: l.dealer?.state || null,
    distance: l.distance || null,
    url: l.vdp_url || null,
  };
}

/* ----------------------------- Mock Response ----------------------------- */
function mockResponse(vin) {
  return {
    vin,
    specs: {
      make: "Honda",
      model: "Civic",
      year: 2018,
      trim: "LX",
    },
    pricing: {
      average: 17500,
      median: 17000,
      low: 16000,
      high: 19000,
      target: 15800,
    },
    mileage: 42000,
    comparables: [],
    marketStats: {
      sampleSize: 5,
      domAvg: 24,
    },
  };
}

module.exports = { getAllVehicleData };
