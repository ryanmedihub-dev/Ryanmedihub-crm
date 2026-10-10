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
import SalesSidebar from "@/components/Sidebars/SalesSidebar";

const COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
];

export default function PerformancePage() {
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

  return (
    <div className="flex min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
      <SalesSidebar
      />

      <div className="w-full p-8 px-12 mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Performance Dashboard
          </h1>
          <p className="text-gray-600 mt-2">
            Visual analytics and performance metrics
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            <button
              onClick={resetFilters}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Reset Filters
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  handleFilterChange("startDate", e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange("endDate", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Branch
              </label>
              <select
                value={filters.branch}
                onChange={(e) => handleFilterChange("branch", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Branches</option>
                <option value="Delhi">Delhi</option>
                <option value="Mumbai">Mumbai</option>
                <option value="Hyderabad">Hyderabad</option>
                <option value="Noida">Noida</option>
                <option value="Gurgaon">Gurgaon</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Agent Performance (Revenue)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.agentPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis />
                <Tooltip
                  formatter={(value) => `₹${value.toLocaleString("en-IN")}`}
                />
                <Legend />
                <Bar dataKey="revenue" fill="#3B82F6" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Agent Performance (Patients)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.agentPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="patients" fill="#10B981" name="Total Patients" />
                <Bar dataKey="visited" fill="#3B82F6" name="Visited" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
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

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Revenue by Procedure
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.revenueByProcedure}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="procedure"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis />
                <Tooltip
                  formatter={(value) => `₹${value.toLocaleString("en-IN")}`}
                />
                <Legend />
                <Bar dataKey="revenue" fill="#F59E0B" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Monthly Revenue Trend
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
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

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
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

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Conversion Funnel
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.conversionFunnel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="stage" type="category" width={120} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#8B5CF6" name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-linear-to-br from-blue-500 to-blue-600 rounded-lg shadow p-6 text-white">
            <h3 className="text-sm font-medium opacity-90">Total Revenue</h3>
            <p className="text-3xl font-bold mt-2">
              ₹{chartData.totalRevenue?.toLocaleString("en-IN") || 0}
            </p>
          </div>

          <div className="bg-linear-to-br from-green-500 to-green-600 rounded-lg shadow p-6 text-white">
            <h3 className="text-sm font-medium opacity-90">Total Patients</h3>
            <p className="text-3xl font-bold mt-2">
              {chartData.totalPatients || 0}
            </p>
          </div>

          <div className="bg-linear-to-br from-purple-500 to-purple-600 rounded-lg shadow p-6 text-white">
            <h3 className="text-sm font-medium opacity-90">Conversion Rate</h3>
            <p className="text-3xl font-bold mt-2">
              {chartData.conversionRate || 0}%
            </p>
          </div>

          <div className="bg-linear-to-br from-orange-500 to-orange-600 rounded-lg shadow p-6 text-white">
            <h3 className="text-sm font-medium opacity-90">Avg Transaction</h3>
            <p className="text-3xl font-bold mt-2">
              ₹{chartData.avgTransaction?.toLocaleString("en-IN") || 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}