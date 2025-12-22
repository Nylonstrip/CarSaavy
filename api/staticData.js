// api/staticData.js

/**
 * NOTE (MVP v1):
 * The following exports are intentionally inactive in MVP:
 * - DefaultExpectedFeatures
 * - BodyStyleNegotiationProfiles
 * - DealerProfiles
 *
 * They are preserved for future versions and must not be referenced
 * by PIC_v1 logic or report generation.
 */


/**
 * Static reference data for CarSaavy (NIC_v2).
    Numeric valuation tables are legacy and not used in MVP.

 *
 * This is intentionally small and focused on popular models.
 * You can expand this file over time without changing any logic.
 */

// ----------------------------------------
// 1) BaseVehicleSpecs
//    - Trim adjustment multipliers
//    - Expected features (for future use)
//    - Body style + segment
// ----------------------------------------
const DefaultExpectedFeatures = [
    "Backup Camera",
    "Bluetooth",
    "Keyless Entry",
    "Lane Assist",
    "Apple CarPlay / Android Auto",
  ];
  

const BaseVehicleSpecs = {
    "Toyota Camry": {
      bodyStyle: "sedan",
      segment: "economy",
      trims: {
        LE: {
          expectedFeatures: ["Backup Camera", "Bluetooth"],
          trimAdjustment: 0.97,
        },
        SE: {
          expectedFeatures: ["Backup Camera", "Sport Suspension"],
          trimAdjustment: 1.0,
        },
        XSE: {
          expectedFeatures: [
            "Leather Seats",
            "Sunroof",
            "Blind Spot Monitoring",
          ],
          trimAdjustment: 1.08,
        },
      },
    },
  
    "Honda Accord": {
      bodyStyle: "sedan",
      segment: "economy",
      trims: {
        LX: {
          expectedFeatures: ["Backup Camera", "Bluetooth"],
          trimAdjustment: 0.96,
        },
        Sport: {
          expectedFeatures: ["Backup Camera", "Sport Styling"],
          trimAdjustment: 1.01,
        },
        Touring: {
          expectedFeatures: ["Leather Seats", "Sunroof", "Navigation"],
          trimAdjustment: 1.12,
        },
      },
    },
  
    "Honda Civic": {
      bodyStyle: "sedan",
      segment: "economy",
      trims: {
        LX: {
          expectedFeatures: ["Backup Camera", "Bluetooth"],
          trimAdjustment: 0.97,
        },
        EX: {
          expectedFeatures: ["Sunroof", "Heated Seats"],
          trimAdjustment: 1.02,
        },
        "Si": {
          expectedFeatures: ["Sport-Tuned Engine"],
          trimAdjustment: 1.08,
        },
      },
    },
  
    "Toyota RAV4": {
      bodyStyle: "suv",
      segment: "economy",
      trims: {
        LE: {
          expectedFeatures: ["Backup Camera", "AWD (optional)"],
          trimAdjustment: 0.98,
        },
        XLE: {
          expectedFeatures: ["Sunroof", "Heated Seats (optional)"],
          trimAdjustment: 1.03,
        },
      },
    },
  
    "Honda CR-V": {
      bodyStyle: "suv",
      segment: "economy",
      trims: {
        LX: {
          expectedFeatures: ["Backup Camera"],
          trimAdjustment: 0.98,
        },
        EX: {
          expectedFeatures: ["Sunroof", "Advanced Safety"],
          trimAdjustment: 1.03,
        },
      },
    },
  
    "Ford F-150": {
      bodyStyle: "truck",
      segment: "truck",
      trims: {
        XL: {
          expectedFeatures: ["Basic Work Truck Features"],
          trimAdjustment: 0.95,
        },
        XLT: {
          expectedFeatures: ["Cloth Seats", "Power Accessories"],
          trimAdjustment: 1.0,
        },
        Lariat: {
          expectedFeatures: ["Leather Seats", "Advanced Features"],
          trimAdjustment: 1.1,
        },
      },
    },
  
    "Jeep Wrangler": {
      bodyStyle: "suv",
      segment: "offroad",
      trims: {
        Sport: {
          expectedFeatures: ["4x4", "Removable Top"],
          trimAdjustment: 1.0,
        },
        Sahara: {
          expectedFeatures: ["4x4", "Comfort Features"],
          trimAdjustment: 1.08,
        },
        Rubicon: {
          expectedFeatures: ["4x4", "Off-Road Package"],
          trimAdjustment: 1.15,
        },
      },
    },
  
    "BMW 3 Series": {
      bodyStyle: "sedan",
      segment: "luxury",
      trims: {
        "330i": {
          expectedFeatures: ["Leather", "Premium Audio"],
          trimAdjustment: 1.08,
        },
        "340i": {
          expectedFeatures: ["Performance Engine", "Premium Package"],
          trimAdjustment: 1.15,
        },
      },
    },
  };
  
  const ModelSegmentMap = {
    "PORSCHE 718 BOXSTER": "performance",
    "PORSCHE 911": "performance",
    "FORD MUSTANG": "performance",
    "CHEVROLET CORVETTE": "performance",
    "BMW M3": "performance",
    "BMW M4": "performance",
    "AUDI RS": "performance",
  };
  

  // ----------------------------------------
  // 2) DepreciationCurves
  //    - Multipliers per year of age, by segment
  // ----------------------------------------
  const DepreciationCurves = {
    default: {
      0: 1.0,
      1: 0.82,
      2: 0.72,
      3: 0.65,
      4: 0.58,
      5: 0.52,
      6: 0.47,
      7: 0.42,
      8: 0.38,
      9: 0.35,
      10: 0.32,
    },
    luxury: {
      0: 1.0,
      1: 0.78,
      2: 0.68,
      3: 0.6,
      4: 0.53,
      5: 0.47,
      6: 0.42,
      7: 0.38,
      8: 0.34,
      9: 0.31,
      10: 0.28,
    },
    truck: {
      0: 1.0,
      1: 0.85,
      2: 0.78,
      3: 0.71,
      4: 0.65,
      5: 0.6,
      6: 0.55,
      7: 0.5,
      8: 0.46,
      9: 0.42,
      10: 0.38,
    },
  };
  
  // ----------------------------------------
  // 3) MileageAdjustment
  //    - How mileage tier modifies leverage
  // ----------------------------------------
  const MileageAdjustment = {
    low: -0.02, // low miles → smaller discount band
    average: 0.0,
    high: 0.05, // high miles → larger discount band
  };
  
  // ----------------------------------------
  // 4) ModelReliabilityScores (0–10)
  // ----------------------------------------
  const ModelReliabilityScores = {
    "Toyota Camry": 9.2,
    "Honda Accord": 8.9,
    "Honda Civic": 8.7,
    "Toyota RAV4": 8.8,
    "Honda CR-V": 8.6,
    "Ford F-150": 8.0,
    "Jeep Wrangler": 6.4,
    "BMW 3 Series": 6.2,
  };
  
  // ----------------------------------------
  // 5) KnownIssueFlags
  // ----------------------------------------
  const KnownIssueFlags = {
    "Honda Accord": [
      "Some turbocharged 1.5L engines (2018–2020) have reported fuel dilution concerns; regular oil changes and monitoring are important.",
    ],
    "Ford Focus": [
      "Earlier model years with Powershift automatic transmissions have widely reported reliability issues and may require costly repairs.",
    ],
    "Jeep Wrangler": [
      "Historically, Wranglers can have higher-than-average wind noise, ride firmness, and potential for rust on underbody components if used off-road.",
    ],
    "BMW 3 Series": [
      "Some turbocharged engines are known for carbon buildup on intake valves and higher-than-average maintenance costs.",
    ],
  };
  
  // ----------------------------------------
  // 6) BodyStyleNegotiationProfiles
  // ----------------------------------------
  const BodyStyleNegotiationProfiles = {
    sedan: { leverageFactor: 1.0 },
    coupe: { leverageFactor: 1.05 },
    suv: { leverageFactor: 0.95 },
    truck: { leverageFactor: 0.9 },
    luxury: { leverageFactor: 0.85 },
    offroad: { leverageFactor: 0.95 },
  };
  
  const DealerProfiles = {
    // National chains known for firm/no-haggle or semi-fixed pricing
    "carmax": {
      type: "no-haggle",
      notes: [
        "CarMax uses fixed pricing; room for negotiation is extremely limited.",
        "Focus negotiation on add-ons or financing, not the vehicle price itself."
      ],
      leverageFactor: 0.5
    },
    "carvana": {
      type: "no-haggle",
      notes: [
        "Carvana operates mostly on fixed online pricing.",
        "Negotiation leverage is minimal; value comes from convenience."
      ],
      leverageFactor: 0.5
    },
    "autonation": {
      type: "corporate",
      notes: [
        "AutoNation often prices based on system-wide algorithms.",
        "Negotiation is possible, but corporate stores follow strict pricing rules."
      ],
      leverageFactor: 0.8
    },
  
    // Big franchise dealers typically attached to manufacturer brands
    "toyota": {
      type: "franchise",
      notes: [
        "Franchise dealerships usually leave some negotiation room,",
        "but may hold firm on popular models."
      ],
      leverageFactor: 1.0
    },
    "honda": { type: "franchise", notes: ["Franchise dealer; expect moderate negotiation flexibility."], leverageFactor: 1.0 },
    "ford":  { type: "franchise", notes: ["Franchise dealer; negotiation depends on inventory pressure."], leverageFactor: 1.0 },
    "chevrolet":  { type: "franchise", notes: ["Franchise dealer; tend to negotiate but follow internal pricing guidelines."], leverageFactor: 1.0 },
  
    // Independents — most flexible
    "motors": {
      type: "independent",
      notes: [
        "Independent dealers often price aggressively but expect negotiation.",
        "These locations vary widely; always check vehicle history carefully."
      ],
      leverageFactor: 1.2
    },
    "autos": { type: "independent", notes: ["Likely an independent seller; negotiation flexibility is higher here."], leverageFactor: 1.2 },
    "auto sales": { type: "independent", notes: ["Independent dealership; good negotiation leverage."], leverageFactor: 1.2 },
  };
  


  module.exports = {
    BaseVehicleSpecs,
    DepreciationCurves,
    MileageAdjustment,
    ModelReliabilityScores,
    KnownIssueFlags,
    BodyStyleNegotiationProfiles,
    DefaultExpectedFeatures,
    DealerProfiles
  };
  
  