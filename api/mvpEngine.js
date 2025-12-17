// api/mvpEngine.js
/**
 * CarSaavy Pricing Intelligence Core (PIC_v1)
 * ------------------------------------------------------------
 * MVP Rules:
 * - No scraping
 * - No dealer profiling
 * - No comparables
 * - No exact "opening offer / target deal price" math
 * - Asking price (optional) is used only for positioning + leverage context
 *
 * This module returns deterministic, model-first outputs that map
 * cleanly into the locked report outline.
 */

const staticData = safeRequire("./staticData");

// Optional static tables (safe defaults if missing)
const BaseVehicleSpecs = staticData.BaseVehicleSpecs || {};
const DepreciationCurves = staticData.DepreciationCurves || {};
const MileageAdjustment = staticData.MileageAdjustment || {};
const ModelReliabilityScores = staticData.ModelReliabilityScores || {};
const KnownIssueFlags = staticData.KnownIssueFlags || {};

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

  if (age <= 3) return { label: "newer", age };
  if (age <= 7) return { label: "mid", age };
  return { label: "older", age };
}

function getMileageTier(mileage, year) {
  const m = num(mileage);
  if (m === null) return { label: "unknown", mileage: null };

  // If year is known, use an age-based expected band
  const ageTier = getAgeTier(year);
  const age = ageTier.age;

  if (!age && age !== 0) {
    // fallback only by mileage
    if (m < 30000) return { label: "low", mileage: m };
    if (m < 90000) return { label: "average", mileage: m };
    return { label: "high", mileage: m };
  }

  const expected = age * 12000; // rough national average
  const ratio = expected > 0 ? m / expected : 1;

  if (ratio <= 0.75) return { label: "low", mileage: m };
  if (ratio >= 1.25) return { label: "high", mileage: m };
  return { label: "average", mileage: m };
}

// -------------------------------
// Ownership outlook mapping
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
    };
  }

  if (r >= 8.5) {
    return { reliability: "strong", maintenance: "low", reliabilityScore: r };
  }
  if (r >= 7.0) {
    return { reliability: "strong", maintenance: "moderate", reliabilityScore: r };
  }
  if (r >= 5.5) {
    return { reliability: "average", maintenance: "moderate", reliabilityScore: r };
  }
  return { reliability: "poor", maintenance: "high", reliabilityScore: r };
}

// -------------------------------
// Market context (static, model-first)
// -------------------------------
function deriveMarketContext({ modelKey, ageTier, mileageTier }) {
  // We keep this intentionally conservative.
  // If you later add true market data, this becomes PIC_v2, not v1.

  if (vehicleClass === "performance" || vehicleClass === "exotic") {
    return {
      position: "specialty-market",
      demandLevel: "niche",
      confidenceLevel: "medium",
      marketStrengthScore: 65,
    };
  }
  
  const spec = modelKey ? BaseVehicleSpecs[modelKey] : null;
  const segment = spec?.segment || "default";

  // Start from a simple baseline and nudge based on reliability + age + mileage.
  let score = 60;

  const r = typeof ModelReliabilityScores[modelKey] === "number"
    ? ModelReliabilityScores[modelKey]
    : null;

  if (r !== null) {
    // map ~5..10 to ~-5..+15
    score += (r - 6.5) * 4;
  }

  if (ageTier.label === "newer") score += 3;
  else if (ageTier.label === "older") score -= 3;

  if (mileageTier.label === "low") score += 3;
  else if (mileageTier.label === "high") score -= 4;

  // Segment nudges (very small in v1)
  if (segment === "luxury") score -= 1;
  if (segment === "truck") score += 1;

  score = clamp(Math.round(score), 35, 85);

  let demandLevel = "normal";
  if (score >= 75) demandLevel = "high";
  else if (score <= 50) demandLevel = "low";

  // Confidence is about model coverage in our tables (NOT data completeness from listings)
  let confidenceLevel = "medium";
  if (!modelKey || !spec) confidenceLevel = "low";
  if (spec && r !== null) confidenceLevel = "high";

  // "position" here is not asking-price based (that’s handled separately)
  // It’s the general market strength framing.
  let position = "fair";
  if (demandLevel === "high") position = "above-market";
  if (demandLevel === "low") position = "below-market";

  return {
    position,          // general market framing
    demandLevel,       // "low" | "normal" | "high"
    confidenceLevel,   // "low" | "medium" | "high"
    marketStrengthScore: score, // internal-friendly (optional to show)
  };
}

