// /api/services/vehicleData.js
const logger = require("./logger");
const { sendAdminAlert } = require("./emailService");
const fetch = global.fetch || require("node-fetch"); // Vercel has fetch, this is just a safe fallback

// ---- ENV / DEFAULTS ----
const MOCK_MODE = process.env.MOCK_MODE !== "false"; // default true unless explicitly "false"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "carsaavy@gmail.com";
const MARKETCHECK_API_KEY = process.env.MARKETCHECK_API_KEY || "";

// ---- In-memory state (resets on redeploy) ----
let apiCallCount = 0;
const seenVINs = new Set();
const vinAttemptWindow = new Map(); // vin -> { count, windowStart }

// ---- VIN helpers ----
function normalizeVin(v) {
  return String(v || "").trim().toUpperCase();
}
function isLikelyVin(v) {
  return /^[A-HJ-NPR-Z0-9]{11,17}$/.test(v); // simple VIN pattern (excludes I,O,Q)
}

// Basic per-VIN rate limit: 5 requests / 10 minutes per deploy
function checkVinRateLimit(vin) {
  const WINDOW_MS = 10 * 60 * 1000;
  const LIMIT = 5;
  const now = Date.now();
  const entry = vinAttemptWindow.get(vin) || { count: 0, windowStart: now };
  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  vinAttemptWindow.set(vin, entry);
  return entry.count <= LIMIT;
}

// ---- Usage alerts (non-blocking) ----
async function maybeSendUsageAlert(count) {
  try {
    if (!ADMIN_EMAIL) return;
    if (count >= 500) {
      await sendAdminAlert(
        ADMIN_EMAIL,
        "MarketCheck quota exceeded",
        `<p>Calls: ${count}/500. Fallback should engage.</p><p>${new Date().toISOString()}</p>`
      );
      return;
    }
    if (count === 400) {
      await sendAdminAlert(
        ADMIN_EMAIL,
        "MarketCheck usage at 80%",
        `<p>Calls: ${count}/500. Consider upgrading or enabling paid fallback.</p>`
      );
    } else if (count === 200) {
      await sendAdminAlert(
        ADMIN_EMAIL,
        "MarketCheck usage at 50%",
        `<p>Calls: ${count}/500. Monitoring recommended.</p>`
      );
    }
  } catch (e) {
    logger.warn(`[VehicleData] Usage alert failed: ${e.message}`);
  }
}

// ---- Mock response for quick testing ----
function getMockVehicleData(vin) {
  logger.info(`[VehicleData] MOCK_MODE active for VIN ${vin}`);
  return {
    vin,
    specs: { make: "Honda", model: "Civic", year: 2020, trim: "EX" },
    pricing: { asking: 18500, estFair: 17900, variance: -600 },
    recalls: [{ id: "NHTSA-FAKE-123", title: "Brake hose recall", status: "OPEN" }],
    repairs: [{ type: "Oil change", date: "2024-08-10", miles: 32000 }],
  };
}

// ---- Real data fetch (keep simple for MVP) ----
async function fetchMarketcheckSpecs(vin) {
  if (!MARKETCHECK_API_KEY) {
    throw new Error("Missing MARKETCHECK_API_KEY");
  }
  const url = `https://api.marketcheck.com/v2/vins/${vin}/specs?api_key=${MARKETCHECK_API_KEY}`;
  try {
    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`MarketCheck error: ${r.status} ${r.statusText} — body: ${text}`);
    }
    const json = await r.json();
    return json;
  } catch (err) {
    logger.error(`[VehicleData] fetchMarketcheckSpecs error for VIN ${vin}: ${err.stack}`);
    throw err; // ensure upstream caller knows
  }
}

// ---- Public API ----
async function getAllVehicleData(rawVin) {
  const vin = normalizeVin(rawVin);
  logger.info(`[VehicleData] Start for VIN: ${vin}`);

  // Validate VIN format
  if (!isLikelyVin(vin)) {
    const msg = "Invalid or missing VIN";
    logger.warn(`[VehicleData] ${msg}: "${rawVin}"`);
    await sendAdminAlert(ADMIN_EMAIL, "Invalid VIN passed to vehicleData", `<p>VIN: ${rawVin}</p>`);
    return { success: false, error: msg };
  }

  // Duplicate prevention (per deploy)
  if (seenVINs.has(vin)) {
    logger.warn(`[VehicleData] Duplicate VIN lookup prevented: ${vin}`);
    return { success: true, duplicate: true, vin };
  }

  // Per-VIN rate limit (cheap anti-abuse)
  if (!checkVinRateLimit(vin)) {
    const msg = "VIN rate limit exceeded";
    logger.warn(`[VehicleData] ${msg}: ${vin}`);
    await sendAdminAlert(ADMIN_EMAIL, "VIN rate limit exceeded", `<p>VIN: ${vin}</p>`);
    return { success: false, error: msg };
  }

  // Usage counter (only for live MarketCheck calls)
  const willCallExternal = (MOCK_MODE === false);
  if (willCallExternal) {
    // Soft cap: if already >=500, short-circuit to minimal data
    if (apiCallCount >= 500) {
      logger.warn("[VehicleData] Quota exceeded — returning minimal data.");
      return {
        vin,
        specs: { note: "Quota exceeded; minimal data returned." },
        pricing: {},
        recalls: [],
        repairs: [],
        quotaExceeded: true,
      };
    }
    apiCallCount += 1;
    logger.info(`[VehicleData] MarketCheck call #${apiCallCount}`);
    // non-blocking usage alert
    // no await — don't delay user flow
    // eslint-disable-next-line promise/catch-or-return
    maybeSendUsageAlert(apiCallCount);
  }

  try {
    let vehicleData;
    if (MOCK_MODE) {
      vehicleData = getMockVehicleData(vin);
    } else {
      const specs = await fetchMarketcheckSpecs(vin);
      // Shape minimal MVP structure
      vehicleData = {
        vin,
        specs: {
          make: specs.make || "Unknown",
          model: specs.model || "Unknown",
          year: specs.year || "Unknown",
          trim: specs.trim || "",
        },
        pricing: {},   // fill when pricing source is added
        recalls: [],   // fill when NHTSA is wired
        repairs: [],   // fill when repair source is wired
      };
    }

    seenVINs.add(vin);
    logger.info(`[VehicleData] Completed for VIN: ${vin}`);
    return vehicleData;
  } catch (err) {
    logger.error(`[VehicleData] Fetch error for ${vin}: ${err.message}`);
    try {
      await sendAdminAlert(
        ADMIN_EMAIL,
        "Vehicle data fetch failed",
        `<p>VIN: ${vin}</p><p>Error: ${err.message}</p>`
      );
    } catch (_) {}
    return { success: false, error: "vehicle_data_fetch_failed" };
  }
}

module.exports = { getAllVehicleData };
