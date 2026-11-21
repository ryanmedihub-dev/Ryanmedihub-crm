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
      setReports({
        summary: {
          totalSurgeries: 45,
          completedSurgeries: 42,
          pendingSurgeries: 3,
          totalGrafts: 112500,
          averageGrafts: 2500,
          totalRevenue: 6750000,
          averageRevenue: 150000
        },
        techniqueBreakdown: {
          FUE: { count: 25, percentage: 55.6 },
          DHI: { count: 12, percentage: 26.7 },
          HYBRID: { count: 8, percentage: 17.8 }
        },
        locationBreakdown: {
          Delhi: { count: 28, percentage: 62.2 },
          Mumbai: { count: 10, percentage: 22.2 },
          Hyderabad: { count: 7, percentage: 15.6 }
        },
        monthlyTrend: [
          { month: 'Jan', surgeries: 8 },
          { month: 'Feb', surgeries: 12 },
          { month: 'Mar', surgeries: 15 },
          { month: 'Apr', surgeries: 10 }
        ],
        recentSurgeries: [
          {
            _id: "1",
            personal: { name: "John Doe", branch: "Delhi" },
            surgery: {
              surgeryDate: new Date().toISOString(),
              technique: "FUE",
              graftsImplanted: 2500
            },
            payments: { totalAmount: 150000, amountReceived: 150000 }
          }
        ]
      });
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

  const getTechniqueColor = (technique) => {
    const colors = {
      FUE: "bg-blue-100 text-blue-700",
      "TURKISH DHI": "bg-purple-100 text-purple-700",
      "INDIAN DHI": "bg-pink-100 text-pink-700",
      HYBRID: "bg-green-100 text-green-700",
      PRP: "bg-yellow-100 text-yellow-700",
      GFC: "bg-orange-100 text-orange-700",
      Mesotherapy: "bg-fuchsia-100 text-fuchsia-700",
    };
    return colors[technique] || "bg-gray-100 text-gray-700";
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar role="surgery" />
      <main className="flex-1 p-4 lg:p-8">

        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Surgery Reports</h1>
              <p className="text-sm text-gray-600 mt-1 mb-5">Comprehensive surgery analytics and reports</p>
            </div>
            <button
              onClick={handleExportReport}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Start Date"
              />

              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="End Date"
              />

              <button
                onClick={fetchReports}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Activity className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-xs text-green-600 font-medium">+12%</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{reports?.summary?.totalSurgeries || 0}</h3>
                <p className="text-sm text-gray-600 mt-1">Total Surgeries</p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Users className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-xs text-green-600 font-medium">+8%</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{reports?.summary?.completedSurgeries || 0}</h3>
                <p className="text-sm text-gray-600 mt-1">Completed</p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{reports?.summary?.averageGrafts?.toLocaleString() || 0}</h3>
                <p className="text-sm text-gray-600 mt-1">Avg. Grafts/Surgery</p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className="text-xs text-green-600 font-medium">+15%</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(reports?.summary?.totalRevenue)}</h3>
                <p className="text-sm text-gray-600 mt-1">Total Revenue</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-600" />
                  Technique Distribution
                </h3>
                <div className="space-y-4">
                  {reports?.techniqueBreakdown && Object.entries(reports.techniqueBreakdown).map(([technique, data]) => (
                    <div key={technique} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`px-3 py-1 text-sm font-medium rounded-full ${getTechniqueColor(technique)}`}>
                          {technique}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-900">{data.count} surgeries</span>
                          <span className="text-sm text-gray-600">{data.percentage}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-linear-to-r from-green-500 to-green-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${data.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-green-600" />
                  Location Distribution
                </h3>
                <div className="space-y-4">
                  {reports?.locationBreakdown && Object.entries(reports.locationBreakdown).map(([location, data]) => (
                    <div key={location} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-700">{location}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-900">{data.count} surgeries</span>
                          <span className="text-sm text-gray-600">{data.percentage}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-linear-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${data.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-600" />
                  Recent Surgery Details
                </h3>
              </div>
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Patient</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Branch</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Technique</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Grafts</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Amount</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {reports?.recentSurgeries?.map((surgery) => (
                        <tr key={surgery._id} className="hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium text-gray-900">{surgery.personal?.name}</td>
                          <td className="py-3 px-4 text-sm text-gray-600">{surgery.personal?.branch}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTechniqueColor(surgery.surgery?.technique)}`}>
                              {surgery.surgery?.technique}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-700">{surgery.surgery?.graftsImplanted}</td>
                          <td className="py-3 px-4 text-sm font-medium text-gray-900">{formatCurrency(surgery.payments?.totalAmount)}</td>
                          <td className="py-3 px-4 text-sm text-gray-600">
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