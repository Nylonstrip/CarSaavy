// /api/test-blob.js  (temporary)
const { put } = require("@vercel/blob");
const fs = require("fs");

module.exports = async (req, res) => {
  try {
    const blob = await put("test-upload.txt", Buffer.from("Hello CarSaavy!"), { access: "public" });
    return res.status(200).json({ success: true, url: blob.url });
  } catch (err) {
    console.error("Blob test failed:", err);
    return res.status(500).json({ error: err.message });
  }
};