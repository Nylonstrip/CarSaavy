// /api/services/logger.js
const pino = require("pino");

const logLevel = process.env.LOG_LEVEL || "info";
const isProd = process.env.NODE_ENV === "production";

const baseLogger = pino({
  level: logLevel,
  transport: !isProd
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "yyyy-mm-dd HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Announce init only in development
if (!isProd) {
  console.log(`🧠 Logger initialized at level: ${logLevel}`);
}

// Build scoped logger helper
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