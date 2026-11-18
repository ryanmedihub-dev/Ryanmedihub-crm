"use client";

import { useState, useEffect } from "react";
import { CheckCircle, Search, ChevronRight } from "lucide-react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebars/SurgerySidebar";
import Link from "next/link";
import { maskPhone } from "@/utils/phoneUtils";
import { Badge, EmptyState, Input, Page, PageHeader, Panel, Select, Spinner } from "@/components/ui";

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
      // Show an honest empty list rather than placeholder rows.
      setPatients([]);
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
      <Page>
        <PageHeader title="Visited Patients" description="Patients who have completed their surgery" />

        <Panel flush>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 border-b border-gray-100">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden />
              <Input
                type="search"
                aria-label="Search by name or phone"
                placeholder="Search by name or phone…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select aria-label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} className="sm:w-48">
              <option value="All">All branches</option>
              <option value="Delhi">Delhi</option>
              <option value="Mumbai">Mumbai</option>
              <option value="Hyderabad">Hyderabad</option>
              <option value="Noida">Noida</option>
              <option value="Gurgaon">Gurgaon</option>
            </Select>
            {!loading && (
              <p className="sm:ml-auto text-xs text-gray-500 tabular-nums">{filteredPatients.length} patients</p>
            )}
          </div>

          {loading ? (
            <Spinner label="Loading patients…" />
          ) : filteredPatients.length === 0 ? (
            <EmptyState icon={CheckCircle} title="No visited patients found" description={searchTerm ? "Try a different search." : undefined} />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50/80 border-b border-gray-200">
                  <tr>
                    <th scope="col" className="px-4 h-9 text-left text-xs font-medium text-gray-500">Patient</th>
                    <th scope="col" className="px-4 h-9 text-left text-xs font-medium text-gray-500">Phone</th>
                    <th scope="col" className="px-4 h-9 text-left text-xs font-medium text-gray-500">Branch</th>
                    <th scope="col" className="px-4 h-9 text-left text-xs font-medium text-gray-500">Surgery date</th>
                    <th scope="col" className="px-4 h-9 text-left text-xs font-medium text-gray-500">Technique</th>
                    <th scope="col" className="px-4 h-9 text-right text-xs font-medium text-gray-500">Grafts</th>
                    <th scope="col" className="px-4 h-9"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPatients.map((patient) => (
                    <tr key={patient._id} className="group hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/surgery/patients/${patient._id}`} className="font-medium text-gray-900 hover:text-indigo-700 rounded">
                          {patient.personal?.name || "Unknown"}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap tabular-nums">{maskPhone(patient.personal?.phone, userRole) || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-600">{patient.personal?.branch || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap tabular-nums">{formatDate(patient.surgery?.surgeryDate)}</td>
                      <td className="px-4 py-2.5">{patient.surgery?.technique ? <Badge tone="blue">{patient.surgery.technique}</Badge> : <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-2.5 text-right text-gray-900 tabular-nums">{patient.surgery?.graftsImplanted ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Link href={`/surgery/patients/${patient._id}`} aria-label={`Open ${patient.personal?.name || "patient"}`} className="inline-flex p-1 rounded text-gray-300 group-hover:text-gray-500">
                          <ChevronRight className="w-4 h-4" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </Page>
    </div>
  );
}
