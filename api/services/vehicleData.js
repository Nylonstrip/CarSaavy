// api/services/vehicleData.js
const fetch = require("node-fetch");

// Toggle mock mode to skip live API calls
const USE_MOCK = true;

// Graceful JSON parser
function safeParse(json, label) {
  try {
    return json;
  } catch (err) {
    console.error(`❌ [VehicleData] Failed to parse ${label}:`, err);
    return null;
  }
}

// Helper: wraps a fetch call in a timeout
async function fetchWithTimeout(url, ms = 10000, label = "request") {
  console.log(`🔍 [VehicleData] Starting ${label}: ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${label} failed with ${res.status}`);
    const data = await res.json();
    console.log(`✅ [VehicleData] ${label} success`);
    return safeParse(data, label);
  } catch (err) {
    console.error(`❌ [VehicleData] ${label} error:`, err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Individual Data Fetchers ---
async function getVehicleSpecs(vin) {
  return fetchWithTimeout(`https://example.com/api/specs/${vin}`, 10000, "specs");
}
async function getRecalls(vin) {
  return fetchWithTimeout(`https://example.com/api/recalls/${vin}`, 10000, "recalls");
}
async function getVehicleHistory(vin) {
  return fetchWithTimeout(`https://example.com/api/history/${vin}`, 10000, "history");
}
async function getMarketPricing(vin) {
  return fetchWithTimeout(`https://example.com/api/pricing/${vin}`, 10000, "pricing");
}
async function getRepairEstimates(vin) {
  return fetchWithTimeout(`https://example.com/api/repairs/${vin}`, 10000, "repairs");
}

// --- Master Aggregator ---
async function getAllVehicleData(vin) {
  console.log("🛰️ [VehicleData] Starting getAllVehicleData for VIN:", vin);

  // MOCK MODE: returns instantly for end-to-end testing
  if (USE_MOCK) {
    console.log("🧪 [VehicleData] Using mock mode for testing...");
    const mockData = {
      vin,
      generatedAt: new Date().toISOString(),
      sections: {
        specs: { make: "Honda", model: "Civic", year: 2022 },
        recalls: { activeRecalls: 0 },
        history: { owners: 1, cleanTitle: true },
        pricing: { marketValue: "$18,500" },
        repairs: { estCost: "$200" },
      },
    };
    console.log("✅ [VehicleData] Mock data ready");
    return mockData;
  }

  // Live mode — real API calls
  try {
    const [specs, recalls, history, pricing, repairs] = await Promise.all([
      getVehicleSpecs(vin),
      getRecalls(vin),
      getVehicleHistory(vin),
      getMarketPricing(vin),
      getRepairEstimates(vin),
    ]);

    console.log("✅ [VehicleData] All API calls complete");

    const result = {
      vin,
      generatedAt: new Date().toISOString(),
      sections: {
        specs: specs || {},
        recalls: recalls || {},
        history: history || {},
        pricing: pricing || {},
        repairs: repairs || {},
      },
    };

    console.log("✅ [VehicleData] Final result structure built");
    return result;
  } catch (err) {
    console.error("🔥 [VehicleData] getAllVehicleData failed:", err);
    return null;
  }
}

module.exports = {
  getAllVehicleData,
  getVehicleSpecs,
  getRecalls,
  getVehicleHistory,
  getMarketPricing,
  getRepairEstimates,
};