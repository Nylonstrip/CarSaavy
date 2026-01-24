// api/ops/update-status.js
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const opsKey = req.headers["x-ops-key"];
  if (!opsKey || opsKey !== process.env.OPS_DASH_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { sku, status } = req.body || {};

  const allowed = ["queued", "in_progress", "ready", "sent", "canceled"];
  if (!sku || !allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("sku", sku);

  if (error) {
    console.error("OPS update-status error:", error);
    return res.status(500).json({ error: "Failed to update status" });
  }

  return res.status(200).json({ ok: true });
};
