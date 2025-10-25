// /api/services/logger.js

const LEVELS = ["debug", "info", "warn", "error"];
const COLORS = {
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m",  // green
  warn: "\x1b[33m",  // yellow
  error: "\x1b[31m", // red
  reset: "\x1b[0m"
};

class Logger {
  constructor() {
    const envLevel = process.env.LOG_LEVEL
      ? process.env.LOG_LEVEL.trim().toLowerCase()
      : "info";
    this.level = LEVELS.includes(envLevel) ? envLevel : "info";
    this.startTime = Date.now();

    console.log(`🧠 Logger initialized at level: ${this.level}`);
  }

  // internal helper: should we print?
  shouldLog(level) {
    return LEVELS.indexOf(level) >= LEVELS.indexOf(this.level);
  }

  // generic handler
  log(level, scope, message, ...args) {
    if (!this.shouldLog(level)) return;

    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const color = COLORS[level] || "";
    const reset = COLORS.reset;
    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] (+${elapsed}s)`;

    const formatted = `${color}${prefix}${reset} ${message}`;

    switch (level) {
      case "error":
        console.error(formatted, ...args);
        break;
      case "warn":
        console.warn(formatted, ...args);
        break;
      case "debug":
        console.debug(formatted, ...args);
        break;
      default:
        console.log(formatted, ...args);
    }
  }

  debug(scope, message, ...args) { this.log("debug", scope, message, ...args); }
  info(scope, message, ...args) { this.log("info", scope, message, ...args); }
  warn(scope, message, ...args) { this.log("warn", scope, message, ...args); }
  error(scope, message, ...args) { this.log("error", scope, message, ...args); }
}

module.exports = new Logger();