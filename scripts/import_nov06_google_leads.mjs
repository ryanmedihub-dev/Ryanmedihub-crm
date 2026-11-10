/**
 * PRODUCTION IMPORT — Nov 6, 2026 Google Leads Recovery
 * Batch ID: NOV06_GOOGLE_RECOVERY_2026
 * Approved: 2026-11-07
 *
 * - 26 records from amanleads.xlsx (sheet: "google ads")
 * - All dates corrected to 2026-11-06 IST
 * - 23 records: original time-of-day preserved
 * - 3 records (rows 6/7/8): estimated times distributed across the day, flagged in remarks
 * - Row 24: name placeholder (Name Unknown) — original field was a phone number
 * - Idempotent: checks [BATCH:NOV06_GOOGLE_RECOVERY_2026][ROW:N] before every insert
 * - Google Sheets webhook fired for each inserted lead (direct call, no next/server)
 * - DOES NOT modify existing records
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX     = require('c:/Users/patwa/Desktop/RyanCRM/ryan-crm/node_modules/xlsx/xlsx.js');
const mongoose = require('c:/Users/patwa/Desktop/RyanCRM/ryan-crm/node_modules/mongoose/index.js');

import fs from 'fs';

// ── 1. Load env ─────────────────────────────────────────────────────────────
const envLines = fs.readFileSync('c:\\Users\\patwa\\Desktop\\RyanCRM\\ryan-crm\\.env.local', 'utf8').split('\n');
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
}
if (!process.env.MONGODB_URI) { console.error('FATAL: MONGODB_URI not set'); process.exit(1); }
if (!process.env.GOOGLE_LEADS_SHEET_WEBHOOK_URL) {
  console.warn('WARN: GOOGLE_LEADS_SHEET_WEBHOOK_URL not set — webhook will be skipped');
}

// ── 2. Webhook helpers (inlined from src/lib/googleLeadsSheetWebhook.js) ───
const TIMEOUT_MS = 8000;

function fmtISTDateTime(v) {
  return v ? new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '';
}
function fmtISTDay(v) {
  return v ? new Date(v).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '';
}
function formatGoogleLeadRow(doc) {
  if (!doc) return null;
  return {
    'Lead ID':          String(doc._id || ''),
    'Received At (IST)': fmtISTDateTime(doc.createdAt || new Date()),
    'Name':             doc.name || '',
    'Phone':            doc.phone || '',
    'Email':            doc.email || '-',
    'City / Location':  doc.city || doc.location || '-',
    'Tag':              doc.tag || 'Google Leads',
    'Visit Date':       fmtISTDay(doc.visitDate),
    'Visit Plan':       doc.visitPlan || '-',
    'Remarks':          doc.remarks || '-',
  };
}
async function sendLeadRow(row) {
  const url = process.env.GOOGLE_LEADS_SHEET_WEBHOOK_URL;
  if (!url) return { success: false, reason: 'URL_NOT_CONFIGURED' };
  const leadId = row?.['Lead ID'] || 'UNKNOWN';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row, secret: process.env.GOOGLE_LEADS_SHEET_WEBHOOK_SECRET || '' }),
      signal: controller.signal,
    });
    if (!res.ok) return { success: false, status: res.status, leadId };
    const text = await res.text().catch(() => '');
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }
    if (!parsed || parsed.success !== true) {
      const isHtml = typeof text === 'string' && text.trim().startsWith('<');
      return { success: false, error: isHtml ? 'HTML response (login/permission redirect)' : (parsed?.error || 'Invalid response'), leadId };
    }
    return { success: true, leadId, action: parsed.action || 'appended' };
  } catch (err) {
    return { success: false, error: err.name === 'AbortError' ? `Timeout after ${TIMEOUT_MS}ms` : err.message, leadId };
  } finally {
    clearTimeout(timer);
  }
}

// ── 3. Date helpers ─────────────────────────────────────────────────────────
const IST_OFFSET_MS = 330 * 60 * 1000;
function istToUtc(year, month, day, h, mn, s) {
  return new Date(Date.UTC(year, month - 1, day, h, mn, s) - IST_OFFSET_MS);
}
function parseTimeString(ts) {
  if (!ts || typeof ts !== 'string') return null;
  const m = ts.trim().toLowerCase().match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)$/);
  if (!m) return null;
  let h = parseInt(m[1]), mn = parseInt(m[2]), s = parseInt(m[3]);
  if (m[4] === 'pm' && h !== 12) h += 12;
  if (m[4] === 'am' && h === 12) h = 0;
  return { h, mn, s };
}
// Corrected date: all records → 2026-11-06 IST
const D = { y: 2026, mo: 11, d: 6 };

// Estimated times for 3 no-timestamp rows (IST)
const ESTIMATED_TIMES = {
  6: { h: 9,  mn: 15, s: 0, label: '09:15:00 IST' },
  7: { h: 13, mn: 30, s: 0, label: '13:30:00 IST' },
  8: { h: 16, mn: 45, s: 0, label: '16:45:00 IST' },
};

function normalizePhone(raw) {
  return String(raw || '').replace(/\D/g, '').slice(-10);
}

const BATCH_ID             = 'NOV06_GOOGLE_RECOVERY_2026';
const UNKNOWN_NAME         = '(Name Unknown)';
const NOV6_UTC_START       = new Date('2026-11-05T18:30:00.000Z');
const NOV6_UTC_END         = new Date('2026-11-06T18:30:00.000Z');

// ── 4. Parse Excel ──────────────────────────────────────────────────────────
const wb = XLSX.readFile('C:\\Users\\patwa\\Downloads\\amanleads.xlsx');
const ws = wb.Sheets['google ads'] || wb.Sheets[wb.SheetNames[0]];
const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
console.log(`Parsed ${rawRows.length} rows from Excel\n`);

// ── 5. Build approved records ───────────────────────────────────────────────
const records = rawRows.map((row, idx) => {
  const excelRow = idx + 2;
  const rawName  = String(row['Name'] || '').trim();
  const rawPhone = String(row['Phone'] || '');
  const phone    = normalizePhone(rawPhone);
  const email    = String(row['Email'] || '').trim() || undefined;
  const city     = String(row['City']  || '').trim() || undefined;
  const sourceInfo      = String(row['__EMPTY'] || '').trim();
  const originalRemarks = String(row['Remarks'] || '').trim();

  // Name
  let name = rawName;
  let nameNote = '';
  if (/^\d{7,}$/.test(rawName)) {
    name = UNKNOWN_NAME;
    nameNote = `Original name field contained phone number "${rawName}"; replaced with placeholder.`;
  }

  // Timestamp
  let createdAt, tsSource, tsLabel;
  if (ESTIMATED_TIMES[excelRow]) {
    const est = ESTIMATED_TIMES[excelRow];
    createdAt = istToUtc(D.y, D.mo, D.d, est.h, est.mn, est.s);
    tsSource  = 'ESTIMATED_IST';
    tsLabel   = est.label;
  } else {
    const time = parseTimeString(String(row['Visit Date']));
    if (time) {
      createdAt = istToUtc(D.y, D.mo, D.d, time.h, time.mn, time.s);
      tsSource  = 'ORIGINAL_TIME_DATE_CORRECTED';
      tsLabel   = `${String(time.h).padStart(2,'0')}:${String(time.mn).padStart(2,'0')}:${String(time.s).padStart(2,'0')} IST`;
    } else {
      createdAt = istToUtc(D.y, D.mo, D.d, 12, 0, 0);
      tsSource  = 'FALLBACK_NOON_IST';
      tsLabel   = '12:00:00 IST (fallback)';
    }
  }

  // Build remarks
  let remarks = '';
  if (originalRemarks) remarks += originalRemarks + ' | ';
  if (sourceInfo)      remarks += sourceInfo + ' | ';
  if (tsSource === 'ESTIMATED_IST') remarks += `[ESTIMATED_TIMESTAMP:2026-11-06 ${tsLabel}] | `;
  if (nameNote)        remarks += `[${nameNote}] | `;
  remarks += `[BATCH:${BATCH_ID}][ROW:${excelRow}]`;

  return { excelRow, name, phone, email, city, tag: 'Google Leads', remarks, createdAt, tsSource, tsLabel };
});

// ── 6. Connect & execute ────────────────────────────────────────────────────
await mongoose.connect(process.env.MONGODB_URI);
console.log(`MongoDB connected: db="${mongoose.connection.name}"\n`);
const leadsCol = mongoose.connection.db.collection('leads');

// Pre-flight: confirm Nov 5 and Nov 7 lead counts (should not change)
const nov5Count = await leadsCol.countDocuments({ createdAt: { $gte: new Date('2026-11-05T00:00:00Z'), $lt: new Date('2026-11-05T18:30:00Z') } });
const nov7Count = await leadsCol.countDocuments({ createdAt: { $gte: new Date('2026-11-06T18:30:00Z'), $lt: new Date('2026-11-08T00:00:00Z') } });
console.log(`Pre-import sanity: Nov 5 leads in DB = ${nov5Count}, Nov 7 leads in DB = ${nov7Count}\n`);

console.log('═'.repeat(80));
console.log('PRODUCTION IMPORT — STARTING');
console.log('═'.repeat(80) + '\n');

const log = [];

for (const rec of records) {
  const idempotencyKey = `[BATCH:${BATCH_ID}][ROW:${rec.excelRow}]`;

  // ── Idempotency check ──────────────────────────────────────────────────
  const existing = await leadsCol.findOne({ remarks: { $regex: idempotencyKey.replace(/[[\]]/g, '\\$&') } });
  if (existing) {
    const entry = { row: rec.excelRow, name: rec.name, phone: rec.phone, action: 'SKIPPED', reason: `Already imported: _id=${existing._id}`, sheetAction: 'N/A' };
    log.push(entry);
    console.log(`Row ${rec.excelRow} | SKIPPED  | ${rec.name} | ${rec.phone} | already in DB as ${existing._id}`);
    continue;
  }

  // ── Insert ─────────────────────────────────────────────────────────────
  let insertedId = null;
  try {
    const doc = {
      name:      rec.name,
      phone:     rec.phone,
      tag:       rec.tag,
      remarks:   rec.remarks,
      createdAt: rec.createdAt,
      updatedAt: rec.createdAt,
    };
    if (rec.email) doc.email    = rec.email;
    if (rec.city)  doc.location = rec.city;

    const result = await leadsCol.insertOne(doc);
    insertedId = result.insertedId;

    // ── Google Sheets webhook ──────────────────────────────────────────
    const row = formatGoogleLeadRow({ ...doc, _id: insertedId });
    const sheetResult = await sendLeadRow(row);

    const entry = {
      row: rec.excelRow, name: rec.name, phone: rec.phone,
      action: 'INSERTED', mongoId: String(insertedId),
      tsSource: rec.tsSource, createdAt: rec.createdAt.toISOString(),
      sheetAction: sheetResult.success ? (sheetResult.action || 'appended') : `FAILED: ${sheetResult.error || sheetResult.reason}`,
      sheetSuccess: sheetResult.success,
    };
    log.push(entry);
    console.log(`Row ${rec.excelRow} | INSERTED | ${rec.name} | ${rec.phone} | _id=${insertedId} | createdAt=${rec.createdAt.toISOString()} | sheet=${entry.sheetAction}`);

  } catch (err) {
    const entry = { row: rec.excelRow, name: rec.name, phone: rec.phone, action: 'FAILED', reason: err.message, sheetAction: 'N/A' };
    log.push(entry);
    console.error(`Row ${rec.excelRow} | FAILED   | ${rec.name} | ${rec.phone} | ERROR: ${err.message}`);
  }

  // 250ms pacing between inserts
  await new Promise(r => setTimeout(r, 250));
}

// ── 7. Post-import verification ────────────────────────────────────────────
console.log('\n' + '═'.repeat(80));
console.log('POST-IMPORT VERIFICATION');
console.log('═'.repeat(80));

const inserted   = log.filter(l => l.action === 'INSERTED');
const skipped    = log.filter(l => l.action === 'SKIPPED');
const failed     = log.filter(l => l.action === 'FAILED');
const sheetOk    = inserted.filter(l => l.sheetSuccess);
const sheetFail  = inserted.filter(l => !l.sheetSuccess);

// MongoDB verification: count leads with this batch ID
const batchInDb = await leadsCol.countDocuments({ remarks: { $regex: BATCH_ID } });
const nov6InDb  = await leadsCol.countDocuments({ createdAt: { $gte: NOV6_UTC_START, $lt: NOV6_UTC_END } });

// Confirm Nov 5 and Nov 7 unchanged
const nov5CountPost = await leadsCol.countDocuments({ createdAt: { $gte: new Date('2026-11-05T00:00:00Z'), $lt: new Date('2026-11-05T18:30:00Z') } });
const nov7CountPost = await leadsCol.countDocuments({ createdAt: { $gte: new Date('2026-11-06T18:30:00Z'), $lt: new Date('2026-11-08T00:00:00Z') } });

console.log(`\nInserted this run  : ${inserted.length}`);
console.log(`Skipped (idempotent): ${skipped.length}`);
console.log(`Failed             : ${failed.length}`);
console.log(`\nMongoDB verification:`);
console.log(`  Leads with batch ID in DB       : ${batchInDb}  (expected: ${inserted.length + skipped.length})`);
console.log(`  Leads with createdAt on Nov 6   : ${nov6InDb}`);
console.log(`  Nov 5 count before / after      : ${nov5Count} / ${nov5CountPost}  (should be equal)`);
console.log(`  Nov 7 count before / after      : ${nov7Count} / ${nov7CountPost}  (should be equal)`);
console.log(`\nGoogle Sheets:`);
console.log(`  Webhook success  : ${sheetOk.length}`);
console.log(`  Webhook failed   : ${sheetFail.length}`);

if (sheetFail.length > 0) {
  console.log('\n  Sheet failures:');
  for (const f of sheetFail) console.log(`    Row ${f.row} | ${f.name} | ${f.sheetAction}`);
}

if (failed.length > 0) {
  console.log('\nFailed inserts requiring attention:');
  for (const f of failed) console.log(`  Row ${f.row} | ${f.name} | ${f.phone} | ${f.reason}`);
}

// Final inserted IDs for record
console.log('\nInserted Lead IDs:');
for (const l of inserted) {
  console.log(`  Row ${String(l.row).padStart(2,'0')} | ${l.mongoId} | ${l.name} | ${l.createdAt} | sheet=${l.sheetAction}`);
}

await mongoose.disconnect();
console.log('\nDone. MongoDB connection closed.');

