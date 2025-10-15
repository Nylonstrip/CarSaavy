// /api/services/vehicleData.js

/**
 * Fetches and aggregates all available vehicle data for a given VIN.
 * Integrates NHTSA data + placeholder modules for future APIs.
 * Returns a unified structure used by the report generator.
 */

const fetch = require('node-fetch');

// ---------- Helper: safe value handler ----------
function safe(value, fallback = 'Not Available') {
  return value && value !== '0' ? value : fallback;
}

// ---------- 1️⃣ Vehicle Specs ----------
async function getVehicleSpecs(vin) {
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
    const data = await res.json();

    const make = safe(data.Results.find(x => x.Variable === 'Make')?.Value);
    const model = safe(data.Results.find(x => x.Variable === 'Model')?.Value);
    const year = safe(data.Results.find(x => x.Variable === 'Model Year')?.Value);
    const body = safe(data.Results.find(x => x.Variable === 'Body Class')?.Value);
    const engine = safe(data.Results.find(x => x.Variable === 'Engine Model')?.Value);

    return { success: true, data: { make, model, year, body, engine } };
  } catch (err) {
    console.error(`❌ [VehicleData] Failed to fetch specs for VIN ${vin}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ---------- 2️⃣ Recalls ----------
async function getRecalls(vin) {
  try {
    const res = await fetch(`https://api.nhtsa.gov/recalls/recallsByVehicle?vin=${vin}`);
    const data = await res.json();

    if (!data.Results || !Array.isArray(data.Results) || !data.Results.length) {
      return { success: true, data: [] };
    }

    const recalls = data.Results.map(
      r => `${r.Component}: ${r.Summary || r.Remedy || 'Recall issued'}`
    );

    return { success: true, data: recalls };
  } catch (err) {
    console.error(`❌ [VehicleData] Failed to fetch recalls for VIN ${vin}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ---------- 3️⃣ Placeholder: Ownership/History ----------
async function getVehicleHistory(vin) {
  try {
    // Future integration with Carfax / EpicVIN API
    return { success: true, data: { summary: 'No ownership history found (sample placeholder).' } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ---------- 4️⃣ Placeholder: Market Pricing ----------
async function getMarketPricing(vin) {
  try {
    // Future integration with KBB / MarketCheck / Edmunds APIs
    return { success: true, data: { low: 8500, high: 11200, currency: 'USD' } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ---------- 5️⃣ Placeholder: Repair & Maintenance ----------
async function getRepairEstimates(vin) {
  try {
    // Future integration with RepairPal or Edmunds maintenance data
    return {
      success: true,
      data: [
        'Oil change recommended every 7,500 miles',
        'Check tire tread and rotation at 10,000 miles',
        'Inspect brakes and pads every 15,000 miles'
      ]
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ---------- 6️⃣ Aggregator ----------
async function getAllVehicleData(vin) {
  console.log(`🛰️ [VehicleData] Fetching data for VIN ${vin}`);

  try {
    const [specs, recalls, history, pricing, repairs] = await Promise.all([
      getVehicleSpecs(vin),
      getRecalls(vin),
      getVehicleHistory(vin),
      getMarketPricing(vin),
      getRepairEstimates(vin)
    ]);

    const finalData = {
      vin: vin.toUpperCase(),
      generatedAt: new Date().toISOString(),
      sections: {
        specs,
        recalls,
        history,
        pricing,
        repairs
      }
    };

    console.log(`✅ [VehicleData] Completed data fetch for ${vin}`);
    return finalData;
  } catch (err) {
    console.error(`🔥 [VehicleData] Error fetching data for ${vin}:`, err.message);
    return {
      vin: vin.toUpperCase(),
      error: err.message,
      sections: {}
    };
  }
}

module.exports = { getAllVehicleData };