const logger = require("./logger");
const { sendAdminAlert } = require("./emailService");

// Environment-controlled toggles
const MOCK_MODE = process.env.MOCK_MODE !== "false";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "carsaavy@gmail.com";

let apiCallCount = 0;
const seenVINs = new Set();

/**
 * Mock data generator (used in MOCK_MODE)
 */
function getMockVehicleData(vin) {
  logger.info(`[VehicleData] Using mock mode for VIN: ${vin}`);
  return {
    vin,
    make: "Honda",
    model: "Civic",
    year: 2020,
    price: "$18,500",
    recommendations: [
      "Negotiate for an additional $500 off due to mileage.",
      "Ask about service history or potential recalls.",
    ],
  };
}

/**
 * Simulated API fetch from MarketCheck or fallback source.
 */
async function fetchVehicleDataFromAPI(vin) {
  const API_KEY = process.env.MARKETCHECK_API_KEY;
  const url = `https://marketcheck-prod.apigee.net/v2/vins/${vin}/specs?api_key=${API_KEY}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch vehicle data: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    vin,
    make: data.make || "Unknown",
    model: data.model || "Unknown",
    year: data.year || "Unknown",
    price: data.price || "N/A",
  };
}

/**
 * Main handler
 */
async function getAllVehicleData(vin) {
  logger.info(`[VehicleData] Processing VIN: ${vin}`);

  // Prevent repeat VIN lookups
  if (seenVINs.has(vin)) {
    logger.warn(`[VehicleData] Duplicate VIN lookup prevented: ${vin}`);
    return {
      vin,
      duplicate: true,
      message: "VIN already processed recently, skipping duplicate lookup.",
    };
  }
  seenVINs.add(vin);

  apiCallCount++;
  logger.info(`[VehicleData] API calls so far: ${apiCallCount}`);

  // Send alert to admin if nearing threshold
  if (apiCallCount === 250 || apiCallCount % 100 === 0) {
    await sendAdminAlert(
      ADMIN_EMAIL,
      "CarSaavy API Usage Alert",
      `API usage has reached ${apiCallCount} calls. Consider upgrading or monitoring usage.`
    );
    logger.info(`[VehicleData] Admin alerted at ${apiCallCount} calls`);
  }

  try {
    // Choose mode
    const result = MOCK_MODE ? getMockVehicleData(vin) : await fetchVehicleDataFromAPI(vin);
    logger.info(`[VehicleData] Data retrieval complete for VIN: ${vin}`);
    return result;
  } catch (error) {
    logger.error(`[VehicleData] Error fetching vehicle data: ${error.message}`);

    // Send failure alert
    await sendAdminAlert(
      ADMIN_EMAIL,
      "CarSaavy Vehicle Data Fetch Failed",
      `Error fetching data for VIN: ${vin}\n\nError: ${error.message}`
    );

    return { success: false, error: error.message };
  }
}

module.exports = { getAllVehicleData };