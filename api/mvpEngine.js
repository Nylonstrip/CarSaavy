// api/mvpEngine.js
/**
 * CarSaavy Negotiation Intelligence Core (NIC_v2)
 * ------------------------------------------------------------
 * Goals:
 * - No scraping
 * - No comparables
 * - No dealer profiling
 * - No "true value" or walk-away dollar math
 * - Generate defensible, say-it-out-loud negotiation leverage
 *
 * Inputs (backward compatible):
 * - New: { vehicleProfile: { year, make, model, segment, trimTier, mileage?, vin? }, askingPrice? }
 * - Legacy: { year, make, model, trim, trimBucket, mileage, price, vin, vehicleClass }
 */

const staticData = safeRequire("./staticData");

// Optional static tables (safe defaults if missing)
const ModelReliabilityScores = staticData.ModelReliabilityScores || {};
const KnownIssueFlags = staticData.KnownIssueFlags || {};
const MakeNotes = staticData.MakeNotes || {}; // optional
const SegmentProfiles = staticData.SegmentProfiles || {}; // optional
const ModelSegmentMap = staticData.ModelSegmentMap || {}; // optional (e.g., {"FORD MUSTANG": "performance"})

// -------------------------------
// Utilities
// -------------------------------
function safeRequire(p) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
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

