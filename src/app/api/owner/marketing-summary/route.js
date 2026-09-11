
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import AdSpend from "@/models/AdSpend";
import { attributeSpendToOutcomes } from "@/lib/owner/marketingAttribution";

const PLATFORMS = ["Meta", "Google"];

// Rebuilt on the shared src/lib/owner/marketingAttribution.js (Owner Panel v2,
// Part 4) — same output shape as before (this route's callers are unchanged),
// but the attribution logic itself now lives in one place, reused by the Ad
// Spend return picture and the Comparison page too.
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["super-admin", "owner"].includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    await connectDB();

    const { branch = "All", from, to } = await req.json();
    if (!from || !to) {
      return NextResponse.json({ success: false, message: "from and to are required" }, { status: 400 });
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const { byPlatform } = await attributeSpendToOutcomes({ platforms: PLATFORMS, branch, from: fromDate, to: toDate });

    const rows = [];
    for (const platform of PLATFORMS) {
      const outcome = byPlatform[platform];
      const campaigns = outcome.campaigns;
      if (campaigns.length === 0) continue;

      if (campaigns.length === 1) {
        rows.push({
          platform,
          campaignName: campaigns[0].campaignName || null,
          isPlatformTotal: false,
          spend: outcome.spend,
          leads: outcome.leads,
          cpl: outcome.cpl,
          converted: outcome.converted,
          cac: outcome.cac,
          revenue: outcome.revenue,
          roas: outcome.roas,
        });
      } else {
        campaigns.forEach((c) => {
          rows.push({
            platform,
            campaignName: c.campaignName || "(unnamed)",
            isPlatformTotal: false,
            spend: c.spend,
            leads: null,
            cpl: null,
            converted: null,
            cac: null,
            revenue: null,
            roas: null,
          });
        });
        rows.push({
          platform,
          campaignName: null,
          isPlatformTotal: true,
          spend: outcome.spend,
          leads: outcome.leads,
          cpl: outcome.cpl,
          converted: outcome.converted,
          cac: outcome.cac,
          revenue: outcome.revenue,
          roas: outcome.roas,
        });
      }
    }

    // Last-entry attribution for the manual-data notice.
    const lastEntry = await AdSpend.findOne(branch !== "All" ? { branch } : {})
      .sort({ createdAt: -1 })
      .select("createdAt enteredBy")
      .lean();

    return NextResponse.json({
      success: true,
      branch,
      note:
        branch !== "All"
          ? `Spend is scoped to ${branch}. Leads/CPL/Converted/Revenue/CAC/ROAS reflect all branches — the Leads collection has no branch field to scope them by.`
          : null,
      rows,
      lastUpdatedAt: lastEntry?.createdAt || null,
      lastUpdatedBy: lastEntry?.enteredBy?.name || null,
    });
  } catch (err) {
    console.error("owner marketing-summary error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
