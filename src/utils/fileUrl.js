// Helpers for reading stored document URLs (Cloudinary).
//
// PDFs are stored as `raw` assets. Legacy uploads (before Nov 2026) got no
// file extension and had an invalid `fl_attachment:false` transformation
// spliced into the delivery URL, so they look like:
//   .../raw/upload/fl_attachment:false/v1731/ryan-clinic/p1/aadhar/kw9xq2abc
// Current uploads look like:
//   .../raw/upload/v1731/ryan-clinic/p1/aadhar/aadhar_1731.pdf
// These helpers read both. Keep using them instead of a bare `.pdf` check.

/** Any `raw` asset in this app is a PDF; newer ones also carry the extension. */
export function isPdfUrl(url = "") {
  const u = String(url).toLowerCase();
  return u.endsWith(".pdf") || u.includes("/raw/upload/");
}

/** Our own endpoint for a stored PDF. See src/app/api/files/pdf/route.js. */
export function pdfProxyUrl(url, { download = false } = {}) {
  const params = new URLSearchParams({ url: String(url) });
  if (download) params.set("download", "1");
  return `/api/files/pdf?${params}`;
}

/**
 * The URL to actually put in a `src` or `href`.
 *
 * Images are served straight from Cloudinary. PDFs are not: Cloudinary serves
 * every `raw` asset as an octet-stream attachment (so a preview iframe reports
 * a failed download) and returns 401 for anything it recognises as a PDF,
 * because this account restricts PDF delivery. They go through our API instead,
 * which also puts patient documents behind a login.
 */
export function normalizeFileUrl(url = "") {
  const u = String(url);
  return u.includes("/raw/upload/") ? pdfProxyUrl(u) : u;
}

/**
 * Cloudinary delivery URL -> { publicId, resourceType } (null if not one).
 * A raw asset keeps its extension inside the public_id; an image drops it.
 * Used by DELETE /api/upload and by scripts/fix-legacy-pdf-urls.mjs.
 */
export function parseCloudinaryUrl(url = "") {
  const m = /\/(image|raw|video)\/upload\/(.+)$/.exec(String(url));
  if (!m) return null;
  const resourceType = m[1];
  // Leading segments may be transformations ("q_auto", "fl_attachment:false")
  // or a version ("v1731200000"); the rest is the public_id.
  const segments = m[2].split("/");
  while (segments.length > 1 && /^(v\d+|[a-z]{1,3}_[^/]*)$/.test(segments[0])) {
    segments.shift();
  }
  const path = segments.join("/");
  return {
    resourceType,
    publicId: resourceType === "raw" ? path : path.replace(/\.[^/.]+$/, ""),
  };
}

/** Display / download filename, with `.pdf` restored for legacy PDF URLs. */
export function fileNameFromUrl(url = "") {
  try {
    const last = String(url).split("/").pop().split("?")[0];
    const name = decodeURIComponent(last) || "file";
    return isPdfUrl(url) && !name.toLowerCase().endsWith(".pdf")
      ? `${name}.pdf`
      : name;
  } catch {
    return String(url);
  }
}
