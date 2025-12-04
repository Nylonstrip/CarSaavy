// api/services/mvpEngine.js
// Core "brains" of the CarSaavy MVP report.
// Takes normalized vehicleData and returns a rich analysis
// for the PDF and email layer to render.

const LOG_PREFIX = '[MvpEngine]';

// --- Helpers -------------------------------------------------------

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

function cleanText(value) {
  if (!value) return null;
  return String(value).replace(/\s+/g, ' ').trim();
}

function getCurrentYear() {
  return new Date().getFullYear();
}

function isSportyModel(model = '') {
  const sporty = [
    'camaro',
    'mustang',
    'charger',
    'challenger',
    'corvette',
    '370z',
    'supra',
    'wrx',
    'sti',
  ];
  const m = (model || '').toLowerCase();
  return sporty.some((s) => m.includes(s));
}

function isLuxuryMake(make = '') {
  const luxury = [
    'bmw',
    'mercedes-benz',
    'mercedes',
    'audi',
    'lexus',
    'infiniti',
    'acura',
    'cadillac',
    'jaguar',
    'porsche',
    'volvo',
    'lincoln',
    'genesis',
  ];
  const mk = (make || '').toLowerCase();
  return luxury.some((s) => mk.includes(s));
}

function estimateBaseMsrp({ make, model }) {
  const mk = (make || '').toLowerCase();
  const md = (model || '').toLowerCase();

  if (isSportyModel(md)) return 35000;
  if (isLuxuryMake(mk)) return 42000;

  const truckKeywords = ['f-150', 'f150', 'silverado', 'ram', 'tacoma', 'tundra', 'sierra'];
  const suvKeywords = ['rav4', 'cr-v', 'crv', 'rogue', 'highlander', 'pilot', 'explorer', 'escape'];

  if (truckKeywords.some((k) => md.includes(k))) return 42000;
  if (suvKeywords.some((k) => md.includes(k))) return 38000;

  // sensible default for sedans / compact
  return 28000;
}

function estimateExpectedMileage(year, mileage) {
  if (!year) {
    return { expected: null, deviationRatio: null, category: 'Unknown' };
  }

  const currentYear = getCurrentYear();
  let ageYears = currentYear - year;
  if (ageYears < 0) ageYears = 0; // future model year

  // assume average 12k miles per year, cap at 15 years for "expected" range
  const effectiveYears = clamp(ageYears, 1, 15);
  const expected = effectiveYears * 12000;

  if (!mileage || mileage <= 0) {
    return { expected, deviationRatio: null, category: 'Unknown' };
  }

  const deviationRatio = (mileage - expected) / expected; // e.g. 0.2 = 20% high
  let category = 'Normal';

  if (deviationRatio > 0.25) category = 'Very High';
  else if (deviationRatio > 0.15) category = 'High';
  else if (deviationRatio < -0.20) category = 'Very Low';
  else if (deviationRatio < -0.10) category = 'Low';

  return { expected, deviationRatio, category };
}

function estimateDepreciationFactor(ageYears, { sporty, luxury }) {
  if (ageYears <= 0) return 0;

  // base annual pattern
  let remainingFactor = 1;
  let depreciation = 0;

  const firstYearDrop = sporty || luxury ? 0.22 : 0.20;
  const secondYearDrop = sporty || luxury ? 0.18 : 0.15;
  const midYearDrop = sporty || luxury ? 0.11 : 0.10;
  const lateYearDrop = sporty || luxury ? 0.08 : 0.07;

  for (let year = 1; year <= ageYears; year++) {
    let drop;
    if (year === 1) drop = firstYearDrop;
    else if (year === 2) drop = secondYearDrop;
    else if (year <= 5) drop = midYearDrop;
    else drop = lateYearDrop;

    const thisDrop = remainingFactor * drop;
    depreciation += thisDrop;
    remainingFactor -= thisDrop;
  }

  // clamp total depreciation to 85% (car never worth 0 in this model)
  return clamp(depreciation, 0, 0.85);
}

