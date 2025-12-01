// api/services/vehicleData.js
// Central orchestrator for vehicle data.
// Primary source: Cars.com
// Future fallback: CarGurus (stubbed for now).

const { scrapeByVIN: carsScrapeByVIN, scrapeByURL: carsScrapeByURL } = require('./sources/carsDotCom');
// Placeholder for future CarGurus implementation:
// const { scrapeByVIN: guruScrapeByVIN } = require('./sources/carGurus');

const LOG_PREFIX = '[VehicleData]';

const FORCE_SOURCE = process.env.FORCE_SOURCE; // 'cars', 'cargurus', etc.
const USE_CARGURUS_BACKUP =
  (process.env.USE_CARGURUS_BACKUP || '').toLowerCase() === 'true';

function logSourceChoice(message, extra) {
  console.info(`${LOG_PREFIX} ${message}`, extra || '');
}

/**
 * Normalize the vehicle payload to the shape your report generator expects.
 * You can extend this over time without breaking callers.
 */
function normalizeVehicleResult(raw, meta = {}) {
  if (!raw || !raw.vehicle) {
    throw new Error('normalizeVehicleResult: missing raw.vehicle');
  }

  const v = raw.vehicle;

  return {
    // Core identity
    vin: v.vin || meta.vin || null,
    year: v.year || null,
    make: v.make || null,
    model: v.model || null,
    trim: v.trim || null,

    // Pricing & mileage
    price: v.price || null,
    mileage: v.mileage || null,

    // Dealer info (may be null for now)
    dealerName: v.dealerName || null,
    dealerAddress: v.dealerAddress || null,

    // Source metadata
    source: raw.source || meta.source || null,
    scrapeMode: raw.mode || null,
    sourceUrl: raw.url || null,
  };
}

/**
 * Primary entrypoint: fetch vehicle data from whichever source is appropriate.
 * Arguments:
 *   - vin (string) – required
 *   - options:
 *       - url: optional listing URL supplied by user
 */
async function fetchVehicleData(vin, options = {}) {
  const { url } = options || {};

  if (!vin && !url) {
    throw new Error('fetchVehicleData requires at least a VIN or a listing URL');
  }

  const effectiveVin = vin || null;

  // If FORCE_SOURCE is set, we can honor that here later (cars vs cargurus).
  if (FORCE_SOURCE && FORCE_SOURCE.toLowerCase() === 'cars') {
    logSourceChoice('FORCE_SOURCE=cars active');
    return fetchFromCars(effectiveVin, url);
  }

  if (FORCE_SOURCE && FORCE_SOURCE.toLowerCase() === 'cargurus') {
    logSourceChoice('FORCE_SOURCE=cargurus active');
    // Placeholder – will implement CarGurus later.
    throw new Error('CarGurus source is not implemented yet.');
  }

  // Default: try Cars.com first, then optionally fallback to CarGurus
  try {
    return await fetchFromCars(effectiveVin, url);
  } catch (err) {
    console.error(`${LOG_PREFIX} Cars.com error:`, err.message || err);

    if (!USE_CARGURUS_BACKUP) {
      console.warn(
        `${LOG_PREFIX} USE_CARGURUS_BACKUP is false – not attempting fallback.`
      );
      throw err;
    }

    console.warn(
      `${LOG_PREFIX} Cars.com failed and USE_CARGURUS_BACKUP=true – would fallback to CarGurus here, but it is not yet implemented.`
    );
    throw err;
  }
}

async function fetchFromCars(vin, url) {
  let raw;

  if (url) {
    logSourceChoice('Using Cars.com by URL', { url });
    raw = await carsScrapeByURL(url);
  } else if (vin) {
    logSourceChoice('Using Cars.com by VIN', { vin });
    raw = await carsScrapeByVIN(vin);
  } else {
    throw new Error('Cars.com fetch requires vin or url');
  }

  const normalized = normalizeVehicleResult(raw, {
    vin,
    source: 'cars',
  });

  console.info(`${LOG_PREFIX} ✅ Normalized vehicle from Cars.com:`, {
    vin: normalized.vin,
    year: normalized.year,
    make: normalized.make,
    model: normalized.model,
    trim: normalized.trim,
    price: normalized.price,
    mileage: normalized.mileage,
  });

  return normalized;
}

module.exports = {
  fetchVehicleData,
};
