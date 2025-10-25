// api/services/vehicleData.js
const fetch = require("node-fetch");
const log = require("../logger").scope("VehicleData");

const USE_MOCK = (process.env.MOCK_MODE || "true").toLowerCase() === "true";

// --- Real data fetchers (stubbed for now). Replace URLs when going live. ---
async function getVehicleSpecs(vin)    { return {}; /* hook real API */ }
async function getRecalls(vin)         { return {}; /* hook real API */ }
async function getVehicleHistory(vin)  { return {}; /* hook real API */ }
async function getMarketPricing(vin)   { return {}; /* hook real API */ }
async function getRepairEstimates(vin) { return {}; /* hook real API */ }

async function getAllVehicleData(vin) {
  if (USE_MOCK) {
    log.info("Mock mode active");
    return {
      vin,
      generatedAt: new Date().toISOString(),
      sections: {
        specs:   { make: "Honda", model: "Civic", year: 2022 },
        recalls: { activeRecalls: 0 },
        history: { owners: 1, cleanTitle: true },
        pricing: { marketValue: "$18,500" },
        repairs: { estCost: "$200" },
      },
    };
  }

  // Live mode: fetch in parallel with basic resilience
  try {
    const [specs, recalls, history, pricing, repairs] = await Promise.all([
      getVehicleSpecs(vin),
      getRecalls(vin),
      getVehicleHistory(vin),
      getMarketPricing(vin),
      getRepairEstimates(vin),
    ]);

    return {
      vin,
      generatedAt: new Date().toISOString(),
      sections: {
        specs:   specs   || {},
        recalls: recalls || {},
        history: history || {},
        pricing: pricing || {},
        repairs: repairs || {},
      },
    };
  } catch (err) {
    log.error("Live fetch failed:", err.message);
    // Fail gracefully so the pipeline continues
    return {
      vin,
      generatedAt: new Date().toISOString(),
      sections: { specs:{}, recalls:{}, history:{}, pricing:{}, repairs:{} },
    };
  }
}

module.exports = {
  getAllVehicleData,
  // export individual fetchers if you’ll unit-test them later
  getVehicleSpecs,
  getRecalls,
  getVehicleHistory,
  getMarketPricing,
  getRepairEstimates,
};