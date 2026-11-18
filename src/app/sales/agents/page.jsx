"use client";

import { useState, useEffect } from "react";
import {
  Trophy,
  ChevronDown,
  ChevronUp,
  Search,
  Users,
  TrendingUp,
  IndianRupee,
  Calendar,
  Filter,
  Phone,
  Mail,
  Eye,
  EyeOff,
  UserCheck,
  UserPlus,
  Target,
  BarChart3,
} from "lucide-react";
import SalesSidebar from "@/components/Sidebars/SalesSidebar";
import { byName } from "@/lib/sortOptions";
import { motion, AnimatePresence } from "framer-motion";

export default function AgentDashboard() {
  const [activePage, setActivePage] = useState("Agents");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState("week");
  const [sortOrder, setSortOrder] = useState("desc");
  const [sortBy, setSortBy] = useState("revenue");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [agentsData, setAgentsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const [minRevenue, setMinRevenue] = useState("");
  const [minPatients, setMinPatients] = useState("");
  const [minConversion, setMinConversion] = useState("");
  const [selectedTechnique, setSelectedTechnique] = useState("all");

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/sales/agents`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        if (data.success) {
          setAgentsData(data.data || []);
        } else {
          throw new Error("API returned unsuccessful response");
        }
      } catch (err) {
        setError(err.message);
        console.error("Error fetching agents:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();
  }, [timeFilter]);

  const allTechniques = Array.from(
    new Set(
      agentsData.flatMap((agent) =>
        agent.techniques ? Object.keys(agent.techniques) : []
      )
    )
  ).sort(byName);

  const filteredAgents = agentsData
    .filter((agent) => {
      const matchesSearch = agent.name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase());

      const matchesRevenue = minRevenue
        ? agent.totalRevenue >= parseFloat(minRevenue)
        : true;

      const matchesPatients = minPatients
        ? agent.totalPatients >= parseInt(minPatients)
        : true;

      const matchesConversion = minConversion
        ? agent.conversionRate >= parseFloat(minConversion)
        : true;

      const matchesTechnique =
        selectedTechnique === "all" || !selectedTechnique
          ? true
          : agent.techniques && agent.techniques[selectedTechnique];

      return (
        matchesSearch &&
        matchesRevenue &&
        matchesPatients &&
        matchesConversion &&
        matchesTechnique
      );
    })
    .sort((a, b) => {
      let compareValue;
      switch (sortBy) {
        case "patients":
          compareValue = a.totalPatients - b.totalPatients;
          break;
        case "visited":
          compareValue = a.visitedPatients - b.visitedPatients;
          break;
        case "readyForSurgery":
          compareValue = a.readyForSurgery - b.readyForSurgery;
          break;
        case "conversionRate":
          compareValue = a.conversionRate - b.conversionRate;
          break;
        case "avgRevenue":
          compareValue = a.avgRevenue - b.avgRevenue;
          break;
        case "revenue":
        default:
          compareValue = a.totalRevenue - b.totalRevenue;
          break;
      }
      return sortOrder === "asc" ? compareValue : -compareValue;
    });

  const totalRevenue = filteredAgents.reduce(
    (sum, agent) => sum + agent.totalRevenue,
    0
  );
  const totalPatients = filteredAgents.reduce(
    (sum, agent) => sum + agent.totalPatients,
    0
  );
  const totalVisited = filteredAgents.reduce(
    (sum, agent) => sum + agent.visitedPatients,
    0
  );
  const totalReadyForSurgery = filteredAgents.reduce(
    (sum, agent) => sum + agent.readyForSurgery,
    0
  );
  const avgConversionRate = filteredAgents.length > 0
    ? filteredAgents.reduce((sum, agent) => sum + agent.conversionRate, 0) / filteredAgents.length
    : 0;

  const formatCurrency = (amount = 0) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);

  const formatPercentage = (value) => `${value.toFixed(1)}%`;

  const toggleAgentDetails = (agentId) => {
    setExpandedAgent(expandedAgent === agentId ? null : agentId);
  };

  const resetFilters = () => {
    setSearchQuery("");
    setMinRevenue("");
    setMinPatients("");
    setMinConversion("");
    setSelectedTechnique("all");
    setSortBy("revenue");
    setSortOrder("desc");
  };


  return (
    <div className="flex min-h-screen bg-gray-50">
      <SalesSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activePage={activePage}
        setActivePage={setActivePage}
      />

      <main className="flex-1 min-w-0 p-4 my-5 lg:p-6">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-gray-900">
                Agent Performance Dashboard
              </h1>
              <p className="text-gray-600 mt-1 mb-4">
                Track all agent performance and sales metrics
              </p>
            </div>
          </div>

          {!loading && !error && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Agents</p>
                    <p className="text-xl font-semibold tracking-tight text-gray-900">
                      {filteredAgents.length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Revenue</p>
                    <p className="text-xl font-semibold tracking-tight text-gray-900">
                      {formatCurrency(totalRevenue)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Patients</p>
                    <p className="text-xl font-semibold tracking-tight text-gray-900">
                      {totalPatients}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Visited</p>
                    <p className="text-xl font-semibold tracking-tight text-gray-900">
                      {totalVisited}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Ready for Surgery</p>
                    <p className="text-xl font-semibold tracking-tight text-gray-900">
                      {totalReadyForSurgery}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search agents by name..."
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500/30 focus:border-transparent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500/30"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="revenue">Sort by Revenue</option>
              <option value="patients">Sort by Patients</option>
              <option value="visited">Sort by Visit</option>
              <option value="readyForSurgery">Sort by Ready for Surgery</option>
              <option value="conversionRate">Sort by Conversion Rate</option>
              <option value="avgRevenue">Sort by Avg Revenue</option>
            </select>

            <button
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              title={sortOrder === "asc" ? "Ascending" : "Descending"}
            >
              {sortOrder === "asc" ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </button>

            <button
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                showFilters
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4" />
              Filters
            </button>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-4 gap-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Revenue (₹)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                    value={minRevenue}
                    onChange={(e) => setMinRevenue(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Patients
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                    value={minPatients}
                    onChange={(e) => setMinPatients(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Conversion Rate (%)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    step="0.1"
                    className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                    value={minConversion}
                    onChange={(e) => setMinConversion(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Technique
                  </label>
                  <select
                    className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                    value={selectedTechnique}
                    onChange={(e) => setSelectedTechnique(e.target.value)}
                  >
                    <option value="all">All Techniques</option>
                    {allTechniques.map((tech) => (
                      <option key={tech} value={tech}>
                        {tech}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-4 flex justify-end">
                  <button
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    onClick={resetFilters}
                  >
                    Reset Filters
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-indigo-500"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 p-4 rounded-xl text-red-700 text-center">
            Error loading data: {error}
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-400 mb-3" />
            <h3 className="text-lg font-medium text-gray-900">
              No agents found
            </h3>
            <p className="text-gray-500 mt-1">
              Try adjusting your filters or search criteria
            </p>
            <button
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              onClick={resetFilters}
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-gray-600">
              Showing {filteredAgents.length} of {agentsData.length} agents
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <div className="min-w-[860px] grid grid-cols-12 gap-4 px-4 h-10 items-center bg-gray-50/80 border-b border-gray-200 font-medium text-gray-500 text-xs">
                <div className="col-span-3">Agent</div>
                <div className="col-span-1 text-right">Patients</div>
                <div className="col-span-1 text-right">Visited</div>
                <div className="col-span-1 text-right">Surgery</div>
                <div className="col-span-2 text-right">Conversion</div>
                <div className="col-span-2 text-right">Revenue</div>
                <div className="col-span-2"><span className="sr-only">Actions</span></div>
              </div>

              <div className="divide-y">
                {filteredAgents.map((agent, idx) => (
                  <div key={agent._id || idx} className="bg-white">
                    <div className="min-w-[860px] grid grid-cols-12 gap-4 px-4 py-2.5 items-center hover:bg-gray-50/70 transition-colors">
                      <div className="col-span-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 shrink-0 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-semibold text-[11px]">
                            {agent.name
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()}
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-gray-900">
                              {agent.name}
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">

                              {agent.phone && (
                                <div className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  <span>{agent.phone}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="col-span-1 text-right">
                        <span className="text-sm text-gray-900 tabular-nums">{agent.totalPatients}</span>
                      </div>

                      <div className="col-span-1 text-right">
                        <span className="text-sm text-gray-900 tabular-nums">{agent.visitedPatients}</span>
                      </div>

                      <div className="col-span-1 text-right">
                        <span className="text-sm text-gray-900 tabular-nums">{agent.readyForSurgery}</span>
                      </div>

                      <div className="col-span-2 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-sm text-gray-900 tabular-nums">{formatPercentage(agent.conversionRate)}</span>
                        </div>
                      </div>

                      <div className="col-span-2 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-medium text-gray-900 tabular-nums">
                            {formatCurrency(agent.totalRevenue)}
                          </span>
                          <span className="text-xs text-gray-500 tabular-nums">
                            Avg: {formatCurrency(agent.avgRevenue)}
                          </span>
                        </div>
                      </div>

                      <div className="col-span-2 flex justify-end">
                        <button
                          onClick={() => toggleAgentDetails(agent._id || idx)}
                          aria-expanded={expandedAgent === (agent._id || idx)}
                          className="press ml-auto inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[13px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                        >
                          {expandedAgent === (agent._id || idx) ? (
                            <>
                              <EyeOff className="h-4 w-4" />
                              Hide
                            </>
                          ) : (
                            <>
                              <Eye className="h-4 w-4" />
                              View
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedAgent === (agent._id || idx) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                          className="bg-gray-50 border-t"
                        >
                          <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                              <div className="bg-white p-4 rounded-lg border border-gray-200">
                                <div className="flex items-center gap-3">
                                  <div>
                                    <p className="text-sm text-gray-600">Performance Score</p>
                                    <p className="text-xl font-semibold text-gray-900 tabular-nums">
                                      {formatPercentage(agent.conversionRate)}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-white p-4 rounded-lg border border-gray-200">
                                <div className="flex items-center gap-3">
                                  <div>
                                    <p className="text-sm text-gray-600">Conversion Ratio</p>
                                    <p className="text-xl font-semibold text-gray-900">
                                      {agent.visitedPatients}/{agent.totalPatients}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-white p-4 rounded-lg border border-gray-200">
                                <div className="flex items-center gap-3">
                                  <div>
                                    <p className="text-sm text-gray-600">Surgery Ready</p>
                                    <p className="text-xl font-semibold text-gray-900">
                                      {agent.readyForSurgery}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-white p-4 rounded-lg border border-gray-200">
                                <div className="flex items-center gap-3">
                                  <div>
                                    <p className="text-sm text-gray-600">Avg Revenue</p>
                                    <p className="text-xl font-semibold text-gray-900">
                                      {formatCurrency(agent.avgRevenue)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {agent.techniques && Object.keys(agent.techniques).length > 0 && (
                              <div className="bg-white p-4 rounded-lg border border-gray-200">
                                <h4 className="font-semibold text-gray-900 mb-3">Techniques Sold</h4>
                                <div className="flex flex-wrap gap-3">
                                  {Object.entries(agent.techniques)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([tech, count]) => (
                                      <div
                                        key={tech}
                                        className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg flex items-center gap-2"
                                      >
                                        <span className="font-semibold">{tech}</span>
                                        <span className="bg-indigo-600 text-white px-2 py-1 rounded-full text-xs">
                                          {count}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}