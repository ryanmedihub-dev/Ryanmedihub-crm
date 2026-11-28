#!/usr/bin/env node
// ============================================================================
// scripts/export-all-patient-pdfs.mjs
//
// Generates a separate, comprehensive, high-fidelity PDF for every single
// patient stored in the RyanCRM MongoDB database.
//
// Version 2.0 (Attachment-Inclusive):
// - Embeds all accessible patient photographs, before/after images, and
//   clinical photos inline with aspect-ratio preservation and captions.
// - Merges all accessible uploaded multi-page PDF documents (consent forms,
//   surgery clearance forms, consultation sheets, invoices, lab reports).
// - Converts WebP/GIF/PNG formats via sharp and embeds into standard PDF.
// - Detects file signatures (magic bytes) to ensure authentic document types.
// - Enforces SSRF security (allowlisted Cloudinary CDN hosts, timeouts, size limits).
// - Atomic file replacement (writes to .tmp before replacing existing file).
// - Re-export and resumable tracking via exportVersion 2 in manifest.
//
// Usage:
//   node --env-file=.env.local scripts/export-all-patient-pdfs.mjs --dry-run
//   node --env-file=.env.local scripts/export-all-patient-pdfs.mjs
//   node --env-file=.env.local scripts/export-all-patient-pdfs.mjs --resume
//   node --env-file=.env.local scripts/export-all-patient-pdfs.mjs --retry-failed
//   node --env-file=.env.local scripts/export-all-patient-pdfs.mjs --patient-id <ID>
//   node --env-file=.env.local scripts/export-all-patient-pdfs.mjs --limit 10
//   node --env-file=.env.local scripts/export-all-patient-pdfs.mjs --reprocess-all
// ============================================================================

import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { PDFDocument, PDFName, PDFArray, PDFStream, StandardFonts, rgb, grayscale } from "pdf-lib";

// sharp handles WebP / GIF / TIFF conversion to JPEG
let sharp = null;
try {
  const sharpMod = await import("sharp");
  sharp = sharpMod.default;
} catch {
  console.warn("WARNING: sharp is not available; WebP images will fall back to reporting.");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const EXPORT_VERSION = 2; // Version 2 denotes attachment-inclusive PDFs

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes("--dry-run");
const IS_RESUME = args.includes("--resume");
const IS_RETRY_FAILED = args.includes("--retry-failed");
const EMBED_LOGO = args.includes("--embed-logo");
const REPROCESS_ALL = args.includes("--reprocess-all");

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return null;
}

const LIMIT_ARG = getArgValue("--limit") ? parseInt(getArgValue("--limit"), 10) : null;
const PATIENT_ID_ARG = getArgValue("--patient-id");
const BATCH_SIZE = getArgValue("--batch-size") ? parseInt(getArgValue("--batch-size"), 10) : 50;
const OUTPUT_DIR_NAME = getArgValue("--output-dir") || "patient-pdf-export";
const EXPORT_DIR = path.isAbsolute(OUTPUT_DIR_NAME)
  ? OUTPUT_DIR_NAME
  : path.join(ROOT_DIR, OUTPUT_DIR_NAME);
const PDFS_DIR = path.join(EXPORT_DIR, "PDFs");

// ---------------------------------------------------------------------------
// Security & Attachment Configuration
// ---------------------------------------------------------------------------
const TRUSTED_STORAGE_HOSTS = new Set([
  "res.cloudinary.com",
  "cloudinary.com",
]);

const ATTACH_TIMEOUT_MS = 15000; // 15 seconds per file download
const ATTACH_MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB max per file
const MAX_CONCURRENT_DOWNLOADS_PER_PATIENT = 8;

// ---------------------------------------------------------------------------
// Formatting & Sanitization Helpers
// ---------------------------------------------------------------------------

function sanitizeText(input, fallback = "Not recorded") {
  if (input === null || input === undefined || input === "") {
    return fallback;
  }
  let str = String(input);
  str = str
    .replace(/₹/g, "Rs. ")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’`]/g, "'")
    .replace(/[•·]/g, "-")
    .replace(/…/g, "...")
    .replace(/[\t\r\n]+/g, " ");

  let result = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      result += str[i];
    } else {
      result += " ";
    }
  }
  const cleaned = result.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

function formatDate(date) {
  if (!date) return "Not recorded";
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return "Not recorded";
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Not recorded";
  }
}

function formatDateTime(date) {
  if (!date) return "Not recorded";
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return "Not recorded";
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "Not recorded";
  }
}

function formatCurrency(val) {
  if (val === null || val === undefined || isNaN(Number(val))) return "Rs. 0";
  return `Rs. ${Number(val).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function sanitizeFilename(name, id) {
  const cleanName = (name || "Patient")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 50);
  return `${cleanName || "Patient"}_${id}.pdf`;
}

function sanitizeUrlForLogging(rawUrl) {
  try {
    const u = new URL(rawUrl);
    // Remove query parameters to prevent token/secret leakage
    return `${u.origin}${u.pathname}`;
  } catch {
    return "invalid_url";
  }
}

// ---------------------------------------------------------------------------
// Attachment Discovery & Normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a Cloudinary delivery URL to strip invalid transformations
 * (e.g., fl_attachment:false or duplicate version tags) so direct HTTP fetch works reliably.
 */
function normalizeCloudinaryDownloadUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    if (!TRUSTED_STORAGE_HOSTS.has(parsed.hostname)) {
      return null;
    }
    const m = /\/(image|raw|video)\/upload\/(.+)$/.exec(parsed.pathname);
    if (m) {
      const resourceType = m[1];
      const segments = m[2].split("/");
      while (segments.length > 1 && /^(v\d+|[a-z]{1,3}_[^/]*)$/.test(segments[0])) {
        segments.shift();
      }
      const publicId = segments.join("/");
      const cloudName = parsed.pathname.split("/")[1];
      return `${parsed.origin}/${cloudName}/${resourceType}/upload/${publicId}`;
    }
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Discovers all patient-associated attachments across the Patient schema:
 * - documents.images (clinical photos, pre/post surgery)
 * - documents.consentForm (signed consents)
 * - documents.suregeryForm (surgery OT clearance forms)
 * - documents.consultForm (consultation / counselling forms)
 * Deduplicates multiple references to the same underlying file.
 */
function resolvePatientAttachments(patient) {
  const seenUrls = new Set();
  const attachments = [];

  function addAttachment(rawUrl, label, section) {
    if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") return;
    const url = rawUrl.trim();
    if (seenUrls.has(url)) return; // Deduplicate
    seenUrls.add(url);

    attachments.push({
      originalUrl: url,
      downloadUrl: normalizeCloudinaryDownloadUrl(url) || url,
      label,
      section,
    });
  }

  const docs = patient.documents || {};

  if (Array.isArray(docs.images)) {
    docs.images.forEach((u, idx) => addAttachment(u, `Clinical Photograph ${idx + 1}`, "Clinical Photographs"));
  }
  if (Array.isArray(docs.consentForm)) {
    docs.consentForm.forEach((u, idx) => addAttachment(u, `Consent Form ${idx + 1}`, "Signed Consent Forms"));
  }
  if (Array.isArray(docs.suregeryForm)) {
    docs.suregeryForm.forEach((u, idx) => addAttachment(u, `Surgery Clearance Form ${idx + 1}`, "Surgical Documentation"));
  }
  if (Array.isArray(docs.consultForm)) {
    docs.consultForm.forEach((u, idx) => addAttachment(u, `Consultation Form ${idx + 1}`, "Consultation Records"));
  }

  return attachments;
}

/**
 * Inspects binary buffer signatures (magic bytes) to accurately identify file format.
 */
function detectFileSignature(buffer) {
  if (!buffer || buffer.length < 4) return "unknown";
  // PDF: %PDF- (0x25 0x50 0x44 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return "pdf";
  }
  // JPEG: 0xFF 0xD8 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  // PNG: 0x89 0x50 0x4E 0x47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "png";
  }
  // GIF: GIF8 (0x47 0x49 0x46 0x38)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return "gif";
  }
  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return "webp";
  }
  return "unknown";
}

/**
 * Downloads a file securely with host verification, timeout, and size cap.
 */
