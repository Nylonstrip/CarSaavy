// api/services/vehicleData.js
/**
 * MVP v1 Vehicle Data Resolver
 * ---------------------------------------
 * Purpose:
 * - Resolve VIN → vehicleProfile
 * - No scraping
 * - No pricing
 * - No dealer data
 */

const axios = require("axios");

// Basic VIN validation (format only, no checksum)
function isValidVinFormat(vin) {
  if (!vin || typeof vin !== "string") return false;
  const v = vin.trim().toUpperCase();
  if (v.length !== 17) return false;
  if (/[IOQ]/.test(v)) return false;
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v);
}

// Lightweight VIN decode via NHTSA (public, free)
// NOTE: This is NOT scraping and is allowed for MVP.
// If this ever fails, we fail cleanly.
async function decodeVin(vin) {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended/${vin}?format=json`;
  const res = await axios.get(url, { timeout: 8000 });
  return res.data && res.data.Results && res.data.Results[0];
}

async function getAllVehicleData(vin) {
  if (!isValidVinFormat(vin)) {
    return {
      error: "Invalid VIN format",
      vehicleProfile: null,
    };
  }

  try {
    console.log("🔍 Decoding VIN (NHTSA):", vin);

    const decoded = await decodeVin(vin);

    if (!decoded || !decoded.Make || !decoded.Model || !decoded.ModelYear) {
      return {
        error: "Unable to resolve vehicle from VIN",
        vehicleProfile: null,
      };
    }

    // Trim bucketing (coarse, MVP-safe)
    let trimBucket = null;
    const trimRaw = (decoded.Trim || "").toLowerCase();

    if (trimRaw) {
      if (/(sport|performance|gt|st|type r|amg|m)/i.test(trimRaw)) {
        trimBucket = "performance";
      } else if (/(limited|platinum|touring|luxury|signature|premier)/i.test(trimRaw)) {
        trimBucket = "premium";
      } else if (/(base|standard|lx|le|s)/i.test(trimRaw)) {
        trimBucket = "base";
      } else {
        trimBucket = "mid";
      }
    }

    return {
      vehicleProfile: {
        year: Number(decoded.ModelYear),
        make: decoded.Make,
        model: decoded.Model,
        trimBucket,
        // mileage intentionally omitted in MVP unless user provides it later
      },
    };
  } catch (err) {
    console.error("❌ VIN decode failed:", err);
    return {
      error: "VIN decoding service unavailable",
      vehicleProfile: null,
    };
  }
}

module.exports = { getAllVehicleData };
