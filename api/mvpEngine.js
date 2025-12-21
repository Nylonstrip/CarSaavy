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

function getSegmentProfile(segment) {
  const seg = normalizeStr(segment) || "general";

  if (SegmentProfiles[seg] && typeof SegmentProfiles[seg] === "object") {
    return SegmentProfiles[seg];
  }

  switch (seg) {
    case "performance":
      return {
        category: "discretionary",
        demandVolatility: "high",
        sellerFlexibility: "moderate",
        dealerNarrative: "emotion-driven pricing",
        leverageAngles: ["timing", "inspection risk", "cross-shopping"],
      };

    case "luxury":
      return {
        category: "discretionary",
        demandVolatility: "medium",
        sellerFlexibility: "moderate",
        dealerNarrative: "condition-sensitive pricing",
        leverageAngles: ["inspection risk", "ownership cost framing", "timing"],
      };

    case "economy":
      return {
        category: "practical",
        demandVolatility: "low",
        sellerFlexibility: "moderate",
        dealerNarrative: "high-competition pricing",
        leverageAngles: ["cross-shopping", "timing", "fees"],
      };

    default:
      return {
        category: "general",
        demandVolatility: "medium",
        sellerFlexibility: "moderate",
        dealerNarrative: "standard retail pricing",
        leverageAngles: ["inspection risk", "cross-shopping", "timing"],
      };
  }
}

function deriveTrimLeverage(trimTier) {
  switch (trimTier) {
    case "base":
      return {
        trimTier: "base",
        negotiability: "moderate",
        notes: [
          "Base trims are typically easier to cross-shop, increasing buyer leverage.",
          "Focus on fees, add-ons, and inspection findings to create movement.",
        ],
      };

    case "premium":
      return {
        trimTier: "premium",
        negotiability: "lower",
        notes: [
          "Premium trims often have fewer direct substitutes.",
          "Leverage comes primarily from inspection findings and timing.",
        ],
      };

    case "performance":
      return {
        trimTier: "performance",
        negotiability: "moderate",
        notes: [
          "Performance trims are often priced with emotion baked in.",
          "Inspection risk and timing are key leverage points.",
        ],
      };

    case "mid":
    default:
      return {
        trimTier: "mid",
        negotiability: "high",
        notes: [
          "Mid-tier trims are typically the most negotiable.",
          "Cross-shopping and timing are strong leverage angles.",
        ],
      };
  }
}

function deriveDepreciationLeverage({ year, ageTier }) {
  const points = [];

  points.push(
    "Vehicles depreciate over time regardless of condition; timing influences seller flexibility."
  );

  if (year) {
    points.push(
      "As vehicles move further past their model year, pricing pressure typically increases, especially when buyers can cross-shop newer inventory."
    );
  }

  if (ageTier?.label === "current" || ageTier?.label === "newer") {
    points.push(
      "Newer vehicles are often priced optimistically; negotiation improves when focusing on inspection certainty and total out-the-door cost."
    );
  } else if (ageTier?.label === "mid") {
    points.push(
      "Mid-age vehicles are commonly negotiated based on condition, service history, and wear items such as tires and brakes."
    );
  } else if (ageTier?.label === "older") {
    points.push(
      "Older vehicles benefit strongly from inspection leverage, where minor findings can justify meaningful concessions."
    );
  }

  return {
    timingPressure: ageTier?.label || "unknown",
    leveragePoints: points,
  };
}

function buildConditionLeverage({
  year,
  make,
  model,
  mileage,
  segment,
  vehicleClass,
}) {
  const points = [];

  points.push(
    "Vehicle condition remains one of the strongest negotiation levers regardless of market conditions."
  );

  if (mileage !== null) {
    points.push(
      "Mileage relative to age can influence inspection risk and future maintenance expectations."
    );
  }

  if (year !== null) {
    points.push(
      "Wear items such as tires, brakes, and suspension components should be evaluated during inspection."
    );
  }

  if (segment === "performance" || segment === "luxury") {
    points.push(
      "Higher-performance or premium vehicles can carry elevated repair costs, increasing inspection-based leverage."
    );
  }

  if (vehicleClass) {
    points.push(
      "Vehicle usage patterns and prior ownership context may affect condition-related negotiation leverage."
    );
  }

  return {
    leverageType: "condition",
    notes: points,
    inspectionFocus: [
      "Tires and brakes",
      "Suspension and alignment",
      "Service records",
      "Warning lights or codes",
    ],
  };
}

function buildNegotiationScripts({
  segmentProfile,
  trimLeverage,
  ageTier,
  mileageTier,
  askingPrice,
}) {
  const scripts = [];

  scripts.push(
    "I’m interested in the vehicle, but I want to make sure the price reflects its condition, age, and current market alternatives."
  );

  if (ageTier?.label === "older") {
    scripts.push(
      "Given the vehicle’s age, I’ll need to factor in future maintenance and inspection findings."
    );
  }

  if (trimLeverage?.negotiability === "high") {
    scripts.push(
      "This trim level is widely available, so I’m comparing several similar options."
    );
  }

  if (askingPrice !== null) {
    scripts.push(
      "Before moving forward, I’d like to understand how this price compares to similar listings I’m considering."
    );
  }

  return scripts;
}

function deriveNegotiationZones({ hasAskingPrice }) {
  if (!hasAskingPrice) {
    return {
      strategy: "discovery",
      notes: [
        "Without a listed asking price, focus on information gathering before anchoring.",
        "Let the seller reveal expectations first to avoid overcommitting.",
      ],
    };
  }

  return {
    strategy: "anchored",
    notes: [
      "With an asking price established, negotiation should focus on justification and leverage.",
      "Use condition, age, and cross-shopping to create downward pressure.",
    ],
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

  // Normalize primitives
  const year = num(vp.year);
  const make = normalizeStr(vp.make);
  const model = normalizeStr(vp.model);
  const mileage = num(vp.mileage);

  // Segment + trim
  const trimTier = normalizeTrimTier(vp.trimTier);
  const segment = deriveSegment(vp);
  const segmentProfile = getSegmentProfile(segment);
  const trimLeverage = deriveTrimLeverage(trimTier);

  // Core tiers
  const modelKey = getModelKey({ make, model });
  const ageTier = getAgeTier(year);
  const mileageTier = getMileageTier(mileage, year);

  // Ownership & pricing context
  const ownership = deriveOwnershipOutlook(modelKey);
  const askingPrice = input.askingPrice ?? input.price ?? null;
  const hasAskingPrice = num(askingPrice) !== null;

  // Depreciation & condition leverage
  const depreciationLeverage = deriveDepreciationLeverage({ year, ageTier });

  const conditionLeverage = buildConditionLeverage({
    year,
    make,
    model,
    mileage,
    segment,
    vehicleClass: vp.vehicleClass,
  });

  // Negotiation mechanics
  const negotiationScripts = buildNegotiationScripts({
    segmentProfile,
    trimLeverage,
    ageTier,
    mileageTier,
    askingPrice,
  });

  const negotiationZones = deriveNegotiationZones({ hasAskingPrice });

  // Final payload
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

    // 🔹 Negotiation intelligence
    segmentProfile,
    trimLeverage,
    ownership,
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
      hasAskingPrice,
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