function clamp(n, min, max) {
  if (typeof n !== "number") return min;
  return Math.min(max, Math.max(min, n));
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
// Tier helpers
// -------------------------------
function getModelKey(vehicleProfile = {}) {
  const make = normalizeStr(vehicleProfile.make);
  const model = normalizeStr(vehicleProfile.model);
  if (!make || !model) return null;
  return `${make} ${model}`;
}

function getAgeTier(year) {
  const y = num(year);
  if (!y) return { label: null, age: null };

  const currentYear = new Date().getFullYear();
  const age = Math.max(0, currentYear - y);

  if (age <= 1) return { label: "current", age }; // 0–1 years old
  if (age <= 3) return { label: "newer", age };   // 2–3
  if (age <= 7) return { label: "mid", age };     // 4–7
  return { label: "older", age };                 // 8+
}

function getMileageTier(mileage, year) {
  const m = num(mileage);
  if (m === null) return { label: "unknown", mileage: null };

  const ageTier = getAgeTier(year);
  const age = ageTier.age;

  // If year is unknown, classify purely by mileage
  if (!age && age !== 0) {
    if (m < 30000) return { label: "low", mileage: m };
    if (m < 90000) return { label: "average", mileage: m };
    return { label: "high", mileage: m };
  }

  // Expected miles: ~12k/year national average (rough framing only)
  const expected = age * 12000;
  const ratio = expected > 0 ? m / expected : 1;

  if (ratio <= 0.75) return { label: "low", mileage: m };
  if (ratio >= 1.25) return { label: "high", mileage: m };
  return { label: "average", mileage: m };
}

// -------------------------------
// Ownership outlook mapping (qualitative only)
// -------------------------------
function deriveOwnershipOutlook(modelKey) {
  const r = typeof ModelReliabilityScores[modelKey] === "number"
    ? ModelReliabilityScores[modelKey]
    : null;

  // Conservative defaults (avoid over-claiming)
  if (r === null) {
    return {
      reliability: "average",
      maintenance: "moderate",
      reliabilityScore: null,
      ownershipNotes: [
        "Ownership expectations vary by maintenance history and driving conditions.",
        "Use service records and an inspection to confirm condition and risk.",
      ],
    };
  }

  if (r >= 8.5) {
    return {
      reliability: "strong",
      maintenance: "low",
      reliabilityScore: r,
      ownershipNotes: [
        "This model is generally viewed as more reliable than many peers.",
        "Strong service history still matters—verify maintenance records.",
      ],
    };
  }
  if (r >= 7.0) {
    return {
      reliability: "strong",
      maintenance: "moderate",
      reliabilityScore: r,
      ownershipNotes: [
        "This model generally holds up well with normal maintenance.",
        "Confirm service intervals and any common wear items during inspection.",
      ],
    };
  }
  if (r >= 5.5) {
    return {
      reliability: "average",
      maintenance: "moderate",
      reliabilityScore: r,
      ownershipNotes: [
        "Ownership costs are typically manageable with consistent maintenance.",
        "Inspection and service history are key negotiation levers.",
      ],
    };
  }
  return {
    reliability: "variable",
    maintenance: "high",
    reliabilityScore: r,
    ownershipNotes: [
      "This model can be more sensitive to maintenance and condition.",
      "Use inspection findings and service gaps to negotiate price or concessions.",
    ],
  };
}

// -------------------------------
// Segment profiles (static, negotiation-focused)
// -------------------------------
function deriveSegment(vehicleProfile = {}) {
  // Priority: explicit segment -> map -> fallback by vehicleClass -> default
  const explicit = normalizeStr(vehicleProfile.segment);
  if (explicit) return explicit;

  const modelKey = getModelKey(vehicleProfile);
  const mapped = modelKey ? ModelSegmentMap[normalizeUpper(modelKey)] : null;
  if (mapped) return mapped;

  const vc = normalizeStr(vehicleProfile.vehicleClass);
  if (vc) return vc;

  return "default";
}

function getSegmentProfile(segment) {
  const seg = normalizeStr(segment) || "default";

  // Allow custom overrides from staticData if you add later
  if (SegmentProfiles[seg] && typeof SegmentProfiles[seg] === "object") {
    return SegmentProfiles[seg];
  }

  // Safe internal defaults (do not over-claim)
  // These are negotiation behavior profiles, not market data assertions.
  switch (seg) {
    case "performance":
      return {
        category: "discretionary",
        demandVolatility: "high",
        sellerFlexibility: "moderate",
        dealerNarrative: "emotion + excitement pricing",
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
    case "truck":
      return {
        category: "utility",
        demandVolatility: "medium",
        sellerFlexibility: "lower",
        dealerNarrative: "utility demand pricing",
        leverageAngles: ["inspection risk", "usage wear", "timing"],
      };
    case "economy":
      return {
        category: "practical",
        demandVolatility: "low",
        sellerFlexibility: "moderate",
        dealerNarrative: "high-competition commodity pricing",
        leverageAngles: ["cross-shopping", "timing", "fees/add-ons"],
      };
    case "suv":
      return {
        category: "practical",
        demandVolatility: "medium",
        sellerFlexibility: "moderate",
        dealerNarrative: "family utility pricing",
        leverageAngles: ["cross-shopping", "inspection risk", "timing"],
      };
    case "ev":
    case "hybrid":
      return {
        category: "technology",
        demandVolatility: "medium",
        sellerFlexibility: "moderate",
        dealerNarrative: "range/battery condition sensitivity",
        leverageAngles: ["inspection risk", "warranty/battery questions", "timing"],
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

function normalizeTrimTier(v) {
  const s = normalizeStr(v).toLowerCase();
  if (!s) return "mid"; // safe default for MVP

  if (s === "base" || s === "entry" || s === "standard") return "base";
  if (s === "mid" || s === "middle") return "mid";
  if (s === "premium" || s === "high" || s === "limited" || s === "lux") return "premium";
  if (s === "performance" || s === "sport" || s === "special") return "performance";

  // If callers pass OEM trim names, bucket them conservatively as "mid"
  return "mid";
}

function deriveTrimLeverage(trimTier) {
  // Negotiation framing only—no claims about exact market pricing.
  switch (trimTier) {
    case "base":
      return {
        trimTier: "base",
        negotiability: "moderate",
        notes: [
          "Base trims are typically easier to cross-shop, which can improve buyer leverage.",
          "Focus on fees, add-ons, and inspection findings to create movement.",
        ],
      };
    case "premium":
      return {
        trimTier: "premium",
        negotiability: "lower",
        notes: [
          "Premium trims can have fewer direct substitutes, which may reduce flexibility.",
          "Leverage comes primarily from inspection risk and timing rather than aggressive anchoring.",
        ],
      };
    case "performance":
      return {
        trimTier: "performance",
        negotiability: "moderate",
        notes: [
          "Performance trims are often priced with emotion baked in.",
          "Use inspection risk and timing to shift the conversation back to rational terms.",
        ],
      };
    case "mid":
    default:
      return {
        trimTier: "mid",
        negotiability: "high",
        notes: [
          "Mid-tier trims are often the most negotiable: not rare enough to be firm, not basic enough to be commodity-only.",
          "Cross-shopping and timing are your strongest leverage angles.",
        ],
      };
  }
}

// -------------------------------
// Depreciation & timing leverage (non-numeric, defensible)
// -------------------------------
function deriveDepreciationLeverage({ year, ageTier }) {
  const y = num(year);
  const age = ageTier?.age;

  const points = [];
  points.push("Vehicles face ongoing depreciation regardless of condition; timing affects seller flexibility.");

  if (y) {
    // Calendar-year framing: no numbers, no false precision.
    points.push("As vehicles move further past their model year, pricing pressure typically increases, especially when buyers can cross-shop newer inventory.");
  }

  if (age === 0) {
    points.push("Near-new vehicles can carry firmer pricing, but dealers still respond to inspection certainty and fee transparency.");
  } else if (ageTier?.label === "current" || ageTier?.label === "newer") {
    points.push("Newer vehicles are often priced optimistically early; negotiation improves when you shift the focus to inspection risk and total out-the-door cost.");
  } else if (ageTier?.label === "mid") {
    points.push("Mid-age vehicles are commonly negotiated based on condition, tires/brakes, and service history. Use inspection to create price movement.");
  } else if (ageTier?.label === "older") {
    points.push("Older vehicles benefit strongly from inspection leverage. Small findings can justify meaningful concessions or repairs.");
  }

  return {
    timingPressure: ageTier?.label || "unknown",
    leveragePoints: points,
  };
}

// -------------------------------
// Condition advisory (leveraged, say-it-out-loud capable)
// -------------------------------
function buildConditionLeverage(vehicleProfile = {}) {
  const year = num(vehicleProfile.year);
  const mileage = num(vehicleProfile.mileage);
  const ageTier = getAgeTier(year);
  const mileageTier = getMileageTier(mileage, year);

  const points = [];
  points.push("Dealer pricing assumes the vehicle is in strong condition until inspection introduces uncertainty.");
  points.push("Use inspection timing to avoid committing to a number before risk is known.");

  if (mileageTier.label === "high") {
    points.push("Higher mileage increases wear risk; service records and inspection findings become stronger negotiation levers.");
  } else if (mileageTier.label === "low") {
    points.push("Low mileage can support stronger pricing, but condition and maintenance history still matter—verify both.");
  } else if (mileageTier.label === "unknown") {
    points.push("If mileage is unknown or unverified, treat it as a risk factor until confirmed.");
  }

  if (ageTier.label === "older") {
    points.push("For older vehicles, request an itemized condition review (tires, brakes, fluids, battery) and use any findings to negotiate.");
  }

  // Known issues (model-level, not condition-specific)
  const modelKey = getModelKey(vehicleProfile);
  const known = modelKey ? KnownIssueFlags[modelKey] : null;
  const knownIssues = [];

  if (Array.isArray(known) && known.length) {
    for (const issue of known.slice(0, 6)) knownIssues.push(issue);
  }

  return {
    ageTier,
    mileageTier,
    leveragePoints: points,
    knownIssues,
  };
}

// -------------------------------
// Negotiation scripts (the product)
// -------------------------------
function buildNegotiationScripts({ segmentProfile, trimLeverage, ageTier, mileageTier, askingPrice }) {
  const hasAskingPrice = num(askingPrice) !== null;

  // Core lines: safe across all vehicles
  const scripts = {
    opener: "I’m not here to argue your price — I just want to make sure it reflects the actual risk and timing on this vehicle.",
    inspectionDelay: "Your price assumes everything checks out perfectly. I’m comfortable moving forward once we confirm condition and history.",
    feesPivot: "Before we talk numbers, can we confirm the full out-the-door breakdown (fees, add-ons, and any required packages)?",
    softCounterSetup: "If we account for timing and inspection risk, I think there’s room to land somewhere more reasonable.",
  };

  // Segment-aware phrasing (still conservative)
  if (segmentProfile?.category === "discretionary") {
    scripts.categoryFrame = "This is a discretionary purchase for me, so I’m cross-shopping hard and I’m not in a rush if the numbers don’t make sense.";
  } else if (segmentProfile?.category === "utility") {
    scripts.categoryFrame = "I’m buying this for utility, so condition and total cost matter more to me than anything else.";
  } else {
    scripts.categoryFrame = "I’m comparing a few similar options, so I want the deal to reflect the real condition and total cost.";
  }

  // Age & mileage reinforcement lines
  if (ageTier?.label === "older") {
    scripts.ageFrame = "On an older vehicle, inspection findings are the difference between a fair deal and an expensive surprise.";
  } else if (ageTier?.label === "mid") {
    scripts.ageFrame = "For a vehicle in this age range, tires, brakes, and service history tend to drive the real cost — that’s what I’m pricing in.";
  } else {
    scripts.ageFrame = "Even on newer vehicles, I factor in timing and verify condition before paying top-of-market terms.";
  }

  if (mileageTier?.label === "high") {
    scripts.mileageFrame = "With higher mileage, service records and inspection carry more weight. I price based on what we can verify.";
  } else if (mileageTier?.label === "low") {
    scripts.mileageFrame = "Low mileage helps, but I still want to verify maintenance and condition before agreeing to the final number.";
  } else {
    scripts.mileageFrame = "Mileage verification and condition checks will guide what I’m comfortable paying.";
  }

  // Trim-tier leaning (negotiation posture)
  if (trimLeverage?.negotiability === "high") {
    scripts.trimFrame = "I’m seeing plenty of similar options in this trim tier, so I’m looking for the cleanest total deal.";
  } else if (trimLeverage?.negotiability === "lower") {
    scripts.trimFrame = "I understand this trim can command more, but condition and total out-the-door cost still have to make sense.";
  } else {
    scripts.trimFrame = "I’m open to this trim at the right number, especially if the condition checks out cleanly.";
  }

  // Asking-price aware nudge (no math comparisons)
  if (hasAskingPrice) {
    scripts.askingPriceFrame = "I see your asking price — my goal is to understand what flexibility exists once we confirm condition and the full out-the-door number.";
  } else {
    scripts.askingPriceFrame = "Once we confirm condition and the out-the-door breakdown, I can make a clear and fair offer.";
  }

  return scripts;
}

// -------------------------------
// Pricing posture / zones (non-numeric)
// -------------------------------
function deriveNegotiationZones({ hasAskingPrice }) {
  // No numbers. These are conversation zones.
  return {
    zones: [
      {
        label: "Dealer-Optimistic",
        meaning: "Initial asking terms before inspection risk, fees, and timing pressure are discussed.",
      },
      {
        label: "Market-Adjusted",
        meaning: "Pricing posture after inspection risk and out-the-door breakdown are acknowledged.",
      },
      {
        label: "Buyer-Favorable",
        meaning: "Applies when inspection findings, service gaps, or add-ons materially increase risk or cost.",
      },
    ],
    note: hasAskingPrice
      ? "Use inspection timing + out-the-door clarity to shift from Dealer-Optimistic to Market-Adjusted."
      : "Start with inspection timing + out-the-door clarity before naming a number.",
  };
}

// -------------------------------
// MAIN: buildMvpAnalysis (backward compatible)
// -------------------------------
function buildMvpAnalysis(input = {}) {
  /**
   * Backward-compatible input handling:
   * - New: { vehicleProfile: {year, make, model, segment, trimTier, mileage?, vin?}, askingPrice? }
   * - Legacy callers: { year, make, model, trim, trimBucket, vehicleClass, mileage, price, vin }
   */
  const vp = input.vehicleProfile || {
    year: input.year,
    make: input.make,
    model: input.model,
    segment: input.segment,
    trimTier: input.trimTier,
    trimBucket: input.trimBucket || input.trim || null,
    vehicleClass: input.vehicleClass || null,
    mileage: input.mileage,
    vin: input.vin,
  };

  const year = num(vp.year);
  const make = normalizeStr(vp.make);
  const model = normalizeStr(vp.model);
  const mileage = num(vp.mileage);

  const segment = deriveSegment(vp);
  const segmentProfile = getSegmentProfile(segment);

  const trimTier = normalizeTrimTier(vp.trimTier || vp.trimBucket || vp.trim);
  const trimLeverage = deriveTrimLeverage(trimTier);

  const modelKey = getModelKey({ make, model });
  const ageTier = getAgeTier(year);
  const mileageTier = getMileageTier(mileage, year);

  const askingPrice = input.askingPrice ?? input.price ?? null;
  const hasAskingPrice = num(askingPrice) !== null;

  const ownership = deriveOwnershipOutlook(modelKey);

  const depreciationLeverage = deriveDepreciationLeverage({ year, ageTier });
  const conditionLeverage = buildConditionLeverage({
    year,
    make,
    model,
    mileage,
    segment,
    vehicleClass: vp.vehicleClass,
  });

  const negotiationScripts = buildNegotiationScripts({
    segmentProfile,
    trimLeverage,
    ageTier,
    mileageTier,
    askingPrice,
  });

  const negotiationZones = deriveNegotiationZones({ hasAskingPrice });

  // Optional: small “highlights” list for the PDF
  const highlights = [];
  highlights.push(`Segment profile: ${normalizeStr(segmentProfile.category) || "general"}`);
  highlights.push(`Trim tier: ${trimTier}`);
  if (ageTier.label) highlights.push(`Age tier: ${ageTier.label}`);
  if (mileageTier.label) highlights.push(`Mileage tier: ${mileageTier.label}`);
  if (ownership.reliability) highlights.push(`Ownership outlook: ${ownership.reliability} reliability, ${ownership.maintenance} maintenance`);

  // Optional: make-level notes (if you ever add them)
  const makeNote = MakeNotes[normalizeUpper(make)] || null;

  // Return: new contract + legacy-friendly fields
  return {
    // New contract (preferred)
    vehicleProfile: {
      year,
      make,
      model,
      segment,
      trimTier,
      vinMasked: maskVin(input.vin || vp.vin || ""),
      mileage: mileage === null ? null : mileage,
    },

    negotiationProfile: {
      segmentCategory: segmentProfile.category,
      demandVolatility: segmentProfile.demandVolatility,
      sellerFlexibility: segmentProfile.sellerFlexibility,
      leverageAngles: Array.isArray(segmentProfile.leverageAngles) ? segmentProfile.leverageAngles : [],
      trimNegotiability: trimLeverage.negotiability,
    },

    depreciationLeverage,

    conditionLeverage,

    ownershipOutlook: {
      reliability: ownership.reliability,
      maintenance: ownership.maintenance,
      notes: ownership.ownershipNotes || [],
    },

    negotiationScripts,

    negotiationZones,

    context: {
      hasAskingPrice,
      askingPrice: hasAskingPrice ? num(askingPrice) : null, // keep numeric if provided
      makeNote,
    },

    highlights,

    modelVersion: "NIC_v2",

    // ---------------------------
    // Legacy fields (keep safe defaults while other files are refactored)
    // ---------------------------
    modelKey,
    reliabilityScore: ownership.reliabilityScore || null,

    // Pricing-related legacy fields (deprecated)
    estimatedValue: null,
    minPrice: null,
    maxPrice: null,
    pricePositioning: null,
    pricingConfidenceScore: null,

    // Old market fields (deprecated)
    marketContext: null,
    marketStrengthScore: null,

    // Feature / listing / dealer fields (not in MVP)
    dealerProfile: null,
    featureAnalysis: null,
    negotiationPlan: null,
    comparables: [],
  };
}

module.exports = {
  buildMvpAnalysis,

  // Keep helpers exported in case other files reference them
  getModelKey,
  getAgeTier,
  getMileageTier,

  // Expose a couple useful internal helpers (optional)
  normalizeTrimTier,
  deriveSegment,
};
