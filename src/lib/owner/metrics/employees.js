import { queryEmployeeSection } from "@/lib/owner/employeeReportQuery";
import { EMPLOYEE_SECTIONS, SECTION_LABELS } from "@/lib/owner/employeeSections";

export async function getEmployeeStats({ section = "Agent", dateFrom = "", dateTo = "", branch = "All", isactive = null } = {}) {
  if (!EMPLOYEE_SECTIONS.includes(section)) {
    throw new Error(`Unknown employee section "${section}" — expected one of ${EMPLOYEE_SECTIONS.join(", ")}`);
  }
  const result = await queryEmployeeSection({
    section,
    filters: { dateFrom, dateTo, branch, tlName: "", isactive, search: "", sortBy: "name", sortDir: "asc" },
    page: 1, pageSize: 1, skip: 0, limit: 1,
  });
  return {
    section,
    label: SECTION_LABELS[section],
    headcount: result.total,
    kpis: result.kpis.map(({ label, value, sub, format }) => ({ label, value, sub, format: format || null })),
    performanceBands: result.bands,
    callbyError: result.callbyError,
  };
}
