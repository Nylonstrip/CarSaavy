// api/test-blob.js
const { put } = require("@vercel/blob");

module.exports = async (req, res) => {
  try {
    const fileName = `blob-test-${Date.now()}.txt`;
    const contents = "✅ Blob test file created successfully!";
    
    console.log("🔐 Blob token present:", !!process.env.BLOB_READ_WRITE_TOKEN);

    const { url } = await put(fileName, contents, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: "text/plain",
    });

    console.log(`✅ Blob upload successful: ${url}`);
    return res.status(200).json({ success: true, url });
  } catch (err) {
    console.error("❌ Blob upload failed:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};