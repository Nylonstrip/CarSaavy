// api/services/vehicleData.js
const fetch = require("node-fetch");

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

// Mock example endpoints — replace with your real data sources
async function getVehicleSpecs(vin) {
  // replace URL with real VIN API endpoint
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

async function getAllVehicleData(vin) {
  console.log("🛰️ [VehicleData] Starting getAllVehicleData for VIN:", vin);
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