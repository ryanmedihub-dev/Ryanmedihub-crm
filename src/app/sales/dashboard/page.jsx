"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  TrendingUp,
  CheckCircle,
  XCircle,
  IndianRupee,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import MetricCard from "@/components/MetricCard";
import SalesSidebar from "../../../components/Sidebars/SalesSidebar";



export default function SalesDashboard() {
  const router = useRouter();
  const [activePage, setActivePage] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [branch, setBranch] = useState("All");
  const [dateRange, setDateRange] = useState("Today");
  const [customDates, setCustomDates] = useState({ from: "", to: "" });

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    totalLeads: 0,
    newPatients: 0,
    contacted: 0,
    converted: 0,
    notConverted: 0,
    revenue: 0,
    activeAgents: 0,
    agentPerformance: [],
    trends: {
      totalLeads: 0,
      newPatients: 0,
      contacted: 0,
      converted: 0,
      revenue: 0
    }
  });

  const buildPayload = () => {
    let fromDate = new Date();
    let toDate = new Date();

    if (dateRange === "Today") {
      fromDate.setHours(0, 0, 0, 0);
      toDate.setHours(23, 59, 59, 999);
    } else if (dateRange === "Yesterday") {
      fromDate.setDate(fromDate.getDate() - 1);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(fromDate);
      toDate.setHours(23, 59, 59, 999);
    } else if (dateRange === "Last 7 Days") {
      toDate.setHours(23, 59, 59, 999);
      fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - 6);
      fromDate.setHours(0, 0, 0, 0);
    } else if (dateRange === "Custom" && customDates.from) {
      fromDate = new Date(customDates.from);
      fromDate.setHours(0, 0, 0, 0);
      toDate = customDates.to ? new Date(customDates.to) : new Date(customDates.from);
      toDate.setHours(23, 59, 59, 999);
    }

    return {
      branch,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    };
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const payload = buildPayload();

      const res = await fetch("/api/sales/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });


      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const responseData = await res.json();

      if (responseData.success) {
        setDashboardData(responseData.data);
      } else {
        throw new Error(responseData.error || "Failed to fetch data");
      }
    } catch (err) {
      console.error("Error fetching admin dashboard:", err);
      setDashboardData({
        totalLeads: 0,
        newPatients: 0,
        contacted: 0,
        converted: 0,
        notConverted: 0,
        revenue: 0,
        activeAgents: 0,
        agentPerformance: [],
        trends: {
          totalLeads: 0,
          newPatients: 0,
          contacted: 0,
          converted: 0,
          revenue: 0
        }
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [branch, dateRange, customDates]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const handleMetricClick = (metricType) => {
    const payload = buildPayload();
    const params = new URLSearchParams({
      branch,
      dateFrom: payload.from,
      dateTo: payload.to,
    });

    switch (metricType) {
      case "totalLeads":
        router.push(`/sales/patients?${params.toString()}`);
        break;
      case "newPatients":
        params.set("status", "NOT_VISITED");
        router.push(`/sales/patients?${params.toString()}`);
        break;
      case "converted":
        params.set("status", "CONSULTED");
        router.push(`/sales/patients?${params.toString()}`);
        break;
      case "notConverted":
        params.set("status", "NOT_CONVERTED");
        router.push(`/sales/patients?${params.toString()}`);
        break;
      case "revenue":
        router.push(`/sales/revenue?${params.toString()}`);
        break;
      case "agents":
        router.push(`/sales/agents?${params.toString()}`);
        break;
      default:
        break;
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <SalesSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activePage={activePage}
        setActivePage={setActivePage}
      />

      <main className="flex-1 min-w-0 px-4 pt-16 pb-6 sm:px-6 lg:p-8">
        <Topbar
          title={"Sales Dashboard"}
          setSidebarOpen={setSidebarOpen}
          timeRange={dateRange}
          setTimeRange={setDateRange}
          branch={branch}
          setBranch={setBranch}
          customDates={customDates}
          setCustomDates={setCustomDates}
        />


          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-indigo-600 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <MetricCard
                  title="Total Appointment"
                  value={dashboardData?.totalLeads || 0}
                  icon={Users}
                  color="blue"
                  trend={dashboardData?.trends?.totalLeads}
                  onClick={() => handleMetricClick("totalLeads")}
                />
                <MetricCard
                  title="Not Visited"
                  value={dashboardData?.newPatients || 0}
                  icon={UserPlus}
                  color="green"
                  trend={dashboardData?.trends?.newPatients}
                  onClick={() => handleMetricClick("newPatients")}
                />
                <MetricCard
                  title="Active Agents"
                  value={dashboardData?.activeAgents || 0}
                  icon={TrendingUp}
                  color="orange"
                  trend={0}
                  onClick={() => handleMetricClick("agents")}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                <MetricCard
                  title="Converted Patients"
                  value={dashboardData?.converted || 0}
                  icon={CheckCircle}
                  color="teal"
                  trend={dashboardData?.trends?.converted}
                  onClick={() => handleMetricClick("converted")}
                />
                <MetricCard
                  title="Not Converted"
                  value={dashboardData?.notConverted || 0}
                  icon={XCircle}
                  color="red"
                  trend={0}
                  onClick={() => handleMetricClick("notConverted")}
                />
                <MetricCard
                  title="Total Revenue"
                  value={formatCurrency(dashboardData?.revenue)}
                  icon={IndianRupee}
                  color="emerald"
                  trend={dashboardData?.trends?.revenue}
                  onClick={() => handleMetricClick("revenue")}
                />
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">
                        Agent Performance
                      </h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Top performing sales agents
                      </p>
                    </div>
                    <button
                      onClick={() => router.push("/sales/agents")}
                      type="button"
                      className="px-3 py-1.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 transition-colors text-sm font-medium"
                    >
                      View All
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {dashboardData?.agentPerformance?.length > 0 ? (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">
                            Agent
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">
                            Branch
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">
                            Total Leads
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">
                            Converted
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">
                            Conversion Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {dashboardData.agentPerformance.slice(0, 5).map((agent, index) => (
                          <tr
                            key={index}
                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => router.push(`/sales/agents`)}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="shrink-0 h-9 w-9 bg-gray-100 rounded-full flex items-center justify-center">
                                  <span className="text-gray-600 font-semibold text-xs">
                                    {agent.name?.charAt(0)?.toUpperCase() || "A"}
                                  </span>
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">
                                    {agent.name || "N/A"}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {agent.email || agent.phone || "N/A"}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 py-0.5 inline-flex text-xs font-medium rounded-md bg-gray-100 text-gray-700">
                                {agent.branch || "N/A"}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-semibold text-gray-900">
                                {agent.totalLeads || 0}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-semibold text-gray-900">
                                {agent.converted || 0}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-25">
                                  <div
                                    className="bg-emerald-500 h-1.5 rounded-full transition-all"
                                    style={{ width: `${agent.conversionRate || 0}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm font-semibold text-gray-900 min-w-11.25">
                                  {agent.conversionRate || 0}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-12">
                      <Users className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900">
                        No agent data
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Agent performance will appear here once data is available.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
      </main>
    </div>
  );
}