"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SuperAdminSidebar from "@/components/Sidebars/SuperAdminSidebar";
import {
  Users,
  Calendar,
  Search,
  X,
  Loader2,
  RefreshCw,
  IndianRupee,
  ListFilter,
  Phone,
} from "lucide-react";

const NODE_STYLE = [
  { match: /^Total Leads/, bar: "#475569", chip: "bg-slate-100 text-slate-700", border: "border-slate-300" },
  { match: /Not Attempted/, bar: "#9ca3af", chip: "bg-gray-100 text-gray-600", border: "border-gray-300" },
  { match: /^Attempted/, bar: "#3b82f6", chip: "bg-blue-100 text-blue-700", border: "border-blue-300" },
  { match: /Not Connected/, bar: "#f87171", chip: "bg-red-100 text-red-600", border: "border-red-300" },
  { match: /^Connected/, bar: "#10b981", chip: "bg-emerald-100 text-emerald-700", border: "border-emerald-300" },
  { match: /^Interested/, bar: "#14b8a6", chip: "bg-teal-100 text-teal-700", border: "border-teal-300" },
  { match: /Not Interested/, bar: "#f43f5e", chip: "bg-rose-100 text-rose-700", border: "border-rose-300" },
  { match: /Follow Up/, bar: "#f59e0b", chip: "bg-amber-100 text-amber-700", border: "border-amber-300" },
  { match: /Checked Against/, bar: "#06b6d4", chip: "bg-cyan-100 text-cyan-700", border: "border-cyan-300" },
  { match: /^Not Visited/, bar: "#fb923c", chip: "bg-orange-100 text-orange-700", border: "border-orange-300" },
  { match: /^Visited/, bar: "#6366f1", chip: "bg-indigo-100 text-indigo-700", border: "border-indigo-300" },
  { match: /Not Converted/, bar: "#ec4899", chip: "bg-pink-100 text-pink-700", border: "border-pink-300" },
  { match: /^Converted/, bar: "#22c55e", chip: "bg-green-100 text-green-700", border: "border-green-300" },
  { match: /Booking Done/, bar: "#8b5cf6", chip: "bg-violet-100 text-violet-700", border: "border-violet-300" },
  { match: /Surgery Booked/, bar: "#d946ef", chip: "bg-fuchsia-100 text-fuchsia-700", border: "border-fuchsia-300" },
];

function styleFor(label) {
  return NODE_STYLE.find((s) => s.match.test(label)) || NODE_STYLE[0];
}

function formatINR(n) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
}

