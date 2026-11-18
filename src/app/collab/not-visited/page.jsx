"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { maskPhone } from "@/utils/phoneUtils";
import { UserX, Search, Filter, ChevronRight } from "lucide-react";
import { Button, EmptyState, Input, Page, PageHeader, Panel, Select, Skeleton } from "@/components/ui";
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
      <div className="flex min-h-screen bg-gray-50">
        <CollabSidebar />
        <Page>
          <PageHeader title="Not Visited Patients" description="Patients who haven't been counselled yet" />
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-6 px-4 h-12">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-20 ml-auto" />
              </div>
            ))}
          </div>
        </Page>
      </div>
    );
  }

  const filtersActive = searchQuery || branchFilter !== "all";

  return (
    <div className="flex min-h-screen bg-gray-50">
      <CollabSidebar />

      <Page>
        <PageHeader title="Not Visited Patients" description="Patients who haven't been counselled yet" />

        <Panel flush>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 border-b border-gray-100">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden />
              <Input
                type="search"
                aria-label="Search by name or phone"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or phone…"
                className="pl-9"
              />
            </div>
            <Select
              aria-label="Branch"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="sm:w-48"
            >
              <option value="all">All branches</option>
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
            </Select>
            <p className="sm:ml-auto text-xs text-gray-500 tabular-nums">
              {filteredPatients.length} of {patients.length} patients
            </p>
            {filtersActive && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearchQuery("");
                  setBranchFilter("all");
                }}
              >
                Reset
              </Button>
            )}
          </div>

          {filteredPatients.length > 0 ? (
            <div className="relative overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50/80 border-b border-gray-200">
                  <tr>
                    <th scope="col" className="px-4 h-9 text-left text-xs font-medium text-gray-500">Patient</th>
                    <th scope="col" className="px-4 h-9 text-left text-xs font-medium text-gray-500">Phone</th>
                    <th scope="col" className="px-4 h-9 text-left text-xs font-medium text-gray-500">Branch</th>
                    <th scope="col" className="px-4 h-9 text-left text-xs font-medium text-gray-500">Visit date</th>
                    <th scope="col" className="px-4 h-9 text-left text-xs font-medium text-gray-500">Added</th>
                    <th scope="col" className="px-4 h-9"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPatients.map((patient) => (
                    <tr
                      key={patient._id}
                      onClick={() => handlePatientClick(patient._id)}
                      className="group cursor-pointer hover:bg-gray-50/70 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handlePatientClick(patient._id); }}
                          className="flex items-center gap-2.5 text-left rounded"
                        >
                          <span className="w-7 h-7 shrink-0 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold">
                            {patient.personal?.name?.charAt(0).toUpperCase() || "?"}
                          </span>
                          <span className="font-medium text-gray-900">{patient.personal?.name || "Unknown"}</span>
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap tabular-nums">
                        {maskPhone(patient.personal?.phone, userRole) || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{patient.personal?.branch || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap tabular-nums">
                        {patient.personal?.visitDate ? new Date(patient.personal.visitDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap tabular-nums">
                        {patient.createdAt ? new Date(patient.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <ChevronRight className="inline w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" aria-hidden />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={UserX}
              title={filtersActive ? "No matching patients" : "Everyone has been seen"}
              description={filtersActive ? "Try a different search or branch." : "All scheduled patients have been counselled."}
            />
          )}
        </Panel>
      </Page>
    </div>
  );
}
