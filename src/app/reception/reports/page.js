"use client";
import { useState, useEffect } from "react";
import ReceptionSidebar from "@/components/Sidebars/ReceptionSidebar";
import {
  Loader2,
  Download,
  Filter,
  Search,
  Calendar,
  FileText,
  Users,
  IndianRupee,
  Activity,
  TrendingUp,
  PieChart,
  BarChart2,
  Star
} from "lucide-react";

export default function ReportsPage() {
  const [activePage, setActivePage] = useState("Reports");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingId, setLoadingId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites] = useState([]);

  const [filters, setFilters] = useState({
    period: "all",
    category: "all",
    startDate: "",
    endDate: "",
    branch: "",
    staffFilter: "",
    techniqueFilter: "",
    statusFilter: "",
    procedureFilter: "",
    paymentTypeFilter: "",
  });

  const [filterOptions, setFilterOptions] = useState({
    staff: [],
    techniques: [],
    status: [],
    branches: ["Delhi", "Mumbai", "Hyderabad", "Noida", "Gurgaon"],
    procedures: ["hair transplant", "prp", "beard transplant", "medicine", "gfc", "Other"],
    paymentTypes: ["Booking", "Pending", "Full-payment", "Other"],
  });

  const reports = [
    {
      id: 1,
      name: "Comprehensive Patient Report",
      description: "Complete patient database with personal, medical, counselling, and surgery details",
      category: "Patient Reports",
      type: "patients-comprehensive",
      icon: Users,
      color: "blue",
    },
    {
      id: 2,
      name: "Patient Demographics Report",
      description: "Patient demographics including age, gender, profession, and location",
      category: "Patient Reports",
      type: "patients-demographics",
      icon: Users,
      color: "blue",
    },
    {
      id: 3,
      name: "Patient Status Pipeline Report",
      description: "Patient distribution across different status stages",
      category: "Patient Reports",
      type: "patients-status",
      icon: Activity,
      color: "green",
    },
    {
      id: 4,
      name: "Medical History Report",
      description: "Patient medical histories, allergies, blood group, and health conditions",
      category: "Patient Reports",
      type: "patients-medical",
      icon: FileText,
      color: "red",
    },

    {
      id: 5,
      name: "Counsellor Performance Report",
      description: "Counsellor conversion rates, packages quoted, and patient readiness metrics",
      category: "Staff Reports",
      type: "counsellors",
      icon: TrendingUp,
      color: "purple",
    },
    {
      id: 6,
      name: "Agent Referral Report",
      description: "Agent referral performance and patient acquisition metrics",
      category: "Staff Reports",
      type: "agents",
      icon: Users,
      color: "indigo",
    },
    {
      id: 7,
      name: "Doctor Performance Report",
      description: "Doctor surgery count, techniques performed, and patient outcomes",
      category: "Staff Reports",
      type: "doctors",
      icon: Activity,
      color: "blue",
    },
    {
      id: 8,
      name: "Implanter Efficiency Report",
      description: "Implanter grafts implanted, surgery efficiency, and performance metrics",
      category: "Staff Reports",
      type: "implanters",
      icon: BarChart2,
      color: "teal",
    },
    {
      id: 9,
      name: "Technician Workload Report",
      description: "Technician procedure count and workload distribution",
      category: "Staff Reports",
      type: "technicians",
      icon: Activity,
      color: "cyan",
    },

    {
      id: 10,
      name: "Surgical Technique Analysis",
      description: "Analysis of surgical techniques (FUE, TURKISH DHI, INDIAN DHI, HYBRID) with success rates",
      category: "Medical Reports",
      type: "techniques",
      icon: PieChart,
      color: "purple",
    },
    {
      id: 11,
      name: "Surgery Schedule Report",
      description: "Upcoming and completed surgeries with details",
      category: "Medical Reports",
      type: "surgery-schedule",
      icon: Calendar,
      color: "orange",
    },
    {
      id: 12,
      name: "Grafts Analysis Report",
      description: "Grafts suggested vs implanted comparison and analysis",
      category: "Medical Reports",
      type: "grafts-analysis",
      icon: BarChart2,
      color: "green",
    },
    {
      id: 13,
      name: "Counselling Outcomes Report",
      description: "Counselling success rates and surgery readiness metrics",
      category: "Medical Reports",
      type: "counselling-outcomes",
      icon: TrendingUp,
      color: "blue",
    },

    {
      id: 14,
      name: "Revenue Report",
      description: "Complete revenue analysis from all procedures and transactions",
      category: "Financial Reports",
      type: "revenue",
      icon: IndianRupee,
      color: "green",
    },
    {
      id: 15,
      name: "Expenses Report",
      description: "All business expenses and cost analysis",
      category: "Financial Reports",
      type: "expenses",
      icon: IndianRupee,
      color: "red",
    },
    {
      id: 16,
      name: "Transaction History Report",
      description: "Detailed transaction history with payment methods and types",
      category: "Financial Reports",
      type: "transactions",
      icon: FileText,
      color: "blue",
    },
    {
      id: 17,
      name: "Outstanding Payments Report",
      description: "Patients with pending payments and outstanding amounts",
      category: "Financial Reports",
      type: "outstanding-payments",
      icon: IndianRupee,
      color: "orange",
    },
    {
      id: 18,
      name: "Payment Collection Report",
      description: "Payment collection efficiency by branch and staff",
      category: "Financial Reports",
      type: "payment-collection",
      icon: TrendingUp,
      color: "purple",
    },
    {
      id: 19,
      name: "Procedure-wise Revenue Report",
      description: "Revenue breakdown by procedure type",
      category: "Financial Reports",
      type: "procedure-revenue",
      icon: PieChart,
      color: "indigo",
    },

    {
      id: 20,
      name: "Branch Performance Comparison",
      description: "Comparative analysis of all branches",
      category: "Branch Reports",
      type: "branch-comparison",
      icon: BarChart2,
      color: "blue",
    },
    {
      id: 21,
      name: "Branch Revenue Report",
      description: "Revenue analysis by branch location",
      category: "Branch Reports",
      type: "branch-revenue",
      icon: IndianRupee,
      color: "green",
    },
    {
      id: 22,
      name: "Branch Patient Volume Report",
      description: "Patient volume and conversion rates by branch",
      category: "Branch Reports",
      type: "branch-patients",
      icon: Users,
      color: "purple",
    },
  ];

  const categories = [
    "all",
    ...new Set(reports.map((report) => report.category)),
  ];

  useEffect(() => {
    fetchFilterOptions();
    loadFavorites();
  }, []);

  const fetchFilterOptions = async () => {
    try {
      const response = await fetch("/api/admin/reports/filters");
      const result = await response.json();

      if (result.success) {
        setFilterOptions((prev) => ({
          ...prev,
          staff: result.data.staff || [],
          techniques: result.data.techniques || [],
          status: result.data.status || [],
        }));
      }
    } catch (error) {
      console.error("Error fetching filter options:", error);
    }
  };

  const loadFavorites = () => {
    const saved = localStorage.getItem("favoriteReports");
    if (saved) {
      setFavorites(JSON.parse(saved));
    }
  };

  const toggleFavorite = (reportId) => {
    const newFavorites = favorites.includes(reportId)
      ? favorites.filter((id) => id !== reportId)
      : [...favorites, reportId];

    setFavorites(newFavorites);
    localStorage.setItem("favoriteReports", JSON.stringify(newFavorites));
  };

  const filteredReports = reports.filter((report) => {
    const matchesSearch =
      report.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      filters.category === "all" || report.category === filters.category;

    return matchesSearch && matchesCategory;
  });

  const downloadExcel = async (reportType, reportId, reportName) => {
    setLoadingId(reportId);

    try {
      const params = new URLSearchParams({
        type: reportType,
        period: filters.period,
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
        ...(filters.branch && { branch: filters.branch }),
        ...(filters.staffFilter && { staffFilter: filters.staffFilter }),
        ...(filters.techniqueFilter && { techniqueFilter: filters.techniqueFilter }),
        ...(filters.statusFilter && { statusFilter: filters.statusFilter }),
        ...(filters.procedureFilter && { procedureFilter: filters.procedureFilter }),
        ...(filters.paymentTypeFilter && { paymentTypeFilter: filters.paymentTypeFilter }),
      });

      const response = await fetch(`/api/admin/reports?${params}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message);
      }

      const { utils, writeFile } = await import("xlsx");
      const wb = utils.book_new();
      const ws = utils.json_to_sheet(result.data);

      const maxWidth = 50;
      const colWidths = Object.keys(result.data[0] || {}).map(key => ({
        wch: Math.min(Math.max(key.length, 10), maxWidth)
      }));
      ws['!cols'] = colWidths;

      utils.book_append_sheet(wb, ws, "Report");

      const fileName = `${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split("T")[0]}.xlsx`;
      writeFile(wb, fileName);

      alert(`Report downloaded successfully: ${fileName}`);
    } catch (error) {
      console.error("Download error:", error);
      alert("Error: " + error.message);
    } finally {
      setLoadingId(null);
    }
  };

  const clearFilters = () => {
    setFilters({
      period: "all",
      category: "all",
      startDate: "",
      endDate: "",
      branch: "",
      staffFilter: "",
      techniqueFilter: "",
      statusFilter: "",
      procedureFilter: "",
      paymentTypeFilter: "",
    });
  };

  const showDateRange = filters.period === "custom";

  return (
    <div className="flex min-h-screen bg-gray-50">
      <ReceptionSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activePage={activePage}
        setActivePage={setActivePage}
      />

      <div className="flex-1 p-8 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 mb-2">
              Reports Dashboard
            </h1>
            <p className="text-gray-600">
              Generate and download comprehensive reports for your clinic
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">All Reports</h2>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  {filteredReports.length} report{filteredReports.length !== 1 ? "s" : ""} found
                </span>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    showFilters
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  Filters
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search reports..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-transparent"
                />
              </div>

              <select
                value={filters.category}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    category: e.target.value,
                  }))
                }
                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-transparent"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category === "all" ? "All Categories" : category}
                  </option>
                ))}
              </select>

              <select
                value={filters.period}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, period: e.target.value }))
                }
                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-transparent"
              >
                <option value="all">All Time</option>
                <option value="daily">Today</option>
                <option value="weekly">This Week</option>
                <option value="monthly">This Month</option>
                <option value="custom">Custom Range</option>
              </select>

              <button
                onClick={clearFilters}
                className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
              >
                Clear Filters
              </button>
            </div>

            {showDateRange && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        startDate: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        endDate: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                  />
                </div>
              </div>
            )}

            {showFilters && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Advanced Filters
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Branch
                    </label>
                    <select
                      value={filters.branch}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          branch: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                    >
                      <option value="">All Branches</option>
                      {filterOptions.branches.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Staff Member
                    </label>
                    <select
                      value={filters.staffFilter}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          staffFilter: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                    >
                      <option value="">All Staff</option>
                      {filterOptions.staff.map((staff) => (
                        <option key={staff} value={staff}>
                          {staff}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Surgical Technique
                    </label>
                    <select
                      value={filters.techniqueFilter}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          techniqueFilter: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                    >
                      <option value="">All Techniques</option>
                      {filterOptions.techniques.map((technique) => (
                        <option key={technique} value={technique}>
                          {technique}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Patient Status
                    </label>
                    <select
                      value={filters.statusFilter}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          statusFilter: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                    >
                      <option value="">All Status</option>
                      {filterOptions.status.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Procedure Type
                    </label>
                    <select
                      value={filters.procedureFilter}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          procedureFilter: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                    >
                      <option value="">All Procedures</option>
                      {filterOptions.procedures.map((procedure) => (
                        <option key={procedure} value={procedure}>
                          {procedure}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Payment Type
                    </label>
                    <select
                      value={filters.paymentTypeFilter}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          paymentTypeFilter: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                    >
                      <option value="">All Payment Types</option>
                      {filterOptions.paymentTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {filteredReports.length > 0 ? (
              <ul className="divide-y divide-gray-100">
                {filteredReports.map((report) => {
                  const Icon = report.icon;
                  const isFavorite = favorites.includes(report.id);
                  const busy = loadingId === report.id;
                  return (
                    <li key={report.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5 transition-colors duration-150 hover:bg-gray-50/70">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gray-200 text-gray-500">
                          <Icon className="w-4 h-4" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2">
                            <h3 className="text-sm font-medium text-gray-900">{report.name}</h3>
                            <span className="text-xs text-gray-400">{report.category}</span>
                          </div>
                          <p className="mt-0.5 text-[13px] leading-5 text-gray-500 line-clamp-2">{report.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 pl-11 sm:pl-0 shrink-0">
                        <button
                          type="button"
                          aria-label={isFavorite ? `Remove ${report.name} from favorites` : `Add ${report.name} to favorites`}
                          aria-pressed={isFavorite}
                          onClick={() => toggleFavorite(report.id)}
                          className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${isFavorite ? "text-amber-500 hover:bg-amber-50" : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"}`}
                        >
                          <Star className={`w-4 h-4 ${isFavorite ? "fill-amber-400" : ""}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadExcel(report.type, report.id, report.name)}
                          disabled={busy}
                          className="press inline-flex items-center justify-center gap-1.5 h-8 min-w-[7.5rem] px-3 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition-colors"
                        >
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-gray-500" />}
                          {busy ? "Generating…" : "Download"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-center py-16">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No reports found
                </h3>
                <p className="text-gray-600 mb-6">
                  Try adjusting your search or filters
                </p>
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Clear All Filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}