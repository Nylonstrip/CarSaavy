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

// ----------------------------
// VIN validation
// ----------------------------
function isValidVinFormat(vin) {
  if (!vin || typeof vin !== "string") return false;
  const v = vin.trim().toUpperCase();
  if (v.length !== 17) return false;
  if (/[IOQ]/.test(v)) return false;
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v);
}

// ----------------------------
// NHTSA decode
// ----------------------------
async function decodeVin(vin) {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended/${vin}?format=json`;
  const res = await axios.get(url, { timeout: 8000 });
  return res.data && res.data.Results && res.data.Results[0];
}

// ----------------------------
// Vehicle class resolution
// ----------------------------
function resolveVehicleClass(make, model, trimRaw) {
  const makeUpper = make.toUpperCase();
  const modelUpper = model.toUpperCase();
  const trimUpper = (trimRaw || "").toUpperCase();

  // Exotic / specialty brands
  const exoticBrands = [
    "FERRARI",
    "LAMBORGHINI",
    "MCLAREN",
    "ASTON MARTIN",
    "BENTLEY",
    "ROLLS-ROYCE"
  ];

  // Performance / enthusiast brands
  const performanceBrands = [
    "PORSCHE",
    "CORVETTE",
    "LOTUS"
  ];

  // Luxury brands
  const luxuryBrands = [
    "BMW",
    "MERCEDES-BENZ",
    "AUDI",
    "LEXUS",
    "ACURA",
    "INFINITI",
    "GENESIS",
    "JAGUAR",
    "LAND ROVER"
  ];

  // Trim / model escalation keywords
  const exoticKeywords = /(SPYDER|HYPERCAR)/i;
  const performanceKeywords = /(GT|RS|TURBO|Z06|ZR1|TYPE R|TRACK|PERFORMANCE)/i;

  if (exoticBrands.includes(makeUpper) || exoticKeywords.test(trimUpper)) {
    return "exotic";
  }

  if (
    performanceBrands.includes(makeUpper) ||
    performanceKeywords.test(trimUpper)
  ) {
    return "performance";
  }

  if (luxuryBrands.includes(makeUpper)) {
    return "luxury";
  }

  return "standard";
}

// ----------------------------
// Main resolver
// ----------------------------
async function getAllVehicleData(vin) {
  if (!isValidVinFormat(vin)) {
    return {
      error: "Invalid VIN format",
      vehicleProfile: null
    };
  }

  try {
    console.log("🔍 Decoding VIN (NHTSA):", vin);

    const decoded = await decodeVin(vin);

    if (!decoded || !decoded.Make || !decoded.Model || !decoded.ModelYear) {
      return {
        error: "Unable to resolve vehicle from VIN",
        vehicleProfile: null
      };
    }

    // ----------------------------
    // Trim bucketing (kept)
    // ----------------------------
    let trimBucket = null;
    const trimRaw = decoded.Trim || "";

    if (trimRaw) {
      const t = trimRaw.toLowerCase();
      if (/(sport|performance|gt|st|type r|amg|m)/i.test(t)) {
        trimBucket = "performance";
      } else if (/(limited|platinum|touring|luxury|signature|premier)/i.test(t)) {
        trimBucket = "premium";
      } else if (/(base|standard|lx|le|s)/i.test(t)) {
        trimBucket = "base";
      } else {
        trimBucket = "mid";
      }
    }

    // ----------------------------
    // NEW: vehicle class
    // ----------------------------
    const vehicleClass = resolveVehicleClass(
      decoded.Make,
      decoded.Model,
      decoded.Trim
    );

    return {
      vehicleProfile: {
        year: Number(decoded.ModelYear),
        make: decoded.Make,
        model: decoded.Model,
        trimBucket,
        vehicleClass
      }
    };
  } catch (err) {
    console.error("❌ VIN decode failed:", err);
    return {
      error: "VIN decoding service unavailable",
      vehicleProfile: null
    };
  }
}

module.exports = { getAllVehicleData };
