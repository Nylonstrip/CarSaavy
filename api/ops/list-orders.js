// api/ops/list-orders.js
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const opsKey = req.headers["x-ops-key"];
  if (!opsKey || opsKey !== process.env.OPS_DASH_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("OPS list-orders error:", error);
    return res.status(500).json({ error: "Failed to fetch orders" });
  }

  return res.status(200).json({ orders: data });
};