// --- Core analysis pieces ------------------------------------------

function buildVehicleSummary(vehicle) {
  const {
    vin,
    year,
    make,
    model,
    trim,
    price,
    mileage,
    dealerName,
    dealerAddress,
    source,
    sourceUrl,
  } = vehicle || {};

  const titleParts = [
    year,
    cleanText(make),
    cleanText(model),
    cleanText(trim),
  ].filter(Boolean);

  const title = titleParts.join(' ');

  const summary = {
    title: title || 'Vehicle Summary',
    vin: vin || null,
    year: year || null,
    make: cleanText(make),
    model: cleanText(model),
    trim: cleanText(trim),
    price: typeof price === 'number' ? price : null,
    mileage: typeof mileage === 'number' ? mileage : null,
    dealerName: cleanText(dealerName),
    dealerAddress: cleanText(dealerAddress),
    source: cleanText(source) || 'cars',
    sourceUrl: cleanText(sourceUrl) || null,
  };

  return summary;
}

function buildPriceAnalysis(vehicle) {
  const { year, make, model, price, mileage } = vehicle || {};

  const currentYear = getCurrentYear();
  let ageYears = year ? currentYear - year : null;
  if (ageYears !== null && ageYears < 0) ageYears = 0;

  const sporty = isSportyModel(model);
  const luxury = isLuxuryMake(make);

  const baseMsrp = estimateBaseMsrp({ make, model });
  const depreciation = ageYears !== null
    ? estimateDepreciationFactor(ageYears, { sporty, luxury })
    : 0.5; // assume ~50% if no year

  let fairCenter = baseMsrp * (1 - depreciation);

  // mileage adjustment
  const { expected, deviationRatio, category } = estimateExpectedMileage(year, mileage);
  let mileageAdjustmentPercent = 0;

  if (deviationRatio !== null) {
    // up to ±20% adjustment from mileage alone
    mileageAdjustmentPercent = clamp(deviationRatio * 0.6, -0.2, 0.2);
  }

  fairCenter = fairCenter * (1 - mileageAdjustmentPercent);
  const fairLow = fairCenter * 0.9;
  const fairHigh = fairCenter * 1.1;

  let position = 'Unknown';
  let percentDiff = null;

  if (price && fairCenter > 0) {
    percentDiff = (price - fairCenter) / fairCenter; // e.g. 0.1 = 10% high

    if (percentDiff > 0.12) position = 'Above expected range';
    else if (percentDiff > 0.04) position = 'Slightly above expected';
    else if (percentDiff < -0.10) position = 'Below expected range';
    else if (percentDiff < -0.03) position = 'Slightly below expected';
    else position = 'Within expected range';
  }

  const narrative = (() => {
    if (!price || !year) {
      return 'We estimated a fair price band based on typical depreciation patterns and mileage, but some inputs were missing, so treat this as a directional guide rather than a precise valuation.';
    }

    const lines = [];

    lines.push(
      `Based on typical depreciation for this type of vehicle and its current mileage, a reasonable price band for this configuration would generally fall around **$${Math.round(
        fairLow
      ).toLocaleString()}–$${Math.round(fairHigh).toLocaleString()}**.`
    );

    if (position === 'Within expected range') {
      lines.push(
        `The asking price of **$${price.toLocaleString()}** sits within that expected band. This doesn’t mean you can’t negotiate, but it suggests the dealer’s pricing is broadly aligned with typical market behavior for this age and mileage.`
      );
    } else if (position.includes('above')) {
      lines.push(
        `The asking price of **$${price.toLocaleString()}** appears **above** what would typically be expected for this year and mileage. This gives you additional room to push for a lower number, especially if the vehicle has any cosmetic or mechanical imperfections.`
      );
    } else if (position.includes('below')) {
      lines.push(
        `The asking price of **$${price.toLocaleString()}** appears **below** the midpoint of our estimated range. This can indicate a motivated seller, prior price drops, or simply aggressive pricing. It’s still reasonable to negotiate, but your focus should be on verifying condition and history.`
      );
    }

    if (category && category !== 'Normal' && category !== 'Unknown') {
      lines.push(
        `Mileage on this vehicle is categorized as **${category} for its age**, which we factor into the fair range above.`
      );
    }

    return lines.join(' ');
  })();

  return {
    baseMsrp,
    ageYears,
    sporty,
    luxury,
    expectedMileage: expected,
    mileageCategory: category,
    mileageDeviationRatio: deviationRatio,
    fairLow,
    fairCenter,
    fairHigh,
    pricePosition: position,
    pricePercentDiff: percentDiff,
    narrative,
  };
}

