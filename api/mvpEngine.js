// api/mvpEngine.js

/**
 * MVP valuation + highlight engine (v2 with static data).
 *
 * This takes raw vehicle data (scraped or mock) and:
 * - Tries to normalize year/make/model/trim from the title if missing
 * - Derives age and mileage tiers
 * - Builds a negotiation band (minPrice / maxPrice) from the advertised price
 * - Uses static tables for reliability/body style to slightly tune that band
 * - Appends useful bullet highlights about age, mileage, and model context
 */

const {
  BaseVehicleSpecs,
  DepreciationCurves,
  MileageAdjustment,
  ModelReliabilityScores,
  KnownIssueFlags,
  BodyStyleNegotiationProfiles,
} = require("./staticData");

function num(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() && !isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeYMMM(base = {}) {
  const out = { ...base };

  if (!out.year || !out.make || !out.model) {
    const title = (out.title || "").toString().trim();
    if (title) {
      const parts = title.split(/\s+/);
      if (parts.length >= 3) {
        const maybeYear = num(parts[0]);
        if (maybeYear && `${maybeYear}`.length === 4) {
          out.year = out.year || maybeYear;
          out.make = out.make || parts[1];
          out.model = out.model || parts[2];
          if (!out.trim && parts.length > 3) {
            out.trim = parts.slice(3).join(" ");
          }
        }
      }
    }
  }

  return out;
}

function getModelKey(vehicle) {
  const make = (vehicle.make || "").toString().trim();
  const model = (vehicle.model || "").toString().trim();
  if (!make || !model) return null;
  return `${make} ${model}`;
}

function getAgeTier(year) {
  const y = num(year);
  if (!y) return { label: null, age: null };

  const currentYear = new Date().getFullYear();
  const age = Math.max(0, currentYear - y);

  if (age <= 3) return { label: "late-model", age };
  if (age <= 7) return { label: "mid-age", age };
  return { label: "older", age };
}

function getMileageTier(mileage) {
  const m = num(mileage);
  if (m === null) return { label: null, mileage: null };

  if (m <= 40000) return { label: "low", mileage: m };
  if (m <= 100000) return { label: "average", mileage: m };
  return { label: "high", mileage: m };
}

/**
 * Get a depreciation curve id based on segment if known.
 */
function getCurveIdForModel(modelKey) {
  if (!modelKey) return "default";

  const spec = BaseVehicleSpecs[modelKey];
  if (!spec) return "default";

  if (spec.segment === "luxury") return "luxury";
  if (spec.segment === "truck") return "truck";
  return "default";
}

/**
 * Baseline negotiation band based on advertised price and age/miles.
 * Later tuned with body style + reliability.
 */
function deriveBaselineBand(price, ageTier, mileageTier) {
  const priceNum = num(price);
  if (priceNum === null || priceNum <= 0) {
    return {
      minPrice: null,
      maxPrice: null,
      lowPct: null,
      highPct: null,
      reason: "no-price",
    };
  }

  let lowPct = 5; // mild discount
  let highPct = 10; // more aggressive discount
  let reason = "generic";

  const ageLabel = ageTier.label;
  const milesLabel = mileageTier.label;

  // Late-model, low miles → tighter range
  if (ageLabel === "late-model" && (milesLabel === "low" || milesLabel === "average")) {
    lowPct = 3;
    highPct = 7;
    reason = "late-model / low-to-average miles";
  }
  // Mid-age, average miles → standard used-car band
  else if (ageLabel === "mid-age" && (!milesLabel || milesLabel === "average")) {
    lowPct = 5;
    highPct = 12;
    reason = "mid-age / typical miles";
  }
  // Older or high miles → wider discount band
  else if (ageLabel === "older" || milesLabel === "high") {
    lowPct = 8;
    highPct = 18;
    reason = "older vehicle and/or high miles";
  }

  const minPrice = Math.round(priceNum * (1 - highPct / 100));
  const maxPrice = Math.round(priceNum * (1 - lowPct / 100));

  return {
    minPrice,
    maxPrice,
    lowPct,
    highPct,
    reason,
  };
}

function tuneBandWithModel(band, mileageTier, modelKey) {
  const tuned = { ...band };
  if (band.minPrice === null || band.maxPrice === null) return tuned;

  const milesLabel = mileageTier.label;
  const reliability = ModelReliabilityScores[modelKey] ?? null;

  // Start with original percentages
  let lowPct = band.lowPct ?? 5;
  let highPct = band.highPct ?? 10;

  // High mileage → bump discounts up a bit
  if (milesLabel && MileageAdjustment[milesLabel] !== undefined) {
    const adj = MileageAdjustment[milesLabel]; // e.g. +0.05 for high
    lowPct = lowPct * (1 + adj);
    highPct = highPct * (1 + adj);
  }

  // Reliability: low reliability → expand discount band
  if (reliability !== null) {
    if (reliability < 7) {
      lowPct += 1;
      highPct += 3;
    } else if (reliability > 8.5) {
      lowPct -= 1;
      highPct -= 1;
    }
  }

  lowPct = clamp(lowPct, 1, 15);
  highPct = clamp(highPct, 3, 25);
  if (highPct < lowPct + 1) {
    highPct = lowPct + 1;
  }

  const priceNum = band.maxPrice / (1 - band.lowPct / 100) || null;
  // If for some reason we can't reliably reconstruct price, just reuse original min/max
  if (!priceNum || !isFinite(priceNum)) {
    return tuned;
  }

  const minPrice = Math.round(priceNum * (1 - highPct / 100));
  const maxPrice = Math.round(priceNum * (1 - lowPct / 100));

  tuned.minPrice = minPrice;
  tuned.maxPrice = maxPrice;
  tuned.lowPct = lowPct;
  tuned.highPct = highPct;
  tuned.reason = band.reason;

  return tuned;
}

function getBodyStyleForModel(modelKey) {
  if (!modelKey) return null;

  const spec = BaseVehicleSpecs[modelKey];
  if (spec && spec.bodyStyle) return spec.bodyStyle;

  return null;
}

function getNegotiationLeverageFactor(bodyStyle, segment) {
  let baseFactor = 1.0;

  if (bodyStyle && BodyStyleNegotiationProfiles[bodyStyle]) {
    baseFactor = BodyStyleNegotiationProfiles[bodyStyle].leverageFactor;
  }

  if (segment === "luxury") {
    baseFactor *= 0.9; // luxury dealers hold firm more often
  }

  return baseFactor;
}

function buildHighlights(existingHighlights, ageTier, mileageTier, reliability, modelKey) {
  const highlights = Array.isArray(existingHighlights)
    ? [...existingHighlights]
    : [];

  const ageLabel = ageTier.label;
  const milesLabel = mileageTier.label;

  function add(line) {
    if (!line) return;
    if (!highlights.includes(line)) highlights.push(line);
  }

  // Age-related highlight
  if (ageLabel === "late-model") {
    add(
      "This vehicle falls into a late-model age bracket, which typically supports stronger asking prices but still leaves some room to negotiate."
    );
  } else if (ageLabel === "mid-age") {
    add(
      "This vehicle is in a mid-age bracket where most used-car negotiations happen — dealers generally expect some discounting from the advertised price."
    );
  } else if (ageLabel === "older") {
    add(
      "Because this vehicle is on the older side, you usually gain additional leverage, especially if condition or reconditioning costs are a factor."
    );
  }

  // Mileage-related highlight
  if (milesLabel === "low") {
    add(
      "Relatively low mileage may make the dealer more confident in the asking price, but it should still be weighed against comparable listings and your budget."
    );
  } else if (milesLabel === "average") {
    add(
      "Mileage appears typical for the vehicle’s age, which keeps the negotiation range within a normal used-car spectrum."
    );
  } else if (milesLabel === "high") {
    add(
      "Higher mileage can justify a more conservative offer and gives you additional room to push on price."
    );
  }

  // Reliability
  if (modelKey && reliability !== null) {
    if (reliability >= 8.5) {
      add(
        `${modelKey} is generally considered a strong choice for reliability, which supports long-term ownership but does not eliminate your ability to negotiate price.`
      );
    } else if (reliability <= 7) {
      add(
        `${modelKey} has a more mixed reliability reputation, so it is reasonable to factor higher potential maintenance costs into your offer.`
      );
    }
  }

  // Known issues (we'll let reportGenerator go deeper later if needed)
  const issueList = modelKey && KnownIssueFlags[modelKey];
  if (Array.isArray(issueList) && issueList.length) {
    add(
      "This model has some widely discussed issues; review the common concerns and factor potential repair or maintenance into your negotiation stance."
    );
  }

  return highlights;
}

function buildMarketStrengthScore({ reliabilityScore, ageTier, mileageTier, modelKey }) {
  let score = 50; // base neutral score

  // Reliability = largest contributor (0–25 pts)
  if (typeof reliabilityScore === "number") {
    score += (reliabilityScore - 5) * 4; // maps reliability 5–10 to roughly +0–20
  }

  // Age impact (up to ±10 pts)
  if (ageTier.age !== null) {
    if (ageTier.age <= 3) score += 5;
    else if (ageTier.age <= 7) score += 0;
    else score -= 5;
  }

  // Mileage impact (up to ±10 pts)
  if (mileageTier.label === "low") score += 5;
  if (mileageTier.label === "average") score += 0;
  if (mileageTier.label === "high") score -= 5;

  // Luxury penalty or truck bump
  if (modelKey && BaseVehicleSpecs[modelKey]) {
    const seg = BaseVehicleSpecs[modelKey].segment;
    if (seg === "luxury") score -= 5; // cost of ownership risk
    if (seg === "truck") score += 3;  // trucks retain value better
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildPricingConfidenceScore(vehicle, featureAnalysis, dealerProfile) {
  let score = 50; // neutral baseline

  // Year/make/model completeness
  if (vehicle.year) score += 5;
  if (vehicle.make) score += 5;
  if (vehicle.model) score += 5;

  // Trim completeness
  if (vehicle.trim) score += 5;

  // Feature completeness
  if (featureAnalysis) {
    const exp = featureAnalysis.expectedFeatures.length;
    const missing = featureAnalysis.missingFeatures.length;

    if (exp > 0) {
      const featureScore = ((exp - missing) / exp) * 20; // up to 20 pts
      score += featureScore;
    }
  }

  // Dealer reliability factor
  if (dealerProfile) {
    // Corporate & franchise have more consistent listing accuracy
    if (dealerProfile.type === "corporate") score += 5;
    if (dealerProfile.type === "franchise") score += 3;

    // Independents vary a lot → subtract a bit
    if (dealerProfile.type === "independent") score -= 3;

    // No-haggle dealers usually have very accurate data
    if (dealerProfile.type === "no-haggle") score += 3;
  }

  // Scraped price quality
  if (!vehicle.price || vehicle.price <= 0) {
    score -= 10; // big red flag
  } else {
    score += 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildConditionAdvisory(vehicle, ageTier, mileageTier, modelKey) {
  const advisory = [];

  const age = ageTier.age;
  const miles = mileageTier.mileage;

  // ---------------------------
  // AGE-BASED INSIGHTS
  // ---------------------------
  if (age !== null) {
    if (age <= 3) {
      advisory.push(
        "This is a relatively new vehicle, so major mechanical issues are unlikely. Focus your inspection on cosmetic condition and tire/brake wear."
      );
    } else if (age <= 7) {
      advisory.push(
        "Mid-age vehicles typically enter their most stable ownership years. Ensure routine maintenance has been performed, especially fluids, brakes, and tires."
      );
    } else {
      advisory.push(
        "Older vehicles often require attention to suspension components, rubber seals, engine gaskets, and cooling system parts. Verify maintenance records carefully."
      );
    }
  }

  // ---------------------------
  // MILEAGE-BASED INSIGHTS
  // ---------------------------
  if (miles !== null) {
    if (miles <= 40000) {
      advisory.push(
        "Low mileage suggests reduced overall wear, but confirm that the vehicle was serviced based on time rather than mileage alone."
      );
    } else if (miles <= 100000) {
      advisory.push(
        "Mileage is typical for the age. Inspect wear items such as brakes, tires, and fluids, and confirm that major services were completed on schedule."
      );
    } else {
      advisory.push(
        "High mileage vehicles may require imminent maintenance such as shocks/struts, bushings, belts, ignition components, and potentially transmission servicing."
      );
    }
  }

  // ---------------------------
  // SEGMENT-SPECIFIC RISKS
  // ---------------------------
  if (modelKey && BaseVehicleSpecs[modelKey]) {
    const segment = BaseVehicleSpecs[modelKey].segment;

    if (segment === "luxury") {
      advisory.push(
        "Luxury vehicles often carry higher long-term maintenance costs and may require premium parts or specialized labor. Consider budgeting for repairs."
      );
    }

    if (segment === "truck") {
      advisory.push(
        "Trucks experience different wear patterns — check tow hitch condition, bed wear, suspension travel, and potential frame rust depending on region."
      );
    }

    if (segment === "offroad") {
      advisory.push(
        "Off-road vehicles may show underbody wear. Inspect skid plates, suspension components, and frame rails for damage or corrosion."
      );
    }
  }

  return advisory;
}


function getTrimFeatureAnalysis(vehicle, modelKey) {
  const scrapedFeatures = (vehicle.features || []).map(f => f.toLowerCase().trim());

  let expected = [];
  const trim = vehicle.trim?.toUpperCase?.();

  if (modelKey && BaseVehicleSpecs[modelKey]) {
    const modelData = BaseVehicleSpecs[modelKey];

    if (trim && modelData.trims[trim]) {
      expected = modelData.trims[trim].expectedFeatures || [];
    } else {
      // fallback to base-level expectation
      expected = DefaultExpectedFeatures;
    }
  } else {
    expected = DefaultExpectedFeatures;
  }

  const missingFeatures = expected.filter(
    exp => !scrapedFeatures.some(f => f.includes(exp.toLowerCase()))
  );

  return {
    expectedFeatures: expected,
    missingFeatures,
  };
}

function detectDealerProfile(dealerName) {
  if (!dealerName) return null;

  const lower = dealerName.toLowerCase();

  for (const key of Object.keys(DealerProfiles)) {
    if (lower.includes(key)) {
      return {
        name: dealerName,
        profileKey: key,
        ...DealerProfiles[key],
      };
    }
  }

  return {
    name: dealerName,
    type: "unknown",
    notes: [
      "This dealership does not match major national chains or common profile patterns.",
      "Negotiation flexibility will depend heavily on market conditions and salesperson strategy."
    ],
    leverageFactor: 1.0,
  };
}

function buildPricePositioning(price, minPrice, maxPrice) {
  const priceNum = num(price);
  if (!priceNum || !minPrice || !maxPrice) {
    return {
      deviationAmount: null,
      deviationPercent: null,
      position: "unknown",
    };
  }

  // Positive deviation = priced above market
  const midpoint = Math.round((minPrice + maxPrice) / 2);
  const deviationAmount = priceNum - midpoint;
  const deviationPercent = Math.round((deviationAmount / midpoint) * 100);

  let position = "at-market";
  if (deviationAmount > 300) position = "above-market";
  else if (deviationAmount < -300) position = "below-market";

  return {
    deviationAmount,
    deviationPercent,
    position,
  };
}

function roundToHundreds(n) {
  if (typeof n !== "number") return null;
  return Math.round(n / 100) * 100;
}

function buildNegotiationPlan({
  price,
  minPrice,
  maxPrice,
  pricePositioning,
  pricingConfidenceScore,
  dealerProfile,
  mileageTier,
  reliabilityScore,
}) {
  if (!minPrice || !maxPrice) return null;

  const midpoint = Math.round((minPrice + maxPrice) / 2);
  const spread = maxPrice - minPrice;
  const flex = dealerProfile?.leverageFactor ?? 1.0;

  // Posture
  let posture = "balanced";
  if (pricingConfidenceScore >= 75 && pricePositioning.position !== "below-market") {
    posture = "firm";
  } else if (pricingConfidenceScore < 55) {
    posture = "verify-first";
  }

  // Primary angle
  let primaryAngle = "market competition";
  if (pricePositioning.position === "above-market") {
    primaryAngle = "above-market pricing";
  } else if (pricingConfidenceScore < 55) {
    primaryAngle = "verification and condition risk";
  } else if (dealerProfile?.type === "no-haggle") {
    primaryAngle = "fees and add-ons";
  }

  const openingOffer = roundToHundreds(minPrice - spread * 0.15 * flex);
  const targetPrice = roundToHundreds(midpoint - spread * 0.1);
  const walkAwayPrice = roundToHundreds(
    Math.min(maxPrice, midpoint + spread * 0.2)
  );

  return {
    posture,
    primaryAngle,
    supportAngles: [
      mileageTier.label === "high" ? "mileage risk" : null,
      reliabilityScore !== null && reliabilityScore < 7 ? "reliability risk" : null,
      dealerProfile?.type ? `dealer type: ${dealerProfile.type}` : null,
    ].filter(Boolean),
    numbers: {
      openingOffer,
      targetPrice,
      walkAwayPrice,
    },
    playbook: [
      {
        step: 1,
        goal: "Anchor the negotiation",
        say: `Open near $${openingOffer} using market pricing as justification.`,
      },
      {
        step: 2,
        goal: "Settle near target",
        say: `Counter toward $${targetPrice} if the dealer pushes back.`,
      },
      {
        step: 3,
        goal: "Protect downside",
        say: `Be prepared to walk if pricing exceeds $${walkAwayPrice}.`,
      },
    ],
    scripts: {
      opener: `Based on current market pricing, a fair range is around $${minPrice}–$${maxPrice}. If you can do $${openingOffer}, I’m ready to move forward.`,
      pushback: `I understand, but given where this sits relative to the market, I’d be comfortable closer to $${targetPrice}.`,
      close: `If we can get to $${targetPrice}, I’m ready to finalize today.`,
      walkAway: `If pricing remains above $${walkAwayPrice}, I’ll need to pass and pursue other options.`,
    },
  };
}


/**
 * Main public function.
 * @param {Object} vehicleData - Raw data
 * @param {Object} options - { reportType }
 */
function buildMvpAnalysis(vehicleData = {}, options = {}) {
  // Normalize year/make/model/trim from title if needed
  const normalized = normalizeYMMM(vehicleData || {});

  const price = num(normalized.price);
  const year = normalized.year;
  const mileage = normalized.mileage;

  const ageTier = getAgeTier(year);
  const mileageTier = getMileageTier(mileage);

  const modelKey = getModelKey(normalized);
  const reliability = modelKey ? ModelReliabilityScores[modelKey] ?? null : null;
  const featureAnalysis = getTrimFeatureAnalysis(normalized, modelKey);
  const dealerProfile = detectDealerProfile(normalized.dealerName);

  // Baseline band from age/miles
  let band = deriveBaselineBand(price, ageTier, mileageTier);

  // Tune band using mileage + model reliability
  band = tuneBandWithModel(band, mileageTier, modelKey);

  // Build enriched highlights
  const highlights = buildHighlights(
    normalized.highlights,
    ageTier,
    mileageTier,
    reliability,
    modelKey
  );

  const pricePositioning = buildPricePositioning(
    normalized.price,
    band.minPrice,
    band.maxPrice
  );
  
  const conditionAdvisory = buildConditionAdvisory(
    normalized,
    ageTier,
    mileageTier,
    modelKey
  );
  

  const pricingConfidenceScore = buildPricingConfidenceScore(
    normalized,
    featureAnalysis,
    dealerProfile
  );

  const marketStrengthScore = buildMarketStrengthScore({
    reliabilityScore: reliability,
    ageTier,
    mileageTier,
    modelKey,
  });
  
  
  const negotiationPlan = buildNegotiationPlan({
    price,
    minPrice: band.minPrice,
    maxPrice: band.maxPrice,
    pricePositioning,
    pricingConfidenceScore,
    dealerProfile,
    mileageTier,
    reliabilityScore: reliability,
  });


  return {
    ...normalized,
    minPrice: band.minPrice,
    maxPrice: band.maxPrice,
    highlights,
    reliabilityScore: reliability,
    modelKey,
    featureAnalysis,
    marketStrengthScore,
    dealerProfile,
    pricePositioning,
    pricingConfidenceScore,
    conditionAdvisory,``
    negotiationPlan,
  };
  
}

module.exports = {
  buildMvpAnalysis,
};
