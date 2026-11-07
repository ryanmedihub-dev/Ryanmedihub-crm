import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Leads from "@/models/Leads";
import { cacheInvalidate } from "@/lib/cache";
import { fireGoogleLeadsSheetWebhook } from "@/lib/googleLeadsSheetWebhook";

// ---------------------------------------------------------------------------
// Rate Limiter (In-Memory Sliding Window, fails open safely)
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // 30 requests per minute per IP
const ipRequestCounts = new Map();

function isRateLimited(ip) {
  if (!ip || ip === "unknown") return false;
  const now = Date.now();
  const timestamps = ipRequestCounts.get(ip) || [];
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    ipRequestCounts.set(ip, validTimestamps);
    return true;
  }

  validTimestamps.push(now);
  ipRequestCounts.set(ip, validTimestamps);

  // Periodically clean stale entries to prevent memory growth
  if (ipRequestCounts.size > 2000) {
    for (const [key, times] of ipRequestCounts.entries()) {
      const active = times.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (active.length === 0) {
        ipRequestCounts.delete(key);
      } else {
        ipRequestCounts.set(key, active);
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// CORS Support with Explicit Domain Allowlist
// ---------------------------------------------------------------------------
function isAllowedOrigin(origin) {
  if (!origin) return false;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "https:" && protocol !== "http:") return false;

    // Local development origins
    if (
      process.env.NODE_ENV !== "production" &&
      (hostname === "localhost" || hostname === "127.0.0.1")
    ) {
      return true;
    }

    // Explicit production marketing domains and all legitimate subdomains
    if (
      hostname === "ryanmedihub.com" ||
      hostname.endsWith(".ryanmedihub.com") ||
      hostname === "ryanclinic.com" ||
      hostname.endsWith(".ryanclinic.com")
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function withCORS(response, req) {
  const origin = req?.headers?.get("origin");
  if (origin && isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-api-key"
    );
    response.headers.set("Vary", "Origin");
  }
  return response;
}

export async function OPTIONS(req) {
  const res = new NextResponse(null, { status: 204 });
  return withCORS(res, req);
}

// ---------------------------------------------------------------------------
// Lead Creation Handler (Public Intake Endpoint)
// ---------------------------------------------------------------------------
const ALLOWED_TAGS = ["Google Leads", "Meta Leads", "Form Leads", "Collab Leads", ""];

const handler = async (req) => {
  // 1. Rate Limiting Check
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "unknown";

  if (isRateLimited(ip)) {
    return withCORS(
      NextResponse.json(
        { success: false, message: "Too many requests. Please try again later." },
        { status: 429 }
      ),
      req
    );
  }

  // 2. Parse & Validate Payload
  let body;
  try {
    body = await req.json();
  } catch {
    return withCORS(
      NextResponse.json(
        { success: false, message: "Invalid JSON payload" },
        { status: 400 }
      ),
      req
    );
  }

  const { name, phone, email, location, visitPlan, visitDate, remarks, tag } = body || {};

  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedPhone = typeof phone === "string" ? phone.trim() : "";

  if (!trimmedName || !trimmedPhone) {
    return withCORS(
      NextResponse.json(
        { success: false, message: "Name and phone are required" },
        { status: 400 }
      ),
      req
    );
  }

  if (trimmedName.length > 120) {
    return withCORS(
      NextResponse.json(
        { success: false, message: "Name exceeds maximum permitted length" },
        { status: 400 }
      ),
      req
    );
  }

  // Validate phone format: minimum 5 digits, maximum 30 chars
  const digitsOnly = trimmedPhone.replace(/\D/g, "");
  if (digitsOnly.length < 5 || trimmedPhone.length > 30) {
    return withCORS(
      NextResponse.json(
        { success: false, message: "Invalid phone number format" },
        { status: 400 }
      ),
      req
    );
  }

  // Sanitize tag against allowed enum list
  const sanitizedTag = ALLOWED_TAGS.includes(tag) ? tag : "Google Leads";

  // 3. Persist Lead to MongoDB
  const newLead = new Leads({
    name: trimmedName,
    phone: trimmedPhone,
    email: typeof email === "string" ? email.trim() : undefined,
    location: typeof location === "string" ? location.trim() : undefined,
    visitPlan: typeof visitPlan === "string" ? visitPlan.trim() : undefined,
    visitDate,
    remarks: typeof remarks === "string" ? remarks.trim().slice(0, 3000) : undefined,
    tag: sanitizedTag,
  });

  await newLead.save();

  // 4. Trigger External Sheets Sync (for Google Leads)
  if (newLead.tag === "Google Leads") {
    fireGoogleLeadsSheetWebhook(newLead);
  }

  // 5. Invalidate Dashboard Caches & Respond
  await cacheInvalidate("patients", "owner");

  return withCORS(
    NextResponse.json(
      { success: true, message: "Lead created successfully", lead: newLead },
      { status: 201 }
    ),
    req
  );
};

export const POST = withDB(handler);
