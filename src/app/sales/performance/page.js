"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useChartColors } from "@/lib/theme";
import SalesSidebar from "@/components/Sidebars/SalesSidebar";

// Validated categorical palette (dataviz skill), assigned in fixed order.
const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

// 34000000 → ₹3.4Cr style ticks for money, plain numbers for counts.
const fmtAxis = (n) =>
  Math.abs(n) >= 10000000 ? `${(n / 10000000).toFixed(1)}Cr` : Math.abs(n) >= 100000 ? `${(n / 100000).toFixed(0)}L` : Math.abs(n) >= 1000 ? `${+(n / 1000).toFixed(1)}K` : n;

export default function PerformancePage() {
  const chart = useChartColors();
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState({
    agentPerformance: [],
    revenueByBranch: [],
    revenueByProcedure: [],
    monthlyRevenue: [],
    conversionFunnel: [],
    patientStatus: [],
  });
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    branch: "",
  });

  const fetchChartData = useCallback(async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();

      Object.keys(filters).forEach((key) => {
        if (filters[key]) {
          queryParams.append(key, filters[key]);
        }
      });

      const response = await fetch(`/api/sales/performance?${queryParams}`);
      const data = await response.json();
      setChartData(data);
    } catch (error) {
      console.error("Error fetching chart data:", error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      startDate: "",
      endDate: "",
      branch: "",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // ~260 agents cannot be read as bars; show the top 15 for each measure.
  const topBy = (key) => [...(chartData.agentPerformance || [])].sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, 15);
  const topRevenue = topBy("revenue");
  const topPatients = topBy("patients");

  return (
    <div className="flex min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
      <SalesSidebar
      />

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-7">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">Performance</h1>
            <p className="mt-1 text-sm text-gray-500">Revenue and patient volume by agent, branch and procedure</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" aria-label="Start date" value={filters.startDate} onChange={(e) => handleFilterChange("startDate", e.target.value)} className="h-9 px-3 text-sm text-gray-800 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow]" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" aria-label="End date" value={filters.endDate} onChange={(e) => handleFilterChange("endDate", e.target.value)} className="h-9 px-3 text-sm text-gray-800 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow]" />
            <select aria-label="Branch" value={filters.branch} onChange={(e) => handleFilterChange("branch", e.target.value)} className="h-9 pl-3 pr-8 text-sm text-gray-800 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow]">
              <option value="">All branches</option>
              <option value="Delhi">Delhi</option>
              <option value="Mumbai">Mumbai</option>
              <option value="Hyderabad">Hyderabad</option>
              <option value="Noida">Noida</option>
              <option value="Gurgaon">Gurgaon</option>
            </select>
            <button onClick={resetFilters} className="h-9 px-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors">Reset</button>
          </div>
        </div>

        <div className="stagger mb-6 grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 border border-gray-200 rounded-xl overflow-hidden">
          {[
            ["Total revenue", `₹${chartData.totalRevenue?.toLocaleString("en-IN", { maximumFractionDigits: 0 }) || 0}`],
            ["Total patients", (chartData.totalPatients || 0).toLocaleString("en-IN")],
            ["Conversion rate", `${chartData.conversionRate || 0}%`],
            ["Avg transaction", `₹${chartData.avgTransaction?.toLocaleString("en-IN", { maximumFractionDigits: 0 }) || 0}`],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 bg-white px-5 py-4">
              <p className="text-[13px] font-medium text-gray-500 truncate">{label}</p>
              <p className="mt-1.5 text-xl font-semibold tracking-tight text-gray-900 tabular-nums whitespace-nowrap">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 px-5 pt-4 pb-3">
            <h3 className="text-[15px] font-semibold text-gray-900 mb-3">
              Top 15 agents by revenue
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topRevenue}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis tickFormatter={fmtAxis} axisLine={false} tickLine={false} width={56} />
                <Tooltip
                  formatter={(value) => `₹${value.toLocaleString("en-IN")}`}
                />
                <Legend />
                <Bar dataKey="revenue" fill={chart.in} name="Revenue" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 px-5 pt-4 pb-3">
            <h3 className="text-[15px] font-semibold text-gray-900 mb-3">
              Top 15 agents by patients
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topPatients}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis tickFormatter={fmtAxis} axisLine={false} tickLine={false} width={56} />
                <Tooltip />
                <Legend />
                <Bar dataKey="patients" fill={chart.in} name="Total Patients" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="visited" fill={chart.out} name="Visited" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 px-5 pt-4 pb-3">
            <h3 className="text-[15px] font-semibold text-gray-900 mb-3">
              Revenue by Branch
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData.revenueByBranch}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="revenue"
                >
                  {chartData.revenueByBranch.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => `₹${value.toLocaleString("en-IN")}`}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 px-5 pt-4 pb-3">
            <h3 className="text-[15px] font-semibold text-gray-900 mb-3">
              Revenue by Procedure
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.revenueByProcedure}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="procedure"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis tickFormatter={fmtAxis} axisLine={false} tickLine={false} width={56} />
                <Tooltip
                  formatter={(value) => `₹${value.toLocaleString("en-IN")}`}
                />
                <Legend />
                <Bar dataKey="revenue" fill={chart.in} name="Revenue" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 px-5 pt-4 pb-3 lg:col-span-2">
            <h3 className="text-[15px] font-semibold text-gray-900 mb-3">
              Monthly Revenue Trend
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData.monthlyRevenue}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={fmtAxis} axisLine={false} tickLine={false} width={56} />
                <Tooltip
                  formatter={(value) => `₹${value.toLocaleString("en-IN")}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  name="Revenue"
                />
                <Line
                  type="monotone"
                  dataKey="patients"
                  stroke="#10B981"
                  strokeWidth={2}
                  name="Patients"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 px-5 pt-4 pb-3">
            <h3 className="text-[15px] font-semibold text-gray-900 mb-3">
              Patient Status Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData.patientStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {chartData.patientStatus.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 px-5 pt-4 pb-3">
            <h3 className="text-[15px] font-semibold text-gray-900 mb-3">
              Conversion Funnel
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.conversionFunnel} layout="vertical">
                <CartesianGrid vertical={false} />
                <XAxis type="number" />
                <YAxis dataKey="stage" type="category" width={120} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill={chart.in} name="Count" radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}