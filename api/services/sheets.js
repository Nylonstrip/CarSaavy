const { google } = require("googleapis");

let sheetsClient = null;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_SHEETS_CREDENTIALS_BASE64, "base64").toString("utf8")
  );
  
  const privatekey = credentials.private_key.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    privatekey,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

async function getCounterForTier(tier) {
  const sheets = getSheetsClient();
  const sheetId = process.env.SHEET_ID;

  await sheets.context._options.auth.authrize();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "counters!A2:B3",
  });

  const rows = res.data.values || [];
  for (const row of rows) {
    if (row[0] === tier) {
      return Number(row[1] || 0);
    }
  }
  return 0;
}

async function incrementCounterForTier(tier) {
  const current = await getCounterForTier(tier);
  const next = current + 1;

  const sheets = getSheetsClient();
  const sheetId = process.env.SHEET_ID;

  const rowIndex = tier === "comp" ? 2 : 3;



  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `counters!B${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[next]],
    },
  });

  return next;
}

async function logOrderRow({ sku, tier, sla, email, vehicle, orderAt }) {
  const sheets = getSheetsClient();
  const sheetId = process.env.SHEET_ID;

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "orders!A:G",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[sku, tier, sla, email, vehicle, orderAt, "queued"]],
    },
  });
}

module.exports = {
  incrementCounterForTier,
  logOrderRow,
};
