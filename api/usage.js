const fs = require("fs");
const path = require("path");

const usageFile = path.join("/tmp", "usage.json");

module.exports = async (req, res) => {
  try {
    // Ensure the usage file exists
    if (!fs.existsSync(usageFile)) {
      fs.writeFileSync(usageFile, JSON.stringify({ count: 0 }));
    }

    const data = JSON.parse(fs.readFileSync(usageFile, "utf8"));
    const count = data.count || 0;
    const percentage = ((count / 500) * 100).toFixed(1);

    // Determine status
    let status = "✅ Normal";
    if (count >= 400) status = "🔥 80% of quota used";
    else if (count >= 200) status = "⚠️ 50% of quota used";
    if (count >= 500) status = "🚫 Fallback mode active";

    // Build response
    return res.status(200).json({
      success: true,
      count,
      percentage: `${percentage}%`,
      status,
      message:
        count >= 500
          ? "Quota exceeded — using fallback mode"
          : "System operating normally",
    });
  } catch (err) {
    console.error("Error reading usage file:", err);
    return res.status(500).json({
      success: false,
      message: "Error retrieving usage data",
      error: err.message,
    });
  }
};
