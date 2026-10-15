import { after } from "next/server";

const TIMEOUT_MS = 8000;

/**
 * Formats date/time into India Standard Time (IST) strings.
 */
export const fmtISTDateTime = (v) =>
  v ? new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "";

export const fmtISTDay = (v) =>
  v ? new Date(v).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "";

/**
 * Maps a Lead mongoose document / plain object to the Google Sheets row shape.
 * Reusable by both real-time ingestion and historical backfill scripts.
 */
export function formatGoogleLeadRow(doc) {
  if (!doc) return null;
  return {
    "Lead ID": String(doc._id || ""),
    "Received At (IST)": fmtISTDateTime(doc.createdAt || new Date()),
    "Name": doc.name || "",
    "Phone": doc.phone || "",
    "Email": doc.email || "-",
    "City / Location": doc.city || doc.location || "-",
    "Tag": doc.tag || "Google Leads",
    "Visit Date": fmtISTDay(doc.visitDate),
    "Visit Plan": doc.visitPlan || "-",
    "Remarks": doc.remarks || "-",
  };
}

/**
 * Sends a single formatted row to the Google Apps Script Web App.
 * Enforces an 8-second timeout, validates the response body, and never exposes PII in logs.
 */
export async function sendLeadRow(row) {
  const url = process.env.GOOGLE_LEADS_SHEET_WEBHOOK_URL;
  if (!url) {
    console.warn("[googleLeadsWebhook] GOOGLE_LEADS_SHEET_WEBHOOK_URL is not set — skipped.");
    return { success: false, reason: "URL_NOT_CONFIGURED" };
  }

  const leadId = row?.["Lead ID"] || "UNKNOWN";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const payload = {
      row,
      secret: process.env.GOOGLE_LEADS_SHEET_WEBHOOK_SECRET || "",
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(
        `[googleLeadsWebhook] HTTP error status=${res.status} for leadId=${leadId}`
      );
      return { success: false, status: res.status, leadId };
    }

    const text = await res.text().catch(() => "");
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Body may be HTML if Google redirects to a login or permission error page
    }

    if (!parsed || parsed.success !== true) {
      const isHtml = typeof text === "string" && text.trim().startsWith("<");
      const failureReason = isHtml
        ? "Received HTML response (possible Google login redirect or permission error)"
        : (parsed?.error || "Invalid response format from Apps Script");

      console.error(
        `[googleLeadsWebhook] Webhook reported failure for leadId=${leadId}: ${failureReason}`
      );
      return { success: false, error: failureReason, leadId };
    }

    return { success: true, leadId };
  } catch (err) {
    const isTimeout = err.name === "AbortError";
    console.error(
      `[googleLeadsWebhook] Webhook dispatch failed for leadId=${leadId}: ${
        isTimeout ? `Timeout after ${TIMEOUT_MS}ms` : err.message
      }`
    );
    return { success: false, error: err.message, leadId };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fires the Google Leads webhook asynchronously using Next.js after().
 * Fails safely and completely isolates errors from the main request cycle.
 */
export function fireGoogleLeadsSheetWebhook(doc) {
  if (!doc || doc.tag !== "Google Leads") return;

  const task = async () => {
    try {
      const row = formatGoogleLeadRow(doc);
      if (row) {
        await sendLeadRow(row);
      }
    } catch (err) {
      console.error(
        `[googleLeadsWebhook] Background task error for leadId=${doc?._id}:`,
        err.message
      );
    }
  };

  try {
    after(task);
  } catch {
    // Fallback if called outside a Next.js server request context
    task().catch((err) => {
      console.error(
        `[googleLeadsWebhook] Fallback unhandled error for leadId=${doc?._id}:`,
        err.message
      );
    });
  }
}
