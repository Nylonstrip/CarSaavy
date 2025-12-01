// api/services/sources/carsDotCom.js
// Scraper for Cars.com vehicle detail pages and VIN search.
// Uses ScraperAPI (fast mode first, then render=true fallback).

const axios = require('axios');
const cheerio = require('cheerio');

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
const LOG_PREFIX = '[CarsDotCom]';

if (!SCRAPER_API_KEY) {
  console.warn(`${LOG_PREFIX} SCRAPER_API_KEY is not set. Scraping will fail.`);
}

function buildScraperApiUrl(targetUrl, options = {}) {
  const {
    render = false,
    premium = false,
    country = 'us',
    device = 'desktop',
  } = options;

  const params = new URLSearchParams({
    api_key: SCRAPER_API_KEY,
    url: targetUrl,
    country,
    device,
  });

  if (render) params.set('render', 'true');
  if (premium) params.set('premium', 'true');

  return `http://api.scraperapi.com/?${params.toString()}`;
}

async function fetchHtml(targetUrl, useRenderFallback = true) {
  if (!SCRAPER_API_KEY) {
    throw new Error('SCRAPER_API_KEY is missing');
  }

  const fastUrl = buildScraperApiUrl(targetUrl, { render: false });
  const renderUrl = buildScraperApiUrl(targetUrl, { render: true, premium: true });

  console.info(`${LOG_PREFIX} 🔍 Scraping: ${targetUrl}`);
  console.info(`${LOG_PREFIX} ⚡ Fast mode URL: ${fastUrl}`);

  try {
    const fastRes = await axios.get(fastUrl, {
      timeout: 15000,
      validateStatus: () => true,
    });

    if (fastRes.status >= 200 && fastRes.status < 300 && fastRes.data) {
      return {
        mode: 'fast',
        html: typeof fastRes.data === 'string' ? fastRes.data : JSON.stringify(fastRes.data),
      };
    }

    console.warn(
      `${LOG_PREFIX} ⚠ Fast mode HTTP ${fastRes.status} – body length: ${
        fastRes.data ? String(fastRes.data).length : 0
      }`
    );
  } catch (err) {
    console.warn(`${LOG_PREFIX} ⚠ Fast mode error: ${err.message}`);
    if (err.code === 'ECONNABORTED') {
      console.warn(`${LOG_PREFIX} ⏱ Fast mode timeout (${err.code})`);
    }
  }

  if (!useRenderFallback) {
    throw new Error('Fast mode failed and render fallback is disabled');
  }

  console.info(`${LOG_PREFIX} 🕒 Fast mode insufficient → trying render=true fallback...`);
  console.info(`${LOG_PREFIX} 🧠 Render mode URL: ${renderUrl}`);

  const renderRes = await axios.get(renderUrl, {
    timeout: 30000,
    validateStatus: () => true,
  });

  if (renderRes.status >= 200 && renderRes.status < 300 && renderRes.data) {
    const html = typeof renderRes.data === 'string' ? renderRes.data : JSON.stringify(renderRes.data);

    // Optional: log a small preview to Vercel logs
    const snippet = html.slice(0, 2000);
    console.info(`${LOG_PREFIX} 🟦 ===== RENDERED HTML PREVIEW START =====`);
    console.info(snippet);
    console.info(`${LOG_PREFIX} 🟦 ===== RENDERED HTML PREVIEW END =====`);

    return { mode: 'render-fallback', html };
  }

  throw new Error(
    `${LOG_PREFIX} Render mode failed with status ${renderRes.status}`
  );
}

// Basic text helpers
function cleanText(str) {
  if (!str) return '';
  return String(str).replace(/\s+/g, ' ').trim();
}

