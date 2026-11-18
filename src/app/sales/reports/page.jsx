"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Users, IndianRupee, TrendingUp, Calendar, CheckCircle } from "lucide-react";
import Sidebar from "../../../components/Sidebars/SalesSidebar";
import Topbar from "../../../components/Topbar";
import { toneClass } from "@/components/dashboard/StatCard";
import { buttonClass } from "@/components/ui";

export default function SalesReports() {
  const [activePage, setActivePage] = useState("Reports");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [branch, setBranch] = useState("All");
  const [dateRange, setDateRange] = useState("Today");
  const [customDates, setCustomDates] = useState({ from: "", to: "" });
  const [loading, setLoading] = useState({});

  const getDateRange = () => {
    let fromDate = new Date();
    fromDate.setHours(0, 0, 0, 0);
    let toDate = new Date();
    toDate.setHours(23, 59, 59, 999);

    if (dateRange === "Yesterday") {
      fromDate.setDate(fromDate.getDate() - 1);
      toDate.setDate(toDate.getDate() - 1);
    } else if (dateRange === "Last 7 Days") {
      fromDate.setDate(fromDate.getDate() - 6);
    } else if (dateRange === "Custom" && customDates.from) {
      fromDate = new Date(customDates.from);
      fromDate.setHours(0, 0, 0, 0);
      toDate = customDates.to ? new Date(customDates.to) : new Date(customDates.from);
      toDate.setHours(23, 59, 59, 999);
    }

    return { from: fromDate, to: toDate };
  };

  const downloadReport = async (reportType) => {
    setLoading(prev => ({ ...prev, [reportType]: true }));

    try {
      const { from, to } = getDateRange();
      const params = new URLSearchParams({
        type: reportType,
        branch,
        dateFrom: from.toISOString(),
        dateTo: to.toISOString()
      });

      const res = await fetch(`/api/sales/reports?${params.toString()}`);
      const data = await res.json();

      if (data.success && data.csvData) {
        const blob = new Blob([data.csvData], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${reportType}-${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Error downloading report:", err);
      alert("Failed to download report. Please try again.");
    } finally {
      setLoading(prev => ({ ...prev, [reportType]: false }));
    }
  };

  const reports = [
    {
      id: "patients",
      title: "Patients Report",
      description: "Complete list of all patients with their personal information and status",
      icon: Users,
      color: "blue",
      includes: ["Name, Age, Gender", "Contact Details", "Branch", "Status", "Conversion Status", "Reference Agent"]
    },
    {
      id: "agent-performance",
      title: "Agent Performance Report",
      description: "Detailed performance metrics for all sales agents",
      icon: TrendingUp,
      color: "purple",
      includes: ["Agent Details", "Total Leads", "Converted Patients", "Conversion Rate", "Branch Performance"]
    },
    {
      id: "revenue",
      title: "Revenue Report",
      description: "All revenue transactions with payment details",
      icon: IndianRupee,
      color: "emerald",
      includes: ["Transaction Date", "Patient Name", "Procedure", "Amount", "Payment Method", "Payment Type"]
    },
    {
      id: "converted-patients",
      title: "Converted Patients Report",
      description: "List of all converted patients",
      icon: CheckCircle,
      color: "teal",
      includes: ["Patient Details", "Conversion Date", "Reference Agent", "Revenue Generated", "Current Status"]
    },
    {
      id: "pending-leads",
      title: "Pending Leads Report",
      description: "All leads that are not yet converted",
      icon: Calendar,
      color: "amber",
      includes: ["Lead Details", "Days Since First Contact", "Last Follow-up", "Reference Agent", "Current Stage"]
    },
    {
      id: "daily-summary",
      title: "Daily Summary Report",
      description: "Daily summary of all sales activities",
      icon: FileText,
      color: "indigo",
      includes: ["New Leads", "Contacted", "Converted", "Revenue", "Top Performers", "Branch Breakdown"]
    }
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activePage={activePage}
        setActivePage={setActivePage}
      />

      <main className="flex-1 min-w-0 overflow-auto">

        <div className="p-4 lg:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 mb-2">Reports</h1>
            <p className="text-gray-600">Download comprehensive reports for your sales data</p>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {reports.map((report) => (
              <div
                key={report.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-lg ${toneClass(report.color)}`}>
                        <report.icon className="h-5 w-5" aria-hidden />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{report.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{report.description}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Includes:</p>
                    <ul className="space-y-1">
                      {report.includes.map((item, idx) => (
                        <li key={idx} className="text-sm text-gray-600 flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => downloadReport(report.id)}
                    disabled={loading[report.id]}
                    type="button"
                    className={buttonClass("secondary", "lg", "w-full justify-center")}
                  >
                    {loading[report.id] ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-200 border-t-gray-600"></div>
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" aria-hidden />
                        <span>Download Report</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
            <div className="flex gap-4">
              <div className="shrink-0">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Report Information</h4>
                <ul className="space-y-1 text-sm text-gray-600">
                  <li>• All reports are generated in CSV format for easy analysis</li>
                  <li>• Use the date range and branch filters above to customize your reports</li>
                  <li>• Reports only include data that is accessible to sales team</li>
                  <li>• Medical, surgery, and payment details are not included for privacy</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
