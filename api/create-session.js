// api/manual/create-session.js

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const dns = require("dns").promises;

function normalizeStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

async function hasMXRecords(email) {
  const domain = email.split("@")[1];
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const {
      fullName,
      email,
      phone,
      vin,
      listingUrl,
      timelineContext,
      budget,
      additionalContext,
      // new fields we just added
      purchasePurpose,
      purchasePurposeOther,
      // pricing info
      priceId,
      tier,
      rush,
      slaHours,
    } = req.body;

    // 1) Hard required fields
    if (!fullName || !email || !priceId || !tier || !purchasePurpose) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // 2) Email syntax + MX check
    const emailNorm = normalizeStr(email).toLowerCase();
    const syntaxOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailNorm);
    if (!syntaxOk) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    const mxOk = await hasMXRecords(emailNorm);
    if (!mxOk) {
      return res.status(400).json({
        error: "Email domain does not appear to accept mail. Please use a valid inbox.",
      });
    }

    // 3) Require at least VIN or Listing URL
    const vinNorm = normalizeStr(vin).toUpperCase();
    const listingUrlNorm = normalizeStr(listingUrl);
    if (!vinNorm && !listingUrlNorm) {
      return res
        .status(400)
        .json({ error: "VIN or listing URL required for manual reports." });
    }

    // 4) Rush → phone required
    const isRush = !!rush;
    if (isRush && !normalizeStr(phone)) {
      return res.status(400).json({
        error:
          "Phone number required for 24h rush orders to ensure deadline fulfillment.",
      });
    }

    // 5) Normalize purpose fields
    const purposeNorm = normalizeStr(purchasePurpose);
    const purposeOtherNorm = normalizeStr(purchasePurposeOther).slice(0, 120);

    // 6) Clean up optional context
    const timelineNorm = normalizeStr(timelineContext);
    const budgetNorm = normalizeStr(budget).slice(0, 50);
    const additionalNorm = normalizeStr(additionalContext);

    // 7) Generate server-side order number (for tracking & credits)
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);

    const orderNumber = `MAN-${yy}${mm}${dd}-${rand}`;
    

    // 8) Build metadata for webhook
    const metadata = {
        mode: "manual-report",              // 👈 distinguishes from auto report
        orderNumber,                        // 👈 NEW: human-friendly tracking ID
        fullName: normalizeStr(fullName),
        email: emailNorm,
        phone: normalizeStr(phone),
        vin: vinNorm,
        listingUrl: listingUrlNorm,
        timelineContext: timelineNorm,
        budget: budgetNorm,
        additionalContext: additionalNorm,
        purchasePurpose: purposeNorm,
        purchasePurposeOther: purposeOtherNorm,
        tier: normalizeStr(tier),           // "essential" | "comprehensive"
        rush: isRush ? "true" : "false",
        slaHours: String(slaHours || ""),
        };
      

    // 8) Compute base URL (match your existing pattern from create-payment.js)
    const baseUrl =
      process.env.NODE_ENV === "production"
        ? "https://www.carsaavy.com"
        : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

    // 9) Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: emailNorm,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_intent_data: { metadata },
      success_url: `${baseUrl}/manual-success`,
      cancel_url: `${baseUrl}/manual-cancel`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("❌ manual create-session error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
