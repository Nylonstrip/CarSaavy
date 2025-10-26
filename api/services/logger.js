// /api/services/logger.js
const pino = require("pino");

const logLevel = process.env.LOG_LEVEL || "info";
const isProd = process.env.NODE_ENV === "production";
const forcePretty = process.env.FORCE_PRETTY_LOGS === "true";

// Try to resolve pino-pretty safely
let transport;
if (!isProd || forcePretty) {
  try {
    require.resolve("pino-pretty"); // check if it’s installed
    transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "yyyy-mm-dd HH:MM:ss.l",
        singleLine: true,
        ignore: "pid,hostname",
      },
    };
  } catch {
    console.warn("⚠️ Pretty transport not available — falling back to JSON logs");
  }
}

const baseLogger = pino({
  level: logLevel,
  transport,
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Startup confirmation
if (!isProd) {
  console.log(
    `🧠 Logger initialized at level: ${logLevel} (pretty: ${!!transport})`
  );
}

// Scoped logger pattern
const logger = {
  info: (msg, ...args) => baseLogger.info(msg, ...args),
  error: (msg, ...args) => baseLogger.error(msg, ...args),
  warn: (msg, ...args) => baseLogger.warn(msg, ...args),
  debug: (msg, ...args) => baseLogger.debug(msg, ...args),

  scope: (context) => ({
    info: (msg, ...args) => baseLogger.info(`[${context}] ${msg}`, ...args),
    error: (msg, ...args) => baseLogger.error(`[${context}] ${msg}`, ...args),
    warn: (msg, ...args) => baseLogger.warn(`[${context}] ${msg}`, ...args),
    debug: (msg, ...args) => baseLogger.debug(`[${context}] ${msg}`, ...args),
  }),
};

module.exports = logger;