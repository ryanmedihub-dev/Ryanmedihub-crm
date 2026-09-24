/**
 * Paste this into Extensions > Apps Script from inside the destination Google Sheet,
 * fill in SHEET_ID and SECRET below, then Deploy > New deployment > Web app
 * (Execute as: Me, Who has access: Anyone with the link). Copy the resulting /exec URL
 * into this app's SHEETS_WEBHOOK_URL env var, and copy SECRET into SHEETS_WEBHOOK_SECRET.
 *
 * Receives one JSON row per new Payable / Receivable / Advance / Transaction created in
 * the CRM (src/lib/sheetsWebhook.js) and appends it to SHEET_NAME, creating the header
 * row on first use. The row shape matches the admin/reports "All Finance Entries (Day
 * Book)" report column-for-column (generateFinanceDaybookReport in
 * src/app/api/admin/reports/route.js) — HEADERS below is that report's column order.
 */

var SHEET_ID = "PUT_YOUR_GOOGLE_SHEET_ID_HERE"; // the id in the sheet's URL between /d/ and /edit
var SHEET_NAME = "Finance Log";
var SECRET = "PUT_A_RANDOM_SHARED_SECRET_HERE"; // must match SHEETS_WEBHOOK_SECRET in the CRM's env

var HEADERS = [
  "Entry Type", "Created On", "Entry Date", "Party", "Employee ID",
  "Purpose / Category", "Sub-type", "Direction", "Amount", "Cash Impact",
  "Branch", "Account", "Method", "Reference", "Status", "Remarks",
  "Created By", "Entry ID",
];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (SECRET && data.secret !== SECRET) {
      return jsonResponse({ success: false, message: "Invalid secret" }, 401);
    }

    var row = data.row || {};
    var sheet = getOrCreateSheet();

    // Built from HEADERS so column order always matches the header row, whatever order
    // the CRM happens to serialize the row object's keys in.
    sheet.appendRow(HEADERS.map(function (h) {
      return row[h] !== undefined && row[h] !== null ? row[h] : "";
    }));

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ success: false, message: err.message }, 500);
  }
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jsonResponse(obj, status) {
  // Apps Script web apps can't set a real HTTP status code on the response, so the caller
  // reads `success` in the body instead — `status` is kept here only for readability.
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
