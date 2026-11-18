"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { maskPhone } from "@/utils/phoneUtils";
import {
  Calendar,
  UserPlus,
  Users,
  IndianRupee,
  Clock,
  Phone,
  UserCheck,
  AlertCircle,
  ClipboardList,
  ChevronRight,
  BadgeCheck,
} from "lucide-react";
import ReceptionSidebar from "@/components/Sidebars/ReceptionSidebar";
import Topbar from "@/components/Topbar";
import { useToast } from "@/components/Toast";
import StatCard from "@/components/dashboard/StatCard";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0);

const STATUS_META = {
  NEW: { label: "New", color: "bg-blue-100 text-blue-700 border-blue-200" },
  NOT_VISITED: { label: "Not Visited", color: "bg-amber-100 text-amber-700 border-amber-200" },
  NOT_CONVERTED: { label: "Not Converted", color: "bg-orange-100 text-orange-700 border-orange-200" },
  CONSULTED: { label: "Consulted", color: "bg-green-100 text-green-700 border-green-200" },
  SURGERY_BOOKED: { label: "Surgery Booked", color: "bg-purple-100 text-purple-700 border-purple-200" },
  CLOSED: { label: "Closed", color: "bg-gray-100 text-gray-600 border-gray-200" },
};

function FunnelBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-600 font-medium">{label}</span>
        <span className="text-xs font-semibold text-gray-900">{value}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ReceptionDashboard() {
  const router = useRouter();
  const toast = useToast();
  const { data: session } = useSession();
  const userRole = session?.user?.role || "";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [timeRange, setTimeRange] = useState("Today");
  const [customDates, setCustomDates] = useState({ from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [data, setData] = useState({
    todayAppointments: 0,
    todayVisits: 0,
    pendingAppointments: 0,
    todayRevenue: 0,
    recentPatients: [],
    trends: { appointments: 0, visits: 0, revenue: 0 },
  });

  const buildPayload = useCallback(() => {
    let from = new Date();
    let to = new Date();

    if (timeRange === "Today") {
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    } else if (timeRange === "Yesterday") {
      from.setDate(from.getDate() - 1);
      from.setHours(0, 0, 0, 0);
      to = new Date(from);
      to.setHours(23, 59, 59, 999);
    } else if (timeRange === "Last 7 Days") {
      to.setHours(23, 59, 59, 999);
      from = new Date(to);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
    } else if (timeRange === "Custom" && customDates.from) {
      from = new Date(customDates.from);
      from.setHours(0, 0, 0, 0);
      to = customDates.to ? new Date(customDates.to) : new Date(customDates.from);
      to.setHours(23, 59, 59, 999);
    }

    return { from: from.toISOString(), to: to.toISOString() };
  }, [timeRange, customDates]);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const payload = buildPayload();
      const res = await fetch("/api/reception/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to fetch dashboard data");

      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        throw new Error(json.error || "Failed to fetch data");
      }
    } catch (err) {
      console.error("Reception dashboard error:", err);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildPayload, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const navTo = useCallback((path) => {
    const { from, to } = buildPayload();
    const params = new URLSearchParams({ dateFrom: from, dateTo: to });
    router.push(`${path}?${params.toString()}`);
  }, [buildPayload, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <ReceptionSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 mx-auto rounded-full border-2 border-gray-200 border-t-indigo-600 animate-spin" />
            <p className="text-gray-500 text-sm mt-3">Loading dashboard…</p>
          </div>
        </div>
      </div>
    );
  }

  const { todayAppointments, todayVisits, pendingAppointments, convertedPatients, todayRevenue, trends, recentPatients } = data;
  const conversionRate = todayAppointments > 0 ? Math.round((todayVisits / todayAppointments) * 100) : 0;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <ReceptionSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <main className="flex-1 flex flex-col px-4 pt-16 pb-6 sm:px-6 lg:p-8 min-w-0">
        <Topbar
          title="Reception Dashboard"
          setSidebarOpen={setSidebarOpen}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          customDates={customDates}
          setCustomDates={setCustomDates}
        />

        <div className="flex-1 space-y-6">

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <StatCard
              title="Total Appointments"
              value={todayAppointments}
              icon={Calendar}
              tone="blue"
              trend={trends?.appointments}
              subtitle="vs previous period"
              onClick={() => navTo("/reception/patients")}
            />
            <StatCard
              title="Patients Visited"
              value={todayVisits}
              icon={UserCheck}
              tone="emerald"
              trend={trends?.visits}
              subtitle={`${conversionRate}% conversion rate`}
              onClick={() => navTo("/reception/patients")}
            />
            <StatCard
              title="Pending / Not Visited"
              value={pendingAppointments}
              icon={Clock}
              tone="amber"
              subtitle="Awaiting consultation"
              onClick={() => navTo("/reception/not-visited")}
            />
            <StatCard
              title="Converted"
              value={convertedPatients ?? 0}
              icon={BadgeCheck}
              tone="teal"
              trend={trends?.converted}
              subtitle="Paid at least once"
              onClick={() => router.push("/reception/transactions")}
            />
            <StatCard
              title="Revenue Collected"
              value={fmt(todayRevenue)}
              icon={IndianRupee}
              tone="purple"
              trend={trends?.revenue}
              subtitle="vs previous period"
              onClick={() => router.push("/reception/transactions")}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="mb-5">
                <h3 className="text-base font-semibold text-gray-900">Patient Flow</h3>
                <p className="text-xs text-gray-500 mt-0.5">{timeRange}</p>
              </div>
              <div className="space-y-4">
                <FunnelBar label="Appointments" value={todayAppointments} max={todayAppointments} color="bg-blue-500" />
                <FunnelBar label="Visited" value={todayVisits} max={todayAppointments} color="bg-emerald-500" />
                <FunnelBar label="Converted" value={convertedPatients ?? 0} max={todayAppointments} color="bg-teal-500" />
                <FunnelBar label="Pending" value={pendingAppointments} max={todayAppointments} color="bg-amber-500" />
              </div>
              <div className="mt-5 pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                <span>Conversion rate</span>
                <span className="font-semibold text-indigo-600">{conversionRate}%</span>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
              <div className="mb-5">
                <h3 className="text-base font-semibold text-gray-900">Quick Actions</h3>
                <p className="text-xs text-gray-500 mt-0.5">Frequently used tasks</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Add Patient", icon: UserPlus, path: "/reception/add-patient", primary: true },
                  { label: "All Patients", icon: Users, path: "/reception/patients" },
                  { label: "Not Visited", icon: AlertCircle, path: "/reception/not-visited" },
                  { label: "Transactions", icon: IndianRupee, path: "/reception/transactions" },
                  { label: "Reports", icon: ClipboardList, path: "/reception/reports" },
                ].map(({ label, icon: Icon, path, primary }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => router.push(path)}
                    className={`flex items-center gap-2.5 px-3.5 py-3 rounded-lg border text-sm font-medium transition-colors ${
                      primary
                        ? "bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${primary ? "text-indigo-100" : "text-gray-400"}`} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Recent Patients</h3>
                <p className="text-xs text-gray-500 mt-0.5">Last visited this period</p>
              </div>
              <button
                onClick={() => navTo("/reception/patients")}
                type="button"
                className="text-sm text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1 rounded"
              >
                View all <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {recentPatients.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {recentPatients.map((patient, i) => {
                  const meta = STATUS_META[patient.ops?.status] || STATUS_META.NEW;
                  const initials = (patient.personal?.name || "?").slice(0, 2).toUpperCase();
                  const borderClass = i > 0 ? "border-t sm:border-t-0 sm:border-l border-gray-100" : "";
                  return (
                    <button
                      type="button"
                      key={patient._id}
                      onClick={() => router.push(`/reception/patients/${patient._id}`)}
                      className={`flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors ${borderClass}`}
                    >
                      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-xs shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{patient.personal?.name}</p>
                        <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 shrink-0" />
                          {maskPhone(patient.personal?.phone, userRole) || "—"}
                        </span>
                      </div>
                      <span className={`shrink-0 px-2 py-1 rounded-full text-[11px] font-semibold border ${meta.color}`}>
                        {meta.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 text-gray-400">
                <Users className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm font-medium text-gray-600">No recent patients</p>
                <p className="text-xs mt-1">Patients visited will appear here</p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
