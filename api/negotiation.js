const { Resend } = require("resend");
const { put } = require("@vercel/blob");
const { createClient } = require("@supabase/supabase-js");
const { getAllVehicleData, buildMvpAnalysis } = require("../mvpEngine");

const {
  RESEND_API_KEY,
  FROM_EMAIL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

// -----------------------------
// Build the branded NPR HTML (for blob + optional inline use)
// -----------------------------
function buildEmailHtml(vehicleLabel, analysis) {
  const primary = analysis.primaryVehicle;
  const anchors = analysis.anchors;
  const risks = analysis.risks;
  const narrative = analysis.narrative;

  const moneyBullets = anchors
    .filter((a) => a.type === "money")
    .map((a) => `<li>${a.label}</li>`)
    .join("");

  const leverageBullets = anchors
    .filter((a) => a.type === "leverage")
    .map((a) => `<li>${a.label}</li>`)
    .join("");

  const riskBullets = risks
    .map((r) => `<li><strong>${r.severity}:</strong> ${r.label}</li>`)
    .join("");

  const quickMoves = analysis.quickMoves
    .map((m) => `<li>${m}</li>`)
    .join("");

  const tone = narrative.tone;
  const summary = narrative.summary;
  const openers = narrative.openers.map((o) => `<li>${o}</li>`).join("");
  const counters = narrative.counters.map((c) => `<li>${c}</li>`).join("");

  const headerLine = `${primary.year} ${primary.make} ${primary.model}${
    primary.trim ? " • " + primary.trim : ""
  }`;

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>CarSaavy Negotiation Positioning Report</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --bg: #020617;
      --card: #020617;
      --card-soft: #020617;
      --border-subtle: rgba(148, 163, 184, 0.35);
      --accent: #38bdf8;
      --accent-soft: rgba(56, 189, 248, 0.08);
      --accent-strong: rgba(56, 189, 248, 0.16);
      --text-primary: #e5e7eb;
      --text-muted: #9ca3af;
      --text-soft: #64748b;
      --pill-bg: rgba(15, 23, 42, 0.9);
      --danger: #f97373;
      --danger-soft: rgba(239, 68, 68, 0.08);
      --danger-border: rgba(239, 68, 68, 0.35);
      --good: #4ade80;
      --good-soft: rgba(34, 197, 94, 0.08);
      --good-border: rgba(34, 197, 94, 0.35);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 24px 12px;
      background: radial-gradient(circle at top, #0b1120, #020617);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text-primary);
    }

    .page {
      max-width: 720px;
      margin: 0 auto;
    }

    .card {
      background: radial-gradient(circle at top left, #020617 0, #020617 40%, #020617 100%);
      border-radius: 20px;
      border: 1px solid rgba(148, 163, 184, 0.4);
      box-shadow:
        0 18px 45px rgba(15, 23, 42, 0.85),
        0 0 0 1px rgba(15, 23, 42, 0.9);
      padding: 20px 18px;
      margin-bottom: 16px;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 16px;
    }

    .card-header-main {
      flex: 1;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(148, 163, 184, 0.4);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--text-soft);
      margin-bottom: 10px;
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: #38bdf8;
      box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.3);
    }

    h1 {
      font-size: 20px;
      margin: 0 0 4px;
      letter-spacing: 0.02em;
    }

    .vehicle-subtitle {
      font-size: 13px;
      color: var(--text-muted);
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(148, 163, 184, 0.5);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      white-space: nowrap;
    }

    .pill-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.25);
    }

    .section-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: var(--text-soft);
      margin-bottom: 6px;
    }

    .section-heading {
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 6px;
    }

    .muted {
      font-size: 12px;
      color: var(--text-muted);
      margin: 0 0 12px;
    }

    .gradient-divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, #334155, transparent);
      margin: 12px 0;
    }

    .grid {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 16px;
    }

    .bubble {
      padding: 10px 12px;
      border-radius: 14px;
      background: radial-gradient(circle at top left, rgba(15, 23, 42, 0.9), #020617);
      border: 1px solid rgba(148, 163, 184, 0.45);
      font-size: 12px;
      color: var(--text-soft);
    }

    .bubble strong {
      color: var(--text-primary);
    }

    .pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
    }

    .chip {
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(148, 163, 184, 0.4);
      font-size: 11px;
      color: var(--text-muted);
    }

    .stacked {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .list {
      margin: 0;
      padding-left: 16px;
      font-size: 12px;
      color: var(--text-soft);
    }

    .list li + li {
      margin-top: 4px;
    }

    .list strong {
      color: var(--text-primary);
    }

    .footer-note {
      margin-top: 16px;
      font-size: 11px;
      color: var(--text-soft);
    }

    @media (max-width: 640px) {
      .card {
        padding: 16px 14px;
      }
      .grid {
        grid-template-columns: 1fr;
      }
      .card-header {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="card">
      <div class="card-header">
        <div class="card-header-main">
          <div class="badge">
            <span class="badge-dot"></span>
            CARSAAVY • NEGOTIATION POSITIONING REPORT
          </div>
          <h1>${headerLine}</h1>
          <div class="vehicle-subtitle">
            ${primary.drivetrain || "Drivetrain unknown"} • ${
    primary.transmission || "Transmission unknown"
  }${primary.mileage ? ` • ${primary.mileage.toLocaleString()} miles` : ""}
          </div>
        </div>
        <div class="card-header-side">
          <div class="pill">
            <span class="pill-dot"></span>
            Free NPR
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-label">Overall Position</div>
        <p class="muted">${summary}</p>
      </div>

      <div class="gradient-divider"></div>

      <div class="grid">
        <div class="stacked">
          <div>
            <div class="section-label">Money Anchors</div>
            <div class="bubble">
              <strong>Where your leverage lives in the numbers.</strong>
              <ul class="list">
                ${moneyBullets}
              </ul>
            </div>
          </div>

          <div>
            <div class="section-label">Leverage Anchors</div>
            <div class="bubble">
              <strong>Angles that make the deal tilt toward you.</strong>
              <ul class="list">
                ${leverageBullets}
              </ul>
            </div>
          </div>
        </div>

        <div class="stacked">
          <div>
            <div class="section-label">Risk / Exposure</div>
            <div class="bubble">
              <strong>What can hurt you if ignored.</strong>
              <ul class="list">
                ${riskBullets}
              </ul>
            </div>
          </div>

          <div>
            <div class="section-label">Quick Moves</div>
            <ul class="list">
              ${quickMoves}
            </ul>
          </div>
        </div>
      </div>

      <div class="gradient-divider"></div>

      <div class="section">
        <div class="section-label">How to Sound at the Table</div>
        <p class="muted">
          General tone guidance: <strong>${tone}</strong>
        </p>
        <div class="grid">
          <div>
            <div class="section-heading">Openers</div>
            <ul class="list">
              ${openers}
            </ul>
          </div>
          <div>
            <div class="section-heading">Counterplay</div>
            <ul class="list">
              ${counters}
            </ul>
          </div>
        </div>
      </div>

      <p class="footer-note">
        Good luck — you’re more prepared than the average buyer walking into that store. Use this as a script, not a script you must obey.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

// -----------------------------
// Helper for the outbound email shell
// -----------------------------
function buildNprEmailShell(vehicleLabel, reportUrl) {
  const safeLabel = vehicleLabel || "your vehicle";

  // If we have a hosted HTML URL, keep the email light and link out.
  if (reportUrl) {
    return `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #0f172a;">
        <h1 style="font-size: 20px; margin-bottom: 12px;">Your free Negotiation Positioning Report is ready</h1>
        <p style="margin: 0 0 12px;">
          Vehicle: <strong>${safeLabel}</strong>
        </p>
        <p style="margin: 0 0 16px;">
          Tap the button below to open your report in your browser. You can download or print it from there.
        </p>
        <p style="margin: 0 0 24px;">
          <a href="${reportUrl}" style="display: inline-block; padding: 10px 18px; background:#0f172a; color:#ffffff; text-decoration:none; border-radius:999px; font-weight:600;">
            View your free report
          </a>
        </p>
        <p style="font-size: 12px; color:#64748b; margin-top:24px;">
          If the button doesn’t work, copy and paste this link into your browser:<br />
          <span style="word-break: break-all;">${reportUrl}</span>
        </p>
        <p style="font-size: 12px; color:#64748b; margin-top:16px;">
          – CarSaavy
        </p>
      </div>
    `;
  }

  // Fallback if blob upload failed: small inline message.
  return `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #0f172a;">
      <p>Your free Negotiation Positioning Report for <strong>${safeLabel}</strong> is ready.</p>
      <p>If you have trouble viewing this email, reply and we’ll resend it another way.</p>
      <p style="font-size: 12px; color:#64748b; margin-top:16px;">– CarSaavy</p>
    </div>
  `;
}

// -----------------------------
// Main handler
// -----------------------------
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { vin, email, year, make, model } = req.body || {};

  if (!vin || !email) {
    return res
      .status(400)
      .json({ error: "VIN and email are required to generate a report." });
  }

  try {
    // 1) Get vehicle data from our MVP engine
    const vehicleData = await getAllVehicleData({ vin, year, make, model });

    if (!vehicleData || !vehicleData.primaryVehicle) {
      return res.status(400).json({
        error:
          "We couldn’t build a reliable profile for this vehicle yet. Please double-check the VIN.",
      });
    }

    const vp = vehicleData.primaryVehicle;
    const vehicleLabel = `${vp.year} ${vp.make} ${vp.model}`;

    // 2) Build NPR-style analysis (no extra OpenAI calls)
    const analysis = buildMvpAnalysis(vehicleData);

    // 3) Build full HTML for the NPR (used both for blob + fallback email)
    const html = buildEmailHtml(vehicleLabel, analysis);

    // 4) Optionally push that HTML to Vercel Blob for a shareable link
    let reportUrl;
    try {
      const safeVin = (vin || "novin").replace(/[^a-zA-Z0-9]/g, "");
      const fileName = `npr/${safeVin || "vehicle"}-${Date.now()}.html`;
      const blob = await put(fileName, html, { access: "public" });
      reportUrl = blob.url;
    } catch (blobErr) {
      console.error("[Negotiation] Failed to upload NPR HTML to blob:", blobErr);
      // Not fatal for the user; email will still contain the inline content
    }

    // 5) Save a copy in Supabase (same structure as before)
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[Negotiation] Missing Supabase env vars");
    } else {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });

      const { error: insertError } = await supabase
        .from("negotiation_reports")
        .insert({
          email,
          vin: vp.vin,
          year: vp.year,
          make: vp.make,
          model: vp.model,
          segment: vp.segment,
          trim_tier: vp.trimTier,
          html,
        });

      if (insertError) {
        console.error("[Negotiation] Supabase insert failed:", insertError);
      }
    }

    // 6) Send email via Resend — simple shell with CTA link to hosted HTML
    const resend = new Resend(RESEND_API_KEY);
    const subject = `Your free Negotiation Positioning Report — ${vehicleLabel}`;
    const emailHtml = buildNprEmailShell(vehicleLabel, reportUrl || null);

    try {
      await resend.emails.send({
        from: FROM_EMAIL || "CarSaavy Reports <reports@carsaavy.com>",
        to: [email],
        subject,
        html: emailHtml || html,
      });
    } catch (err) {
      console.error("[Negotiation] Failed to send email:", err);
      // Report + lead exist; you can always recover from Supabase if needed
    }

    // Front-end only cares that this returns success
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[Negotiation] Unexpected error:", err);
    return res
      .status(500)
      .json({ error: "Something went wrong generating your report." });
  }
};