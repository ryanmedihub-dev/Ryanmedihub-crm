"use client";

import { useState, useEffect } from "react";
import {
  Stethoscope,
  Calendar,
  CheckCircle,
  Clock,
  MapPin,
  Users,
  TrendingUp
} from "lucide-react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebars/SurgerySidebar";
import { maskPhone } from "@/utils/phoneUtils";
import Topbar from "@/components/Topbar";
import MetricCard from "@/components/MetricCard";
import { ErrorState } from "@/components/ui";
import Link from "next/link";

export default function SurgeryDashboard() {
  const { data: session } = useSession();
  const userRole = session?.user?.role || "";
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [branch, setBranch] = useState("All");
  const [dateRange, setDateRange] = useState("Today");
  const [upcomingSurgeries, setUpcomingSurgeries] = useState([]);
  const [performedSurgeries, setPerformedSurgeries] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchData();
  }, [branch, dateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/surgery/dashboard?branch=${branch}&dateRange=${dateRange}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data?.error || "Request failed");
      setError("");
      setDashboardData(data.metrics || {});

      setUpcomingSurgeries(data.upcomingSurgeries || []);
      setPerformedSurgeries(data.performedSurgeries || []);
    } catch (err) {
      console.error("Surgery dashboard error:", err);
      setError("Couldn't load the surgery dashboard.");
      setDashboardData({});
      setUpcomingSurgeries([]);
      setPerformedSurgeries([]);
    } finally {
      setLoading(false);
    }
  };

  const metrics = [
    {
      title: "Scheduled Today",
      value: dashboardData?.scheduledSurgeries || 0,
      icon: Calendar,
      color: "blue"
    },
    {
      title: "Completed Today",
      value: dashboardData?.completedSurgeries || 0,
      icon: CheckCircle,
      color: "green"
    },
    {
      title: "Pending",
      value: dashboardData?.pendingSurgeries || 0,
      icon: Clock,
      color: "amber"
    },
    {
      title: "Ready for Surgery",
      value: dashboardData?.readyForSurgery || 0,
      icon: Stethoscope,
      color: "indigo"
    },
  ];

  const getTechniqueColor = (technique) => {
    const colors = {
      FUE: "bg-blue-100 text-blue-700",
      "TURKISH DHI": "bg-purple-100 text-purple-700",
      "INDIAN DHI": "bg-pink-100 text-pink-700",
      HYBRID: "bg-green-100 text-green-700",
      PRP: "bg-yellow-100 text-yellow-700",
      GFC: "bg-orange-100 text-orange-700",
    };
    return colors[technique] || "bg-gray-100 text-gray-700";
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar role="surgery" />
      <main className="flex-1 min-w-0 px-4 pt-16 pb-6 sm:px-6 lg:p-8">
        <Topbar
          title="Surgery Dashboard"
          role="surgery"
          timeRange={dateRange}
          setTimeRange={setDateRange}
          branch={branch}
          setBranch={setBranch}
        />

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-indigo-600 animate-spin" />
          </div>
        ) : error ? (
          <ErrorState title={error} description="Check your connection and try again." onRetry={fetchData} className="bg-white border border-gray-200 rounded-xl" />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {metrics.map((card, idx) => (
                <MetricCard key={idx} {...card} />
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-base font-semibold text-gray-900">Today's Techniques</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {dashboardData?.techniqueBreakdown && Object.entries(dashboardData.techniqueBreakdown).map(([technique, count]) => (
                    <div key={technique} className="flex items-center justify-between py-2.5">
                      <span className={`px-3 py-1 text-sm font-medium rounded-full ${getTechniqueColor(technique)}`}>
                        {technique}
                      </span>
                      <span className="text-base font-semibold text-gray-900 tabular-nums">{count}</span>
                    </div>
                  ))}
                  {!Object.keys(dashboardData?.techniqueBreakdown || {}).length && (
                    <p className="py-6 text-sm text-gray-500 text-center">No surgeries in this period</p>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-base font-semibold text-gray-900">Surgeries by Location</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {dashboardData?.locationBreakdown && Object.entries(dashboardData.locationBreakdown).map(([location, count]) => (
                    <div key={location} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">{location}</span>
                      </div>
                      <span className="text-base font-semibold text-gray-900 tabular-nums">{count}</span>
                    </div>
                  ))}
                  {!Object.keys(dashboardData?.locationBreakdown || {}).length && (
                    <p className="py-6 text-sm text-gray-500 text-center">No surgeries in this period</p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-gray-900">Today's Upcoming Surgeries</h3>
                  </div>
                  <Link
                    href="/surgery/patients?filter=upcoming"
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    View All
                  </Link>
                </div>
              </div>
              <div className="p-6">
                {upcomingSurgeries.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-300" aria-hidden />
                    <p>No upcoming surgeries scheduled for today</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Patient</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Contact</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Technique</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Location</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Grafts Needed</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {upcomingSurgeries.map((patient) => (
                          <tr key={patient._id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <div className="font-medium text-gray-900">{patient.personal?.name}</div>
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600">{maskPhone(patient.personal?.phone, userRole)}</td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTechniqueColor(patient.surgery?.technique || patient.counselling?.techniqueSuggested)}`}>
                                {patient.surgery?.technique || patient.counselling?.techniqueSuggested}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <MapPin className="w-3 h-3" />
                                {patient.surgery?.location || patient.personal?.branch}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-700 font-medium">
                              {patient.surgery?.graftsneed || patient.counselling?.graftsSuggested || 'N/A'}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Link
                                href={`/surgery/patients/${patient._id}`}
                                className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                              >
                                View Details
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-gray-900">Completed Surgeries Today</h3>
                  </div>
                  <Link
                    href="/surgery/patients?filter=performed"
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    View All
                  </Link>
                </div>
              </div>
              <div className="p-6">
                {performedSurgeries.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="w-10 h-10 mx-auto mb-3 text-gray-300" aria-hidden />
                    <p>No surgeries completed today</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Patient</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Contact</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Technique</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Location</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Grafts Implanted</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {performedSurgeries.map((patient) => (
                          <tr key={patient._id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <div className="font-medium text-gray-900">{patient.personal?.name}</div>
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600">{maskPhone(patient.personal?.phone, userRole)}</td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTechniqueColor(patient.surgery?.technique)}`}>
                                {patient.surgery?.technique}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <MapPin className="w-3 h-3" />
                                {patient.surgery?.location}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="text-sm font-medium text-gray-900">
                                {patient.surgery?.graftsImplanted || 0} / {patient.surgery?.graftsneed || 0}
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                <div
                                  className="bg-green-600 h-1.5 rounded-full"
                                  style={{ width: `${Math.min((patient.surgery?.graftsImplanted / patient.surgery?.graftsneed) * 100, 100)}%` }}
                                ></div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Link
                                href={`/surgery/patients/${patient._id}`}
                                className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                              >
                                View Details
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}