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

const nextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
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