function buildLeverageScore(vehicle, priceAnalysis) {
  const { make, model, mileage } = vehicle || {};
  const {
    mileageDeviationRatio,
    pricePercentDiff,
  } = priceAnalysis || {};

  let score = 50;
  const reasons = [];

  // price vs fair band
  if (typeof pricePercentDiff === 'number') {
    if (pricePercentDiff > 0.15) {
      score += 20;
      reasons.push('The asking price appears significantly above our estimated fair range.');
    } else if (pricePercentDiff > 0.07) {
      score += 12;
      reasons.push('The asking price appears somewhat above the estimated fair range.');
    } else if (pricePercentDiff < -0.12) {
      score -= 12;
      reasons.push('The asking price appears well below the estimated fair range, which may reduce your room to negotiate.');
    } else if (pricePercentDiff < -0.05) {
      score -= 6;
      reasons.push('The asking price appears slightly below the estimated fair range, leaving less obvious room for a discount.');
    } else {
      reasons.push('The asking price is roughly in line with our estimated fair range.');
    }
  }

  // mileage leverage
  if (typeof mileageDeviationRatio === 'number') {
    if (mileageDeviationRatio > 0.25) {
      score += 15;
      reasons.push('Mileage is significantly higher than average for the vehicle’s age, which strengthens your ability to push the price down.');
    } else if (mileageDeviationRatio > 0.15) {
      score += 10;
      reasons.push('Mileage is above average for the vehicle’s age, giving you additional negotiation leverage.');
    } else if (mileageDeviationRatio < -0.20) {
      score -= 8;
      reasons.push('Mileage is noticeably below average, making the vehicle more desirable and slightly reducing your leverage.');
    } else if (mileageDeviationRatio < -0.10) {
      score -= 4;
      reasons.push('Mileage is somewhat below average, which tends to support stronger pricing from the dealer.');
    }
  }

  // type adjustments
  const sporty = isSportyModel(model);
  const luxury = isLuxuryMake(make);

  if (sporty) {
    reasons.push('Sporty coupes and performance models can have more niche demand, which sometimes reduces leverage unless the vehicle has been sitting for a while.');
  }

  if (luxury) {
    score += 4;
    reasons.push('Luxury vehicles often experience steeper depreciation, which can increase negotiation flexibility, especially on older models.');
  }

  // clamp
  score = Math.round(clamp(score, 0, 100));

  let category;
  if (score >= 75) category = 'Strong';
  else if (score >= 55) category = 'Moderate';
  else category = 'Limited';

  const summary = (() => {
    if (category === 'Strong') {
      return 'You have **strong leverage** to negotiate a lower price on this vehicle, assuming there are no major surprises in its condition or history.';
    }
    if (category === 'Moderate') {
      return 'You have **moderate leverage**. A meaningful discount is still realistic, but you may need to be flexible and patient in your negotiation.';
    }
    return 'Your leverage appears **limited** based on the data we can see. You can still negotiate, but you should set conservative expectations for how far the dealer is likely to move.';
  })();

  return {
    score,
    category,
    reasons,
    summary,
  };
}

