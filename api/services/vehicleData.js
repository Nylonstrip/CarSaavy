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

  // Normalize object inputs (so empty strings become null-ish)
  const asObj = typeof input === "object" && input !== null ? input : null;

  // ----------------------------
  // Helper: build profile from decoded VIN
  // ----------------------------
  function profileFromDecoded(decoded, vin) {
    const trimTier = normalizeTrimTier(decoded.Trim);
    const vehicleClass = resolveVehicleClass(decoded.Make, decoded.Model, decoded.Trim);

    return {
      year: Number(decoded.ModelYear),

      // Presentation-safe casing
      make: decoded.Make
        ? decoded.Make.charAt(0).toUpperCase() + decoded.Make.slice(1).toLowerCase()
        : null,

      model: decoded.Model
        ? decoded.Model.charAt(0).toUpperCase() + decoded.Model.slice(1).toLowerCase()
        : null,

      // Safe segment inference
      segment:
        vehicleClass === "performance"
          ? "performance"
          : vehicleClass === "luxury"
          ? "luxury"
          : "general",

      trimTier,
      vehicleClass,
      vin,
    };
  }

  // ----------------------------
  // Case 1: input is VIN string
  // ----------------------------
  if (typeof input === "string") {
    const vin = input.trim().toUpperCase();

    if (!isValidVinFormat(vin)) {
      return { error: "Invalid VIN format", vehicleProfile: null };
    }

    try {
      console.log("🔍 Decoding VIN (NHTSA):", vin);
      const decoded = await decodeVin(vin);

      if (!decoded || !decoded.Make || !decoded.Model || !decoded.ModelYear) {
        return { error: "Unable to resolve vehicle from VIN", vehicleProfile: null };
      }
      

      return { vehicleProfile: profileFromDecoded(decoded, vin) };
    } catch (err) {
      console.error("❌ VIN decode failed:", err);
      return { error: "VIN decoding service unavailable", vehicleProfile: null };
    }
  }

  // ----------------------------
  // Case 2: input is metadata object (dropdown flow OR vin+partial)
  // ----------------------------
  const vin = typeof asObj?.vin === "string" ? asObj.vin.trim().toUpperCase() : null;

  // Treat empty strings as missing
  const year = asObj?.year ? String(asObj.year).trim() : "";
  const make = asObj?.make ? String(asObj.make).trim() : "";
  const model = asObj?.model ? String(asObj.model).trim() : "";

  const hasYMM = !!(year && make && model);
  const hasVin = !!(vin && isValidVinFormat(vin));

  // If we have a VIN and Y/M/M is missing, decode VIN and use it as the base profile
  if (hasVin && !hasYMM) {
    try {
      console.log("🔍 Decoding VIN (NHTSA):", vin);
      const decoded = await decodeVin(vin);

      if (!decoded || !decoded.Make || !decoded.Model || !decoded.ModelYear) {
        return { error: "Unable to resolve vehicle from VIN", vehicleProfile: null };
      }

      // Merge: decoded base + allow metadata overrides if present later
      const base = profileFromDecoded(decoded, vin);

      // If dropdown fields were provided, allow them to override (but only if non-empty)
      const merged = {
        ...base,
        segment: asObj?.segment ? String(asObj.segment).trim() : base.segment,
        trimTier: asObj?.trimTier ? normalizeTrimTier(asObj.trimTier) : base.trimTier,
        // mileage is optional and only present from form
        mileage: asObj?.mileage ? Number(String(asObj.mileage).replace(/[$,]/g, "")) : null,
      };

      return { vehicleProfile: merged };
    } catch (err) {
      console.error("❌ VIN decode failed:", err);
      return { error: "VIN decoding service unavailable", vehicleProfile: null };
    }
  }

  // Pure dropdown flow requires Y/M/M
  if (!hasYMM) {
    return { error: "Insufficient vehicle data", vehicleProfile: null };
  }

  const normalizedTrim = normalizeTrimTier(asObj?.trimTier);
  const vehicleClass = resolveVehicleClass(make, model, asObj?.trimTier);

  return {
    vehicleProfile: {
      year: Number(year),
      make,
      model,
      segment: asObj?.segment ? String(asObj.segment).trim() : "general",
      trimTier: normalizedTrim,
      vehicleClass,
      vin: hasVin ? vin : null,
      mileage: asObj?.mileage ? Number(String(asObj.mileage).replace(/[$,]/g, "")) : null,
    },
  };
}


module.exports = { getAllVehicleData };
