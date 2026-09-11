import { withDB } from "@/lib/withDB";
import { runEmployeeReportQuery } from "@/lib/owner/employeeReportQuery";

export const GET = withDB((req) => runEmployeeReportQuery(req, "Surgery"));