// -------------------------------
// Value estimation (static)
// -------------------------------
function getSegmentForModel(modelKey) {
  const spec = modelKey ? BaseVehicleSpecs[modelKey] : null;
  return spec?.segment || "default";
}

function getBaseValueForModel(modelKey) {
  const spec = modelKey ? BaseVehicleSpecs[modelKey] : null;
  if (!spec) return null;

  // Try common keys if you’ve been evolving this table
  const candidates = [spec.baseValue, spec.basePrice, spec.msrp, spec.msrpBase, spec.typicalValue];
  for (const c of candidates) {
    const n = num(c);
    if (n !== null) return n;
  }
  return null;
}

function depreciationFactor(segment, age) {
  const curve = DepreciationCurves[segment] || DepreciationCurves.default;

  // If curve is an array: index by age
  if (Array.isArray(curve) && curve.length) {
    const idx = clamp(age, 0, curve.length - 1);
    const f = num(curve[idx]);
    if (f !== null) return clamp(f, 0.08, 1.0);
  }

  // If curve is an object with numeric keys ("0","1","2"...)
  if (curve && typeof curve === "object") {
    const key = String(clamp(age, 0, 30));
    const f = num(curve[key]);
    if (f !== null) return clamp(f, 0.08, 1.0);
  }

  // Fallback: simple exponential-ish decay (conservative)
  // Year 0: 1.00, Year 5: ~0.62, Year 10: ~0.42
  const f = Math.pow(0.92, age);
  return clamp(f, 0.12, 1.0);
}

function mileageMultiplier(mileageTierLabel) {
  // If you have a table already, respect it—but treat it safely.
  // Your old table was used to modify discounts; here we use a multiplier.
  if (mileageTierLabel && MileageAdjustment[mileageTierLabel] !== undefined) {
    const adj = num(MileageAdjustment[mileageTierLabel]);
    // If adj is a small +/- (e.g., 0.05), interpret it as a ~5% impact.
    if (adj !== null) return clamp(1 - adj, 0.90, 1.08);
  }

  if (mileageTierLabel === "low") return 1.03;
  if (mileageTierLabel === "high") return 0.96;
  return 1.0;
}

function estimateValueRange(vehicleProfile = {}) {
  const year = num(vehicleProfile.year);
  const mileage = num(vehicleProfile.mileage);
  const modelKey = getModelKey(vehicleProfile);

  const ageTier = getAgeTier(year);
  const mileageTier = getMileageTier(mileage, year);

  const segment = getSegmentForModel(modelKey);
  const base = getBaseValueForModel(modelKey);

  // Vehicle class–aware fallback anchors (MVP-safe, conservative)
  let fallbackBase;
  switch (vehicleProfile.vehicleClass) {
    case "exotic":
      fallbackBase = 90000;
      break;
    case "performance":
      fallbackBase = 65000;
      break;
    case "luxury":
      fallbackBase = 42000;
      break;
    default:
      fallbackBase = segment === "truck" ? 36000 : 24000;
  }

const baseValue = base !== null ? base : fallbackBase;


  const age = ageTier.age !== null ? ageTier.age : 8;
  const dep = depreciationFactor(segment, age);
  const milMult = mileageMultiplier(mileageTier.label);

  // Midpoint estimate
  let midpoint = Math.round(baseValue * dep * milMult);

  // Guardrail: prevent absurd undervaluation when asking price is known
if (vehicleProfile.vehicleClass && vehicleProfile.vehicleClass !== "standard") {
  const ask = num(vehicleProfile.askingPrice);
  if (ask && midpoint < ask * 0.5) {
    midpoint = Math.round(ask * 0.7);
  }
}


  // Reliability nudge (small, conservative)
  const rel = typeof ModelReliabilityScores[modelKey] === "number" ? ModelReliabilityScores[modelKey] : null;
  if (rel !== null) {
    // maps ~5..10 to ~-2%..+2%
    const relPct = clamp((rel - 7.0) * 0.01, -0.02, 0.02);
    midpoint = Math.round(midpoint * (1 + relPct));
  }

  // Build a band around midpoint
  // Wider when confidence is low
  const bandPct = base !== null ? 0.07 : 0.10; // 7% if model covered, else 10%
  const low = Math.round(midpoint * (1 - bandPct));
  const high = Math.round(midpoint * (1 + bandPct));

  return {
    low: Math.max(1000, low),
    midpoint: Math.max(1000, midpoint),
    high: Math.max(1000, high),
    ageTier,
    mileageTier,
    modelKey,
    segment,
  };
}