function buildRiskProfile(vehicle) {
  const { year, mileage, make, model, trim } = vehicle || {};
  const currentYear = getCurrentYear();
  const ageYears = year ? currentYear - year : null;

  const bullets = [];

  if (ageYears !== null) {
    if (ageYears >= 10) {
      bullets.push(
        'The vehicle is over 10 years old, which increases the likelihood of age-related wear on suspension components, seals, and electronics.'
      );
    } else if (ageYears >= 6) {
      bullets.push(
        'The vehicle is in a mid-to-late lifecycle age range where wear items such as suspension, cooling components, and interior trim may start to show more noticeable fatigue.'
      );
    } else if (ageYears <= 3) {
      bullets.push(
        'The vehicle is relatively new in calendar age, which can help reduce risk—provided that scheduled maintenance has been followed.'
      );
    }
  }

  if (mileage != null) {
    if (mileage >= 120000) {
      bullets.push(
        'Mileage above 120,000 is considered high for most vehicles and may increase the likelihood of major repairs such as transmission work, steering components, or engine-related issues.'
      );
    } else if (mileage >= 90000) {
      bullets.push(
        'Mileage in the 90,000–120,000 range is often when larger scheduled services and potential component replacements begin to appear.'
      );
    } else if (mileage <= 45000 && ageYears && ageYears > 4) {
      bullets.push(
        'Mileage is low for the age, which can be positive, but you should still verify that the vehicle has been driven regularly and not left sitting for long periods.'
      );
    }
  }

  if (isSportyModel(model)) {
    bullets.push(
      'Sport-oriented models are more likely to have been driven aggressively. Pay extra attention to tire wear, brake condition, and any signs of previous modifications or track use.'
    );
  }

  if (isLuxuryMake(make)) {
    bullets.push(
      'Luxury brands can carry higher parts and labor costs. Even routine maintenance may be pricier than non-luxury alternatives, so factor this into your long-term budget.'
    );
  }

  if (!bullets.length) {
    bullets.push(
      'We did not identify any obvious risk flags from the basic data alone. You should still obtain a pre-purchase inspection and review vehicle history before finalizing any deal.'
    );
  }

  const intro = `This section highlights **risk factors and ownership considerations** based on the vehicle’s age, mileage, and type. It is not a substitute for an in-person inspection or a full vehicle history report, but it can help you ask smarter questions.`;

  return {
    intro,
    bullets,
  };
}

