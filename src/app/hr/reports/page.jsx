"use client";

import { useState } from "react";
import {
  Download,
  FileText,
  Users,
  UserCheck,
  UserX,
  Calendar,
  BarChart2,
  Clock,
} from "lucide-react";
import HRSidebar from "@/components/Sidebars/HRSidebar";
import { toneClass } from "@/components/dashboard/StatCard";
import { buttonClass } from "@/components/ui";

const reports = [
  {
    id: "employees",
    title: "All Employees Report",
    description: "Complete list of all employees with role, contact, and status",
    icon: Users,
    color: "violet",
    includes: ["Name, Phone, Email", "Role & Active Status", "Linked Patient Count", "Date Joined"],
  },
  {
    id: "employees-by-role",
    title: "Employees by Role",
    description: "Summary of employee count grouped by role",
    icon: BarChart2,
    color: "blue",
    includes: ["Role Name", "Total Count", "Active Count", "Inactive Count"],
  },
  {
    id: "candidates",
    title: "All Candidates Report",
    description: "Full candidate list with application details and evaluation scores",
    icon: FileText,
    color: "emerald",
    includes: ["Name, Position, Contact", "Experience & Salary", "Application Status", "HR Comments & Remarks"],
  },
  {
    id: "candidates",
    title: "Selected Candidates",
    description: "List of candidates who have been selected",
    icon: UserCheck,
    color: "teal",
    includes: ["Candidate Details", "Position Applied", "Expected Salary", "Previous Company"],
    statusFilter: "Selected",
  },
  {
    id: "candidates",
    title: "Rejected Candidates",
    description: "List of candidates who have been rejected",
    icon: UserX,
    color: "red",
    includes: ["Candidate Details", "Position Applied", "Rejection Stage", "Final Remarks"],
    statusFilter: "Rejected",
  },
  {
    id: "interview-schedule",
    title: "Interview Schedule",
    description: "All candidates with scheduled interviews sorted by date",
    icon: Calendar,
    color: "amber",
    includes: ["Candidate Name & Contact", "Position", "Interview Date", "Experience & Salary"],
  },
];

export default function HRReportsPage() {
  const [loading, setLoading] = useState({});
  const [filters, setFilters] = useState({ startDate: "", endDate: "" });

  const downloadReport = async (report) => {
    const key = report.title;
    setLoading((prev) => ({ ...prev, [key]: true }));

    try {
      const params = new URLSearchParams({ type: report.id });
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);
      if (report.statusFilter) params.append("status", report.statusFilter);

      const res = await fetch(`/api/hr/reports?${params}`);
      const data = await res.json();

      if (data.success && data.csvData) {
        const blob = new Blob([data.csvData], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${data.filename}-${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        alert(data.message || "Failed to generate report");
      }
    } catch (err) {
      console.error("Report download error:", err);
      alert("Failed to download report. Please try again.");
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <HRSidebar />

      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-6 lg:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Reports</h1>
            <p className="text-gray-600 mt-1">Download HR reports in CSV format</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Date Range Filter (optional)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">From</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">To</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                  className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                />
              </div>
            </div>
            {(filters.startDate || filters.endDate) && (
              <button
                onClick={() => setFilters({ startDate: "", endDate: "" })}
                className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Clear dates
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((report, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`p-2.5 rounded-lg shrink-0 ${toneClass(report.color)}`}>
                      <report.icon className="h-5 w-5" aria-hidden />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 leading-tight">{report.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">{report.description}</p>
                    </div>
                  </div>

                  <div className="mb-5">
                    <p className="text-xs font-medium text-gray-500 mb-2">Includes</p>
                    <ul className="space-y-1">
                      {report.includes.map((item, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => downloadReport(report)}
                    disabled={loading[report.title]}
                    type="button"
                    className={buttonClass("secondary", "lg", "w-full justify-center")}
                  >
                    {loading[report.title] ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-200 border-t-gray-600" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Download CSV
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 bg-indigo-50 border border-indigo-200 rounded-xl p-5">
            <div className="flex gap-3">
              <FileText className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-1">Report Information</p>
                <ul className="text-sm text-gray-600 space-y-0.5">
                  <li>• All reports are downloaded in CSV format</li>
                  <li>• Use the date range filter to scope reports to a specific period</li>
                  <li>• Leave dates empty to include all records</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