// -------------------------------
// Asking price positioning & negotiation context
// -------------------------------
function classifyAskingPosition(askingPrice, estimatedValue) {
  const ask = num(askingPrice);
  if (ask === null) return { hasAskingPrice: false, position: "unknown" };

  const { low, midpoint, high } = estimatedValue || {};
  if (![low, midpoint, high].every((n) => typeof n === "number")) {
    return { hasAskingPrice: true, position: "unknown" };
  }

  if (ask <= low) return { hasAskingPrice: true, position: "below-market" };
  if (ask <= midpoint) return { hasAskingPrice: true, position: "fair-buyer" };
  if (ask <= high) return { hasAskingPrice: true, position: "fair-seller" };
  return { hasAskingPrice: true, position: "above-market" };
}

function deriveNegotiationContext({ marketContext, estimatedValue, askingPrice }) {
  const conf = marketContext?.confidenceLevel || "medium";
  const askPos = classifyAskingPosition(askingPrice, estimatedValue);

  // Base leverage from asking position if present; else conservative from market
  let buyerLeverage = "neutral";

  if (askPos.hasAskingPrice) {
    if (askPos.position === "below-market") buyerLeverage = "strong";
    else if (askPos.position === "fair-buyer") buyerLeverage = "moderate";
    else if (askPos.position === "fair-seller") buyerLeverage = "neutral";
    else if (askPos.position === "above-market") buyerLeverage = "weak";
  } else {
    // Without asking price, cap leverage at neutral (MVP-safe)
    if (marketContext?.demandLevel === "low") buyerLeverage = "neutral";
    else buyerLeverage = "neutral";
  }

  // Confidence cap
  if (conf === "low" && buyerLeverage === "strong") buyerLeverage = "moderate";
  if (conf === "low" && buyerLeverage === "moderate") buyerLeverage = "neutral";

  // Tone follows leverage (still conservative)
  let negotiationTone = "balanced";
  if (buyerLeverage === "weak") negotiationTone = "conservative";
  if (buyerLeverage === "strong") negotiationTone = "assertive";

  return {
    buyerLeverage,
    negotiationTone,
    askingPricePosition: askPos.position,
    hasAskingPrice: askPos.hasAskingPrice,
    walkAwayThreshold: estimatedValue?.high || null, // allowed (ties to PIC high)
  };
}

// -------------------------------
// Condition advisory (generic, safe)
// -------------------------------
function buildConditionAdvisory(vehicleProfile = {}) {
  const out = [];

  const year = num(vehicleProfile.year);
  const mileage = num(vehicleProfile.mileage);
  const ageTier = getAgeTier(year);
  const mileageTier = getMileageTier(mileage, year);

  // Vehicle-specific factors (generic, non-quantified)
  out.push(
    "This report assumes the vehicle is in typical condition for its age and category. Prior accidents, visible damage, warning lights, or inconsistent maintenance history can increase buyer leverage."
  );

  if (ageTier.label === "older") {
    out.push(
      "Older vehicles often benefit from a pre-purchase inspection. Use any inspection findings to negotiate repairs, price, or concessions."
    );
  }

  if (mileageTier.label === "high") {
    out.push(
      "Higher mileage can justify a more conservative approach to pricing and increases the importance of service records and inspection results."
    );
  } else if (mileageTier.label === "low") {
    out.push(
      "Relatively low mileage can support stronger pricing, but condition and maintenance history should still be verified."
    );
  }

  // Known issues (model-level, not condition-specific)
  const modelKey = getModelKey(vehicleProfile);
  const known = modelKey ? KnownIssueFlags[modelKey] : null;
  if (Array.isArray(known) && known.length) {
    out.push("Common issues for this model can be used as targeted discussion points during negotiation:");
    // keep it short in-engine; report generator can format bullets
    for (const issue of known.slice(0, 5)) out.push(`• ${issue}`);
  }

  return out;
}