function buildNegotiationBlueprint(summary, priceAnalysis, leverage) {
  const { title, price, mileage } = summary || {};
  const { pricePosition } = priceAnalysis || {};
  const { score, category } = leverage || {};

  const intro = `This blueprint is designed to help you negotiate more confidently on **${title || 'this vehicle'}**. It’s written so you can adapt the language to your style while keeping the strategy intact.`;

  // Target starting number for the opening offer
  let suggestedStartPrice = null;
  let tone = 'balanced';

  if (price && priceAnalysis && priceAnalysis.fairLow && priceAnalysis.fairCenter) {
    if (category === 'Strong') {
      suggestedStartPrice = Math.round(priceAnalysis.fairLow * 0.97);
      tone = 'firmer';
    } else if (category === 'Moderate') {
      suggestedStartPrice = Math.round(priceAnalysis.fairCenter * 0.93);
    } else {
      suggestedStartPrice = Math.round(priceAnalysis.fairCenter * 0.95);
      tone = 'cautious';
    }
  }

  const openingLine = (() => {
    if (!price || !suggestedStartPrice) {
      return `“I’ve done some homework on this vehicle and on similar models in the market. I’d be comfortable moving forward if we can land on a number that fairly reflects the age, mileage, and condition. What flexibility do you have on the price?”`;
    }

    return `“I’ve taken a close look at this ${title || 'vehicle'}—given its age, mileage, and typical depreciation, I’m comfortable at **$${suggestedStartPrice.toLocaleString()} out-the-door**. If we can get close to that today, I’m ready to move forward.”`;
  })();

  const counterStrategy = (() => {
    const lines = [];

    if (category === 'Strong') {
      lines.push(
        'Expect the dealer to counter noticeably higher than your opening number. Stay calm and avoid rushing to split the difference. Instead, move in **small increments** and keep pointing back to mileage, age, and any cosmetic or maintenance items you’ve noticed.'
      );
    } else if (category === 'Moderate') {
      lines.push(
        'When the dealer counters, aim to move gradually and keep the conversation focused on value: how the price compares to typical expectations for this age and mileage, and what reconditioning has actually been done.'
      );
    } else {
      lines.push(
        'With more limited leverage, your goal is to secure a modest discount while prioritizing clean condition, solid service history, and a straightforward out-the-door number without junk fees.'
      );
    }

    lines.push(
      'Try to avoid making large jumps in your counter offers. Instead, move a few hundred dollars at a time and make the dealer do most of the moving.'
    );

    return lines.join(' ');
  })();

  const feeGuidance = `Ask the dealer for a clear, written breakdown of the **out-the-door price**, including taxes, title, registration, and all fees. Push back on doc fees that seem unusually high, nitrogen in tires, VIN etching, paint protection add-ons, and any “market adjustment” line items that are not tied to tangible value. It’s reasonable to say you’re comfortable paying for legitimate government and registration fees, but not for padded extras.`;

  const walkAway = `Your strongest leverage comes from your willingness to **walk away politely**. If the dealer won’t approach a number you’re comfortable with, thank them for their time, leave your contact information, and let them know you’re continuing to compare options. It’s common for stores to follow up later when they’re more flexible.`;

  const toneNote =
    tone === 'firmer'
      ? 'Given your leverage profile, you can afford to be firmer in your expectations while remaining respectful and calm.'
      : tone === 'cautious'
      ? 'With leverage on the lighter side, keep your expectations realistic and focus on overall deal quality, not just maximum discount.'
      : 'You have some room to negotiate while still keeping expectations grounded in typical market behavior for this vehicle type.';

  return {
    intro,
    suggestedStartPrice,
    openingLine,
    counterStrategy,
    feeGuidance,
    walkAway,
    toneNote,
  };
}

function buildDisclaimer() {
  return (
    'This report is an **informational tool**, not a formal appraisal or guarantee. ' +
    'Carsaavy does not inspect vehicles, verify odometer readings, or confirm accident history. ' +
    'All estimates are based on typical patterns for age, mileage, and vehicle type, combined with the listing information available at the time of analysis. ' +
    'Actual vehicle condition, local market dynamics, and dealer policies may differ. Always obtain a pre-purchase inspection and review a full vehicle history report before finalizing a purchase.'
  );
}

// --- Public API ----------------------------------------------------

/**
 * Build the full MVP analysis object from a normalized vehicleData payload.
 *
 * vehicleData is expected to look like:
 * {
 *   vin, year, make, model, trim,
 *   price, mileage,
 *   dealerName, dealerAddress,
 *   source, scrapeMode, sourceUrl,
 * }
 */
function buildMvpAnalysis(vehicleData) {
  if (!vehicleData) {
    throw new Error('buildMvpAnalysis requires vehicleData');
  }

  console.info(`${LOG_PREFIX} Building MVP analysis for VIN: ${vehicleData.vin || 'unknown'}`);

  const summary = buildVehicleSummary(vehicleData);
  const priceAnalysis = buildPriceAnalysis(vehicleData);
  const leverage = buildLeverageScore(vehicleData, priceAnalysis);
  const riskProfile = buildRiskProfile(vehicleData);
  const negotiation = buildNegotiationBlueprint(summary, priceAnalysis, leverage);
  const disclaimer = buildDisclaimer();

  return {
    summary,
    priceAnalysis,
    leverage,
    riskProfile,
    negotiation,
    disclaimer,
  };
}

module.exports = {
  buildMvpAnalysis,
};
