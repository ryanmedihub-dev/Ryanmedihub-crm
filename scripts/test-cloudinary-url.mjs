// node scripts/test-cloudinary-url.mjs
// Checks the stored-document URL helpers: src/utils/fileUrl.js + compressImage.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { parseCloudinaryUrl } = await import("../src/utils/fileUrl.js");

const B = "https://res.cloudinary.com/demo";

// raw PDF: extension is part of the public_id
assert.deepEqual(
  parseCloudinaryUrl(`${B}/raw/upload/v1731200000/ryan-clinic/p1/aadhar/scan_1731200000.pdf`),
  { resourceType: "raw", publicId: "ryan-clinic/p1/aadhar/scan_1731200000.pdf" }
);

// image: extension dropped
assert.deepEqual(
  parseCloudinaryUrl(`${B}/image/upload/v1731200000/ryan-clinic/p1/images/abc123.jpg`),
  { resourceType: "image", publicId: "ryan-clinic/p1/images/abc123.jpg".replace(/\.jpg$/, "") }
);

// transformation segments are skipped
assert.deepEqual(
  parseCloudinaryUrl(`${B}/image/upload/q_auto/f_auto/v1/ryan-clinic/p1/images/abc.png`),
  { resourceType: "image", publicId: "ryan-clinic/p1/images/abc" }
);

// legacy PDFs carry the (invalid) fl_attachment segment
assert.deepEqual(
  parseCloudinaryUrl(`${B}/raw/upload/fl_attachment:false/v1/ryan-clinic/p1/consent/old.pdf`),
  { resourceType: "raw", publicId: "ryan-clinic/p1/consent/old.pdf" }
);

// no version segment
assert.deepEqual(
  parseCloudinaryUrl(`${B}/raw/upload/ryan-clinic/receipts/x.pdf`),
  { resourceType: "raw", publicId: "ryan-clinic/receipts/x.pdf" }
);

assert.equal(parseCloudinaryUrl("https://example.com/foo.pdf"), null);
assert.equal(parseCloudinaryUrl(undefined), null);

console.log("parseCloudinaryUrl: all checks passed");

// --- withExtension (compressImage.js) --------------------------------------
const utilSrc = readFileSync(
  new URL("../src/utils/compressImage.js", import.meta.url),
  "utf8"
);
const withExtension = new Function(
  `${utilSrc.slice(
    utilSrc.indexOf("export function withExtension"),
    utilSrc.indexOf("export function formatBytes")
  ).replace("export ", "")}; return withExtension;`
)();

assert.equal(withExtension("aadhar card.JPG", ".webp"), "aadhar card.webp");
assert.equal(withExtension("scan.tar.gz", ".webp"), "scan.tar.webp");
assert.equal(withExtension("noext", ".webp"), "noext.webp");
assert.equal(withExtension(".hidden", ".webp"), "file.webp");

console.log("withExtension: all checks passed");

// --- fileUrl.js (what the viewers use) -------------------------------------
const { isPdfUrl, normalizeFileUrl, fileNameFromUrl } = await import(
  "../src/utils/fileUrl.js"
);

const LEGACY = `${B}/raw/upload/fl_attachment:false/v1731/ryan-clinic/p1/aadhar/kw9xq2abc`;
const CURRENT = `${B}/raw/upload/v1731/ryan-clinic/p1/aadhar/aadhar_card_1731.pdf`;
const IMG = `${B}/image/upload/v1731/ryan-clinic/p1/images/abc.webp`;

// legacy PDFs have no extension: detected by resource type instead
assert.equal(isPdfUrl(LEGACY), true);
assert.equal(isPdfUrl(CURRENT), true);
assert.equal(isPdfUrl(IMG), false);
assert.equal(isPdfUrl(""), false);

// PDFs go through our own endpoint (Cloudinary 401s on .pdf and forces
// attachment on raw); images are served straight from Cloudinary.
assert.equal(
  normalizeFileUrl(LEGACY),
  `/api/files/pdf?url=${encodeURIComponent(LEGACY)}`
);
assert.equal(
  normalizeFileUrl(CURRENT),
  `/api/files/pdf?url=${encodeURIComponent(CURRENT)}`
);
assert.equal(normalizeFileUrl(IMG), IMG);

// filenames keep .pdf so saved files open
assert.equal(fileNameFromUrl(LEGACY), "kw9xq2abc.pdf");
assert.equal(fileNameFromUrl(CURRENT), "aadhar_card_1731.pdf");
assert.equal(fileNameFromUrl(IMG), "abc.webp");

console.log("fileUrl: all checks passed");
