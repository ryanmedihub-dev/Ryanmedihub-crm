import dbConnect from "@/lib/db";
import { runEmployeeReportQuery } from "@/lib/owner/employeeReportQuery";

export async function GET(req, { params }) {
  await dbConnect();
  const { tlNameKey } = await params;

  const url = new URL(req.url);
  url.searchParams.set("tlName", decodeURIComponent(tlNameKey));

  const proxyReq = new Request(url.toString(), { method: "GET" });
  return runEmployeeReportQuery(proxyReq, "Agent");
}
