// /api/admin-key.js
const rateLimitStore = new Map();
const { sendSystemAlertEmail, buildSystemAlertHtml } = require("./services/emailService");

module.exports = async (req, res) => {
  try {
    const ADMIN_KEY = process.env.ADMIN_KEY;
    const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL;
    const { key } = req.query;
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const now = Date.now();

    const entry = rateLimitStore.get(ip) || { attempts: 0, lastAttempt: 0 };

    // lockout window: 15 minutes
    if (entry.attempts >= 10 && now - entry.lastAttempt < 15 * 60 * 1000) {
      // fire alert once per lock window
      if (!entry.alerted) {
        entry.alerted = true;
        if (ADMIN_ALERT_EMAIL) {
          const html = buildSystemAlertHtml("Admin Panel Lockout", [
            `IP: <code>${ip}</code>`,
            `Window: 15 minutes`,
            `Attempts: ${entry.attempts}`,
            `Time: ${new Date().toISOString()}`,
          ]);
          sendSystemAlertEmail({
            to: ADMIN_ALERT_EMAIL,
            subject: "🚨 Admin Panel Lockout Triggered",
            html,
          }).catch(() => {});
        }
      }
      rateLimitStore.set(ip, entry);
      return res.status(429).json({ success: false, message: "Too many attempts. Try again later." });
    }

    entry.lastAttempt = now;

    if (!key) {
      entry.attempts++;
      rateLimitStore.set(ip, entry);
      return res.status(400).json({ success: false, message: "Key missing" });
    }

    if (key === ADMIN_KEY) {
      rateLimitStore.set(ip, { attempts: 0, lastAttempt: now });
      return res.status(200).json({ success: true });
    }

    entry.attempts++;
    rateLimitStore.set(ip, entry);
    return res.status(403).json({ success: false, message: "Access denied" });
  } catch (err) {
    console.error("Error validating admin key:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};