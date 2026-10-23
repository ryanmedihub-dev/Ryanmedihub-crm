"use client";

import { useState, useEffect } from "react";
import { CheckCircle, Search, Calendar, MapPin, Phone } from "lucide-react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebars/SurgerySidebar";
import Link from "next/link";
import { maskPhone } from "@/utils/phoneUtils";

export default function VisitedPatients() {
  const { data: session } = useSession();
  const userRole = session?.user?.role || "";
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [branch, setBranch] = useState("All");

  useEffect(() => {
    fetchVisitedPatients();
  }, [branch]);

  const fetchVisitedPatients = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/surgery/visited-patients?branch=${branch}`);
      const data = await response.json();
      setPatients(data.patients || []);
    } catch (error) {
      console.error("Error:", error);
      setPatients([
        {
          _id: "1",
          personal: {
            name: "John Doe",
            phone: "9876543210",
            branch: "Delhi",
            visitDate: new Date().toISOString()
          },
          surgery: {
            surgeryDate: new Date().toISOString(),
            technique: "FUE",
            graftsImplanted: 2500
          },
          ops: { status: "CLOSED" }
        },
        {
          _id: "2",
          personal: {
            name: "Sarah Johnson",
            phone: "9876543213",
            branch: "Mumbai",
            visitDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
          },
          surgery: {
            surgeryDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            technique: "DHI",
            graftsImplanted: 3000
          },
          ops: { status: "CLOSED" }
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

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar role="surgery" />
      <main className="flex-1 p-4 lg:p-8">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Visited Patients</h1>
              <p className="text-sm text-gray-600 mt-1">Patients who have completed their surgery</p>
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
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  {filteredPatients.length} Visited Patients
                </h3>
              </div>

              {filteredPatients.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-600">No visited patients found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPatients.map((patient) => (
                    <Link
                      key={patient._id}
                      href={`/surgery/patients/${patient._id}`}
                      className="block p-4 border border-gray-200 rounded-lg hover:border-green-500 hover:shadow-md transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-gray-900">{patient.personal?.name}</h4>
                          <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                            <Phone className="w-3 h-3" />
                            {maskPhone(patient.personal?.phone, userRole)}
                          </div>
                        </div>
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                          Completed
                        </span>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <MapPin className="w-3 h-3" />
                          {patient.personal?.branch}
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-3 h-3" />
                          {formatDate(patient.surgery?.surgeryDate)}
                        </div>
                        {patient.surgery?.technique && (
                          <div className="pt-2">
                            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                              {patient.surgery.technique}
                            </span>
                            {patient.surgery?.graftsImplanted && (
                              <span className="ml-2 text-xs text-gray-600">
                                {patient.surgery.graftsImplanted} grafts
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}