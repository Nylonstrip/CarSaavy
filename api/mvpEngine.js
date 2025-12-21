// api/mvpEngine.js
/**
 * CarSaavy Negotiation Intelligence Core (NIC_v2)
 * ------------------------------------------------------------
 * Stable, identity-bound, negotiation-focused engine.
 */

const staticData = safeRequire("./staticData");

// Optional static tables
const ModelReliabilityScores = staticData.ModelReliabilityScores || {};
const KnownIssueFlags = staticData.KnownIssueFlags || {};
const MakeNotes = staticData.MakeNotes || {};
const SegmentProfiles = staticData.SegmentProfiles || {};
const ModelSegmentMap = staticData.ModelSegmentMap || {};

// -------------------------------
// Utilities
// -------------------------------
function safeRequire(p) {
  try {
    return require(p);
  } catch {
    return {};
  }
}

function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function normalizeStr(v) {
  return (v || "").toString().trim();
}

function normalizeUpper(v) {
  return normalizeStr(v).toUpperCase();
}

function maskVin(vin) {
  const s = normalizeStr(vin);
  if (s.length < 6) return s || "N/A";
  return `${"*".repeat(Math.max(0, s.length - 6))}${s.slice(-6)}`;
}

// -------------------------------
// Identity helpers
// -------------------------------
function getModelKey(vp = {}) {
  const make = normalizeStr(vp.make);
  const model = normalizeStr(vp.model);
  if (!make || !model) return null;
  return `${make} ${model}`;
}

function getAgeTier(year) {
  const y = num(year);
  if (!y) return { label: null, age: null };
  const age = new Date().getFullYear() - y;
  if (age <= 1) return { label: "current", age };
  if (age <= 3) return { label: "newer", age };
  if (age <= 7) return { label: "mid", age };
  return { label: "older", age };
}

function getMileageTier(mileage, year) {
  const m = num(mileage);
  if (m === null) return { label: "unknown", mileage: null };
  const age = getAgeTier(year).age;
  if (!age && age !== 0) {
    if (m < 30000) return { label: "low", mileage: m };
    if (m < 90000) return { label: "average", mileage: m };
    return { label: "high", mileage: m };
  }
  const expected = age * 12000;
  const ratio = expected > 0 ? m / expected : 1;
  if (ratio <= 0.75) return { label: "low", mileage: m };
  if (ratio >= 1.25) return { label: "high", mileage: m };
  return { label: "average", mileage: m };
}

// -------------------------------
// Segment + trim logic
// -------------------------------
function deriveSegment(vp = {}) {
  if (vp.segment) return vp.segment;
  const modelKey = getModelKey(vp);
  if (modelKey && ModelSegmentMap[normalizeUpper(modelKey)]) {
    return ModelSegmentMap[normalizeUpper(modelKey)];
  }
  if (vp.vehicleClass) return vp.vehicleClass;
  return "general";
}

function normalizeTrimTier(v) {
  const s = normalizeStr(v).toLowerCase();
  if (!s) return "mid";
  if (["base", "entry", "standard"].includes(s)) return "base";
  if (["premium", "high", "limited", "lux"].includes(s)) return "premium";
  if (["performance", "sport"].includes(s)) return "performance";
  return "mid";
}

// -------------------------------
// Ownership outlook
// -------------------------------
function deriveOwnershipOutlook(modelKey) {
  const r = typeof ModelReliabilityScores[modelKey] === "number"
    ? ModelReliabilityScores[modelKey]
    : null;

  if (r === null) {
    return {
      reliability: "average",
      maintenance: "moderate",
      reliabilityScore: null,
      notes: [
        "Ownership expectations vary by maintenance history and inspection.",
      ],
    };
  }

  if (r >= 7.0) {
    return {
      reliability: "strong",
      maintenance: r >= 8.5 ? "low" : "moderate",
      reliabilityScore: r,
      notes: ["Generally reliable with proper maintenance."],
    };
  }

  return {
    reliability: "variable",
    maintenance: "high",
    reliabilityScore: r,
    notes: ["Inspection and service history are critical negotiation levers."],
  };
}

// -------------------------------
// MAIN ENGINE
// -------------------------------
function buildMvpAnalysis(input = {}) {
  // Canonical vehicle profile (identity-bound)
  const vp =
    input.vehicleProfile && typeof input.vehicleProfile === "object"
      ? input.vehicleProfile
      : {
          year: input.year ?? null,
          make: input.make ?? null,
          model: input.model ?? null,
          segment: input.segment ?? null,
          trimTier: input.trimTier ?? input.trimBucket ?? input.trim ?? null,
          mileage: input.mileage ?? null,
          vin: input.vin ?? null,
          vehicleClass: input.vehicleClass ?? null,
        };

  const year = num(vp.year);
  const make = normalizeStr(vp.make);
  const model = normalizeStr(vp.model);
  const mileage = num(vp.mileage);
  const trimTier = normalizeTrimTier(vp.trimTier);
  const segment = deriveSegment(vp);

  const modelKey = getModelKey({ make, model });
  const ageTier = getAgeTier(year);
  const mileageTier = getMileageTier(mileage, year);

  const ownership = deriveOwnershipOutlook(modelKey);
  const askingPrice = input.askingPrice ?? input.price ?? null;

  return {
    // 🔹 Core identity (used by PDF)
    vehicleSummary: {
      year: year ?? "N/A",
      make: make || "N/A",
      model: model || "N/A",
      segment,
      trimTier,
      mileage: mileage ?? "N/A",
      vinMasked: maskVin(vp.vin),
    },
  
    // 🔹 Core tiers
    ageTier,
    mileageTier,
  
    // 🔹 Negotiation intelligence (MUST be returned)
    segmentProfile,
    trimLeverage,
    ownership,                 // keep raw ownership object
    depreciationLeverage,
    conditionLeverage,
    negotiationScripts,
    negotiationZones,
  
    // 🔹 Presentation helpers
    highlights: [
      `Segment: ${segment}`,
      `Trim tier: ${trimTier}`,
      ageTier.label ? `Age tier: ${ageTier.label}` : null,
      mileageTier.label ? `Mileage tier: ${mileageTier.label}` : null,
    ].filter(Boolean),
  
    context: {
      hasAskingPrice: num(askingPrice) !== null,
      askingPrice: num(askingPrice),
      makeNote: MakeNotes[normalizeUpper(make)] || null,
    },
  
    modelVersion: "NIC_v2",
  };
  
}

module.exports = {
  buildMvpAnalysis,
  getModelKey,
  getAgeTier,
  getMileageTier,
  normalizeTrimTier,
  deriveSegment,
};