function downloadAttachmentBytes(targetUrl) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return reject(new Error("Malformed attachment URL"));
    }

    if (!TRUSTED_STORAGE_HOSTS.has(parsedUrl.hostname)) {
      return reject(new Error(`SSRF guard blocked untrusted host: ${parsedUrl.hostname}`));
    }

    const protocol = parsedUrl.protocol === "https:" ? https : http;
    const req = protocol.get(targetUrl, (res) => {
      // Follow redirect if on trusted host
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        try {
          const redir = new URL(res.headers.location);
          if (TRUSTED_STORAGE_HOSTS.has(redir.hostname)) {
            return resolve(downloadAttachmentBytes(res.headers.location));
          }
        } catch {}
        return reject(new Error("Redirect to untrusted destination"));
      }

      if (res.statusCode === 404) {
        return reject(new Error("Attachment not found in storage (HTTP 404)"));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Storage service responded with HTTP ${res.statusCode}`));
      }

      const chunks = [];
      let totalBytes = 0;

      res.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > ATTACH_MAX_SIZE_BYTES) {
          req.destroy(new Error(`File size exceeds safety limit (${ATTACH_MAX_SIZE_BYTES / 1024 / 1024} MB)`));
        } else {
          chunks.push(chunk);
        }
      });

      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const format = detectFileSignature(buffer);
        resolve({ buffer, format, bytesLength: buffer.length });
      });

      res.on("error", (err) => reject(err));
    });

    req.setTimeout(ATTACH_TIMEOUT_MS, () => {
      req.destroy(new Error(`Download timeout exceeded (${ATTACH_TIMEOUT_MS / 1000}s)`));
    });

    req.on("error", (err) => reject(err));
  });
}

// ---------------------------------------------------------------------------
// PDF Canvas Layout Engine
// ---------------------------------------------------------------------------
class PDFCanvas {
  constructor(pdfDoc, fonts, logoImage = null) {
    this.pdfDoc = pdfDoc;
    this.fonts = fonts;
    this.logoImage = logoImage;

    // Standard A4 dimensions (595.28 x 841.89 pt)
    this.pageWidth = 595.28;
    this.pageHeight = 841.89;
    this.marginLeft = 38;
    this.marginRight = 38;
    this.marginTop = 38;
    this.marginBottom = 40;
    this.contentWidth = this.pageWidth - this.marginLeft - this.marginRight; // 519.28 pt

    // Theme Color Palette - Restrained Medical Corporate System
    this.cPrimary = rgb(0.07, 0.18, 0.36);      // #122E5C - Deep Navy
    this.cPrimaryLight = rgb(0.92, 0.95, 0.99); // #EBF2FC - Soft Navy Tint
    this.cAccent = rgb(0.05, 0.40, 0.52);       // #0D6685 - Deep Teal
    this.cAccentLight = rgb(0.93, 0.97, 0.99);  // #EEF8FA - Soft Teal Tint
    this.cGold = rgb(0.70, 0.48, 0.14);         // #B37B24 - Medical Gold/Bronze
    this.cGoldLight = rgb(0.99, 0.97, 0.92);    // #FCF7EB - Soft Gold Tint
    this.cDark = rgb(0.12, 0.16, 0.22);         // #1F2937 - Slate Dark Body Text
    this.cMid = rgb(0.28, 0.35, 0.45);          // #475A73 - Mid Slate
    this.cMuted = rgb(0.45, 0.52, 0.60);        // #738599 - Muted Labels/Timestamps
    this.cBorder = rgb(0.85, 0.88, 0.92);       // #D9E0EB - Clean Border
    this.cBorderSubtle = rgb(0.92, 0.94, 0.96); // #EAEFF5
    this.cLightBg = rgb(0.98, 0.985, 0.995);    // #FAFBFC - Light Card Background
    this.cWhite = rgb(1, 1, 1);
    this.cSuccess = rgb(0.08, 0.52, 0.22);      // #148538 - Paid / Cleared Green
    this.cSuccessBg = rgb(0.93, 0.98, 0.94);
    this.cWarning = rgb(0.78, 0.42, 0.10);      // #C76B1A - Action / Notes Alert
    this.cWarningBg = rgb(0.99, 0.96, 0.92);
    this.cDanger = rgb(0.75, 0.15, 0.15);       // #BF2626 - Balance Due / Alert
    this.cDangerBg = rgb(0.99, 0.94, 0.94);

    // Aliases for compatibility
    this.cNavy = this.cPrimary;
    this.cNavyLight = this.cPrimaryLight;
    this.cRed = this.cDanger;

    this.pages = [];
    this.currentPage = null;
    this.currentY = 0;
    this.patientMeta = null;
  }

  wrapText(text, fontSize, font, maxWidth) {
    if (!text || String(text).trim() === "") return [];
    const clean = sanitizeText(text, "");
    if (!clean) return [];

    const words = clean.split(/\s+/);
    const lines = [];
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const w = font.widthOfTextAtSize(candidate, fontSize);
      if (w <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = "";
        }
        if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
          let part = "";
          for (let i = 0; i < word.length; i++) {
            const charCandidate = part + word[i];
            if (font.widthOfTextAtSize(`${charCandidate}-`, fontSize) <= maxWidth) {
              part = charCandidate;
            } else {
              lines.push(`${part}-`);
              part = word[i];
            }
          }
          currentLine = part;
        } else {
          currentLine = word;
        }
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  addPage(patientMeta) {
    this.patientMeta = patientMeta || this.patientMeta;
    const page = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
    this.pages.push(page);
    this.currentPage = page;
    this.currentY = this.pageHeight - this.marginTop;

    if (this.pages.length > 1) {
      this.drawRunningHeader();
    }
    return page;
  }

  drawRunningHeader() {
    const page = this.currentPage;
    const y = this.pageHeight - 24;

    const pName = sanitizeText(this.patientMeta?.name || "Patient Dossier");
    page.drawText(pName, {
      x: this.marginLeft,
      y,
      size: 8,
      font: this.fonts.bold,
      color: this.cPrimary,
    });

    const nameW = this.fonts.bold.widthOfTextAtSize(pName, 8);
    const metaMid = `  •  Branch: ${sanitizeText(this.patientMeta?.branch || "All")}  •  ID: ${this.patientMeta?._id || ""}`;
    page.drawText(metaMid, {
      x: this.marginLeft + nameW,
      y,
      size: 7.5,
      font: this.fonts.regular,
      color: this.cMuted,
    });

    const rawStatus = (this.patientMeta?.status || "RECORD").toUpperCase();
    const isSurgeryDone = rawStatus.includes("SURGERY") || rawStatus.includes("DONE");
    const statusBg = isSurgeryDone ? this.cSuccess : this.cPrimary;
    const statusText = ` ${rawStatus} `;
    const stW = this.fonts.bold.widthOfTextAtSize(statusText, 7) + 8;
    const pillX = this.pageWidth - this.marginRight - stW;

    page.drawRectangle({
      x: pillX,
      y: y - 2,
      width: stW,
      height: 12,
      color: statusBg,
      borderRadius: 3,
    });

    page.drawText(statusText, {
      x: pillX + 4,
      y: y + 1,
      size: 7,
      font: this.fonts.bold,
      color: this.cWhite,
    });

    page.drawLine({
      start: { x: this.marginLeft, y: y - 7 },
      end: { x: this.pageWidth - this.marginRight, y: y - 7 },
      thickness: 0.5,
      color: this.cBorder,
    });

    this.currentY = this.pageHeight - this.marginTop - 16;
  }

  ensureSpace(neededHeight) {
    if (this.currentY - neededHeight < this.marginBottom) {
      this.addPage();
    }
  }

  drawCoverPage(patient, financialSummary = {}, sectionsSummary = {}) {
    const page = this.currentPage;
    this.currentY = this.pageHeight - this.marginTop;

    // 1. Header Clinic Banner
    const bannerHeight = 88;
    const bannerY = this.currentY - bannerHeight;

    page.drawRectangle({
      x: this.marginLeft,
      y: bannerY,
      width: this.contentWidth,
      height: bannerHeight,
      color: this.cPrimary,
      borderRadius: 4,
    });

    page.drawRectangle({
      x: this.marginLeft,
      y: bannerY,
      width: 4.5,
      height: bannerHeight,
      color: this.cGold,
    });

    let textStartX = this.marginLeft + 14;

    if (this.logoImage) {
      try {
        const logoTargetHeight = 44;
        const logoTargetWidth = (this.logoImage.width / this.logoImage.height) * logoTargetHeight;
        page.drawImage(this.logoImage, {
          x: textStartX,
          y: bannerY + (bannerHeight - logoTargetHeight) / 2,
          width: Math.min(logoTargetWidth, 75),
          height: logoTargetHeight,
        });
        textStartX += Math.min(logoTargetWidth, 75) + 12;
      } catch {}
    } else {
      const crestSize = 48;
      const crestY = bannerY + (bannerHeight - crestSize) / 2;
      page.drawRectangle({
        x: textStartX,
        y: crestY,
        width: crestSize,
        height: crestSize,
        color: this.cPrimary,
        borderRadius: 6,
        borderColor: this.cGold,
        borderWidth: 1.5,
      });

      const monogram = "RM";
      const monoW = this.fonts.bold.widthOfTextAtSize(monogram, 16);
      page.drawText(monogram, {
        x: textStartX + (crestSize - monoW) / 2,
        y: crestY + 15,
        size: 16,
        font: this.fonts.bold,
        color: this.cGold,
      });
      textStartX += crestSize + 12;
    }

    page.drawText("RYAN MEDIHUB CLINIC & HAIR TRANSPLANT CENTRE", {
      x: textStartX,
      y: bannerY + 58,
      size: 11,
      font: this.fonts.bold,
      color: this.cWhite,
    });

    page.drawText("CENTRE FOR ADVANCED AESTHETIC & HAIR RESTORATION SURGERY", {
      x: textStartX,
      y: bannerY + 44,
      size: 7.5,
      font: this.fonts.regular,
      color: this.cGold,
    });

    const networkText = "Clinic Network: New Delhi  |  Mumbai  |  Hyderabad  |  Noida  |  Gurgaon";
    page.drawText(networkText, {
      x: textStartX,
      y: bannerY + 30,
      size: 7,
      font: this.fonts.regular,
      color: rgb(0.85, 0.90, 0.98),
    });

    const exportMeta = `Confidential CRM Record Archive  •  Exported: ${formatDateTime(new Date())}`;
    page.drawText(exportMeta, {
      x: textStartX,
      y: bannerY + 16,
      size: 7,
      font: this.fonts.regular,
      color: rgb(0.70, 0.78, 0.90),
    });

    const rawStatus = (patient.ops?.status || "REGISTERED").toUpperCase();
    const isSurgeryDone = rawStatus.includes("SURGERY") || rawStatus.includes("DONE");
    const statusText = `STATUS: ${rawStatus}`;
    const statusWidth = this.fonts.bold.widthOfTextAtSize(statusText, 8) + 16;
    const pillX = this.pageWidth - this.marginRight - statusWidth - 12;
    const pillY = bannerY + bannerHeight - 28;

    page.drawRectangle({
      x: pillX,
      y: pillY,
      width: statusWidth,
      height: 18,
      color: isSurgeryDone ? this.cSuccess : this.cAccent,
      borderRadius: 4,
    });

    page.drawText(statusText, {
      x: pillX + 8,
      y: pillY + 5,
      size: 8,
      font: this.fonts.bold,
      color: this.cWhite,
    });

    this.currentY = bannerY - 14;

    // 2. Patient Identity Card
    const cardHeight = 118;
    const cardY = this.currentY - cardHeight;

    page.drawRectangle({
      x: this.marginLeft,
      y: cardY,
      width: this.contentWidth,
      height: cardHeight,
      color: this.cLightBg,
      borderColor: this.cBorder,
      borderWidth: 0.75,
      borderRadius: 4,
    });

    const topBarHeight = 24;
    page.drawRectangle({
      x: this.marginLeft,
      y: cardY + cardHeight - topBarHeight,
      width: this.contentWidth,
      height: topBarHeight,
      color: this.cPrimaryLight,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
    });

    page.drawRectangle({
      x: this.marginLeft,
      y: cardY + cardHeight - topBarHeight,
      width: 3.5,
      height: topBarHeight,
      color: this.cPrimary,
    });

    const pName = sanitizeText(patient.personal?.name, "Patient").toUpperCase();
    page.drawText(pName, {
      x: this.marginLeft + 10,
      y: cardY + cardHeight - 16,
      size: 11,
      font: this.fonts.bold,
      color: this.cPrimary,
    });

    const idLabel = `PATIENT RECORD DOSSIER  •  ID: ${patient._id}`;
    const idW = this.fonts.bold.widthOfTextAtSize(idLabel, 8);
    page.drawText(idLabel, {
      x: this.pageWidth - this.marginRight - idW - 10,
      y: cardY + cardHeight - 16,
      size: 8,
      font: this.fonts.bold,
      color: this.cMid,
    });

    const idFields = [
      { label: "Assigned Branch", val: patient.personal?.branch || "All" },
      { label: "Contact Phone", val: patient.personal?.phone || "N/A" },
      { label: "Age & Gender", val: `${patient.personal?.age ? `${patient.personal.age} yrs` : "N/A"} / ${patient.personal?.gender || "N/A"}` },
      { label: "Email Address", val: patient.personal?.email || "N/A" },
      { label: "First Visit Date", val: formatDate(patient.personal?.visitDate) },
      { label: "Registration Date", val: formatDateTime(patient.createdAt) },
      { label: "Visit Purpose", val: patient.personal?.purpose || "Consultation" },
      { label: "Profession", val: patient.personal?.profession || "N/A" },
    ];

    const colW = (this.contentWidth - 20) / 2;
    for (let i = 0; i < idFields.length; i++) {
      const c = i % 2;
      const r = Math.floor(i / 2);
      const fx = this.marginLeft + 12 + c * colW;
      const fy = cardY + cardHeight - topBarHeight - 18 - r * 19;

      const f = idFields[i];
      const lbl = `${f.label}: `;
      page.drawText(lbl, {
        x: fx,
        y: fy,
        size: 7.5,
        font: this.fonts.bold,
        color: this.cMuted,
      });
      const lblW = this.fonts.bold.widthOfTextAtSize(lbl, 7.5);
      const valStr = sanitizeText(f.val, "-");
      const maxValW = colW - lblW - 10;
      let displayVal = valStr;
      if (this.fonts.regular.widthOfTextAtSize(displayVal, 8) > maxValW) {
        while (displayVal.length > 2 && this.fonts.regular.widthOfTextAtSize(`${displayVal}..`, 8) > maxValW) {
          displayVal = displayVal.slice(0, -1);
        }
        displayVal = `${displayVal}..`;
      }
      page.drawText(displayVal, {
        x: fx + lblW,
        y: fy,
        size: 8,
        font: this.fonts.regular,
        color: this.cDark,
      });
    }

    this.currentY = cardY - 14;

    // 3. Financial Snapshot Card (4 boxes)
    const finHeight = 66;
    const finY = this.currentY - finHeight;

    page.drawRectangle({
      x: this.marginLeft,
      y: finY,
      width: this.contentWidth,
      height: finHeight,
      color: this.cLightBg,
      borderColor: this.cBorder,
      borderWidth: 0.75,
      borderRadius: 4,
    });

    page.drawRectangle({
      x: this.marginLeft,
      y: finY + finHeight - 18,
      width: this.contentWidth,
      height: 18,
      color: this.cAccentLight,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
    });

    page.drawText("FINANCIAL SNAPSHOT & SETTLEMENT SUMMARY", {
      x: this.marginLeft + 10,
      y: finY + finHeight - 13,
      size: 7.5,
      font: this.fonts.bold,
      color: this.cAccent,
    });

    const isFullyPaid = (financialSummary.pending || 0) <= 0;
    const settStatusText = isFullyPaid ? "STATUS: FULLY SETTLED" : "STATUS: BALANCE OUTSTANDING";
    const settW = this.fonts.bold.widthOfTextAtSize(settStatusText, 7) + 12;
    page.drawRectangle({
      x: this.pageWidth - this.marginRight - settW - 6,
      y: finY + finHeight - 16,
      width: settW,
      height: 14,
      color: isFullyPaid ? this.cSuccess : this.cDanger,
      borderRadius: 3,
    });
    page.drawText(settStatusText, {
      x: this.pageWidth - this.marginRight - settW,
      y: finY + finHeight - 12,
      size: 7,
      font: this.fonts.bold,
      color: this.cWhite,
    });

    const finCols = [
      { label: "Agreed Package", val: formatCurrency(financialSummary.totalPkg), color: this.cDark },
      { label: "Amount Received", val: formatCurrency(financialSummary.received), color: this.cSuccess },
      { label: "Discount Allowed", val: formatCurrency(financialSummary.discount), color: this.cMid },
      { label: "Outstanding Balance", val: formatCurrency(financialSummary.pending), color: isFullyPaid ? this.cSuccess : this.cDanger },
    ];

    const finBoxW = this.contentWidth / 4;
    for (let i = 0; i < finCols.length; i++) {
      const fc = finCols[i];
      const bx = this.marginLeft + i * finBoxW;
      const by = finY + 8;

      if (i > 0) {
        page.drawLine({
          start: { x: bx, y: finY + 6 },
          end: { x: bx, y: finY + finHeight - 22 },
          thickness: 0.5,
          color: this.cBorder,
        });
      }

      page.drawText(fc.label, {
        x: bx + 10,
        y: by + 22,
        size: 7,
        font: this.fonts.bold,
        color: this.cMuted,
      });

      page.drawText(fc.val, {
        x: bx + 10,
        y: by + 7,
        size: 10,
        font: this.fonts.bold,
        color: fc.color,
      });
    }

    this.currentY = finY - 14;

    // 4. Dossier Table of Contents & Record Summary
    const tocHeight = 120;
    const tocY = this.currentY - tocHeight;

    page.drawRectangle({
      x: this.marginLeft,
      y: tocY,
      width: this.contentWidth,
      height: tocHeight,
      color: this.cLightBg,
      borderColor: this.cBorder,
      borderWidth: 0.75,
      borderRadius: 4,
    });

    page.drawRectangle({
      x: this.marginLeft,
      y: tocY + tocHeight - 18,
      width: this.contentWidth,
      height: 18,
      color: this.cPrimaryLight,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
    });

    page.drawText("PATIENT MEDICAL DOSSIER INDEX (SECTIONS INCLUDED)", {
      x: this.marginLeft + 10,
      y: tocY + tocHeight - 13,
      size: 7.5,
      font: this.fonts.bold,
      color: this.cPrimary,
    });

    const indexItems = [
      "1. Demographic & Registration Profile",
      "2. Clinical Observations & Medical History",
      "3. Consultation & Counselling Record",
      "4. Surgical Records & Operating Team",
      "5. Treatment Sessions & Aftercare History",
      "6. Medicines & Stock Products Issued",
      "7. Financial Summary & Transaction Ledger",
      "8. Collaboration Cases (Clinic Partner)",
      "9. Linked Payables & Receivables",
      "10. System Audit Trail & Edit History",
      `11. Uploaded Documents (${sectionsSummary?.attachmentCount || 0} File(s) on Record)`,
    ];

    const tocColW = (this.contentWidth - 20) / 2;
    for (let i = 0; i < indexItems.length; i++) {
      const c = i < 6 ? 0 : 1;
      const r = i < 6 ? i : i - 6;
      const ix = this.marginLeft + 12 + c * tocColW;
      const iy = tocY + tocHeight - 34 - r * 14;

      page.drawText("[x]", {
        x: ix,
        y: iy,
        size: 7.5,
        font: this.fonts.bold,
        color: this.cAccent,
      });

      page.drawText(indexItems[i], {
        x: ix + 16,
        y: iy,
        size: 7.5,
        font: this.fonts.regular,
        color: this.cDark,
      });
    }

    this.currentY = tocY - 14;

    const disc = "CONFIDENTIAL MEDICAL DOCUMENT • GENERATED DIRECTLY FROM RYAN MEDIHUB ELECTRONIC MEDICAL RECORDS DATABASE";
    const discW = this.fonts.italic.widthOfTextAtSize(disc, 6.5);
    page.drawText(disc, {
      x: this.marginLeft + (this.contentWidth - discW) / 2,
      y: this.marginBottom + 16,
      size: 6.5,
      font: this.fonts.italic,
      color: this.cMuted,
    });
  }

  drawBanner(patient) {
    this.drawCoverPage(patient, {}, {});
  }

  drawSectionHeader(title) {
    this.ensureSpace(34);
    const page = this.currentPage;
    const headerHeight = 22;
    const headerY = this.currentY - headerHeight;

    page.drawRectangle({
      x: this.marginLeft,
      y: headerY,
      width: this.contentWidth,
      height: headerHeight,
      color: this.cPrimary,
      borderRadius: 3,
    });

    page.drawRectangle({
      x: this.marginLeft,
      y: headerY,
      width: 4,
      height: headerHeight,
      color: this.cGold,
    });

    page.drawText(title.toUpperCase(), {
      x: this.marginLeft + 10,
      y: headerY + 6.5,
      size: 8.5,
      font: this.fonts.bold,
      color: this.cWhite,
    });

    this.currentY = headerY - 8;
  }

  drawSubSectionHeader(title) {
    this.ensureSpace(20);
    const page = this.currentPage;
    const y = this.currentY - 12;

    page.drawRectangle({
      x: this.marginLeft,
      y: y - 1,
      width: 3,
      height: 11,
      color: this.cAccent,
      borderRadius: 1.5,
    });

    page.drawText(title, {
      x: this.marginLeft + 8,
      y,
      size: 8,
      font: this.fonts.bold,
      color: this.cAccent,
    });

    page.drawLine({
      start: { x: this.marginLeft + 8 + this.fonts.bold.widthOfTextAtSize(title, 8) + 8, y: y + 4 },
      end: { x: this.pageWidth - this.marginRight, y: y + 4 },
      thickness: 0.5,
      color: this.cBorderSubtle,
    });

    this.currentY = y - 7;
  }

  drawCardGrid(pairs, columns = 2) {
    if (!pairs || pairs.length === 0) return;

    const colWidth = this.contentWidth / columns;
    const numRows = Math.ceil(pairs.length / columns);

    const rowHeights = [];
    const processedCells = [];

    for (let r = 0; r < numRows; r++) {
      let maxLines = 1;
      const rowCells = [];

      for (let c = 0; c < columns; c++) {
        const idx = r * columns + c;
        if (idx < pairs.length) {
          const item = pairs[idx];
          const label = `${item.label}:`;
          const rawVal = sanitizeText(item.value, "Not recorded");
          const labelWidth = this.fonts.bold.widthOfTextAtSize(label, 7.5);
          const maxValWidth = colWidth - labelWidth - 18;

          const valLines = this.wrapText(rawVal, 8, this.fonts.regular, Math.max(maxValWidth, 60));
          const linesCount = Math.max(valLines.length, 1);
          if (linesCount > maxLines) maxLines = linesCount;

          rowCells.push({ label, valLines, labelWidth, col: c });
        } else {
          rowCells.push(null);
        }
      }

      const rowH = 14 + (maxLines - 1) * 10 + 6;
      rowHeights.push(rowH);
      processedCells.push(rowCells);
    }

    const totalHeight = rowHeights.reduce((a, b) => a + b, 0) + 6;
    this.ensureSpace(totalHeight);

    const page = this.currentPage;
    const startY = this.currentY;

    page.drawRectangle({
      x: this.marginLeft,
      y: startY - totalHeight,
      width: this.contentWidth,
      height: totalHeight,
      color: this.cLightBg,
      borderColor: this.cBorder,
      borderWidth: 0.6,
      borderRadius: 3,
    });

    let currentCellY = startY - 4;
    for (let r = 0; r < numRows; r++) {
      const rowH = rowHeights[r];
      const cells = processedCells[r];

      if (r > 0) {
        page.drawLine({
          start: { x: this.marginLeft + 6, y: currentCellY + 2 },
          end: { x: this.pageWidth - this.marginRight - 6, y: currentCellY + 2 },
          thickness: 0.4,
          color: this.cBorderSubtle,
        });
      }

      for (const cell of cells) {
        if (!cell) continue;
        const x = this.marginLeft + cell.col * colWidth + 8;
        const textY = currentCellY - 11;

        page.drawText(cell.label, {
          x,
          y: textY,
          size: 7.5,
          font: this.fonts.bold,
          color: this.cMuted,
        });

        const valX = x + cell.labelWidth + 5;
        for (let l = 0; l < cell.valLines.length; l++) {
          page.drawText(cell.valLines[l], {
            x: valX,
            y: textY - l * 10,
            size: 8,
            font: this.fonts.regular,
            color: this.cDark,
          });
        }
      }

      currentCellY -= rowH;
    }

    this.currentY = startY - totalHeight - 10;
  }

  drawKeyValueGrid(pairs, columns = 2) {
    this.drawCardGrid(pairs, columns);
  }

  drawVitalsGrid(vitals) {
    const columns = 4;
    const totalHeight = 78;
    this.ensureSpace(totalHeight);

    const page = this.currentPage;
    const startY = this.currentY;
    const colWidth = this.contentWidth / columns;
    const rowHeight = 35;

    page.drawRectangle({
      x: this.marginLeft,
      y: startY - totalHeight,
      width: this.contentWidth,
      height: totalHeight,
      color: this.cLightBg,
      borderColor: this.cBorder,
      borderWidth: 0.6,
      borderRadius: 3,
    });

    for (let i = 0; i < vitals.length; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = this.marginLeft + col * colWidth + 8;
      const y = startY - 6 - row * rowHeight;

      const item = vitals[i];
      const label = item.label.toUpperCase();
      const rawVal = sanitizeText(item.value, "Not recorded");

      page.drawText(label, {
        x,
        y: y - 8,
        size: 7,
        font: this.fonts.bold,
        color: this.cMuted,
      });

      let valColor = this.cDark;
      const lower = rawVal.toLowerCase();
      if (lower.includes("non-reactive") || lower.includes("negative") || lower === "no") {
        valColor = this.cSuccess;
      } else if (lower.includes("reactive") || lower.includes("positive") || (item.label.includes("Allergies") && lower !== "none" && lower !== "not recorded")) {
        valColor = this.cDanger;
      }

      const displayVal = rawVal.length > 22 ? `${rawVal.slice(0, 20)}..` : rawVal;
      page.drawText(displayVal, {
        x,
        y: y - 22,
        size: 8.5,
        font: this.fonts.bold,
        color: valColor,
      });

      if (col < columns - 1) {
        page.drawLine({
          start: { x: this.marginLeft + (col + 1) * colWidth, y: y - 26 },
          end: { x: this.marginLeft + (col + 1) * colWidth, y: y - 4 },
          thickness: 0.4,
          color: this.cBorderSubtle,
        });
      }
    }

    page.drawLine({
      start: { x: this.marginLeft + 6, y: startY - 40 },
      end: { x: this.pageWidth - this.marginRight - 6, y: startY - 40 },
      thickness: 0.4,
      color: this.cBorderSubtle,
    });

    this.currentY = startY - totalHeight - 10;
  }

  drawNotesBlock(title, text, type = "info") {
    if (!text || text === "Not recorded") return;
    const clean = sanitizeText(text);
    if (!clean || clean === "Not recorded") return;

    let borderCol = this.cPrimary;
    let bgCol = this.cPrimaryLight;
    let titleCol = this.cPrimary;

    if (type === "warning") {
      borderCol = this.cWarning;
      bgCol = this.cWarningBg;
      titleCol = this.cWarning;
    } else if (type === "danger" || type === true) {
      borderCol = this.cDanger;
      bgCol = this.cDangerBg;
      titleCol = this.cDanger;
    } else if (type === "success") {
      borderCol = this.cSuccess;
      bgCol = this.cSuccessBg;
      titleCol = this.cSuccess;
    }

    const maxWidth = this.contentWidth - 24;
    const lines = this.wrapText(clean, 8, this.fonts.regular, maxWidth);
    if (lines.length === 0) return;

    const blockHeight = lines.length * 11 + 22;
    this.ensureSpace(blockHeight + 10);

    const page = this.currentPage;
    const boxY = this.currentY - blockHeight;

    page.drawRectangle({
      x: this.marginLeft,
      y: boxY,
      width: this.contentWidth,
      height: blockHeight,
      color: bgCol,
      borderColor: this.cBorder,
      borderWidth: 0.5,
      borderRadius: 3,
    });

    page.drawRectangle({
      x: this.marginLeft,
      y: boxY,
      width: 3.5,
      height: blockHeight,
      color: borderCol,
    });

    page.drawText(title, {
      x: this.marginLeft + 10,
      y: boxY + blockHeight - 12,
      size: 8,
      font: this.fonts.bold,
      color: titleCol,
    });

    let lineY = boxY + blockHeight - 23;
    for (const line of lines) {
      page.drawText(line, {
        x: this.marginLeft + 10,
        y: lineY,
        size: 8,
        font: this.fonts.regular,
        color: this.cDark,
      });
      lineY -= 11;
    }

    this.currentY = boxY - 8;
  }

  drawTable({ headers, colWidths, rows, emptyText = "No records found", aligns = [] }) {
    const headerHeight = 18;

    if (!rows || rows.length === 0) {
      this.ensureSpace(28);
      const page = this.currentPage;
      const emptyY = this.currentY - 20;

      page.drawRectangle({
        x: this.marginLeft,
        y: emptyY,
        width: this.contentWidth,
        height: 20,
        color: this.cLightBg,
        borderColor: this.cBorder,
        borderWidth: 0.5,
        borderRadius: 2,
      });

      page.drawText(`- ${emptyText} -`, {
        x: this.marginLeft + 12,
        y: emptyY + 6,
        size: 7.5,
        font: this.fonts.italic,
        color: this.cMuted,
      });

      this.currentY = emptyY - 8;
      return;
    }

    const renderHeader = () => {
      const page = this.currentPage;
      const y = this.currentY - headerHeight;

      page.drawRectangle({
        x: this.marginLeft,
        y,
        width: this.contentWidth,
        height: headerHeight,
        color: this.cAccent,
        borderRadius: 2,
      });

      let curX = this.marginLeft;
      for (let c = 0; c < headers.length; c++) {
        const align = aligns[c] || "left";
        const hText = headers[c];
        const hWidth = this.fonts.bold.widthOfTextAtSize(hText, 7.5);
        let textX = curX + 6;
        if (align === "right") {
          textX = curX + colWidths[c] - hWidth - 6;
        }

        page.drawText(hText, {
          x: textX,
          y: y + 5,
          size: 7.5,
          font: this.fonts.bold,
          color: this.cWhite,
        });
        curX += colWidths[c];
      }
      this.currentY = y;
    };

    this.ensureSpace(headerHeight + 25);
    renderHeader();

    for (let r = 0; r < rows.length; r++) {
      const rowData = rows[r];

      let maxLinesInRow = 1;
      const cellLines = [];
      for (let c = 0; c < rowData.length; c++) {
        const maxW = colWidths[c] - 10;
        const text = sanitizeText(rowData[c], "-");
        const lines = this.wrapText(text, 7.5, this.fonts.regular, maxW);
        cellLines.push(lines.length > 0 ? lines : [text]);
        if (lines.length > maxLinesInRow) maxLinesInRow = lines.length;
      }

      const rowHeight = Math.max(16, 12 + maxLinesInRow * 9);

      if (this.currentY - rowHeight < this.marginBottom) {
        this.addPage();
        renderHeader();
      }

      const page = this.currentPage;
      const y = this.currentY - rowHeight;
      const isEven = r % 2 === 0;

      page.drawRectangle({
        x: this.marginLeft,
        y,
        width: this.contentWidth,
        height: rowHeight,
        color: isEven ? this.cLightBg : this.cWhite,
        borderColor: this.cBorderSubtle,
        borderWidth: 0.4,
      });

      let curX = this.marginLeft;
      for (let c = 0; c < rowData.length; c++) {
        const align = aligns[c] || "left";
        const lines = cellLines[c];

        for (let l = 0; l < lines.length; l++) {
          const lineStr = lines[l];
          const lineW = this.fonts.regular.widthOfTextAtSize(lineStr, 7.5);
          let textX = curX + 6;
          if (align === "right") {
            textX = curX + colWidths[c] - lineW - 6;
          }

          page.drawText(lineStr, {
            x: textX,
            y: y + rowHeight - 11 - l * 9,
            size: 7.5,
            font: this.fonts.regular,
            color: this.cDark,
          });
        }

        curX += colWidths[c];
      }

      this.currentY = y;
    }

    this.currentY -= 10;
  }

  /**
   * Universal shared image collage renderer for all clinical and patient attachment categories:
   * - Clinical photographs
   * - Signed consent forms
   * - Surgical documentation & clearance forms
   * - Consultation & counselling forms
   * - Other uploaded image attachments (JPEG, PNG, WebP, GIF after pipeline conversion)
   *
   * Automatically groups images by original document category (section) with clear headings,
   * while ensuring no category ever creates a wasteful 1-page-per-image layout.
   *
   * Grid layout specifications:
   * - 1 image: large centered frame
   * - 2 images: 2-column side-by-side layout
   * - 3-4 images: 2x2 grid
   * - 5-6 images: 3x2 grid
   * - >6 images: paginated cleanly across subsequent collage pages in batches of up to 6
   * Strictly preserves aspect ratio with contained scaling (zero distortion or cropping).
   */
  async renderImageCollage(imageList, customCategoryTitle = null, embedFailures = []) {
    if (!imageList || imageList.length === 0) return 0;

    // If no customCategoryTitle was provided, inspect image categories.
    // Group attachments by original category so different document types
    // (e.g. Consent Forms, Clinical Photos, Surgery Forms) receive distinct, dedicated collage sections.
    if (!customCategoryTitle) {
      const CATEGORY_ORDER = [
        "Clinical Photographs",
        "Signed Consent Forms",
        "Surgical Documentation",
        "Consultation Records",
      ];
      const rawSections = [...new Set(imageList.map((item) => item.section || "Clinical Attachments"))];
      const distinctSections = [
        ...CATEGORY_ORDER.filter((cat) => rawSections.includes(cat)),
        ...rawSections.filter((sec) => !CATEGORY_ORDER.includes(sec)),
      ];
      if (distinctSections.length > 1) {
        let totalRendered = 0;
        for (const sec of distinctSections) {
          const sectionImages = imageList.filter((item) => (item.section || "Clinical Attachments") === sec);
          totalRendered += await this.renderImageCollage(sectionImages, sec, embedFailures);
        }
        return totalRendered;
      } else if (distinctSections.length === 1) {
        customCategoryTitle = distinctSections[0];
      }
    }

    const preparedImages = [];
    for (const item of imageList) {
      try {
        let embedded;
        if (item.format === "pdf-page") {
          embedded = await this.pdfDoc.embedPage(item.srcPage);
        } else if (item.format === "png") {
          embedded = await this.pdfDoc.embedPng(item.buffer);
        } else {
          embedded = await this.pdfDoc.embedJpg(item.buffer);
        }
        preparedImages.push({ ...item, embedded });
      } catch (err) {
        // Fallback: if sharp is available, normalize problematic PNG/JPEG encoding to baseline JPEG
        let recovered = false;
        if (sharp && item.format !== "pdf-page" && item.buffer) {
          try {
            const normalizedJpeg = await sharp(item.buffer).jpeg({ quality: 88 }).toBuffer();
            const embedded = await this.pdfDoc.embedJpg(normalizedJpeg);
            preparedImages.push({ ...item, format: "jpeg", embedded });
            recovered = true;
          } catch {}
        }
        if (!recovered) {
          console.warn(`Could not embed image "${item.label}": ${err.message}`);
          embedFailures.push({
            label: item.label,
            section: item.section || customCategoryTitle || "Clinical Attachments",
            originalUrl: item.originalUrl,
            reason: `Image embed failure: ${err.message}`,
          });
        }
      }
    }

    if (preparedImages.length === 0) return 0;

    const MAX_PER_PAGE = 6;
    const totalPages = Math.ceil(preparedImages.length / MAX_PER_PAGE);

    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      const pageImages = preparedImages.slice(pIdx * MAX_PER_PAGE, (pIdx + 1) * MAX_PER_PAGE);
      const N = pageImages.length;

      let cols = 1;
      let rows = 1;
      if (N === 2) {
        cols = 2;
        rows = 1;
      } else if (N === 3 || N === 4) {
        cols = 2;
        rows = 2;
      } else if (N >= 5) {
        cols = 3;
        rows = 2;
      }

      const page = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
      this.pages.push(page);
      this.currentPage = page;
      this.currentY = this.pageHeight - this.marginTop;
      this.drawRunningHeader();

      const bannerH = 24;
      const bannerY = this.currentY - bannerH;

      page.drawRectangle({
        x: this.marginLeft,
        y: bannerY,
        width: this.contentWidth,
        height: bannerH,
        color: this.cPrimaryLight,
        borderColor: this.cBorder,
        borderWidth: 0.75,
        borderRadius: 3,
      });

      page.drawRectangle({
        x: this.marginLeft,
        y: bannerY,
        width: 3.5,
        height: bannerH,
        color: this.cPrimary,
      });

      const pageSuffix = totalPages > 1 ? ` (PAGE ${pIdx + 1} OF ${totalPages})` : "";
      const rawTitle = customCategoryTitle || "Clinical Attachments";
      const cleanTitle = sanitizeText(rawTitle).toUpperCase();
      let bannerTitle;
      if (cleanTitle === "CLINICAL PHOTOGRAPHS") {
        bannerTitle = `CLINICAL PHOTOGRAPHS & IMAGING RECORD${pageSuffix}`;
      } else if (cleanTitle.startsWith("CLINICAL")) {
        bannerTitle = `${cleanTitle}${pageSuffix}`;
      } else {
        bannerTitle = `CLINICAL ATTACHMENTS — ${cleanTitle}${pageSuffix}`;
      }

      page.drawText(bannerTitle, {
        x: this.marginLeft + 10,
        y: bannerY + 8,
        size: 8.5,
        font: this.fonts.bold,
        color: this.cPrimary,
      });

      const countBadge = `${N} Image(s) on Page • Contained Scaling`;
      const badgeW = this.fonts.bold.widthOfTextAtSize(countBadge, 7);
      page.drawText(countBadge, {
        x: this.pageWidth - this.marginRight - badgeW - 10,
        y: bannerY + 8,
        size: 7,
        font: this.fonts.bold,
        color: this.cAccent,
      });

      const topY = bannerY - 10;
      const bottomY = this.marginBottom + 10;
      const availableH = topY - bottomY;
      const availableW = this.contentWidth;

      const gapX = 10;
      const gapY = 12;

      const cellW = (availableW - (cols - 1) * gapX) / cols;
      let cellH = (availableH - (rows - 1) * gapY) / rows;

      let gridTopY = topY;
      if (rows === 1) {
        if (cols === 1) {
          cellH = Math.min(cellH, 560);
          gridTopY = topY - (availableH - cellH) / 2;
        } else {
          cellH = Math.min(cellH, 420);
          gridTopY = topY - (availableH - cellH) / 2;
        }
      }

      for (let i = 0; i < N; i++) {
        const item = pageImages[i];
        const emb = item.embedded;
        const c = i % cols;
        const r = Math.floor(i / cols);

        const cellX = this.marginLeft + c * (cellW + gapX);
        const cellY = gridTopY - (r + 1) * cellH - r * gapY;

        page.drawRectangle({
          x: cellX,
          y: cellY,
          width: cellW,
          height: cellH,
          color: this.cLightBg,
          borderColor: this.cBorder,
          borderWidth: 0.6,
          borderRadius: 3,
        });

        const stripH = 16;
        page.drawRectangle({
          x: cellX,
          y: cellY + cellH - stripH,
          width: cellW,
          height: stripH,
          color: this.cPrimaryLight,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
        });

        const cellHeader = sanitizeText(item.label || `${customCategoryTitle || "Attachment Image"} ${pIdx * MAX_PER_PAGE + i + 1}`);
        const maxHeaderW = cellW - 14;
        let displayHeader = cellHeader;
        if (this.fonts.bold.widthOfTextAtSize(displayHeader, 7) > maxHeaderW) {
          while (displayHeader.length > 2 && this.fonts.bold.widthOfTextAtSize(`${displayHeader}..`, 7) > maxHeaderW) {
            displayHeader = displayHeader.slice(0, -1);
          }
          displayHeader = `${displayHeader}..`;
        }

        page.drawText(displayHeader, {
          x: cellX + 6,
          y: cellY + cellH - 11.5,
          size: 7,
          font: this.fonts.bold,
          color: this.cPrimary,
        });

        const captionH = 16;
        const dimStr = `${Math.round(emb.width)}x${Math.round(emb.height)} ${item.format === "pdf-page" ? "pt" : "px"}`;
        const capText = `${sanitizeText(item.section || customCategoryTitle || "Clinical Record")} • ${dimStr}`;
        const maxCapW = cellW - 12;
        let displayCap = capText;
        if (this.fonts.italic.widthOfTextAtSize(displayCap, 6.5) > maxCapW) {
          while (displayCap.length > 2 && this.fonts.italic.widthOfTextAtSize(`${displayCap}..`, 6.5) > maxCapW) {
            displayCap = displayCap.slice(0, -1);
          }
          displayCap = `${displayCap}..`;
        }

        page.drawText(displayCap, {
          x: cellX + 6,
          y: cellY + 5.5,
          size: 6.5,
          font: this.fonts.italic,
          color: this.cMuted,
        });

        const padX = 6;
        const padY = 5;
        const vpX = cellX + padX;
        const vpY = cellY + captionH + padY;
        const vpW = cellW - 2 * padX;
        const vpH = cellH - stripH - captionH - 2 * padY;

        page.drawRectangle({
          x: vpX,
          y: vpY,
          width: vpW,
          height: vpH,
          color: this.cWhite,
          borderColor: this.cBorderSubtle,
          borderWidth: 0.5,
        });

        const scale = Math.min(vpW / emb.width, vpH / emb.height);
        const drawW = emb.width * scale;
        const drawH = emb.height * scale;
        const imgDrawX = vpX + (vpW - drawW) / 2;
        const imgDrawY = vpY + (vpH - drawH) / 2;

        if (item.format === "pdf-page") {
          page.drawPage(emb, {
            x: imgDrawX,
            y: imgDrawY,
            width: drawW,
            height: drawH,
          });
        } else {
          page.drawImage(emb, {
            x: imgDrawX,
            y: imgDrawY,
            width: drawW,
            height: drawH,
          });
        }
      }
    }

    return preparedImages.length;
  }

  finalize(patient) {
    const totalPages = this.pdfDoc.getPageCount();
    for (let i = 0; i < this.pages.length; i++) {
      const page = this.pages[i];
      const y = 20;

      page.drawLine({
        start: { x: this.marginLeft, y: y + 9 },
        end: { x: this.pageWidth - this.marginRight, y: y + 9 },
        thickness: 0.5,
        color: this.cBorder,
      });

      const pName = sanitizeText(patient.personal?.name, "Patient");
      const footerLeft = `Ryan Medihub Clinic CRM Archive  •  Patient: ${pName} (ID: ${patient._id})`;
      page.drawText(footerLeft, {
        x: this.marginLeft,
        y,
        size: 7,
        font: this.fonts.regular,
        color: this.cMuted,
      });

      const footerRight = `Page ${i + 1} of ${totalPages}`;
      const pageTextWidth = this.fonts.bold.widthOfTextAtSize(footerRight, 7.5);
      page.drawText(footerRight, {
        x: this.pageWidth - this.marginRight - pageTextWidth,
        y,
        size: 7.5,
        font: this.fonts.bold,
        color: this.cDark,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Photo-Wrapper PDF Page Inspection & Extraction Helper
// ---------------------------------------------------------------------------
function inspectUploadedPdfPageForCollage(srcPdfDoc, srcPage, section) {
  try {
    const { width, height } = srcPage.getSize();
    const isStdA4 =
      (Math.abs(width - 595.28) <= 15 && Math.abs(height - 841.89) <= 15) ||
      (Math.abs(height - 595.28) <= 15 && Math.abs(width - 841.89) <= 15);
    const isStdLetter =
      (Math.abs(width - 612) <= 15 && Math.abs(height - 792) <= 15) ||
      (Math.abs(height - 612) <= 15 && Math.abs(width - 792) <= 15);

    const res = srcPage.node.Resources();
    const xobjs = res ? res.lookup(PDFName.of("XObject")) : null;
    const imageXObjs = [];
    if (xobjs && typeof xobjs.entries === "function") {
      for (const [, ref] of xobjs.entries()) {
        const obj = srcPdfDoc.context.lookup(ref);
        if (!obj || !obj.dict) continue;
        const subtype = obj.dict.get(PDFName.of("Subtype"));
        if (subtype && subtype.toString() === "/Image") {
          const w = Number(obj.dict.get(PDFName.of("Width"))?.toString() || 0);
          const h = Number(obj.dict.get(PDFName.of("Height"))?.toString() || 0);
          imageXObjs.push({ obj, w, h });
        }
      }
    }

    if (imageXObjs.length === 0) {
      return { asCollage: false };
    }

    // Inspect content stream text to separate true clinical documents from image-wrapper PDFs
    let rawStream = "";
    const contentsNode = srcPage.node.Contents();
    const resolvedContents = contentsNode ? srcPdfDoc.context.lookup(contentsNode) : null;
    const contentStreams = [];
    if (resolvedContents instanceof PDFArray) {
      for (let k = 0; k < resolvedContents.size(); k++) {
        const st = srcPdfDoc.context.lookup(resolvedContents.get(k));
        if (st && st.contents) contentStreams.push(st);
      }
    } else if (resolvedContents && resolvedContents.contents) {
      contentStreams.push(resolvedContents);
    }

    for (const st of contentStreams) {
      try {
        rawStream += zlib.inflateSync(st.contents).toString("latin1");
      } catch {
        rawStream += Buffer.from(st.contents).toString("latin1");
      }
    }

    const textTokens = [];
    const litRe = /\(([^()]{1,120})\)\s*Tj/g;
    let m;
    while ((m = litRe.exec(rawStream)) !== null) {
      const cleaned = m[1].trim();
      if (cleaned) textTokens.push(cleaned);
    }
    const hasTJArray = /\]\s*TJ\b/.test(rawStream);
    const hasRealText =
      hasTJArray ||
      textTokens.length > 2 ||
      textTokens.some((t) => t.length > 35);

    const isNonStdPhotoPage = !isStdA4 && !isStdLetter && !hasRealText;
    const isClinicalPhotoPdfPage = section === "Clinical Photographs" && !hasRealText && imageXObjs.length === 1;

    if (!isNonStdPhotoPage && !isClinicalPhotoPdfPage) {
      return { asCollage: false };
    }

    // Try direct lossless JPEG extraction so scanner watermarks (e.g. "Image to PDF") are cleanly omitted
    const rotAngle = srcPage.getRotation().angle;
    const cropBox = srcPage.getCropBox();
    const sortedImgs = [...imageXObjs].sort((a, b) => b.w * b.h - a.w * a.h);
    const primary = sortedImgs[0];
    const othersAreTinyIcons = sortedImgs.slice(1).every((x) => Math.max(x.w, x.h) <= 220);

    if (
      rotAngle === 0 &&
      cropBox.x === 0 &&
      cropBox.y === 0 &&
      primary &&
      Math.max(primary.w, primary.h) >= 250 &&
      othersAreTinyIcons &&
      primary.obj.contents
    ) {
      const d = primary.obj.dict;
      const hasMask = Boolean(d.get(PDFName.of("SMask")) || d.get(PDFName.of("Mask")) || d.get(PDFName.of("Decode")));
      const cs = srcPdfDoc.context.lookup(d.get(PDFName.of("ColorSpace")));
      const csStr = cs ? cs.toString() : "";
      const isSimpleColor = csStr === "/DeviceRGB" || csStr === "/DeviceGray";
      const filterObj = srcPdfDoc.context.lookup(d.get(PDFName.of("Filter")));
      const filters = filterObj instanceof PDFArray
        ? Array.from({ length: filterObj.size() }, (_, idx) => filterObj.get(idx).toString())
        : filterObj
          ? [filterObj.toString()]
          : [];

      if (!hasMask && isSimpleColor) {
        let candidateBytes = null;
        if (filters.length === 1 && filters[0] === "/DCTDecode") {
          candidateBytes = Buffer.from(primary.obj.contents);
        } else if (filters.length === 2 && filters[0] === "/FlateDecode" && filters[1] === "/DCTDecode") {
          try {
            candidateBytes = zlib.inflateSync(primary.obj.contents);
          } catch {}
        }
        if (candidateBytes && detectFileSignature(candidateBytes) === "jpeg") {
          return { asCollage: true, format: "jpeg", buffer: candidateBytes };
        }
      }
    }

    // Lossless PDF-page form XObject fallback (handles FlateDecode, CMYK, rotated, or multi-strip photo pages)
    return { asCollage: true, format: "pdf-page", srcPage };
  } catch {
    return { asCollage: false };
  }
}

// ---------------------------------------------------------------------------
// Patient PDF Generator Core Function
// ---------------------------------------------------------------------------
async function generatePatientPDF({
  patient,
  employeeMap,
  stockMap,
  linkedTransactions = [],
  linkedCollabCases = [],
  linkedPayables = [],
  linkedReceivables = [],
  linkedAudits = [],
  logoImageBytes = null,
  attachmentDownloader = downloadAttachmentBytes,
}) {
  const pdfDoc = await PDFDocument.create();

  // Load standard fonts
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let embeddedLogo = null;
  if (logoImageBytes) {
    try {
      embeddedLogo = await pdfDoc.embedPng(logoImageBytes);
    } catch {}
  }

  const canvas = new PDFCanvas(
    pdfDoc,
    { regular: fontRegular, bold: fontBold, italic: fontItalic },
    embeddedLogo
  );

  const patientMeta = {
    _id: patient._id.toString(),
    name: patient.personal?.name,
    branch: patient.personal?.branch,
    status: patient.ops?.status || "NEW",
  };

  const totalPkg = patient.payments?.totalAmount || patient.counselling?.finlpackage || 0;
  const received = patient.payments?.amountReceived || 0;
  const discount = patient.payments?.discount || 0;
  const pending = patient.payments?.pendingAmount ?? Math.max(0, totalPkg - received - discount);
  const medAmt = patient.payments?.medicineAmount || 0;

  // Cover Page
  canvas.addPage(patientMeta);
  canvas.drawCoverPage(
    patient,
    { totalPkg, received, discount, pending },
    { attachmentCount: (patient.documents?.images?.length || 0) + (patient.documents?.consentForm?.length || 0) + (patient.documents?.suregeryForm?.length || 0) + (patient.documents?.consultForm?.length || 0) }
  );

  // Page 2 begins with Section 1
  canvas.addPage(patientMeta);

  // 1. Demographic & Registration Information
  canvas.drawSectionHeader("1. Patient Demographic & Registration Profile");
  const refEmpName = patient.personal?.reference
    ? employeeMap.get(patient.personal.reference.toString()) || "Employee Linked"
    : "None";

  canvas.drawSubSectionHeader("A. Personal Identification & Details");
  canvas.drawCardGrid([
    { label: "Full Name", value: patient.personal?.name },
    { label: "Unique Patient ID", value: patient._id.toString() },
    { label: "Contact Phone", value: patient.personal?.phone },
    { label: "Normalized Phone", value: patient.personal?.phoneNormalized },
    { label: "Email Address", value: patient.personal?.email },
    { label: "Age & Gender", value: `${patient.personal?.age ? `${patient.personal.age} yrs` : "N/A"} / ${patient.personal?.gender || "N/A"}` },
    { label: "Profession", value: patient.personal?.profession },
    { label: "Residential Address", value: patient.personal?.address },
  ], 2);

  canvas.drawSubSectionHeader("B. Registration, Branch & Reference");
  canvas.drawCardGrid([
    { label: "Assigned Branch", value: patient.personal?.branch },
    { label: "First Visit Date", value: formatDate(patient.personal?.visitDate) },
    { label: "Staff Reference", value: refEmpName },
    { label: "Visit Purpose", value: patient.personal?.purpose },
    { label: "Registration Date", value: formatDateTime(patient.createdAt) },
    { label: "Last Profile Update", value: formatDateTime(patient.updatedAt) },
  ], 2);

  if (patient.personal?.remarks) {
    canvas.drawNotesBlock("Registration Remarks", patient.personal.remarks, "info");
  }

  // 2. Clinical Observations & Medical History
  canvas.drawSectionHeader("2. Clinical Observations & Medical History");
  canvas.drawVitalsGrid([
    { label: "Blood Group", value: patient.medical?.bloodGroup },
    { label: "Random Sugar", value: patient.medical?.sugar },
    { label: "Blood Pressure", value: patient.medical?.bp },
    { label: "Pulse Rate", value: patient.medical?.pulse },
    { label: "Body Weight", value: patient.medical?.weight },
    { label: "HIV Status", value: patient.medical?.hiv },
    { label: "HCV Status", value: patient.medical?.hcv },
    { label: "Known Allergies", value: patient.medical?.allergies },
  ]);

  if (patient.medical?.medicalHistory) {
    canvas.drawNotesBlock("Recorded Medical History & Contraindications", patient.medical.medicalHistory, "warning");
  }

  // 3. Consultation & Counselling Record
  canvas.drawSectionHeader("3. Consultation & Counselling Record");
  const counsellorName = patient.counselling?.counsellor
    ? employeeMap.get(patient.counselling.counsellor.toString()) || "Counsellor Linked"
    : "Not assigned";

  canvas.drawSubSectionHeader("A. Hair Loss Evaluation & Clinical Recommendation");
  canvas.drawCardGrid([
    { label: "Assigned Counsellor", value: counsellorName },
    { label: "Hair Loss Pattern", value: patient.counselling?.hairlossType },
    { label: "Area of Concern", value: patient.counselling?.areaofConcern },
    { label: "Hair Loss Duration", value: patient.counselling?.hairlossduration },
    { label: "Hair Loss Cause", value: patient.counselling?.hairlossreason },
    { label: "Technique Suggested", value: patient.counselling?.techniqueSuggested },
  ], 2);

  canvas.drawSubSectionHeader("B. Package Quoted & Surgical Clearance");
  canvas.drawCardGrid([
    { label: "Technique Quoted", value: patient.personal?.techniqueQuoted },
    { label: "Initial Package Quoted", value: formatCurrency(patient.personal?.packageQuoted) },
    { label: "Final Agreed Package", value: formatCurrency(patient.counselling?.finlpackage) },
    { label: "Grafts Suggested", value: patient.counselling?.graftsSuggested },
    { label: "Surgery Clearance", value: patient.counselling?.readyForSurgery ? "Ready for Surgery" : "Pending Clearance" },
    { label: "Clearance Status", value: patient.counselling?.readyForSurgery ? "Cleared by Counselling" : "Pending Medical Clearance" },
  ], 2);

  if (patient.counselling?.additionalbenefits?.length > 0) {
    canvas.drawNotesBlock(
      "Agreed Additional Benefits",
      patient.counselling.additionalbenefits.filter(Boolean).join(" | "),
      "info"
    );
  }

  if (patient.counselling?.medicines?.length > 0) {
    canvas.drawNotesBlock(
      "Prescribed Medications",
      patient.counselling.medicines.filter(Boolean).join(" | "),
      "info"
    );
  }

  if (patient.counselling?.notes) {
    canvas.drawNotesBlock("Consultation Clinical Notes", patient.counselling.notes, "info");
  }

  // 4. Surgical Records & Clinical Team
  canvas.drawSectionHeader("4. Surgical Records & Operating Team");
  const resolveTeam = (ids) => {
    if (!ids || ids.length === 0) return "None";
    return ids
      .map((id) => employeeMap.get(id.toString()) || "Staff")
      .filter(Boolean)
      .join(", ") || "None";
  };

  canvas.drawSubSectionHeader("A. Procedure Details & Graft Metrics");
  canvas.drawCardGrid([
    { label: "Surgery Date", value: formatDate(patient.surgery?.surgeryDate) },
    { label: "Operating Location", value: patient.surgery?.location },
    { label: "Operating Theatre (OT)", value: patient.surgery?.OT ? `OT #${patient.surgery.OT}` : "N/A" },
    { label: "Surgical Technique", value: patient.surgery?.technique },
    { label: "Grafts Required", value: patient.surgery?.graftsneed },
    { label: "Grafts Implanted", value: patient.surgery?.graftsImplanted },
    { label: "Donor Area Condition", value: patient.surgery?.donorCondition },
  ], 2);

  canvas.drawSubSectionHeader("B. Operating Surgical Roster & Team Members");
  const surgicalRoster = [
    ["Lead Doctor(s)", resolveTeam(patient.surgery?.doctor)],
    ["Senior Technician(s)", resolveTeam(patient.surgery?.seniorTech)],
    ["Implanter (Right Side)", resolveTeam(patient.surgery?.implanterRight)],
    ["Implanter (Left Side)", resolveTeam(patient.surgery?.implanterLeft)],
    ["Grafting Specialist", resolveTeam(patient.surgery?.graftingPerson)],
    ["Surgical Helper(s)", resolveTeam(patient.surgery?.helper)],
  ];
  canvas.drawTable({
    headers: ["Surgical Role / Responsibility", "Assigned Specialist / Staff Member"],
    colWidths: [180, 339.28],
    rows: surgicalRoster,
    emptyText: "No surgical team assigned",
  });

  // 5. Treatment Sessions & Aftercare (PRP / GFC / Canacot / Biotin / Mesotherapy)
  canvas.drawSectionHeader("5. Treatment Sessions & Aftercare History");
  canvas.drawCardGrid([
    { label: "Scheduled Headwash Date", value: formatDate(patient.afterSurgery?.headwashDate) },
    { label: "Bandage Removal Date", value: formatDate(patient.afterSurgery?.bandageRemovalDate) },
  ], 2);

  const prpSessions = (patient.afterSurgery?.prp || []).map((s, idx) => [
    String(s.prpNumber || idx + 1),
    s.type || "PRP",
    formatDate(s.date),
    s.date && new Date(s.date) <= new Date() ? "Completed / Administered" : "Scheduled",
  ]);

  canvas.drawTable({
    headers: ["Session #", "Treatment Procedure", "Treatment Date", "Session Status"],
    colWidths: [80, 150, 140, 149.28],
    rows: prpSessions,
    emptyText: "No aftercare or treatment sessions recorded for this patient",
  });

  // 6. Medication & Stock Products
  if (patient.products?.length > 0) {
    canvas.drawSectionHeader("6. Medicines & Stock Products Issued");
    const productRows = patient.products.map((item, idx) => {
      const stockName = item.stocks ? stockMap.get(item.stocks.toString()) || "Stock Medicine" : "Medicine";
      return [
        String(idx + 1),
        stockName,
        String(item.quantity || 1),
        formatCurrency(item.amount),
      ];
    });

    canvas.drawTable({
      headers: ["#", "Product / Medicine Name", "Quantity", "Billed Amount"],
      colWidths: [40, 260, 100, 119.28],
      rows: productRows,
      emptyText: "No products or stock medications issued",
      aligns: ["left", "left", "left", "right"],
    });
  }

  // 7. Financial Balance & Transaction Ledger
  canvas.drawSectionHeader("7. Financial Summary & Transaction Ledger");
  canvas.drawCardGrid([
    { label: "Total Package Amount", value: formatCurrency(totalPkg) },
    { label: "Total Amount Received", value: formatCurrency(received) },
    { label: "Authorized Discount", value: formatCurrency(discount) },
    { label: "Outstanding Balance Due", value: formatCurrency(pending) },
    { label: "Medicine Sales Amount", value: formatCurrency(medAmt) },
    { label: "Settlement Status", value: pending <= 0 ? "Fully Paid" : "Balance Outstanding" },
  ], 2);

  const txnRows = linkedTransactions.map((tx) => [
    formatDate(tx.date || tx.createdAt),
    tx.transactionCategory || "REVENUE",
    tx.procedure || "Procedure",
    tx.method || "Cash/Bank",
    tx.paymentType || "Direct",
    tx.branch || "Branch",
    formatCurrency(tx.amount),
  ]);

  canvas.drawTable({
    headers: ["Date", "Category", "Procedure", "Method", "Type", "Branch", "Amount"],
    colWidths: [75, 75, 95, 80, 65, 60, 69.28],
    rows: txnRows,
    emptyText: "No transaction records found in ledger for this patient",
    aligns: ["left", "left", "left", "left", "left", "left", "right"],
  });

  // 8. Collaboration Cases (If Applicable)
  if (linkedCollabCases.length > 0) {
    canvas.drawSectionHeader("8. Collaboration Clinic Cases");
    const collabRows = linkedCollabCases.map((c) => [
      c.clinic || "Collab Clinic",
      c.procedure || "Procedure",
      formatCurrency(c.packageAmount),
      formatCurrency(c.clinicShare),
      c.status || "OPEN",
      c.clinicCollections?.length ? `${c.clinicCollections.length} Collection(s)` : "None",
    ]);

    canvas.drawTable({
      headers: ["Clinic Partner", "Procedure", "Package", "Clinic Share", "Status", "Collections"],
      colWidths: [100, 100, 85, 85, 65, 84.28],
      rows: collabRows,
      emptyText: "No collaboration cases linked",
      aligns: ["left", "left", "right", "right", "left", "left"],
    });
  }

  // 9. Payables & Receivables (If Applicable)
  if (linkedPayables.length > 0 || linkedReceivables.length > 0) {
    canvas.drawSectionHeader("9. Linked Payables & Receivables");
    const prRows = [
      ...linkedPayables.map((p) => [
        "PAYABLE (OUT)",
        p.category || "PAYABLE",
        formatCurrency(p.amount),
        formatCurrency(p.settledAmount || 0),
        p.status || "PENDING",
        formatDate(p.dueDate || p.createdAt),
      ]),
      ...linkedReceivables.map((r) => [
        "RECEIVABLE (IN)",
        r.category || "RECEIVABLE",
        formatCurrency(r.amount),
        formatCurrency(r.receivedAmount || 0),
        r.status || "PENDING",
        formatDate(r.dueDate || r.createdAt),
      ]),
    ];

    canvas.drawTable({
      headers: ["Type", "Category", "Amount", "Settled/Received", "Status", "Date"],
      colWidths: [95, 95, 85, 85, 75, 84.28],
      rows: prRows,
      emptyText: "No payables or receivables linked",
      aligns: ["left", "left", "right", "right", "left", "left"],
    });
  }

  // 10. Audit Trail & Metadata
  canvas.drawSectionHeader("10. System Audit Trail & Metadata");
  const creatorStr = patient.createdBy?.name
    ? `${patient.createdBy.name} (${patient.createdBy.branch || "HQ"}) on ${formatDateTime(patient.createdBy.date)}`
    : `System on ${formatDateTime(patient.createdAt)}`;

  canvas.drawCardGrid([
    { label: "Created By Staff", value: creatorStr },
    { label: "System Creation Timestamp", value: formatDateTime(patient.createdAt) },
    { label: "Last System Update", value: formatDateTime(patient.updatedAt) },
    { label: "Total Audit Logs", value: `${linkedAudits.length} Logged Entry(ies)` },
  ], 2);

  if (patient.editors?.length > 0) {
    const editorRows = patient.editors.slice(-10).map((ed, idx) => [
      String(idx + 1),
      ed.name || "Staff",
      ed.email || "-",
      ed.branch || "-",
      formatDateTime(ed.date),
    ]);

    canvas.drawTable({
      headers: ["#", "Staff Editor", "Email", "Branch", "Edit Timestamp"],
      colWidths: [30, 130, 160, 80, 119.28],
      rows: editorRows,
      emptyText: "No edits recorded in profile history",
    });
  }

  // -------------------------------------------------------------------------
  // 11. ATTACHMENT RESOLUTION & EMBEDDING PIPELINE
  // -------------------------------------------------------------------------
  const discoveredAttachments = resolvePatientAttachments(patient);
  const attachmentStats = {
    discovered: discoveredAttachments.length,
    embeddedImages: 0,
    embeddedPdfPages: 0,
    unavailable: 0,
    unsupported: 0,
    failed: 0,
    errors: [],
  };

  canvas.drawSectionHeader("11. Uploaded Documents & Clinical Attachments");

  if (discoveredAttachments.length === 0) {
    canvas.drawNotesBlock(
      "Attachment Index",
      "No uploaded documents or clinical photographs are recorded for this patient."
    );
  } else {
    // Summary of discovered files
    const sectionCounts = {};
    for (const att of discoveredAttachments) {
      sectionCounts[att.section] = (sectionCounts[att.section] || 0) + 1;
    }
    const summaryGrid = Object.entries(sectionCounts).map(([sec, count]) => ({
      label: sec,
      value: `${count} file(s) on record`,
    }));
    summaryGrid.push({
      label: "Total Registered Files",
      value: `${discoveredAttachments.length} file(s)`,
    });
    canvas.drawKeyValueGrid(summaryGrid, 2);

    // Download attachments with concurrency control
    const downloadResults = [];
    for (let i = 0; i < discoveredAttachments.length; i += MAX_CONCURRENT_DOWNLOADS_PER_PATIENT) {
      const slice = discoveredAttachments.slice(i, i + MAX_CONCURRENT_DOWNLOADS_PER_PATIENT);
      const slicePromises = slice.map(async (att) => {
        try {
          const download = await attachmentDownloader(att.downloadUrl);
          return { ...att, success: true, ...download };
        } catch (err) {
          return { ...att, success: false, error: err.message || String(err) };
        }
      });
      const sliceResults = await Promise.all(slicePromises);
      downloadResults.push(...sliceResults);
    }

    // Embed each downloaded attachment in deterministic order
    const pagesToAppendFromPdfs = [];
    const imagesToEmbed = [];

    for (const item of downloadResults) {
      if (!item.success) {
        const is404 = item.error.includes("404") || item.error.includes("not found");
        if (is404) {
          attachmentStats.unavailable++;
        } else {
          attachmentStats.failed++;
        }
        attachmentStats.errors.push({
          patientId: patient._id.toString(),
          patientName: sanitizeText(patient.personal?.name, "Patient"),
          label: item.label,
          section: item.section,
          sanitizedUrl: sanitizeUrlForLogging(item.originalUrl),
          reason: item.error,
        });

        canvas.drawNotesBlock(
          `Unavailable: ${item.label}`,
          `Storage Error: ${item.error}. (Reference URL logged securely in manifest).`,
          true
        );
        continue;
      }

      // Check format
      if (item.format === "pdf") {
        try {
          const srcPdfDoc = await PDFDocument.load(item.buffer, { ignoreEncryption: true });
          const indices = srcPdfDoc.getPageIndices();
          if (indices.length === 0) {
            attachmentStats.unsupported++;
            canvas.drawNotesBlock(item.label, "Document has 0 pages (empty PDF).", true);
            continue;
          }

          const srcPages = srcPdfDoc.getPages();
          const nativeIndices = [];
          let collagedPageCount = 0;

          for (let pIdx = 0; pIdx < indices.length; pIdx++) {
            const pageSpec = inspectUploadedPdfPageForCollage(srcPdfDoc, srcPages[pIdx], item.section);
            if (pageSpec.asCollage) {
              const pageLabel = indices.length > 1 ? `${item.label} (p.${pIdx + 1})` : item.label;
              imagesToEmbed.push({
                ...pageSpec,
                label: pageLabel,
                section: item.section,
                originalUrl: item.originalUrl,
              });
              collagedPageCount++;
            } else {
              nativeIndices.push(indices[pIdx]);
            }
          }

          if (nativeIndices.length > 0) {
            const copiedPages = await pdfDoc.copyPages(srcPdfDoc, nativeIndices);
            pagesToAppendFromPdfs.push({
              label: item.label,
              section: item.section,
              pages: copiedPages,
              count: nativeIndices.length,
            });
            attachmentStats.embeddedPdfPages += nativeIndices.length;
          }

          if (collagedPageCount > 0 && nativeIndices.length === 0) {
            canvas.drawNotesBlock(
              item.label,
              `Grouped ${collagedPageCount} photo-PDF page(s) into ${item.section} collage grid.`
            );
          } else if (collagedPageCount > 0 && nativeIndices.length > 0) {
            canvas.drawNotesBlock(
              item.label,
              `Grouped ${collagedPageCount} photo-PDF page(s) into ${item.section} collage and attached ${nativeIndices.length} native document page(s).`
            );
          } else {
            canvas.drawNotesBlock(
              item.label,
              `Successfully embedded uploaded PDF document (${nativeIndices.length} page(s) attached).`
            );
          }
        } catch (pdfErr) {
          attachmentStats.failed++;
          attachmentStats.errors.push({
            patientId: patient._id.toString(),
            patientName: sanitizeText(patient.personal?.name, "Patient"),
            label: item.label,
            section: item.section,
            sanitizedUrl: sanitizeUrlForLogging(item.originalUrl),
            reason: `PDF load failure: ${pdfErr.message}`,
          });
          canvas.drawNotesBlock(
            `Corrupted Document: ${item.label}`,
            `Could not parse uploaded PDF bytes: ${pdfErr.message}`,
            true
          );
        }
      } else if (item.format === "jpeg" || item.format === "png") {
        imagesToEmbed.push({
          buffer: item.buffer,
          format: item.format,
          label: item.label,
          section: item.section,
          originalUrl: item.originalUrl,
        });
      } else if (item.format === "webp" || item.format === "gif") {
        if (sharp) {
          try {
            const convertedJpeg = await sharp(item.buffer).jpeg({ quality: 85 }).toBuffer();
            imagesToEmbed.push({
              buffer: convertedJpeg,
              format: "jpeg",
              label: item.label,
              section: item.section,
              originalUrl: item.originalUrl,
            });
          } catch (convErr) {
            attachmentStats.failed++;
            attachmentStats.errors.push({
              patientId: patient._id.toString(),
              patientName: sanitizeText(patient.personal?.name, "Patient"),
              label: item.label,
              section: item.section,
              sanitizedUrl: sanitizeUrlForLogging(item.originalUrl),
              reason: `Image conversion error: ${convErr.message}`,
            });
            canvas.drawNotesBlock(
              `Conversion Failed: ${item.label}`,
              `Could not convert ${item.format.toUpperCase()} to JPEG: ${convErr.message}`,
              true
            );
          }
        } else {
          attachmentStats.unsupported++;
          canvas.drawNotesBlock(
            `Unsupported Format: ${item.label}`,
            `${item.format.toUpperCase()} format requires sharp library for rendering.`,
            true
          );
        }
      } else {
        attachmentStats.unsupported++;
        attachmentStats.errors.push({
          patientId: patient._id.toString(),
          patientName: sanitizeText(patient.personal?.name, "Patient"),
          label: item.label,
          section: item.section,
          sanitizedUrl: sanitizeUrlForLogging(item.originalUrl),
          reason: `Unrecognized file signature: ${item.format}`,
        });
        canvas.drawNotesBlock(
          `Unrecognized Format: ${item.label}`,
          "File contents do not match supported clinical document formats (PDF, JPEG, PNG, WebP).",
          true
        );
      }
    }

    // Render clinical images in responsive collage grid
    if (imagesToEmbed.length > 0) {
      const embedFailures = [];
      const embeddedCount = await canvas.renderImageCollage(imagesToEmbed, null, embedFailures);
      attachmentStats.embeddedImages += embeddedCount;
      if (embeddedCount < imagesToEmbed.length) {
        attachmentStats.failed += (imagesToEmbed.length - embeddedCount);
        for (const fail of embedFailures) {
          attachmentStats.errors.push({
            patientId: patient._id.toString(),
            patientName: sanitizeText(patient.personal?.name, "Patient"),
            label: fail.label,
            section: fail.section,
            sanitizedUrl: sanitizeUrlForLogging(fail.originalUrl || ""),
            reason: fail.reason,
          });
          canvas.drawNotesBlock(
            `Image Embed Failed: ${fail.label}`,
            `${fail.reason}. (Reference URL logged securely in manifest).`,
            true
          );
        }
      }
    }

    // Now append any copied PDF pages to the document
    for (const pdfItem of pagesToAppendFromPdfs) {
      for (const page of pdfItem.pages) {
        pdfDoc.addPage(page);
      }
    }
  }

  // Finalize page numbering and headers
  canvas.finalize(patient);

  const finalPdfBytes = await pdfDoc.save();
  return {
    pdfBytes: finalPdfBytes,
    pageCount: pdfDoc.getPageCount(),
    attachmentStats,
  };
}