function CountUp({ value }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const duration = 500;
    const from = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setDisplay(Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{display}</>;
}

function OrgChartStyles() {
  return (
    <style>{`
      .org-tree, .org-tree ul {
        display: flex;
        justify-content: center;
        padding-top: 18px;
        position: relative;
      }
      .org-tree { padding-top: 0; }
      .org-tree ul { margin: 0; padding-left: 0; }
      .org-tree li {
        list-style: none;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 18px 6px 0 6px;
      }
      .org-tree > li { padding-top: 0; }
      .org-tree li::before,
      .org-tree li::after {
        content: "";
        position: absolute;
        top: 0;
        right: 50%;
        width: 50%;
        height: 18px;
        border-top: 2px solid #cbd5e1;
      }
      .org-tree li::after {
        right: auto;
        left: 50%;
        border-left: 2px solid #cbd5e1;
      }
      .org-tree > li::before,
      .org-tree > li::after { display: none; }
      .org-tree li:only-child::before,
      .org-tree li:only-child::after { display: none; }
      .org-tree li:only-child { padding-top: 0; }
      .org-tree li:first-child::before,
      .org-tree li:last-child::after { border: 0 none; }
      .org-tree li:last-child::before {
        border-right: 2px solid #cbd5e1;
        border-radius: 0 6px 0 0;
      }
      .org-tree li:first-child::after {
        border-radius: 6px 0 0 0;
      }
      .org-tree li:only-child::after,
      .org-tree li:only-child::before { border: 0 none; }
      .org-tree ul::before {
        content: "";
        position: absolute;
        top: 0;
        left: 50%;
        width: 0;
        height: 18px;
        border-left: 2px solid #cbd5e1;
      }
    `}</style>
  );
}

function NodeBox({ node, parentCount, onSelectLeads }) {
  const style = styleFor(node.label);
  const pct = parentCount ? Math.round((node.count / parentCount) * 100) : 100;

  return (
    <motion.button
      onClick={() => onSelectLeads(node)}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.03 }}
      transition={{ duration: 0.25 }}
      className={`relative w-[128px] rounded-lg border bg-white p-1.5 shadow-sm hover:shadow-md text-left ${style.border}`}
      style={{ borderTopWidth: 3, borderTopColor: style.bar }}
    >
      <p className="text-[10.5px] font-semibold text-gray-700 leading-tight line-clamp-2 min-h-[22px]">
        {node.label}
      </p>
      <div className="mt-0.5 flex items-center justify-between">
        <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${style.chip}`}>
          <CountUp value={node.count} />
        </span>
        {parentCount ? <span className="text-[9px] text-gray-400">{pct}%</span> : null}
      </div>
      {typeof node.amount === "number" && (
        <div className="mt-0.5 flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600">
          <IndianRupee className="h-2.5 w-2.5" />
          {formatINR(node.amount).replace("₹", "")}
        </div>
      )}
    </motion.button>
  );
}

function OrgNode({ node, parentCount, onSelectLeads }) {
  return (
    <li>
      <NodeBox node={node} parentCount={parentCount} onSelectLeads={onSelectLeads} />
      {node.children && node.children.length > 0 && (
        <ul>
          {node.children.map((child, i) => (
            <OrgNode key={child.label + i} node={child} parentCount={node.count} onSelectLeads={onSelectLeads} />
          ))}
        </ul>
      )}
    </li>
  );
}

function FitToScreen({ children }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    function recompute() {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return;

      inner.style.transform = "scale(1)";
      const naturalWidth = inner.scrollWidth;
      const naturalHeight = inner.scrollHeight;

      const availWidth = outer.clientWidth - 24;
      const topOffset = outer.getBoundingClientRect().top;
      const availHeight = window.innerHeight - topOffset - 24;

      const nextScale = Math.min(availWidth / naturalWidth, availHeight / naturalHeight, 1);
      const finalScale = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1;

      setScale(finalScale);
      setBoxSize({ width: naturalWidth * finalScale, height: naturalHeight * finalScale });
    }

    recompute();
    const ro = new ResizeObserver(recompute);
    if (innerRef.current) ro.observe(innerRef.current);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [children]);

  return (
    <div ref={outerRef} className="w-full flex justify-center" style={{ height: boxSize.height || undefined }}>
      <div
        ref={innerRef}
        style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
      >
        {children}
      </div>
    </div>
  );
}

function MultiSelect({ label, icon: Icon, options, selected, onChange, getKey = (o) => o, getLabel = (o) => o }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggle = (key) => {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:border-gray-300 min-w-[150px]"
      >
        <Icon className="h-3.5 w-3.5 text-gray-400" />
        <span className="truncate">{selected.length ? `${label} (${selected.length})` : label}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-20 mt-1.5 w-64 max-h-64 overflow-y-auto rounded-xl border border-gray-100 bg-white p-2 shadow-lg"
          >
            {options.length === 0 && <p className="text-xs text-gray-400 px-2 py-1.5">No options</p>}
            {options.map((opt) => {
              const key = getKey(opt);
              const checked = selected.includes(key);
              return (
                <label key={key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => toggle(key)} className="accent-blue-600" />
                  <span className="text-gray-700 truncate">{getLabel(opt)}</span>
                </label>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LeadsDrawer({ node, onClose }) {
  if (!node) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 overlay-in z-50 flex justify-end bg-gray-950/40"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-gray-800">{node.label}</h3>
              <p className="text-xs text-gray-400">{node.count} lead{node.count === 1 ? "" : "s"}</p>
            </div>
            <button aria-label="Close" onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100">
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>

          <div className="space-y-2">
            {(node.leads || []).map((l) => (
              <div key={l.id || l.phone} className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{l.name}</span>
                  <span className="text-[11px] rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">{l.status}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                  <Phone className="h-3 w-3" /> {l.phone}
                  {l.agent && <span className="ml-2">· {l.agent}{l.team ? ` (${l.team})` : ""}</span>}
                </div>
                {typeof l.amountReceived === "number" && l.amountReceived > 0 && (
                  <p className="mt-1 text-xs font-medium text-emerald-600">{formatINR(l.amountReceived)} received</p>
                )}
              </div>
            ))}
            {(!node.leads || node.leads.length === 0) && (
              <p className="text-sm text-gray-400 text-center py-8">No leads in this bucket.</p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function LeadFunnelPage() {
  const [agentOptions, setAgentOptions] = useState([]);
  const [teamOptions, setTeamOptions] = useState([]);

  const [selectedAgents, setSelectedAgents] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [leadNumber, setLeadNumber] = useState("");

  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    fetch("/api/super-admin/lead-funnel/filters")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setAgentOptions(json.agents);
          setTeamOptions(json.teams);
        }
      })
      .catch(() => {});
  }, []);

  const fetchTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/lead-funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentIds: selectedAgents,
          teams: selectedTeams,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          leadNumber: leadNumber || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Failed to load funnel");
      setTree(json.tree);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTree();
  }, []);

  const clearFilters = () => {
    setSelectedAgents([]);
    setSelectedTeams([]);
    setDateFrom("");
    setDateTo("");
    setLeadNumber("");
  };

  const activeFilterCount = useMemo(
    () => [selectedAgents.length > 0, selectedTeams.length > 0, dateFrom, dateTo, leadNumber].filter(Boolean).length,
    [selectedAgents, selectedTeams, dateFrom, dateTo, leadNumber]
  );

  return (
    <section className="flex min-h-screen bg-gray-50">
      <OrgChartStyles />
      <SuperAdminSidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <div className="p-6 w-full">
          <div className="flex items-center justify-between mb-5 max-w-5xl">
            <div>
              <h1 className="text-xl font-semibold text-gray-800">Lead Funnel</h1>
              <p className="text-sm text-gray-400">Lead → Call → Visit → Conversion, live from Callby + patient records.</p>
            </div>
            <button
              onClick={fetchTree}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-gray-800 hover:bg-gray-900 text-white px-3.5 py-2 text-sm font-medium disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4 mb-6 max-w-5xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <MultiSelect
                label="Agents"
                icon={Users}
                options={agentOptions}
                selected={selectedAgents}
                onChange={setSelectedAgents}
                getKey={(o) => o.id}
                getLabel={(o) => `${o.name}${o.team ? ` · ${o.team}` : ""}`}
              />
              <MultiSelect
                label="Teams"
                icon={ListFilter}
                options={teamOptions}
                selected={selectedTeams}
                onChange={setSelectedTeams}
              />
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-sm text-gray-600 outline-none" />
                <span className="text-gray-300 text-xs">to</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-sm text-gray-600 outline-none" />
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search lead number"
                  value={leadNumber}
                  onChange={(e) => setLeadNumber(e.target.value)}
                  className="text-sm text-gray-600 outline-none w-36"
                />
              </div>

              <button
                onClick={fetchTree}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-medium"
              >
                Apply
              </button>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-600 underline">
                  Clear all
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm p-3 mb-4 max-w-5xl">{error}</div>
          )}

          {loading && !tree ? (
            <div className="flex items-center justify-center py-24 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Building funnel…
            </div>
          ) : tree ? (
            <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
              <FitToScreen>
                <ul className="org-tree py-4">
                  <OrgNode node={tree} parentCount={null} onSelectLeads={setSelectedNode} />
                </ul>
              </FitToScreen>
            </div>
          ) : null}
        </div>
      </main>

      <LeadsDrawer node={selectedNode} onClose={() => setSelectedNode(null)} />
    </section>
  );
}