// api/services/vehicleData.js
/**
 * Vehicle Data Resolver (NIC_v2)
 * ---------------------------------------
 * Purpose:
 * - Resolve vehicleProfile from VIN OR dropdown metadata
 * - VIN is optional enrichment, not required
 * - No pricing
 * - No scraping
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
  const makeUpper = (make || "").toUpperCase();
  const modelUpper = (model || "").toUpperCase();
  const trimUpper = (trimRaw || "").toUpperCase();

  const exoticBrands = [
    "FERRARI",
    "LAMBORGHINI",
    "MCLAREN",
    "ASTON MARTIN",
    "BENTLEY",
    "ROLLS-ROYCE",
  ];

  const performanceBrands = [
    "PORSCHE",
    "CORVETTE",
    "LOTUS",
  ];

  const luxuryBrands = [
    "BMW",
    "MERCEDES-BENZ",
    "AUDI",
    "LEXUS",
    "ACURA",
    "INFINITI",
    "GENESIS",
    "JAGUAR",
    "LAND ROVER",
  ];

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
// Trim tier normalization
// ----------------------------
function normalizeTrimTier(raw) {
  if (!raw) return "mid";
  const t = raw.toString().toLowerCase();

  if (/(performance|sport|gt|type r|amg|m)/i.test(t)) return "performance";
  if (/(limited|platinum|touring|luxury|signature|premier)/i.test(t)) return "premium";
  if (/(base|standard|lx|le|s)/i.test(t)) return "base";

  return "mid";
}

// ----------------------------
// MAIN resolver (VIN OR metadata)
// ----------------------------
async function getAllVehicleData(input = {}) {
  /**
   * input can be:
   * - string VIN
   * - { vin, year, make, model, segment, trimTier, mileage }
   */

  // ----------------------------
  // Case 1: input is VIN string
  // ----------------------------
  if (typeof input === "string") {
    const vin = input.trim().toUpperCase();

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

      const trimTier = normalizeTrimTier(decoded.Trim);
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
          segment: null, // can be filled later by dropdown logic
          trimTier,
          vehicleClass,
          vin,
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

  // ----------------------------
  // Case 2: input is metadata object (dropdown flow)
  // ----------------------------
  const {
    vin,
    year,
    make,
    model,
    segment,
    trimTier,
  } = input || {};

  if (!year || !make || !model) {
    return {
      error: "Insufficient vehicle data",
      vehicleProfile: null,
    };
  }

  const normalizedTrim = normalizeTrimTier(trimTier);
  const vehicleClass = resolveVehicleClass(make, model, trimTier);

  return {
    vehicleProfile: {
      year: Number(year),
      make,
      model,
      segment: segment || null,
      trimTier: normalizedTrim,
      vehicleClass,
      vin: typeof vin === "string" ? vin.trim().toUpperCase() : null,
    },
  };
}

module.exports = { getAllVehicleData };
