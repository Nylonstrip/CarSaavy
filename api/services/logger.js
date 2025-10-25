// api/logger.js
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const levelName = (process.env.LOG_LEVEL || "info").toLowerCase();
const LEVEL = LEVELS[levelName] ?? LEVELS.info;

function logAt(reqLevel, prefix, ...args) {
  if (LEVELS[reqLevel] <= LEVEL) {
    const ts = new Date().toISOString();
    // Use console methods so Vercel groups severities correctly
    const fn = reqLevel === "error" ? console.error :
               reqLevel === "warn"  ? console.warn  :
               reqLevel === "debug" ? console.debug : console.log;
    fn(`${ts} [${reqLevel}] ${prefix}`, ...args);
  }
}

module.exports = {
  error: (...a) => logAt("error", "", ...a),
  warn:  (...a) => logAt("warn",  "", ...a),
  info:  (...a) => logAt("info",  "", ...a),
  debug: (...a) => logAt("debug", "", ...a),

  // Convenience tagged loggers
  scope(tag) {
    const p = tag ? `[${tag}]` : "";
    return {
      error: (...a) => logAt("error", p, ...a),
      warn:  (...a) => logAt("warn",  p, ...a),
      info:  (...a) => logAt("info",  p, ...a),
      debug: (...a) => logAt("debug", p, ...a),
    };
  },
};