// /api/services/logger.js

/**
 * Carsaavy Logger — lightweight audit trail system.
 * Saves each VIN report generation event to /tmp/logs.json
 * Works on both Vercel (ephemeral) and local environments.
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join('/tmp', 'carsaavy_logs.json');

/**
 * Appends a structured log entry.
 * @param {Object} data { vin, email, status, message, error }
 */
async function logEvent(data = {}) {
  try {
    const timestamp = new Date().toISOString();

    const entry = {
      timestamp,
      vin: data.vin || 'Unknown',
      email: data.email || 'Unknown',
      status: data.status || 'unknown',
      message: data.message || '',
      error: data.error || null,
    };

    // Read existing logs (if any)
    let logs = [];
    if (fs.existsSync(LOG_FILE)) {
      const fileData = fs.readFileSync(LOG_FILE, 'utf8');
      logs = JSON.parse(fileData || '[]');
    }

    // Add new log and write back
    logs.push(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), 'utf8');

    console.log(`🪵 [Logger] Logged event for VIN ${entry.vin} (${entry.status})`);
  } catch (err) {
    console.error("❌ [Logger] Failed to write log:", err.message);
  }
}

/**
 * Reads all log entries (for internal analytics or debugging)
 */
async function readLogs() {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const fileData = fs.readFileSync(LOG_FILE, 'utf8');
    return JSON.parse(fileData || '[]');
  } catch (err) {
    console.error("❌ [Logger] Failed to read logs:", err.message);
    return [];
  }
}

module.exports = { logEvent, readLogs };