"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  Calendar,
  Download,
  Filter,
  TrendingUp,
  Users,
  Activity,
  MapPin,
  BarChart3
} from "lucide-react";
import Sidebar from "@/components/Sidebars/SurgerySidebar";
import { buttonClass, inputClass } from "@/components/ui";
import Topbar from "@/components/Topbar";

export default function SurgeryReports() {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState(null);
  const [branch, setBranch] = useState("All");
  const [dateRange, setDateRange] = useState("This Month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reportType, setReportType] = useState("all");

  useEffect(() => {
    fetchReports();
  }, [branch, dateRange, reportType]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        branch,
        dateRange,
        reportType,
        ...(startDate && { startDate }),
        ...(endDate && { endDate })
      });

      const response = await fetch(`/api/surgery/reports?${params}`);
      const data = await response.json();
      setReports(data);
    } catch (error) {
      console.error("Error:", error);
      // Show zeros rather than placeholder figures.
      setReports(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = () => {
    alert('Export functionality will be implemented with API');
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount || 0);
  };



  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar role="surgery" />
      <main className="flex-1 min-w-0 px-4 pt-16 pb-6 sm:px-6 lg:p-8">

        <div className="mb-6">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-gray-900">Surgery Reports</h1>
              <p className="text-sm text-gray-500 mt-1">Surgeries by technique and location for the selected period</p>
            </div>
            <button
              onClick={handleExportReport}
              className={buttonClass("secondary")}
            >
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className={inputClass()}
              >
                <option value="all">All Reports</option>
                <option value="medical">Medical Reports</option>
                <option value="surgery">Surgery Reports</option>
                <option value="documents">Documents Reports</option>
              </select>

              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass()}
                placeholder="Start Date"
              />

              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputClass()}
                placeholder="End Date"
              />

              <button
                onClick={fetchReports}
                className={buttonClass("primary", "md", "justify-center")}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-indigo-600"></div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="stagger grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 border border-gray-200 rounded-xl overflow-hidden">
              {[
                ["Total surgeries", (reports?.summary?.totalSurgeries || 0).toLocaleString("en-IN")],
                ["Completed", (reports?.summary?.completedSurgeries || 0).toLocaleString("en-IN")],
                ["Avg. grafts / surgery", reports?.summary?.averageGrafts?.toLocaleString("en-IN") || 0],
                ["Total revenue", formatCurrency(reports?.summary?.totalRevenue)],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 bg-white px-5 py-4">
                  <p className="text-[13px] font-medium text-gray-500 truncate">{label}</p>
                  <p className="mt-1.5 text-xl font-semibold tracking-tight text-gray-900 tabular-nums whitespace-nowrap">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <h3 className="text-[15px] font-semibold text-gray-900 mb-4">
                  Surgeries by technique
                </h3>
                <div className="space-y-3">
                  {reports?.techniqueBreakdown && Object.entries(reports.techniqueBreakdown).map(([technique, data]) => (
                    <div key={technique} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{technique}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-900 tabular-nums">{data.count}</span>
                          <span className="w-12 text-right text-xs text-gray-500 tabular-nums">{data.percentage}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full"
                          style={{ width: `${data.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <h3 className="text-[15px] font-semibold text-gray-900 mb-4">
                  Surgeries by location
                </h3>
                <div className="space-y-3">
                  {reports?.locationBreakdown && Object.entries(reports.locationBreakdown).map(([location, data]) => (
                    <div key={location} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{location}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-900 tabular-nums">{data.count}</span>
                          <span className="w-12 text-right text-xs text-gray-500 tabular-nums">{data.percentage}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full"
                          style={{ width: `${data.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h3 className="text-[15px] font-semibold text-gray-900">
                  Recent surgeries
                </h3>
              </div>
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left h-9 px-4 text-xs font-medium text-gray-500">Patient</th>
                        <th className="text-left h-9 px-4 text-xs font-medium text-gray-500">Branch</th>
                        <th className="text-left h-9 px-4 text-xs font-medium text-gray-500">Technique</th>
                        <th className="text-left h-9 px-4 text-xs font-medium text-gray-500">Grafts</th>
                        <th className="text-left h-9 px-4 text-xs font-medium text-gray-500">Amount</th>
                        <th className="text-left h-9 px-4 text-xs font-medium text-gray-500">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {reports?.recentSurgeries?.map((surgery) => (
                        <tr key={surgery._id} className="hover:bg-gray-50">
                          <td className="py-2.5 px-4 font-medium text-gray-900">{surgery.personal?.name}</td>
                          <td className="py-2.5 px-4 text-sm text-gray-600">{surgery.personal?.branch}</td>
                          <td className="py-2.5 px-4">
                            <span className="inline-flex items-center h-5 px-2 rounded-md bg-gray-100 text-xs font-medium text-gray-700">
                              {surgery.surgery?.technique}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-sm text-gray-700">{surgery.surgery?.graftsImplanted}</td>
                          <td className="py-2.5 px-4 text-sm font-medium text-gray-900">{formatCurrency(surgery.payments?.totalAmount)}</td>
                          <td className="py-2.5 px-4 text-sm text-gray-600">
                            {new Date(surgery.surgery?.surgeryDate).toLocaleDateString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}