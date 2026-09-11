import dbConnect from "@/lib/db";
import { runEmployeeReportQuery } from "@/lib/owner/employeeReportQuery";

// Team roster for one TL: reuses the exact Agent list query, filtered to this
// team, so it's the same table/KPI shape as /owner/employees/agents — no
// second implementation of "list of agents" to maintain.
export async function GET(req, { params }) {
  await dbConnect();
  const { tlNameKey } = await params;

  const url = new URL(req.url);
  url.searchParams.set("tlName", decodeURIComponent(tlNameKey));
  url.searchParams.set("pageSize", url.searchParams.get("pageSize") || "200");

  const proxyReq = new Request(url.toString(), { method: "GET" });
  return runEmployeeReportQuery(proxyReq, "Agent");
}
