/**
 * Backfill for legacy PDF uploads.
 *
 * Before Nov 2026 the upload route stored PDFs as Cloudinary `raw` assets with
 * no file extension, and spliced an invalid `fl_attachment:false`
 * transformation into the saved URL. Result: the delivery URL 404s, and with no
 * `.pdf` extension Cloudinary serves the bytes as octet-stream, so browsers
 * download instead of previewing.
 *
 * This renames each such asset to `<public_id>.pdf` in Cloudinary and rewrites
 * the stored URL. Idempotent: assets already ending in `.pdf` are skipped, and
 * a rename whose target already exists is treated as done.
 *
 *   node --env-file=.env scripts/fix-legacy-pdf-urls.mjs            # dry run
 *   node --env-file=.env scripts/fix-legacy-pdf-urls.mjs --apply    # write
 *   node --env-file=.env scripts/fix-legacy-pdf-urls.mjs --apply --limit 10
 */
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import { parseCloudinaryUrl } from "../src/utils/fileUrl.js";

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// collection -> fields holding a URL string (arrays of strings, or receipt docs)
const TARGETS = [
  { collection: "patients", arrays: [
    "documents.images",
    "documents.consentForm",
    "documents.suregeryForm",
    "documents.consultForm",
  ] },
  { collection: "transactions", receipts: "receipts" },
  { collection: "payables", receipts: "receipts" },
  { collection: "receivables", receipts: "receipts" },
  { collection: "advances", receipts: "receipts" },
  { collection: "borrowings", receipts: "receipts" },
  { collection: "accounttransfers", receipts: "receipts" },
  { collection: "suspenseentries", receipts: "receipts" },
];

/** Legacy = a raw asset whose URL does not end in .pdf. */
const isLegacyPdfUrl = (url) =>
  typeof url === "string" &&
  url.includes("/raw/upload/") &&
  !url.toLowerCase().endsWith(".pdf");

const renamed = new Map(); // old public_id -> new secure_url
let scanned = 0, fixed = 0, failed = 0;

/** Rename once per asset; returns the new URL or null if it could not be fixed. */
async function fixedUrlFor(url) {
  const publicId = parseCloudinaryUrl(url)?.publicId;
  if (!publicId) return null;
  if (renamed.has(publicId)) return renamed.get(publicId);

  const target = `${publicId}.pdf`;
  if (!APPLY) {
    renamed.set(publicId, `[dry-run] ${target}`);
    return renamed.get(publicId);
  }

  try {
    const res = await cloudinary.uploader.rename(publicId, target, {
      resource_type: "raw",
      invalidate: true,
    });
    renamed.set(publicId, res.secure_url);
    return res.secure_url;
  } catch (error) {
    // Already renamed by an earlier run: reuse the existing asset.
    if (/already exists/i.test(error?.message || "")) {
      const existing = await cloudinary.api
        .resource(target, { resource_type: "raw" })
        .catch(() => null);
      if (existing?.secure_url) {
        renamed.set(publicId, existing.secure_url);
        return existing.secure_url;
      }
    }
    console.error(`  ! rename failed for ${publicId}: ${error?.message}`);
    renamed.set(publicId, null);
    return null;
  }
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set. Run it as:\n  node --env-file=.env scripts/fix-legacy-pdf-urls.mjs"
    );
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(APPLY ? "APPLY mode: renaming assets and updating the DB\n"
                    : "DRY RUN: nothing will be changed (pass --apply)\n");

  for (const target of TARGETS) {
    if (fixed >= LIMIT) break;
    const col = db.collection(target.collection);
    const fields = target.arrays || [target.receipts];
    const docs = await col
      .find(
        { $or: fields.map((f) => ({ [f]: { $exists: true, $ne: [] } })) },
        { projection: Object.fromEntries(fields.map((f) => [f, 1])) }
      )
      .toArray();

    for (const doc of docs) {
      if (fixed >= LIMIT) break;
      const set = {};

      for (const field of fields) {
        const value = field
          .split(".")
          .reduce((acc, key) => (acc == null ? acc : acc[key]), doc);
        if (!Array.isArray(value)) continue;

        if (target.receipts) {
          // array of { url, publicId, fileName, fileType }
          for (let i = 0; i < value.length; i++) {
            const receipt = value[i];
            if (!isLegacyPdfUrl(receipt?.url)) continue;
            scanned++;
            const url = await fixedUrlFor(receipt.url);
            if (!url) { failed++; continue; }
            set[`${field}.${i}.url`] = url;
            set[`${field}.${i}.publicId`] = `${parseCloudinaryUrl(receipt.url).publicId}.pdf`;
            set[`${field}.${i}.fileType`] = "pdf";
            fixed++;
          }
        } else {
          // array of URL strings
          for (let i = 0; i < value.length; i++) {
            if (!isLegacyPdfUrl(value[i])) continue;
            scanned++;
            const url = await fixedUrlFor(value[i]);
            if (!url) { failed++; continue; }
            set[`${field}.${i}`] = url;
            fixed++;
          }
        }
      }

      if (!Object.keys(set).length) continue;
      console.log(`${target.collection}/${doc._id}:`);
      for (const [k, v] of Object.entries(set)) console.log(`  ${k} -> ${v}`);
      if (APPLY) await col.updateOne({ _id: doc._id }, { $set: set });
    }
  }

  console.log(
    `\n${APPLY ? "fixed" : "would fix"} ${fixed} url(s) across ${renamed.size} asset(s)` +
      (failed ? `, ${failed} could not be renamed` : "")
  );
  if (!APPLY && scanned) console.log("re-run with --apply to write the changes");
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
