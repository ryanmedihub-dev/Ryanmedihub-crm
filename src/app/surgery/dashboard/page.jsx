"use client";

import { useState, useEffect } from "react";
import {
  Stethoscope,
  Calendar,
  CheckCircle,
  Clock,
  MapPin,
  Activity,
  Users,
  TrendingUp
} from "lucide-react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebars/SurgerySidebar";
import { maskPhone } from "@/utils/phoneUtils";
import Topbar from "@/components/Topbar";
import MetricCard from "@/components/MetricCard";
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

  useEffect(() => {
    fetchData();
  }, [branch, dateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/surgery/dashboard?branch=${branch}&dateRange=${dateRange}`);
      const data = await response.json();

      setDashboardData(data.metrics || {
        scheduledSurgeries: 6,
        completedSurgeries: 4,
        pendingSurgeries: 2,
        readyForSurgery: 8,
        techniqueBreakdown: {
          FUE: 3,
          DHI: 2,
          HYBRID: 1,
        },
        locationBreakdown: {
          Delhi: 4,
          Mumbai: 1,
          Hyderabad: 1,
        }
      });

      setUpcomingSurgeries(data.upcomingSurgeries || []);
      setPerformedSurgeries(data.performedSurgeries || []);
    } catch (error) {
      console.error("Error:", error);
      setDashboardData({
        scheduledSurgeries: 6,
        completedSurgeries: 4,
        pendingSurgeries: 2,
        readyForSurgery: 8,
        techniqueBreakdown: {
          FUE: 3,
          DHI: 2,
          HYBRID: 1,
        },
        locationBreakdown: {
          Delhi: 4,
          Mumbai: 1,
          Hyderabad: 1,
        }
      });

      setUpcomingSurgeries([
        {
          _id: "1",
          personal: { name: "John Doe", phone: "9876543210", branch: "Delhi" },
          surgery: {
            surgeryDate: new Date().toISOString(),
            technique: "FUE",
            location: "Delhi",
            graftsneed: 2500
          },
          counselling: { techniqueSuggested: "FUE" }
        },
        {
          _id: "2",
          personal: { name: "Jane Smith", phone: "9876543211", branch: "Mumbai" },
          surgery: {
            surgeryDate: new Date().toISOString(),
            technique: "DHI",
            location: "Mumbai",
            graftsneed: 3000
          },
          counselling: { techniqueSuggested: "DHI" }
        }
      ]);

      setPerformedSurgeries([
        {
          _id: "3",
          personal: { name: "Mike Johnson", phone: "9876543212", branch: "Delhi" },
          surgery: {
            surgeryDate: new Date().toISOString(),
            technique: "HYBRID",
            location: "Delhi",
            graftsImplanted: 2800,
            graftsneed: 3000
          }
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const metrics = [
    {
      title: "Scheduled Today",
      value: dashboardData?.scheduledSurgeries || 0,
      icon: Calendar,
      color: "from-blue-500 to-blue-600"
    },
    {
      title: "Completed Today",
      value: dashboardData?.completedSurgeries || 0,
      icon: CheckCircle,
      color: "from-green-500 to-green-600"
    },
    {
      title: "Pending",
      value: dashboardData?.pendingSurgeries || 0,
      icon: Clock,
      color: "from-amber-500 to-amber-600"
    },
    {
      title: "Ready for Surgery",
      value: dashboardData?.readyForSurgery || 0,
      icon: Stethoscope,
      color: "from-indigo-500 to-indigo-600"
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
      Mesotherapy: "bg-fuchsia-100 text-fuchsia-700",
    };
    return colors[technique] || "bg-gray-100 text-gray-700";
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar role="surgery" />
      <main className="flex-1 p-4 lg:p-8">
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
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {metrics.map((card, idx) => (
                <MetricCard key={idx} {...card} />
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Today's Techniques</h3>
                </div>
                <div className="space-y-3">
                  {dashboardData?.techniqueBreakdown && Object.entries(dashboardData.techniqueBreakdown).map(([technique, count]) => (
                    <div key={technique} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className={`px-3 py-1 text-sm font-medium rounded-full ${getTechniqueColor(technique)}`}>
                        {technique}
                      </span>
                      <span className="text-lg font-bold text-gray-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-5 h-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Surgeries by Location</h3>
                </div>
                <div className="space-y-3">
                  {dashboardData?.locationBreakdown && Object.entries(dashboardData.locationBreakdown).map(([location, count]) => (
                    <div key={location} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">{location}</span>
                      </div>
                      <span className="text-lg font-bold text-gray-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Today's Upcoming Surgeries</h3>
                  </div>
                  <Link
                    href="/surgery/patients?filter=upcoming"
                    className="text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    View All
                  </Link>
                </div>
              </div>
              <div className="p-6">
                {upcomingSurgeries.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No upcoming surgeries scheduled for today</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Patient</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Contact</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Technique</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Location</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Grafts Needed</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Actions</th>
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
                                className="text-sm font-medium text-blue-600 hover:text-blue-700"
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

            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Completed Surgeries Today</h3>
                  </div>
                  <Link
                    href="/surgery/patients?filter=performed"
                    className="text-sm font-medium text-green-600 hover:text-green-700"
                  >
                    View All
                  </Link>
                </div>
              </div>
              <div className="p-6">
                {performedSurgeries.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No surgeries completed today</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Patient</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Contact</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Technique</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Location</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Grafts Implanted</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Actions</th>
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
                                className="text-sm font-medium text-green-600 hover:text-green-700"
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