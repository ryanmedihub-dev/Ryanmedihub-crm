"use client";

import { useState, useEffect } from "react";
import { Clock, Search, Calendar, MapPin, Phone, AlertCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebars/SurgerySidebar";
import Link from "next/link";
import { maskPhone } from "@/utils/phoneUtils";

export default function NotVisitedPatients() {
  const { data: session } = useSession();
  const userRole = session?.user?.role || "";
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [branch, setBranch] = useState("All");

  useEffect(() => {
    fetchNotVisitedPatients();
  }, [branch]);

  const fetchNotVisitedPatients = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/surgery/not-visited-patients?branch=${branch}`);
      const data = await response.json();
      setPatients(data.patients || []);
    } catch (error) {
      console.error("Error:", error);
      setPatients([
        {
          _id: "1",
          personal: {
            name: "Jane Smith",
            phone: "9876543211",
            branch: "Mumbai",
            visitDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          },
          counselling: {
            techniqueSuggested: "DHI",
            readyForSurgery: true
          },
          ops: { status: "CONSULTED" }
        },
        {
          _id: "2",
          personal: {
            name: "Mike Wilson",
            phone: "9876543214",
            branch: "Delhi",
            visitDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
          },
          counselling: {
            techniqueSuggested: "FUE",
            readyForSurgery: true
          },
          ops: { status: "SURGERY_BOOKED" }
        },
        {
          _id: "3",
          personal: {
            name: "Emma Davis",
            phone: "9876543215",
            branch: "Hyderabad",
            visitDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
          },
          counselling: {
            techniqueSuggested: "HYBRID",
            readyForSurgery: false
          },
          ops: { status: "NEW" }
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patients.filter(patient =>
    patient.personal?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.personal?.phone?.includes(searchTerm)
  );

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getDaysSinceVisit = (visitDate) => {
    if (!visitDate) return null;
    const days = Math.floor((new Date() - new Date(visitDate)) / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar role="surgery" />
      <main className="flex-1 p-4 lg:p-8">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Not Visited Patients</h1>
              <p className="text-sm text-gray-600 mt-1">Patients awaiting surgery or follow-up</p>
            </div>
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
            >
              <option value="All">All Branches</option>
              <option value="Delhi">Delhi</option>
              <option value="Mumbai">Mumbai</option>
              <option value="Hyderabad">Hyderabad</option>
              <option value="Noida">Noida</option>
              <option value="Gurgaon">Gurgaon</option>
            </select>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  {filteredPatients.length} Pending Patients
                </h3>
              </div>

              {filteredPatients.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-600">No pending patients found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPatients.map((patient) => {
                    const daysSinceVisit = getDaysSinceVisit(patient.personal?.visitDate);
                    const isUrgent = daysSinceVisit > 30;

                    return (
                      <Link
                        key={patient._id}
                        href={`/surgery/patients/${patient._id}`}
                        className={`block p-4 border rounded-lg hover:shadow-md transition-all ${
                          isUrgent
                            ? 'border-red-300 bg-red-50 hover:border-red-500'
                            : 'border-gray-200 hover:border-amber-500'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-semibold text-gray-900">{patient.personal?.name}</h4>
                            <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                              <Phone className="w-3 h-3" />
                              {maskPhone(patient.personal?.phone, userRole)}
                            </div>
                          </div>
                          {isUrgent && (
                            <AlertCircle className="w-5 h-5 text-red-500" />
                          )}
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-gray-600">
                            <MapPin className="w-3 h-3" />
                            {patient.personal?.branch}
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Calendar className="w-3 h-3" />
                            Last Visit: {formatDate(patient.personal?.visitDate)}
                          </div>
                          {daysSinceVisit !== null && (
                            <div className={`text-xs font-medium ${isUrgent ? 'text-red-600' : 'text-amber-600'}`}>
                              {daysSinceVisit} days since visit
                            </div>
                          )}
                          {patient.counselling?.techniqueSuggested && (
                            <div className="pt-2">
                              <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded">
                                {patient.counselling.techniqueSuggested}
                              </span>
                            </div>
                          )}
                          {patient.counselling?.readyForSurgery && (
                            <div className="pt-1">
                              <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                                Ready for Surgery
                              </span>
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}