// -------------------------------
// MAIN: buildMvpAnalysis (backward compatible input)
// -------------------------------
function buildMvpAnalysis(input = {}) {
  /**
   * Backward-compatible input handling:
   * - New: { vehicleProfile: {year, make, model, trimBucket?, mileage?}, askingPrice? }
   * - Legacy callers might pass: { year, make, model, trim, mileage, price }
   */
  const vehicleProfile = input.vehicleProfile || {
    year: input.year,
    make: input.make,
    model: input.model,
    trimBucket: input.trimBucket || input.trim || null,
    vehicleClass: input.vehicleClass || null,
    mileage: input.mileage,
  };
  

  const askingPrice = input.askingPrice ?? input.price ?? null;

  const est = estimateValueRange(vehicleProfile);
  const ownership = deriveOwnershipOutlook(est.modelKey);
  let ownershipOutlook = ownership;

  if (
    vehicleProfile.vehicleClass === "performance" ||
    vehicleProfile.vehicleClass === "exotic"
  ) {
    ownershipOutlook = {
      reliability: "variable",
      maintenance: "high",
    };
  }

  const marketContext = deriveMarketContext({
    modelKey: est.modelKey,
  ageTier: est.ageTier,
  mileageTier: est.mileageTier,
  vehicleClass: vehicleProfile.vehicleClass,
  });

  const negotiationContext = deriveNegotiationContext({
    marketContext,
    estimatedValue: est,
    askingPrice,
  });

  const conditionAdvisory = buildConditionAdvisory({
    ...vehicleProfile,
    mileage: vehicleProfile.mileage,
  });

  // Helpful highlights (optional)
  const highlights = [];
  if (est.mileageTier.label === "high") highlights.push("Higher mileage can increase negotiation leverage when verified by service records and inspection.");
  if (est.mileageTier.label === "low") highlights.push("Relatively low mileage may support stronger pricing, but verify history and condition.");
  if (ownershipOutlook.reliability === "strong") highlights.push("Model reputation suggests stronger long-term reliability relative to peers.");
  if (marketContext.demandLevel === "high") highlights.push("This vehicle segment tends to be in higher demand, which can reduce seller flexibility.");
  if (marketContext.demandLevel === "low") highlights.push("Lower demand conditions may increase seller flexibility and improve buyer leverage.");

  // Return: new contract + legacy-friendly fields
  return {
    // New contract (preferred)
    vehicleProfile: {
      year: num(vehicleProfile.year),
      make: normalizeStr(vehicleProfile.make),
      model: normalizeStr(vehicleProfile.model),
      trimBucket: vehicleProfile.trimBucket || null,
      vinMasked: maskVin(input.vin || vehicleProfile.vin || ""),
    },

    estimatedValue: {
      low: est.low,
      midpoint: est.midpoint,
      high: est.high,
    },

    marketContext: {
      position: marketContext.position,
      demandLevel: marketContext.demandLevel,
      confidenceLevel: marketContext.confidenceLevel,
      marketStrengthScore: marketContext.marketStrengthScore,
    },

    ownershipOutlook: {
      reliability: ownershipOutlook.reliability,
      maintenance: ownershipOutlook.maintenance,
    },

    negotiationContext: {
      buyerLeverage: negotiationContext.buyerLeverage,
      negotiationTone: negotiationContext.negotiationTone,
      hasAskingPrice: negotiationContext.hasAskingPrice,
      askingPricePosition: negotiationContext.askingPricePosition,
      walkAwayThreshold: negotiationContext.walkAwayThreshold,
    },

    conditionAdvisory,

    highlights,

    modelVersion: "PIC_v1",

    // Legacy fields (so reportGenerator doesn’t explode while we refactor it next)
    modelKey: est.modelKey,
    reliabilityScore: ownership.reliabilityScore,
    marketStrengthScore: marketContext.marketStrengthScore,
    // Keep these null/absent in v1 (explicitly no listing-driven bands)
    minPrice: null,
    maxPrice: null,
    pricePositioning: null,
    pricingConfidenceScore: null,
    dealerProfile: null,
    featureAnalysis: null,
    negotiationPlan: null,
    comparables: [],
  };
}

module.exports = {
  buildMvpAnalysis,

  // Export helpers in case other files reference them
  getModelKey,
  getAgeTier,
  getMileageTier,
  estimateValueRange,
};