// ---------------------------------------------------------------------------
// Main Bulk Export Orchestrator
// ---------------------------------------------------------------------------

/**
 * Executes a MongoDB operation with automatic exponential backoff retries
 * to protect bulk runs against transient Atlas DNS/network disruptions (e.g. EAI_AGAIN, socket timeouts).
 */
async function withDbRetry(fn, maxRetries = 12, baseDelayMs = 5000) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const isTransient =
        err.name === "MongoServerSelectionError" ||
        err.name === "MongoNetworkError" ||
        err.name === "MongoNetworkTimeoutError" ||
        (err.message &&
          (err.message.includes("EAI_AGAIN") ||
            err.message.includes("ECONNRESET") ||
            err.message.includes("ETIMEDOUT") ||
            err.message.includes("getaddrinfo")));

      if (attempt >= maxRetries || !isTransient) {
        throw err;
      }
      const delay = baseDelayMs * attempt;
      console.warn(`\n[DB RETRY] Transient MongoDB network error (${err.message}). Retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries})...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function main() {
  const startTime = Date.now();
  console.log("==================================================================");
  console.log("    RyanCRM Patient Bulk PDF Export System - Attachment V2       ");
  console.log("==================================================================");
  console.log(`Execution Mode       : ${IS_DRY_RUN ? "DRY RUN (Inspection Only)" : "LIVE EXPORT"}`);
  console.log(`Output Directory     : ${EXPORT_DIR}`);
  console.log(`Resume Mode          : ${IS_RESUME ? "YES (Only process pending/v1 exports)" : "NO"}`);
  console.log(`Reprocess All        : ${REPROCESS_ALL ? "YES (Regenerate all PDFs with attachments)" : "NO"}`);
  console.log(`Retry Failed Mode    : ${IS_RETRY_FAILED ? "YES" : "NO"}`);
  if (LIMIT_ARG) console.log(`Patient Limit        : First ${LIMIT_ARG} records`);
  if (PATIENT_ID_ARG) console.log(`Single Target ID     : ${PATIENT_ID_ARG}`);
  console.log("------------------------------------------------------------------");

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("CRITICAL ERROR: MONGODB_URI environment variable is missing.");
    process.exit(1);
  }

  console.log("Connecting to RyanCRM MongoDB database...");
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
  });
  console.log("Connected successfully to MongoDB.");

  const db = mongoose.connection.db;
  const patientsColl = db.collection("patients");
  const txnsColl = db.collection("transactions");
  const collabColl = db.collection("collabcases");
  const payablesColl = db.collection("payables");
  const receivablesColl = db.collection("receivables");
  const auditsColl = db.collection("audits");
  const employeesColl = db.collection("employees");
  const stocksColl = db.collection("stocks");

  const initialTotalPatients = await patientsColl.countDocuments();
  console.log(`Database Total Patient Count: ${initialTotalPatients}`);

  if (initialTotalPatients === 0) {
    console.warn("No patient documents found. Exiting.");
    await mongoose.disconnect();
    return;
  }

  // Pre-load reference maps
  console.log("Pre-loading employee directory and medicine stock index...");
  const [employees, stocks] = await Promise.all([
    employeesColl.find({}, { projection: { name: 1, role: 1, branch: 1 } }).toArray(),
    stocksColl.find({}, { projection: { name: 1, category: 1 } }).toArray(),
  ]);

  const employeeMap = new Map();
  for (const emp of employees) {
    employeeMap.set(emp._id.toString(), emp.name || "Employee");
  }

  const stockMap = new Map();
  for (const stk of stocks) {
    stockMap.set(stk._id.toString(), stk.name || "Stock Item");
  }
  console.log(`Loaded ${employeeMap.size} employee references and ${stockMap.size} stock items.`);

  // Load logo bytes if requested
  let logoImageBytes = null;
  if (EMBED_LOGO) {
    const logoPath = path.join(ROOT_DIR, "public", "logo.png");
    if (fs.existsSync(logoPath)) {
      try {
        logoImageBytes = await fsp.readFile(logoPath);
        console.log("Loaded official clinic branding logo from public/logo.png");
      } catch (err) {
        console.warn(`Could not read logo: ${err.message}`);
      }
    }
  }

  // Compute attachment counts across database for dry run or reporting
  const attachmentAggregation = await patientsColl.aggregate([
    {
      $project: {
        imgCount: { $size: { $ifNull: ["$documents.images", []] } },
        consentCount: { $size: { $ifNull: ["$documents.consentForm", []] } },
        surgeryCount: { $size: { $ifNull: ["$documents.suregeryForm", []] } },
        consultCount: { $size: { $ifNull: ["$documents.consultForm", []] } },
      },
    },
    {
      $group: {
        _id: null,
        patientsWithImages: { $sum: { $cond: [{ $gt: ["$imgCount", 0] }, 1, 0] } },
        patientsWithConsent: { $sum: { $cond: [{ $gt: ["$consentCount", 0] }, 1, 0] } },
        patientsWithSurgery: { $sum: { $cond: [{ $gt: ["$surgeryCount", 0] }, 1, 0] } },
        patientsWithConsult: { $sum: { $cond: [{ $gt: ["$consultCount", 0] }, 1, 0] } },
        totalImages: { $sum: "$imgCount" },
        totalConsent: { $sum: "$consentCount" },
        totalSurgery: { $sum: "$surgeryCount" },
        totalConsult: { $sum: "$consultCount" },
        patientsWithAny: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $gt: ["$imgCount", 0] },
                  { $gt: ["$consentCount", 0] },
                  { $gt: ["$surgeryCount", 0] },
                  { $gt: ["$consultCount", 0] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]).toArray();

  const attachSummary = attachmentAggregation[0] || {
    patientsWithAny: 0,
    totalImages: 0,
    totalConsent: 0,
    totalSurgery: 0,
    totalConsult: 0,
  };

  const grandTotalFiles = (attachSummary.totalImages || 0) +
    (attachSummary.totalConsent || 0) +
    (attachSummary.totalSurgery || 0) +
    (attachSummary.totalConsult || 0);

  console.log("------------------------------------------------------------------");
  console.log("ATTACHMENT AUDIT ACROSS FULL DATABASE:");
  console.log(`- Patients with Any Attachment       : ${attachSummary.patientsWithAny} of ${initialTotalPatients}`);
  console.log(`- Patients without Attachments       : ${initialTotalPatients - attachSummary.patientsWithAny}`);
  console.log(`- Total Clinical Images on File      : ${attachSummary.totalImages}`);
  console.log(`- Total Signed Consent Forms         : ${attachSummary.totalConsent}`);
  console.log(`- Total Surgery Clearance Forms      : ${attachSummary.totalSurgery}`);
  console.log(`- Total Consultation Record Forms    : ${attachSummary.totalConsult}`);
  console.log(`- Grand Total Attachment Files       : ${grandTotalFiles}`);
  console.log("------------------------------------------------------------------");

  if (IS_DRY_RUN) {
    console.log("DRY RUN COMPLETE: Database and attachments verified. No files written.");
    await mongoose.disconnect();
    return;
  }

  // Ensure export directory exists
  await fsp.mkdir(PDFS_DIR, { recursive: true });

  const manifestJsonPath = path.join(EXPORT_DIR, "manifest.json");
  const manifestCsvPath = path.join(EXPORT_DIR, "manifest.csv");
  const summaryJsonPath = path.join(EXPORT_DIR, "export-summary.json");
  const errorsJsonPath = path.join(EXPORT_DIR, "errors.json");
  const attachErrorsJsonPath = path.join(EXPORT_DIR, "attachment-errors.json");

  // Load existing manifest if resuming
  let existingManifest = {};
  if (fs.existsSync(manifestJsonPath)) {
    try {
      const raw = await fsp.readFile(manifestJsonPath, "utf8");
      existingManifest = JSON.parse(raw);
      console.log(`Found existing manifest with ${Object.keys(existingManifest.records || {}).length} records.`);
    } catch {
      existingManifest = {};
    }
  }

  const recordsMap = existingManifest.records || {};
  const errorList = [];
  const allAttachmentErrors = [];

  // Query filter
  const query = {};
  if (PATIENT_ID_ARG) {
    try {
      query._id = new mongoose.Types.ObjectId(PATIENT_ID_ARG);
    } catch {
      console.error(`Invalid ObjectId: ${PATIENT_ID_ARG}`);
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  let totalTarget = LIMIT_ARG ? Math.min(LIMIT_ARG, initialTotalPatients) : initialTotalPatients;
  if (PATIENT_ID_ARG) totalTarget = 1;

  console.log(`Processing ${totalTarget} patient dossier(s) in batches of ${BATCH_SIZE}...`);
  console.log("------------------------------------------------------------------");

  let processedCount = 0;
  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // Global attachment counters
  let totalDiscoveredAcrossRun = 0;
  let totalImagesEmbeddedAcrossRun = 0;
  let totalPdfPagesEmbeddedAcrossRun = 0;
  let totalUnavailableAcrossRun = 0;
  let totalUnsupportedAcrossRun = 0;
  let totalAttachFailedAcrossRun = 0;

  let batch = [];

  async function processBatch(currentBatch) {
    if (currentBatch.length === 0) return;

    const patientIds = currentBatch.map((p) => p._id);

    // Batch query linked collections
    const embeddedTxnIds = [];
    for (const p of currentBatch) {
      if (Array.isArray(p.payments?.transactions)) {
        for (const tId of p.payments.transactions) {
          if (tId) embeddedTxnIds.push(tId);
        }
      }
    }

    const txnQuery = embeddedTxnIds.length > 0
      ? { $or: [{ patient: { $in: patientIds } }, { _id: { $in: embeddedTxnIds } }] }
      : { patient: { $in: patientIds } };

    const [batchTxns, batchCollabs, batchPayables, batchReceivables, batchAudits] = await withDbRetry(() =>
      Promise.all([
        txnsColl.find(txnQuery).sort({ date: 1, createdAt: 1 }).toArray(),
        collabColl.find({ patient: { $in: patientIds } }).toArray(),
        payablesColl.find({ relatedPatient: { $in: patientIds } }).toArray(),
        receivablesColl.find({ relatedPatient: { $in: patientIds } }).toArray(),
        auditsColl.find({ patient: { $in: patientIds } }).toArray(),
      ])
    );

    const txnsByPatient = new Map();
    for (const tx of batchTxns) {
      const pKey = tx.patient ? tx.patient.toString() : null;
      if (pKey) {
        if (!txnsByPatient.has(pKey)) txnsByPatient.set(pKey, []);
        txnsByPatient.get(pKey).push(tx);
      }
    }
    const txnById = new Map(batchTxns.map((t) => [t._id.toString(), t]));
    for (const p of currentBatch) {
      const pKey = p._id.toString();
      if (!txnsByPatient.has(pKey)) txnsByPatient.set(pKey, []);
      const existingIds = new Set(txnsByPatient.get(pKey).map((t) => t._id.toString()));
      if (Array.isArray(p.payments?.transactions)) {
        for (const refId of p.payments.transactions) {
          const rStr = refId.toString();
          if (!existingIds.has(rStr) && txnById.has(rStr)) {
            txnsByPatient.get(pKey).push(txnById.get(rStr));
            existingIds.add(rStr);
          }
        }
      }
    }

    const collabsByPatient = new Map();
    for (const c of batchCollabs) {
      const pKey = c.patient ? c.patient.toString() : null;
      if (pKey) {
        if (!collabsByPatient.has(pKey)) collabsByPatient.set(pKey, []);
        collabsByPatient.get(pKey).push(c);
      }
    }

    const payablesByPatient = new Map();
    for (const pb of batchPayables) {
      const pKey = pb.relatedPatient ? pb.relatedPatient.toString() : null;
      if (pKey) {
        if (!payablesByPatient.has(pKey)) payablesByPatient.set(pKey, []);
        payablesByPatient.get(pKey).push(pb);
      }
    }

    const receivablesByPatient = new Map();
    for (const rc of batchReceivables) {
      const pKey = rc.relatedPatient ? rc.relatedPatient.toString() : null;
      if (pKey) {
        if (!receivablesByPatient.has(pKey)) receivablesByPatient.set(pKey, []);
        receivablesByPatient.get(pKey).push(rc);
      }
    }

    const auditsByPatient = new Map();
    for (const au of batchAudits) {
      const pKey = au.patient ? au.patient.toString() : null;
      if (pKey) {
        if (!auditsByPatient.has(pKey)) auditsByPatient.set(pKey, []);
        auditsByPatient.get(pKey).push(au);
      }
    }

    // Process each patient
    for (const patient of currentBatch) {
      const pId = patient._id.toString();
      const pName = patient.personal?.name || "Patient";
      const filename = sanitizeFilename(pName, pId);
      const filePath = path.join(PDFS_DIR, filename);
      const tempFilePath = path.join(PDFS_DIR, `${filename}.tmp`);
      const relPath = path.join("PDFs", filename);

      // Check if resume applies (must be exportVersion: 2 to skip)
      if (IS_RESUME && !REPROCESS_ALL && !IS_RETRY_FAILED) {
        const existing = recordsMap[pId];
        if (
          existing &&
          existing.exportStatus === "SUCCESS" &&
          existing.exportVersion === EXPORT_VERSION &&
          fs.existsSync(filePath)
        ) {
          const stats = fs.statSync(filePath);
          if (stats.size > 0) {
            skippedCount++;
            processedCount++;
            continue;
          }
        }
      }

      if (IS_RETRY_FAILED) {
        const existing = recordsMap[pId];
        if (existing && existing.exportStatus === "SUCCESS" && fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.size > 0) {
            skippedCount++;
            processedCount++;
            continue;
          }
        }
      }

      try {
        const { pdfBytes, pageCount, attachmentStats } = await generatePatientPDF({
          patient,
          employeeMap,
          stockMap,
          linkedTransactions: txnsByPatient.get(pId) || [],
          linkedCollabCases: collabsByPatient.get(pId) || [],
          linkedPayables: payablesByPatient.get(pId) || [],
          linkedReceivables: receivablesByPatient.get(pId) || [],
          linkedAudits: auditsByPatient.get(pId) || [],
          logoImageBytes,
        });

        // Write atomically using temporary file
        await fsp.writeFile(tempFilePath, pdfBytes);
        await fsp.rename(tempFilePath, filePath);

        const stat = await fsp.stat(filePath);
        if (stat.size === 0) {
          throw new Error("Generated PDF file is 0 bytes");
        }

        // Aggregate attachment statistics
        totalDiscoveredAcrossRun += attachmentStats.discovered;
        totalImagesEmbeddedAcrossRun += attachmentStats.embeddedImages;
        totalPdfPagesEmbeddedAcrossRun += attachmentStats.embeddedPdfPages;
        totalUnavailableAcrossRun += attachmentStats.unavailable;
        totalUnsupportedAcrossRun += attachmentStats.unsupported;
        totalAttachFailedAcrossRun += attachmentStats.failed;

        if (attachmentStats.errors.length > 0) {
          allAttachmentErrors.push(...attachmentStats.errors);
        }

        let attachStatus = "NO_ATTACHMENTS";
        if (attachmentStats.discovered > 0) {
          const embeddedCount = attachmentStats.embeddedImages + (attachmentStats.embeddedPdfPages > 0 ? 1 : 0);
          if (attachmentStats.unavailable === 0 && attachmentStats.failed === 0 && attachmentStats.unsupported === 0) {
            attachStatus = "ALL_EMBEDDED";
          } else if (embeddedCount > 0) {
            attachStatus = "PARTIAL_EMBEDDED";
          } else {
            attachStatus = "ALL_FAILED";
          }
        }

        recordsMap[pId] = {
          patientId: pId,
          patientName: sanitizeText(pName, "Patient"),
          phone: sanitizeText(patient.personal?.phone, "N/A"),
          branch: sanitizeText(patient.personal?.branch, "All"),
          status: patient.ops?.status || "NEW",
          filename: relPath,
          fileSizeBytes: stat.size,
          pageCount,
          exportStatus: "SUCCESS",
          exportVersion: EXPORT_VERSION,
          attachmentsDiscovered: attachmentStats.discovered,
          embeddedImages: attachmentStats.embeddedImages,
          embeddedPdfPages: attachmentStats.embeddedPdfPages,
          attachmentsUnavailable: attachmentStats.unavailable,
          attachmentsUnsupported: attachmentStats.unsupported,
          attachmentsFailed: attachmentStats.failed,
          attachmentStatus: attachStatus,
          exportedAt: new Date().toISOString(),
          error: null,
        };

        successCount++;
      } catch (err) {
        failedCount++;
        const errMsg = err.message || String(err);
        try {
          if (fs.existsSync(tempFilePath)) await fsp.unlink(tempFilePath);
        } catch {}

        errorList.push({
          patientId: pId,
          patientName: pName,
          error: errMsg,
          timestamp: new Date().toISOString(),
        });

        recordsMap[pId] = {
          patientId: pId,
          patientName: sanitizeText(pName, "Patient"),
          phone: sanitizeText(patient.personal?.phone, "N/A"),
          branch: sanitizeText(patient.personal?.branch, "All"),
          status: patient.ops?.status || "NEW",
          filename: relPath,
          fileSizeBytes: 0,
          pageCount: 0,
          exportStatus: "FAILED",
          exportVersion: EXPORT_VERSION,
          attachmentsDiscovered: 0,
          embeddedImages: 0,
          embeddedPdfPages: 0,
          attachmentsUnavailable: 0,
          attachmentsUnsupported: 0,
          attachmentsFailed: 0,
          attachmentStatus: "FAILED",
          exportedAt: new Date().toISOString(),
          error: errMsg,
        };

        console.error(`FAILED: Patient ID ${pId} (${pName}) - ${errMsg}`);
      }

      processedCount++;
      if (processedCount % 10 === 0 || processedCount === totalTarget) {
        const pct = ((processedCount / totalTarget) * 100).toFixed(1);
        process.stdout.write(
          `\rProgress: [${processedCount}/${totalTarget}] (${pct}%) | Success: ${successCount} | Skipped: ${skippedCount} | Failed: ${failedCount} `
        );
      }
    }
  }

  // Keyset pagination: robust against cursor timeouts and large collections
  let lastSeenId = null;
  while (true) {
    const batchQuery = { ...query };
    if (lastSeenId) {
      batchQuery._id = { $gt: lastSeenId };
    }
    const currentBatch = await withDbRetry(() =>
      patientsColl
        .find(batchQuery)
        .sort({ _id: 1 })
        .limit(BATCH_SIZE)
        .toArray()
    );

    if (currentBatch.length === 0) break;

    await processBatch(currentBatch);
    lastSeenId = currentBatch[currentBatch.length - 1]._id;

    // Save interim manifest every 100 items for robust resumability
    if (processedCount % 100 === 0) {
      await fsp.writeFile(
        manifestJsonPath,
        JSON.stringify({ targetCount: totalTarget, records: recordsMap }, null, 2)
      );
    }

    if ((LIMIT_ARG && processedCount >= LIMIT_ARG) || PATIENT_ID_ARG) break;
  }

  console.log("\n------------------------------------------------------------------");
  console.log("Writing final manifest and audit reports...");

  // 1. Write manifest.json
  const manifestData = {
    exportCompletedAt: new Date().toISOString(),
    exportVersion: EXPORT_VERSION,
    databasePatientCount: initialTotalPatients,
    processedTargetCount: totalTarget,
    successfulCount: successCount,
    failedCount,
    skippedCount,
    attachmentSummary: {
      totalDiscovered: totalDiscoveredAcrossRun,
      totalImagesEmbedded: totalImagesEmbeddedAcrossRun,
      totalPdfPagesEmbedded: totalPdfPagesEmbeddedAcrossRun,
      totalUnavailable: totalUnavailableAcrossRun,
      totalUnsupported: totalUnsupportedAcrossRun,
      totalFailed: totalAttachFailedAcrossRun,
    },
    records: recordsMap,
  };
  await fsp.writeFile(manifestJsonPath, JSON.stringify(manifestData, null, 2));

  // 2. Write manifest.csv
  const csvHeaders = [
    "Patient ID",
    "Patient Name",
    "Phone",
    "Branch",
    "Status",
    "Filename",
    "File Size (Bytes)",
    "Page Count",
    "Export Status",
    "Attachments Discovered",
    "Embedded Images",
    "Embedded PDF Pages",
    "Unavailable Files",
    "Unsupported Files",
    "Failed Files",
    "Attachment Status",
    "Exported At",
    "Error",
  ];

  const csvLines = [csvHeaders.join(",")];
  for (const r of Object.values(recordsMap)) {
    const row = [
      `"${r.patientId}"`,
      `"${(r.patientName || "").replace(/"/g, '""')}"`,
      `"${(r.phone || "").replace(/"/g, '""')}"`,
      `"${(r.branch || "").replace(/"/g, '""')}"`,
      `"${r.status || ""}"`,
      `"${(r.filename || "").replace(/\\/g, "/")}"`,
      r.fileSizeBytes || 0,
      r.pageCount || 0,
      `"${r.exportStatus}"`,
      r.attachmentsDiscovered || 0,
      r.embeddedImages || 0,
      r.embeddedPdfPages || 0,
      r.attachmentsUnavailable || 0,
      r.attachmentsUnsupported || 0,
      r.attachmentsFailed || 0,
      `"${r.attachmentStatus || "NO_ATTACHMENTS"}"`,
      `"${r.exportedAt || ""}"`,
      `"${(r.error || "").replace(/"/g, '""')}"`,
    ];
    csvLines.push(row.join(","));
  }
  await fsp.writeFile(manifestCsvPath, csvLines.join("\n"));

  // 3. Write errors.json
  await fsp.writeFile(errorsJsonPath, JSON.stringify(errorList, null, 2));

  // 4. Write attachment-errors.json
  await fsp.writeFile(attachErrorsJsonPath, JSON.stringify(allAttachmentErrors, null, 2));

  // 5. Filesystem integrity check
  console.log("Conducting final filesystem integrity verification...");
  let verifiedFilesCount = 0;
  let emptyFilesCount = 0;

  for (const r of Object.values(recordsMap)) {
    if (r.exportStatus === "SUCCESS") {
      const fullPath = path.join(EXPORT_DIR, r.filename);
      if (fs.existsSync(fullPath)) {
        const s = fs.statSync(fullPath);
        if (s.size > 0) {
          verifiedFilesCount++;
        } else {
          emptyFilesCount++;
        }
      }
    }
  }

  // Attachment status counts across all records in manifest
  let countNoAttach = 0;
  let countAllEmbedded = 0;
  let countPartialEmbedded = 0;
  let countAllFailed = 0;

  for (const r of Object.values(recordsMap)) {
    if (r.attachmentStatus === "NO_ATTACHMENTS") countNoAttach++;
    else if (r.attachmentStatus === "ALL_EMBEDDED") countAllEmbedded++;
    else if (r.attachmentStatus === "PARTIAL_EMBEDDED") countPartialEmbedded++;
    else if (r.attachmentStatus === "ALL_FAILED") countAllFailed++;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = {
    exportVersion: EXPORT_VERSION,
    databasePatientCount: initialTotalPatients,
    processedScopeCount: totalTarget,
    successfulExports: successCount,
    skippedVerifiedExports: skippedCount,
    failedExports: failedCount,
    verifiedFilesOnDisk: verifiedFilesCount,
    emptyFilesDetected: emptyFilesCount,
    attachmentSummary: {
      totalPatientsWithAttachments: initialTotalPatients - countNoAttach,
      totalPatientsWithoutAttachments: countNoAttach,
      patientsAllAttachmentsEmbedded: countAllEmbedded,
      patientsPartialAttachmentsEmbedded: countPartialEmbedded,
      patientsAllAttachmentsFailed: countAllFailed,
      totalAttachmentsDiscovered: totalDiscoveredAcrossRun,
      totalImagesEmbedded: totalImagesEmbeddedAcrossRun,
      totalPdfPagesEmbedded: totalPdfPagesEmbeddedAcrossRun,
      totalUnavailable: totalUnavailableAcrossRun,
      totalUnsupported: totalUnsupportedAcrossRun,
      totalFailed: totalAttachFailedAcrossRun,
    },
    durationSeconds: parseFloat(durationSec),
    manifestJson: manifestJsonPath,
    manifestCsv: manifestCsvPath,
    attachmentErrorsJson: attachErrorsJsonPath,
    errorsJson: errorsJsonPath,
    summaryJson: summaryJsonPath,
    pdfsDirectory: PDFS_DIR,
  };

  await fsp.writeFile(summaryJsonPath, JSON.stringify(summary, null, 2));

  // Console Summary
  console.log("==================================================================");
  console.log("             FINAL ATTACHMENT EXPORT SUMMARY                      ");
  console.log("==================================================================");
  console.log(`Database Total Patients       : ${initialTotalPatients}`);
  console.log(`Export Scope Targeted         : ${totalTarget}`);
  console.log(`Successfully Generated        : ${successCount}`);
  console.log(`Skipped (Verified Up-to-date) : ${skippedCount}`);
  console.log(`Failed Patient Records        : ${failedCount}`);
  console.log(`Verified Non-Empty PDFs       : ${verifiedFilesCount}`);
  console.log(`Execution Time                : ${durationSec} seconds`);
  console.log("------------------------------------------------------------------");
  console.log("ATTACHMENT OUTCOMES:");
  console.log(`- Patients without Attachments  : ${countNoAttach}`);
  console.log(`- Patients with Attachments     : ${countAllEmbedded + countPartialEmbedded + countAllFailed}`);
  console.log(`  * All Attachments Embedded    : ${countAllEmbedded}`);
  console.log(`  * Partially Embedded          : ${countPartialEmbedded}`);
  console.log(`  * Failed to Embed             : ${countAllFailed}`);
  console.log(`- Total Files Discovered        : ${totalDiscoveredAcrossRun}`);
  console.log(`- Clinical Images Embedded      : ${totalImagesEmbeddedAcrossRun}`);
  console.log(`- PDF Pages Merged              : ${totalPdfPagesEmbeddedAcrossRun}`);
  console.log(`- Storage 404 (Unavailable)     : ${totalUnavailableAcrossRun}`);
  console.log(`- Unsupported Formats           : ${totalUnsupportedAcrossRun}`);
  console.log(`- Download/Parsing Failures     : ${totalAttachFailedAcrossRun}`);
  console.log("==================================================================");

  await mongoose.disconnect();
  console.log("Database connection closed. Export execution complete.");
}

export {
  PDFCanvas,
  generatePatientPDF,
  sanitizeText,
  formatDate,
  formatCurrency,
  normalizeCloudinaryDownloadUrl,
  resolvePatientAttachments,
  detectFileSignature,
  downloadAttachmentBytes,
};

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectExecution) {
  main().catch(async (err) => {
    console.error("CRITICAL RUNTIME ERROR:", err);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
}
