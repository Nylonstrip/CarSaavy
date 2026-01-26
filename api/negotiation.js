// api/negotiation.js

const { Resend } = require("resend");
const { createClient } = require("@supabase/supabase-js");

// Reuse your NIC core
const { getAllVehicleData } = require("./services/vehicleData");
const { buildMvpAnalysis } = require("./mvpEngine");

// -----------------------------
// Helpers
// -----------------------------
function isValidEmail(email) {
  if (!email) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim());
}

function normalizeStr(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function toNumberOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(/[$,]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Build a human-friendly title for subject/body
function buildVehicleLabel(vp) {
  if (!vp) return "your vehicle";
  const parts = [vp.year, vp.make, vp.model]
    .map(p => (p ? String(p).trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(" ") : "your vehicle";
}

// Very lightweight HTML email using analysis output
function buildEmailHtml(vehicleLabel, analysis) {
  const stance = analysis?.summary?.stance || "Neutral";
  const posture = analysis?.summary?.postureSummary || "";
  const keyAngles = analysis?.leverage?.keyAngles || [];
  const buyerScripts = analysis?.tactics?.openingScripts || [];
  const dealerCounters = analysis?.tactics?.dealerCounters || [];
  const riskNotes = analysis?.risk?.headlineRisks || [];

  // CTA URL placeholder – adjust to match your real manual URL
  const ctaUrl = "https://carsaavy.com/manual"; // update if needed

  return `
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Negotiation Readiness Report — ${vehicleLabel}</title>
  </head>
  <body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#e5e7eb;">
    <div style="max-width:640px;margin:0 auto;padding:24px 16px 40px;">
      <!-- Header -->
      <div style="border-radius:16px;border:1px solid #1f2937;background:
          radial-gradient(circle at top left,rgba(56,189,248,0.18),transparent 55%),
          radial-gradient(circle at bottom right,rgba(52,211,153,0.15),transparent 55%),
          linear-gradient(135deg,#020617,#020617);padding:20px 18px 18px;">
        <div style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#a5b4fc;margin-bottom:4px;">
          CarSaavy · Negotiation Readiness
        </div>
        <div style="font-size:18px;font-weight:600;color:#f9fafb;margin-bottom:4px;">
          ${vehicleLabel}
        </div>
        <div style="font-size:13px;color:#9ca3af;">
          Your negotiation positioning snapshot, based on vehicle identity and typical dealer behavior for this segment.
        </div>
      </div>

      <!-- Stance -->
      <div style="margin-top:18px;border-radius:12px;border:1px solid #1f2937;padding:16px 16px 14px;background:linear-gradient(145deg,rgba(15,23,42,0.95),rgba(15,23,42,1));">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:#9ca3af;margin-bottom:4px;">
          Overall stance
        </div>
        <div style="font-size:15px;font-weight:600;color:#e5e7eb;margin-bottom:4px;">
          ${stance}
        </div>
        ${
          posture
            ? `<div style="font-size:13px;line-height:1.6;color:#9ca3af;">${posture}</div>`
            : ""
        }
      </div>

      <!-- Leverage angles -->
      ${
        keyAngles && keyAngles.length
          ? `
      <div style="margin-top:16px;border-radius:12px;border:1px solid #1f2937;padding:14px 16px;background:#020617;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:#9ca3af;margin-bottom:6px;">
          Primary leverage angles
        </div>
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:#cbd5f5;">
          ${keyAngles.map(a => `<li>${a}</li>`).join("")}
        </ul>
      </div>
      `
          : ""
      }

      <!-- Buyer scripts -->
      ${
        buyerScripts && buyerScripts.length
          ? `
      <div style="margin-top:16px;border-radius:12px;border:1px solid #1f2937;padding:14px 16px;background:#020617;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:#9ca3af;margin-bottom:6px;">
          Opening negotiation scripts
        </div>
        <ol style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:#cbd5f5;">
          ${buyerScripts.map(s => `<li style="margin-top:4px;">${s}</li>`).join("")}
        </ol>
      </div>
      `
          : ""
      }

      <!-- Dealer pushback handling -->
      ${
        dealerCounters && dealerCounters.length
          ? `
      <div style="margin-top:16px;border-radius:12px;border:1px solid #1f2937;padding:14px 16px;background:#020617;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:#9ca3af;margin-bottom:6px;">
          If the dealer pushes back
        </div>
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:#cbd5f5;">
          ${dealerCounters.map(s => `<li style="margin-top:4px;">${s}</li>`).join("")}
        </ul>
      </div>
      `
          : ""
      }

      <!-- Risk notes -->
      ${
        riskNotes && riskNotes.length
          ? `
      <div style="margin-top:16px;border-radius:12px;border:1px solid #1f2937;padding:14px 16px;background:#020617;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:#9ca3af;margin-bottom:6px;">
          Key risk checks before committing
        </div>
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:#fca5a5;">
          ${riskNotes.map(r => `<li style="margin-top:4px;">${r}</li>`).join("")}
        </ul>
      </div>
      `
          : ""
      }

      <!-- CTA -->
      <div style="margin-top:20px;border-radius:12px;border:1px solid #1f2937;padding:14px 16px;background:radial-gradient(circle at top left,rgba(56,189,248,0.2),transparent 55%),#020617;">
        <div style="font-size:13px;color:#e5e7eb;margin-bottom:8px;">
          Want a deeper, analyst-built plan specific to your deal, fees, and dealer behavior?
        </div>
        <a href="${ctaUrl}"
           style="display:inline-block;padding:9px 16px;border-radius:999px;border:1px solid rgba(148,163,184,0.9);font-size:13px;font-weight:500;color:#f9fafb;text-decoration:none;">
          Upgrade to a Full Manual Evaluation (48h)
        </a>
        <div style="font-size:11px;color:#6b7280;margin-top:6px;">
          Includes detailed inspection focus points, fee audit, and tailored walk-away triggers.
        </div>
      </div>

      <!-- Footer -->
      <div style="margin-top:30px;font-size:11px;color:#6b7280;text-align:center;line-height:1.6;">
        You’re more prepared than most people who walk into the dealership.<br/>
        Good luck, you’re prepared. Execute the plan. — CarSaavy
      </div>
    </div>
  </body>
</html>
  `;
}

// -----------------------------
// Main handler
// -----------------------------
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};

    const email = normalizeStr(body.email);
    const vin = normalizeStr(body.vin);
    const year = normalizeStr(body.year);
    const make = normalizeStr(body.make);
    const model = normalizeStr(body.model);
    const segment = normalizeStr(body.segment);
    const trimTier = normalizeStr(body.trimTier);
    const askingPrice = toNumberOrNull(body.askingPrice);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const hasVin = !!vin;
    const hasYmm = !!(year && make && model);

    if (!hasVin && !hasYmm) {
      return res.status(400).json({
        error: "Please provide either a valid VIN or Year/Make/Model.",
      });
    }

    if (hasVin && hasYmm) {
      return res.status(400).json({
        error: "Conflicting vehicle identifiers. Use VIN or Year/Make/Model, not both.",
      });
    }

    // -----------------------------
    // Resolve vehicle profile
    // -----------------------------
    const vehicleInput = hasVin
      ? { vin, year, make, model, segment, trimTier }
      : { year, make, model, segment, trimTier };

    const { vehicleProfile, error: vpError } = await getAllVehicleData(vehicleInput);

    if (!vehicleProfile && vpError) {
      console.warn("[Negotiation] Vehicle resolution failed:", vpError);
    }

    const vp = vehicleProfile || {
      year: year ? Number(year) : null,
      make: make || null,
      model: model || null,
      segment: segment || "general",
      trimTier: trimTier || null,
      vin: vin || null,
      mileage: null,
    };

    const analysisInput = {
      year: vp.year,
      make: vp.make,
      model: vp.model,
      segment: vp.segment,
      trimTier: vp.trimTier,
      vin: vp.vin,
      mileage: vp.mileage,
      askingPrice,
    };

    const analysis = buildMvpAnalysis(analysisInput);
    const vehicleLabel = buildVehicleLabel(vp);
    const html = buildEmailHtml(vehicleLabel, analysis);

    // -----------------------------
    // Save lead to Supabase
    // -----------------------------
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("[Negotiation] Missing Supabase env vars");
    } else {
      const supabase = createClient(supabaseUrl, supabaseKey, {
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

    // -----------------------------
    // Send email to customer
    // -----------------------------
    const resend = new Resend(process.env.RESEND_API_KEY);

    const subject = `Negotiation Readiness Report — ${vehicleLabel}`;

    try {
      await resend.emails.send({
        from: "CarSaavy Reports <reports@carsaavy.com>",
        to: [email],
        subject,
        html,
      });
    } catch (err) {
      console.error("[Negotiation] Failed to send email:", err);
      // We still return success since the lead is stored; but you can flip this if you prefer
    }

    return res.status(200).json({ success: true, html });
  } catch (err) {
    console.error("[Negotiation] Unexpected error:", err);
    return res.status(500).json({
      error: "Failed to generate negotiation report.",
    });
  }
};