function extractNumeric(str) {
  if (!str) return null;
  const match = String(str).replace(/,/g, '').match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function parseVehicleDetailHtml(html) {
  const $ = cheerio.load(html);

  // We’ll use combined text scraping for robustness
  const fullText = cleanText($('body').text());

  // Title: e.g. "2018 Chevrolet Camaro 1LT"
  let title = '';
  const h1 = $('h1').first().text() || $('h1, h2').first().text();
  title = cleanText(h1);

  let year = null;
  let make = '';
  let model = '';
  let trim = '';

  if (title) {
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      year = Number(yearMatch[0]);
      const afterYear = title.replace(yearMatch[0], '').trim();
      const parts = afterYear.split(' ');
      if (parts.length >= 1) make = parts[0];
      if (parts.length >= 2) model = parts[1];
      if (parts.length >= 3) {
        trim = parts.slice(2).join(' ');
      }
    }
  }

  // Price: first $X,XXX that looks like the main price near the top
  let price = null;
  const priceMatch = fullText.match(/\$[\d,]+/);
  if (priceMatch) {
    price = extractNumeric(priceMatch[0]);
  }

  // Mileage: "93,567 mi."
  let mileage = null;
  const mileageMatch = fullText.match(/(\d[\d,]*)\s*mi\./i);
  if (mileageMatch) {
    mileage = extractNumeric(mileageMatch[1]);
  }

  // VIN: look for "VIN" and the following token that looks like a VIN
  let vin = null;
  const vinMatch = fullText.match(/VIN\s+([A-HJ-NPR-Z0-9]{11,17})/i);
  if (vinMatch) {
    vin = vinMatch[1];
  }

  // Dealer name & address — leave as best-effort for now
  // We can refine selectors later once we see more variety of listings.
  let dealerName = '';
  let dealerAddress = '';

  // Try heuristic: Dealer name sometimes appears near "Contact seller" or "Call (xxx)"
  // For MVP we’ll leave these empty if not easily extracted.
  // You’re still getting strong negotiation value from price/mileage/specs alone.

  const vehicle = {
    title,
    year,
    make,
    model,
    trim,
    price,
    mileage,
    vin,
    dealerName: cleanText(dealerName) || null,
    dealerAddress: cleanText(dealerAddress) || null,
  };

  console.info(`${LOG_PREFIX} ✅ Parsed vehicle:`, {
    title,
    year,
    make,
    model,
    trim,
    price,
    mileage,
    vin,
  });

  return vehicle;
}

// Scrape a specific Cars.com vehicle URL
async function scrapeByURL(url) {
  const { mode, html } = await fetchHtml(url, true);
  const vehicle = parseVehicleDetailHtml(html);

  return {
    source: 'cars',
    mode,
    url,
    vehicle,
  };
}

// VIN search → find first matching listing, then scrape it
async function scrapeByVIN(vin) {
  if (!vin) throw new Error('VIN is required for Cars.com VIN search');

  const searchUrl = `https://www.cars.com/shopping/results/?stock_type=all&maximum_distance=all&searchSource=GN_BREADCRUMB&keyword=${encodeURIComponent(
    vin
  )}`;

  console.info(`${LOG_PREFIX} 🔍 VIN search URL: ${searchUrl}`);

  const { html: searchHtml } = await fetchHtml(searchUrl, true);
  const $ = cheerio.load(searchHtml);

  // Cars.com search pages typically contain links like /vehicledetail/<id>/
  let listingPath = null;

  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!listingPath && /\/vehicledetail\//.test(href)) {
      listingPath = href;
    }
  });

  if (!listingPath) {
    throw new Error(`${LOG_PREFIX} No vehicledetail link found for VIN ${vin}`);
  }

  const listingUrl = listingPath.startsWith('http')
    ? listingPath
    : `https://www.cars.com${listingPath}`;

  console.info(`${LOG_PREFIX} 🔗 First listing URL for VIN ${vin}: ${listingUrl}`);

  return scrapeByURL(listingUrl);
}

module.exports = {
  scrapeByURL,
  scrapeByVIN,
};
