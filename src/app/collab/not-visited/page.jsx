"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { maskPhone } from "@/utils/phoneUtils";
import {
  UserX,
  Phone,
  Calendar,
  MapPin,
  Search,
  Filter,
} from "lucide-react";
import CollabSidebar from "@/components/Sidebars/CollabSidebar";
import { useToast } from "@/components/Toast";

export default function NotVisited() {
  const router = useRouter();
  const toast = useToast();
  const { data: session } = useSession();
  const userRole = session?.user?.role || "";
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState([]);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");

  useEffect(() => {
    fetchNotVisitedPatients();
  }, []);

  useEffect(() => {
    filterPatients();
  }, [patients, searchQuery, branchFilter]);

  const fetchNotVisitedPatients = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/collab/not-visited");

      if (!res.ok) throw new Error("Failed to fetch patients");

      const data = await res.json();
      setPatients(data.patients || []);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to load patients");
    } finally {
      setLoading(false);
    }
  };

  const filterPatients = () => {
    let filtered = [...patients];

    if (searchQuery.trim()) {
      filtered = filtered.filter(
        (patient) =>
          patient.personal?.name
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          patient.personal?.phone?.includes(searchQuery)
      );
    }

    if (branchFilter !== "all") {
      filtered = filtered.filter(
        (patient) => patient.personal?.branch === branchFilter
      );
    }

    setFilteredPatients(filtered);
  };

  const handlePatientClick = (patientId) => {
    router.push(`/collab/patients/${patientId}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <CollabSidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <CollabSidebar />

      <main className="flex-1 p-4 lg:p-8">
        <div className="mb-6">
          <div className=" mb-2">
            <h1 className="text-2xl font-bold text-gray-900">Not Visited Patients</h1>
          </div>
          <p className="text-gray-600">
            Patients who haven't been counselled yet
          </p>
        </div>

        <div className="rounded-xl mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or phone..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>

            <div className="w-full md:w-64">
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="all">All Branches</option>
                <option value="Patna">Patna</option>
                <option value="Gujarat">Gujarat</option>
                <option value="Kolkata">Kolkata</option>
                <option value="Ahmedabad">Ahmedabad</option>
                <option value="Jaipur">Jaipur</option>
                <option value="Bengaluru">Bengaluru</option>
                <option value="Pune">Pune</option>
                <option value="Lucknow">Lucknow</option>
                <option value="Chennai">Chennai</option>
                <option value="Jammu">Jammu</option>
                <option value="Kashmir">Kashmir</option>
                <option value="Ranchi">Ranchi</option>
                <option value="Prayagraj">Prayagraj</option>
                <option value="Chandigarh">Chandigarh</option>
                <option value="Jalandhar">Jalandhar</option>
                <option value="Indore">Indore</option>
                <option value="Bhopal">Bhopal</option>
                <option value="Nagpur">Nagpur</option>
                <option value="Dehradun">Dehradun</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing <span className="font-semibold">{filteredPatients.length}</span>{" "}
              of <span className="font-semibold">{patients.length}</span> patients
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setBranchFilter("all");
              }}
              className="text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {filteredPatients.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPatients.map((patient) => (
              <div
                key={patient._id}
                onClick={() => handlePatientClick(patient._id)}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-amber-200 transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-full bg-linear-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                    <span className="text-white font-bold text-lg">
                      {patient.personal?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                    Not Visited
                  </span>
                </div>

                <h3 className="text-lg font-bold text-gray-900 mb-3 group-hover:text-amber-600 transition-colors">
                  {patient.personal?.name}
                </h3>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="w-4 h-4" />
                    <span>{maskPhone(patient.personal?.phone, userRole) || "N/A"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4" />
                    <span>{patient.personal?.branch || "N/A"}</span>
                  </div>
                  {patient.personal?.visitDate && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>
                        Visit: {new Date(patient.personal.visitDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    Added {new Date(patient.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-linear-to-br from-amber-100 to-orange-100 flex items-center justify-center mx-auto mb-4">
              <UserX className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchQuery || branchFilter !== "all"
                ? "No Matching Patients"
                : "All Patients Visited!"}
            </h3>
            <p className="text-gray-600">
              {searchQuery || branchFilter !== "all"
                ? "Try adjusting your search filters"
                : "Great job! All scheduled patients have been counselled"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}