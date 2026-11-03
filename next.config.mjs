// Old /owner/* routes -> their new home in the v2 section tree (Owner Panel v2, F8).
// Kept as server redirects so bookmarks and shared links keep working.
const OWNER_V2_REDIRECTS = {
  "/owner/agent-360": "/owner/employees/agents",
  "/owner/staff-360": "/owner/employees/other-staff",
  "/owner/leadership": "/owner/employees/leadership",
  "/owner/live-workforce": "/owner/calls/live",
  "/owner/forecast": "/owner/calls/forecast",
  "/owner/sim-health": "/owner/calls/sim-health",
  "/owner/retry": "/owner/leads/retry",
  "/owner/leaks": "/owner/ai/attention",
  "/owner/leads/leaks": "/owner/ai/attention",
  // Owner recheck (2026-09): duplicate/placeholder HR pages fold into the real ones.
  "/owner/hr/statistics": "/owner/employees/hr",
  "/owner/hr/payroll": "/owner/finance/salary-incentive",
  // Part 3: the standalone search-a-patient tool is superseded by the All
  // page's ReportTable search box + click-through to /owner/patients/[id].
  "/owner/patient-journey": "/owner/patients/all",
  "/owner/patients/journey": "/owner/patients/all",
  "/owner/counsellor-conversion": "/owner/patients/counsellor-conversion",
  "/owner/surgery-planner": "/owner/patients/surgery-planner",
  "/owner/ad-spend": "/owner/marketing/ad-spend",
  "/owner/conversion": "/owner/statistics",
  "/owner/attendance": "/owner/ai/attendance",
  "/owner/ai-health": "/owner/ai/health",
  "/owner/clinical-ai-quality": "/owner/ai/clinical-quality",
  "/owner/payroll": "/owner/hr/payroll",
  // HR Action Center was dropped (no action-tracking system exists); both the
  // pre-v2 URL and the v2 stub URL land on the HR section landing.
  "/owner/hr-actions": "/owner/hr",
  "/owner/hr/actions": "/owner/hr",
  // The standalone Saniya assistant was replaced by the tool-calling Sanya at
  // /owner/ai/sanya (one implementation, aggregate-only, PII-guarded).
  "/saniya": "/owner/ai/sanya",
};

// ---------------------------------------------------------------------------
// Security Header Definitions
// ---------------------------------------------------------------------------
// Applied to every route via the `headers()` function below.
// These are defence-in-depth headers; they do NOT replace API-level auth guards.
//
// CSP strategy:
//  - script-src: 'self' + 'unsafe-inline' retained for Next.js inline hydration
//    chunks; tighten to nonce-based CSP in a future hardening sprint.
//  - img-src: 'self' blob: data: + res.cloudinary.com for patient photo uploads.
//  - font-src: 'self' + Google Fonts CDN.
//  - connect-src: 'self' + Atlas Data API / Upstash Redis REST endpoints.
// ---------------------------------------------------------------------------
const SECURITY_HEADERS = [
  // Enforce HTTPS for 1 year; includeSubDomains covers *.ryanmedihub.com.
  // preload is intentionally omitted until the domain is on the HSTS preload list.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  // Prevent the application from being embedded in iframes on foreign origins
  // (clickjacking protection).
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  // Prevent browsers from MIME-sniffing a response away from the declared
  // Content-Type (e.g., serving a JS file as text/plain).
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  // Send full URL as Referer only to same-origin; send origin only to HTTPS
  // cross-origin; send nothing over HTTP.
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // Restrict access to sensitive browser APIs. camera/microphone are unused;
  // geolocation is unused; payment is unused.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // Content-Security-Policy — pragmatic baseline for a Next.js SSR app.
  // TODO: Migrate to nonce-based strict CSP in a future hardening sprint
  // to eliminate 'unsafe-inline' from script-src.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js injects inline scripts for hydration; unsafe-inline is required
      // until nonce support is configured.  unsafe-eval is needed by some
      // recharts/jspdf internals.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Inline styles are common in React component libraries.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Patient photos are served from Cloudinary; blob: for jsPDF canvas export.
      "img-src 'self' blob: data: https://res.cloudinary.com",
      // Google Fonts font files.
      "font-src 'self' https://fonts.gstatic.com",
      // API calls are same-origin; Upstash Redis REST is called server-side only
      // (not from the browser), so connect-src stays narrow.
      "connect-src 'self'",
      // PDF/xlsx generation uses object URLs only; no plugin embeds.
      "object-src 'none'",
      // Disallow <base> tag hijacking.
      "base-uri 'self'",
      // All form submissions must stay same-origin.
      "form-action 'self'",
      // Prevent this page from being embedded in foreign frames (CSP complement
      // to X-Frame-Options for modern browsers).
      "frame-ancestors 'self'",
      // Allow embedding patient document PDFs (e.g. lab reports, prescriptions)
      // inside iframe preview modals from Cloudinary CDN and blob URLs.
      "frame-src 'self' blob: https://res.cloudinary.com",
    ].join("; "),
  },
];

const nextConfig = {
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },

  // Apply security headers to every route served by Next.js.
  async headers() {
    return [
      {
        // Match all routes including API routes, page routes, and static assets.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },

  async redirects() {
    return [
      {
        source: "/admin/payables",
        destination: "/admin/liabilities?section=payables",
        permanent: false,
      },
      {
        source: "/admin/receivables",
        destination: "/admin/assets?section=receivables",
        permanent: false,
      },
      {
        source: "/admin/borrowings",
        destination: "/admin/financing?tab=borrowings",
        permanent: false,
      },
      {
        source: "/admin/advances",
        destination: "/admin/financing?tab=advances",
        permanent: false,
      },
      ...Object.entries(OWNER_V2_REDIRECTS).map(([source, destination]) => ({
        source,
        destination,
        permanent: false,
      })),
    ];
  },
};

export default nextConfig;
