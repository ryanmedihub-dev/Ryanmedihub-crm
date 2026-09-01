"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/Toast";
import { PAYABLE_PURPOSES, payablePurposeLabel } from "@/constants/payablePurposes";
import { ALL_BRANCHES, MAIN_BRANCHES } from "@/lib/branches";
import {
  Loader2,
  Plus,
  Lock,
  Search,
  Pencil,
  Trash2,
  RotateCcw,
  X,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

// Admin-managed master data. Super-admin only (also enforced on every /api/master-data route).
// A change can take up to ~60s to reach every server instance (per-instance cache, 60s TTL).

const TABS = [
  { key: "heads", label: "Expense Heads" },
  { key: "methods", label: "Payment Methods" },
  { key: "receiptModes", label: "Receipt Modes" },
  { key: "accounts", label: "Accounts" },
  { key: "routing", label: "Bank Routing" },
];

const ROUTING_CATEGORIES = ["TRANSPLANT", "SERVICE", "MEDICINE"];
const DEFAULT_ROUTING_METHODS = ["cash", "card", "upi", "bajaj_loan", "fibe_loan"];

// Files that branch on a system method by name — shown in the lock tooltip.
const SYSTEM_DEPS = {
  paid_to_external: "externalPartyDerivation.js · collabDerivation.js",
  paid_by_other: "externalPartyDerivation.js",
  offset_settlement: "collabDerivation.js (clinic-share contra pair)",
};

// ----------------------------------------------------------------------------- data helpers

async function apiSend(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || `Request failed (${res.status})`), {
      status: res.status,
      data,
    });
  }
  return data;
}

function useMasterRows(kind, { withUsage = true } = {}) {
  const [rows, setRows] = useState([]);
  const [usage, setUsage] = useState({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiSend(
        `/api/master-data?kind=${kind}${withUsage ? "&withUsage=1" : ""}`,
        "GET",
      );
      setRows(data.rows || []);
      setUsage(data.usage || {});
    } catch {
      setRows([]);
      setUsage({});
    } finally {
      setLoading(false);
    }
  }, [kind, withUsage]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { rows, usage, loading, reload };
}

function matchesSearch(row, q) {
  if (!q) return true;
  return `${row.value} ${row.label}`.toLowerCase().includes(q.trim().toLowerCase());
}
function matchesStatus(row, status) {
  if (status === "active") return row.isActive !== false;
  if (status === "retired") return row.isActive === false;
  return true;
}

// ----------------------------------------------------------------------------- UI atoms

function Spinner({ className = "" }) {
  return <Loader2 className={`w-4 h-4 animate-spin ${className}`} />;
}

function StatusFilter({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
      {["all", "active", "retired"].map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 capitalize ${
            value === v ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder = "Search…" }) {
  return (
    <div className="relative">
      <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
    </div>
  );
}

function Toggle({ checked, disabled, onChange, title }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
        checked ? "bg-indigo-600" : "bg-gray-300"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Badge({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    indigo: "bg-indigo-100 text-indigo-700",
    rose: "bg-rose-100 text-rose-700",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200";

// ----------------------------------------------------------------------------- page

export default function MasterDataSettingsPage() {
  const { data: session, status } = useSession();
  const [tab, setTab] = useState("heads");

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  const role = session?.user?.role;
  if (role !== "super-admin" && role !== "owner") {
    return (
      <div className="p-10 max-w-lg mx-auto text-center">
        <Lock className="w-8 h-8 mx-auto text-gray-300 mb-3" />
        <h1 className="text-lg font-semibold text-gray-800">Super-admin only</h1>
        <p className="text-sm text-gray-500 mt-1">Master data can only be managed by a super-admin.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Master Data</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Expense heads, payment methods, receipt modes, accounts and bank-routing rules. Changes
          propagate to every server within ~60s. Retire values instead of deleting — a retired
          value stays valid on the documents that already use it.
        </p>
      </header>

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.key
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "heads" && <ExpenseHeadsTab />}
      {tab === "methods" && <MethodsTab />}
      {tab === "receiptModes" && <SimpleListTab kind="RECEIPT_MODE" noun="receipt mode" />}
      {tab === "accounts" && <SimpleListTab kind="ACCOUNT" noun="account" showRefs />}
      {tab === "routing" && <RoutingTab />}
    </div>
  );
}

// ----------------------------------------------------------------------------- Expense Heads

function ExpenseHeadsTab() {
  const toast = useToast();
  const cats = useMasterRows("EXPENSE_CATEGORY");
  const subs = useMasterRows("EXPENSE_SUBTYPE");
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState(null); // { mode: "new-cat" | "edit-cat" | "new-sub" | "edit-sub", row }

  const shownCats = cats.rows.filter(
    (r) => matchesSearch(r, search) && matchesStatus(r, statusFilter),
  );
  const selectedCat = selected ? cats.rows.find((r) => r._id === selected) : null;
  const shownSubs = subs.rows.filter(
    (r) => r.parent === selectedCat?.value && matchesStatus(r, statusFilter),
  );

  const reloadAll = () => {
    cats.reload();
    subs.reload();
  };

  const patch = async (row, body, okMsg) => {
    try {
      await apiSend(`/api/master-data/${row._id}`, "PATCH", body);
      toast.success(okMsg || "Saved");
      reloadAll();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (row) => {
    if (!confirm(`Permanently delete "${row.label}"? Only possible because nothing references it.`)) return;
    try {
      await apiSend(`/api/master-data/${row._id}`, "DELETE");
      toast.success("Deleted");
      if (selected === row._id) setSelected(null);
      reloadAll();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchBox value={search} onChange={setSearch} placeholder="Search heads…" />
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setModal({ mode: "new-cat" })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> Category
          </button>
          <button
            type="button"
            disabled={!selectedCat}
            onClick={() => setModal({ mode: "new-sub" })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            <Plus className="w-4 h-4" /> Sub-type
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Categories */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Categories {cats.loading && <Spinner className="inline ml-1" />}
          </div>
          <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
            {shownCats.map((r) => {
              const u = cats.usage[r._id]?.total ?? 0;
              const isSel = selected === r._id;
              return (
                <div
                  key={r._id}
                  onClick={() => setSelected(r._id)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm ${
                    isSel ? "bg-indigo-50" : "hover:bg-gray-50"
                  } ${r.isActive === false ? "opacity-60" : ""}`}
                >
                  <ChevronRight className={`w-3.5 h-3.5 text-gray-300 ${isSel ? "text-indigo-500" : ""}`} />
                  <span className={`flex-1 truncate ${r.isActive === false ? "line-through" : ""}`}>
                    {r.label}
                  </span>
                  {r.settlementType === "DIRECT" && <Badge tone="green">Direct</Badge>}
                  {r.settlementType === "PAYABLE" && <Badge tone="amber">Payable</Badge>}
                  {r.ownedElsewhere && <Badge tone="indigo">own flow</Badge>}
                  {r.isSystem && <Lock className="w-3 h-3 text-gray-400" />}
                  <span className="text-xs text-gray-400 tabular-nums w-10 text-right">{u}</span>
                  <RowMenu
                    onEdit={() => setModal({ mode: "edit-cat", row: r })}
                    onToggle={() =>
                      patch(
                        r,
                        { isActive: r.isActive === false },
                        r.isActive === false ? "Restored" : "Retired",
                      )
                    }
                    retired={r.isActive === false}
                    canDelete={u === 0 && !r.isSystem}
                    onDelete={() => remove(r)}
                    system={r.isSystem}
                  />
                </div>
              );
            })}
            {!cats.loading && shownCats.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-gray-400">No categories.</p>
            )}
          </div>
        </div>

        {/* Sub-types */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {selectedCat ? `Sub-types of “${selectedCat.label}”` : "Select a category"}
          </div>
          <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
            {selectedCat &&
              shownSubs.map((r) => {
                const u = subs.usage[r._id]?.total ?? 0;
                return (
                  <div
                    key={r._id}
                    className={`flex items-center gap-2 px-3 py-2 text-sm ${
                      r.isActive === false ? "opacity-60" : ""
                    }`}
                  >
                    <span className={`flex-1 truncate ${r.isActive === false ? "line-through" : ""}`}>
                      {r.label}
                    </span>
                    <span className="text-xs text-gray-400 tabular-nums w-10 text-right">{u}</span>
                    <RowMenu
                      onEdit={() => setModal({ mode: "edit-sub", row: r })}
                      onToggle={() =>
                        patch(
                          r,
                          { isActive: r.isActive === false },
                          r.isActive === false ? "Restored" : "Retired",
                        )
                      }
                      retired={r.isActive === false}
                      canDelete={u === 0}
                      onDelete={() => remove(r)}
                    />
                  </div>
                );
              })}
            {selectedCat && shownSubs.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-gray-400">No sub-types.</p>
            )}
          </div>
        </div>
      </div>

      {modal?.mode === "new-cat" && (
        <CategoryModal onClose={() => setModal(null)} onSaved={reloadAll} />
      )}
      {modal?.mode === "edit-cat" && (
        <CategoryModal row={modal.row} onClose={() => setModal(null)} onSaved={reloadAll} />
      )}
      {modal?.mode === "new-sub" && (
        <SubTypeModal
          parent={selectedCat.value}
          onClose={() => setModal(null)}
          onSaved={reloadAll}
        />
      )}
      {modal?.mode === "edit-sub" && (
        <SubTypeModal
          row={modal.row}
          categories={cats.rows.filter((c) => c.isActive !== false)}
          onClose={() => setModal(null)}
          onSaved={reloadAll}
        />
      )}
    </div>
  );
}

function RowMenu({ onEdit, onToggle, onDelete, retired, canDelete, system }) {
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        title="Edit"
        onClick={onEdit}
        className="p-1 text-gray-400 hover:text-indigo-600"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      {!system && (
        <button
          type="button"
          title={retired ? "Restore" : "Retire"}
          onClick={onToggle}
          className="p-1 text-gray-400 hover:text-amber-600"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          title="Delete (usage is 0)"
          onClick={onDelete}
          className="p-1 text-gray-400 hover:text-rose-600"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function CategoryModal({ row, onClose, onSaved }) {
  const toast = useToast();
  const editing = !!row;
  const [label, setLabel] = useState(row?.label || "");
  const [value, setValue] = useState(row?.value || "");
  const [sortOrder, setSortOrder] = useState(row?.sortOrder ?? 0);
  const [settlementType, setSettlementType] = useState(row?.settlementType || "");
  const [ownedElsewhere, setOwnedElsewhere] = useState(!!row?.ownedElsewhere);
  const [payablePurpose, setPayablePurpose] = useState(row?.payablePurpose || "");
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState(null);

  const settlementChanged = editing && (row.settlementType || "") !== settlementType;

  useEffect(() => {
    if (!settlementChanged) {
      setImpact(null);
      return;
    }
    let alive = true;
    apiSend(
      `/api/master-data/${row._id}/impact?settlementType=${encodeURIComponent(settlementType)}`,
      "GET",
    )
      .then((d) => alive && setImpact(d.settlementTypeChange))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [settlementChanged, settlementType, row]);

  const save = async () => {
    setBusy(true);
    try {
      if (editing) {
        await apiSend(`/api/master-data/${row._id}`, "PATCH", {
          label,
          sortOrder: Number(sortOrder),
          settlementType: settlementType || null,
          ownedElsewhere,
          payablePurpose: payablePurpose || null,
        });
      } else {
        await apiSend("/api/master-data", "POST", {
          kind: "EXPENSE_CATEGORY",
          value: value.trim(),
          label: label.trim(),
          sortOrder: Number(sortOrder),
          settlementType: settlementType || null,
          ownedElsewhere,
          payablePurpose: payablePurpose || null,
        });
      }
      toast.success(editing ? "Category updated" : "Category created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={editing ? `Edit “${row.label}”` : "New expense category"} onClose={onClose}>
      <Field label="Label (shown in the UI)">
        <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      {!editing && (
        <Field label="Stored value (immutable after creation)">
          <input className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      )}
      <Field label="Sort order">
        <input
          type="number"
          className={inputCls}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </Field>
      <Field label="Settlement type">
        <select
          className={inputCls}
          value={settlementType}
          onChange={(e) => setSettlementType(e.target.value)}
        >
          <option value="">— (special flow / none)</option>
          <option value="DIRECT">Direct payment</option>
          <option value="PAYABLE">Raises a payable</option>
        </select>
      </Field>
      {settlementChanged && impact?.blocked && (
        <div className="flex gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 mb-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {impact.payableCount} payable(s) already exist under this category — reclassifying is
          blocked. It would change the treatment of money already raised.
        </div>
      )}
      <label className="flex items-center gap-2 text-sm mb-3">
        <input
          type="checkbox"
          checked={ownedElsewhere}
          onChange={(e) => setOwnedElsewhere(e.target.checked)}
        />
        Raised by its own flow (hide from the generic payable dropdown)
      </label>
      <Field label="Payable purpose (for payable-backed categories)">
        <select
          className={inputCls}
          value={payablePurpose}
          onChange={(e) => setPayablePurpose(e.target.value)}
        >
          <option value="">—</option>
          {PAYABLE_PURPOSES.map((p) => (
            <option key={p} value={p}>
              {payablePurposeLabel(p)}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || (settlementChanged && impact?.blocked)}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy && <Spinner />} Save
        </button>
      </div>
    </Modal>
  );
}

function SubTypeModal({ row, parent, categories, onClose, onSaved }) {
  const toast = useToast();
  const editing = !!row;
  const [label, setLabel] = useState(row?.label || "");
  const [value, setValue] = useState(row?.value || "");
  const [sortOrder, setSortOrder] = useState(row?.sortOrder ?? 0);
  const [parentValue, setParentValue] = useState(row?.parent || parent || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (editing) {
        await apiSend(`/api/master-data/${row._id}`, "PATCH", {
          label,
          sortOrder: Number(sortOrder),
          parent: parentValue,
        });
      } else {
        await apiSend("/api/master-data", "POST", {
          kind: "EXPENSE_SUBTYPE",
          value: value.trim(),
          label: label.trim(),
          parent: parentValue,
          sortOrder: Number(sortOrder),
        });
      }
      toast.success(editing ? "Sub-type updated" : "Sub-type created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={editing ? `Edit “${row.label}”` : "New sub-type"} onClose={onClose}>
      <Field label="Label">
        <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      {!editing && (
        <Field label="Stored value (immutable)">
          <input className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      )}
      {editing && categories && (
        <Field label="Parent category">
          <select
            className={inputCls}
            value={parentValue}
            onChange={(e) => setParentValue(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c._id} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Sort order">
        <input
          type="number"
          className={inputCls}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy && <Spinner />} Save
        </button>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------------------- Payment Methods

function MethodsTab() {
  const toast = useToast();
  const { rows, usage, loading, reload } = useMasterRows("PAYMENT_METHOD");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [flagPreview, setFlagPreview] = useState(null); // { row, flag, next }
  const [editRow, setEditRow] = useState(null);
  const [creating, setCreating] = useState(false);

  const shown = rows.filter((r) => matchesSearch(r, search) && matchesStatus(r, statusFilter));

  const patch = async (row, body, okMsg) => {
    try {
      await apiSend(`/api/master-data/${row._id}`, "PATCH", body);
      toast.success(okMsg || "Saved");
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchBox value={search} onChange={setSearch} placeholder="Search methods…" />
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> Method
        </button>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">Label</th>
              <th className="text-left px-3 py-2">Value</th>
              <th className="text-left px-3 py-2">Applies to</th>
              <th className="px-3 py-2">Non-cash</th>
              <th className="px-3 py-2">Unsettled</th>
              <th className="text-right px-3 py-2">Usage</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  <Spinner className="inline" />
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const u = usage[r._id]?.total ?? 0;
              const retired = r.isActive === false;
              return (
                <tr key={r._id} className={retired ? "opacity-60" : ""}>
                  <td className={`px-3 py-2 ${retired ? "line-through" : ""}`}>
                    <span className="flex items-center gap-1.5">
                      {r.label}
                      {r.isSystem && (
                        <Lock className="w-3 h-3 text-gray-400" title={`System — ${SYSTEM_DEPS[r.value] || "depended on by code"}`} />
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.value}</td>
                  <td className="px-3 py-2">
                    <select
                      value={r.appliesTo}
                      disabled={r.isSystem}
                      onChange={(e) => patch(r, { appliesTo: e.target.value }, "Updated")}
                      className="text-xs border border-gray-200 rounded px-1.5 py-1 disabled:opacity-50"
                    >
                      <option value="BOTH">Both</option>
                      <option value="REVENUE">Revenue</option>
                      <option value="EXPENSE">Expense</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Toggle
                      checked={!!r.isNonCash}
                      disabled={r.isSystem}
                      title={r.isSystem ? "System method — locked" : "Toggle non-cash treatment"}
                      onChange={(next) => setFlagPreview({ row: r, flag: "isNonCash", next })}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Toggle
                      checked={!!r.isUnsettled}
                      disabled={r.isSystem}
                      title={r.isSystem ? "System method — locked" : "Toggle unsettled treatment"}
                      onChange={(next) => setFlagPreview({ row: r, flag: "isUnsettled", next })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">{u}</td>
                  <td className="px-3 py-2">
                    <RowMenu
                      onEdit={() => setEditRow(r)}
                      onToggle={() =>
                        patch(r, { isActive: retired }, retired ? "Restored" : "Retired")
                      }
                      retired={retired}
                      canDelete={u === 0 && !r.isSystem}
                      onDelete={async () => {
                        if (!confirm(`Delete "${r.label}"?`)) return;
                        try {
                          await apiSend(`/api/master-data/${r._id}`, "DELETE");
                          toast.success("Deleted");
                          reload();
                        } catch (e) {
                          toast.error(e.message);
                        }
                      }}
                      system={r.isSystem}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {flagPreview && (
        <FlagImpactModal
          {...flagPreview}
          onClose={() => setFlagPreview(null)}
          onConfirmed={() => {
            setFlagPreview(null);
            reload();
          }}
        />
      )}
      {editRow && (
        <SimpleRowModal
          row={editRow}
          kind="PAYMENT_METHOD"
          onClose={() => setEditRow(null)}
          onSaved={reload}
        />
      )}
      {creating && (
        <MethodCreateModal onClose={() => setCreating(false)} onSaved={reload} />
      )}
    </div>
  );
}

function FlagImpactModal({ row, flag, next, onClose, onConfirmed }) {
  const toast = useToast();
  const [impact, setImpact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const qs = new URLSearchParams({ [flag]: String(next) }).toString();
    apiSend(`/api/master-data/${row._id}/impact?${qs}`, "GET")
      .then((d) => setImpact(d.flagImpact))
      .catch((e) => setErr(e.message));
  }, [row, flag, next]);

  const confirm = async () => {
    setBusy(true);
    try {
      await apiSend(`/api/master-data/${row._id}`, "PATCH", { [flag]: next, confirmImpact: true });
      toast.success("Flag changed — audit record written");
      onConfirmed();
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  const inr = (n) =>
    "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  return (
    <Modal title={`${next ? "Enable" : "Disable"} ${flag} on “${row.label}”`} onClose={onClose}>
      <p className="text-sm text-gray-600 mb-3">
        This retroactively changes the accounting treatment of every existing transaction on this
        method. There is no reversal entry — a{" "}
        <span className="font-semibold">MasterDataAudit</span> record is written instead.
      </p>
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {!impact && !err && (
        <p className="text-sm text-gray-400 flex items-center gap-2">
          <Spinner /> computing impact…
        </p>
      )}
      {impact && (
        <div className="text-sm space-y-2 bg-gray-50 rounded-lg p-3 mb-4">
          <div className="flex justify-between">
            <span className="text-gray-500">Transactions on this method</span>
            <span className="font-semibold tabular-nums">{impact.transactionCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Revenue / expense value</span>
            <span className="tabular-nums">
              {inr(impact.revenue.amount)} / {inr(impact.expense.amount)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Estimated P&amp;L change</span>
            <span className="font-semibold tabular-nums">{inr(impact.pnlDeltaEstimate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Estimated balance change</span>
            <span className="font-semibold tabular-nums">{inr(impact.balanceDeltaEstimate)}</span>
          </div>
          <p className="text-[11px] text-gray-400 pt-1">{impact.note}</p>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy || !impact}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50"
        >
          {busy && <Spinner />} Confirm change
        </button>
      </div>
    </Modal>
  );
}

function MethodCreateModal({ onClose, onSaved }) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [appliesTo, setAppliesTo] = useState("BOTH");
  const [isNonCash, setIsNonCash] = useState(false);
  const [isUnsettled, setIsUnsettled] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await apiSend("/api/master-data", "POST", {
        kind: "PAYMENT_METHOD",
        value: value.trim(),
        label: label.trim(),
        appliesTo,
        isNonCash,
        isUnsettled,
        sortOrder: Number(sortOrder),
      });
      toast.success("Method created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New payment method" onClose={onClose}>
      <Field label="Stored value (immutable, e.g. hdfc_new_bank_transfer)">
        <input className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Field label="Label">
        <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="Applies to">
        <select className={inputCls} value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)}>
          <option value="BOTH">Both</option>
          <option value="REVENUE">Revenue</option>
          <option value="EXPENSE">Expense</option>
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm mb-2">
        <input type="checkbox" checked={isNonCash} onChange={(e) => setIsNonCash(e.target.checked)} />
        Non-cash (excluded from account balances)
      </label>
      <label className="flex items-center gap-2 text-sm mb-3">
        <input
          type="checkbox"
          checked={isUnsettled}
          onChange={(e) => setIsUnsettled(e.target.checked)}
        />
        Unsettled (excluded from P&amp;L and balances; raises a payable/receivable)
      </label>
      <Field label="Sort order">
        <input
          type="number"
          className={inputCls}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy && <Spinner />} Create
        </button>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------------------- Receipt Modes / Accounts

function SimpleListTab({ kind, noun, showRefs = false }) {
  const toast = useToast();
  const { rows, usage, loading, reload } = useMasterRows(kind);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editRow, setEditRow] = useState(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const shown = rows.filter((r) => matchesSearch(r, search) && matchesStatus(r, statusFilter));

  const patch = async (row, body, okMsg) => {
    try {
      await apiSend(`/api/master-data/${row._id}`, "PATCH", body);
      toast.success(okMsg || "Saved");
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchBox value={search} onChange={setSearch} placeholder={`Search ${noun}s…`} />
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 capitalize"
        >
          <Plus className="w-4 h-4" /> {noun}
        </button>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">Label</th>
              <th className="text-left px-3 py-2">Value</th>
              <th className="text-right px-3 py-2">Usage</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                  <Spinner className="inline" />
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const u = usage[r._id];
              const total = u?.total ?? 0;
              const retired = r.isActive === false;
              return (
                <Fragment key={r._id}>
                  <tr className={retired ? "opacity-60" : ""}>
                    <td className={`px-3 py-2 ${retired ? "line-through" : ""}`}>
                      <span className="flex items-center gap-1.5">
                        {r.label}
                        {r.isSystem && <Lock className="w-3 h-3 text-gray-400" />}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.value}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                      {showRefs && total > 0 ? (
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === r._id ? null : r._id)}
                          className="underline decoration-dotted hover:text-indigo-600"
                        >
                          {total}
                        </button>
                      ) : (
                        total
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <RowMenu
                        onEdit={() => setEditRow(r)}
                        onToggle={() =>
                          patch(r, { isActive: retired }, retired ? "Restored" : "Retired")
                        }
                        retired={retired}
                        canDelete={total === 0 && !r.isSystem}
                        onDelete={async () => {
                          if (!confirm(`Delete "${r.label}"?`)) return;
                          try {
                            await apiSend(`/api/master-data/${r._id}`, "DELETE");
                            toast.success("Deleted");
                            reload();
                          } catch (e) {
                            toast.error(e.message);
                          }
                        }}
                        system={r.isSystem}
                      />
                    </td>
                  </tr>
                  {showRefs && expanded === r._id && u?.byCollection && (
                    <tr>
                      <td colSpan={4} className="px-6 py-2 bg-gray-50 text-xs text-gray-500">
                        {Object.entries(u.byCollection)
                          .filter(([, n]) => n > 0)
                          .map(([k, n]) => `${k}: ${n}`)
                          .join("  ·  ") || "no references"}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {editRow && (
        <SimpleRowModal row={editRow} kind={kind} onClose={() => setEditRow(null)} onSaved={reload} />
      )}
      {creating && (
        <SimpleRowModal kind={kind} noun={noun} onClose={() => setCreating(false)} onSaved={reload} />
      )}
    </div>
  );
}

function SimpleRowModal({ row, kind, noun = "value", onClose, onSaved }) {
  const toast = useToast();
  const editing = !!row;
  const [label, setLabel] = useState(row?.label || "");
  const [value, setValue] = useState(row?.value || "");
  const [sortOrder, setSortOrder] = useState(row?.sortOrder ?? 0);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (editing) {
        await apiSend(`/api/master-data/${row._id}`, "PATCH", {
          label,
          sortOrder: Number(sortOrder),
        });
      } else {
        await apiSend("/api/master-data", "POST", {
          kind,
          value: value.trim(),
          label: label.trim(),
          sortOrder: Number(sortOrder),
        });
      }
      toast.success(editing ? "Updated" : "Created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={editing ? `Edit “${row.label}”` : `New ${noun}`} onClose={onClose}>
      <Field label="Label">
        <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      {!editing && (
        <Field label="Stored value (immutable)">
          <input className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      )}
      <Field label="Sort order">
        <input
          type="number"
          className={inputCls}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </Field>
      {editing && row.isSystem && (
        <p className="text-xs text-amber-600 mb-2">
          System value — only the label and sort order can change.
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy && <Spinner />} Save
        </button>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------------------- Bank Routing

function RoutingTab() {
  const toast = useToast();
  const [rules, setRules] = useState([]);
  const [receiptModes, setReceiptModes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState(MAIN_BRANCHES[0]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [r, rm, ac] = await Promise.all([
        apiSend("/api/master-data/routing", "GET"),
        apiSend("/api/master-data?kind=RECEIPT_MODE&withUsage=0", "GET"),
        apiSend("/api/master-data?kind=ACCOUNT&withUsage=0", "GET"),
      ]);
      setRules(r.rules || []);
      setReceiptModes((rm.rows || []).filter((x) => x.isActive !== false).map((x) => x.value));
      setAccounts((ac.rows || []).filter((x) => x.isActive !== false).map((x) => x.value));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const methods = useMemo(() => {
    const set = new Set(DEFAULT_ROUTING_METHODS);
    rules.forEach((r) => set.add(r.method));
    return [...set];
  }, [rules]);

  const ruleFor = (cat, method) =>
    rules.find(
      (r) => r.branch === branch && r.transactionCategory === cat && r.method === method,
    );

  const saveCell = async (cat, method, receiptMode, furtherMode) => {
    try {
      await apiSend("/api/master-data/routing", "POST", {
        branch,
        transactionCategory: cat,
        method,
        receiptMode,
        furtherMode,
      });
      toast.success("Rule saved");
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteCell = async (rule) => {
    try {
      await apiSend(`/api/master-data/routing/${rule._id}`, "DELETE");
      toast.success("Rule removed — cell reverts to a blank pre-fill");
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600">Branch</label>
        <select
          className={inputCls + " w-56"}
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        >
          {ALL_BRANCHES.map((b) => (
            <option key={b} value={b}>
              {b}
              {!MAIN_BRANCHES.includes(b) ? " (collab — usually no rules)" : ""}
            </option>
          ))}
        </select>
        {loading && <Spinner />}
      </div>

      <div className="space-y-5">
        {ROUTING_CATEGORIES.map((cat) => (
          <div key={cat} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {cat}
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-400">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">Method</th>
                  <th className="text-left px-3 py-1.5 font-medium">Receipt mode</th>
                  <th className="text-left px-3 py-1.5 font-medium">Account (furtherMode)</th>
                  <th className="px-3 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {methods.map((m) => (
                  <RoutingCell
                    key={m}
                    method={m}
                    rule={ruleFor(cat, m)}
                    receiptModes={receiptModes}
                    accounts={accounts}
                    onSave={(rm, fm) => saveCell(cat, m, rm, fm)}
                    onDelete={deleteCell}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoutingCell({ method, rule, receiptModes, accounts, onSave, onDelete }) {
  const [rm, setRm] = useState(rule?.receiptMode ?? "");
  const [fm, setFm] = useState(rule?.furtherMode ?? "");

  useEffect(() => {
    setRm(rule?.receiptMode ?? "");
    setFm(rule?.furtherMode ?? "");
  }, [rule]);

  const dirty = (rule?.receiptMode ?? "") !== rm || (rule?.furtherMode ?? "") !== fm;

  return (
    <tr className={!rule ? "bg-amber-50/40" : ""}>
      <td className="px-3 py-1.5 font-mono text-xs">{method}</td>
      <td className="px-3 py-1.5">
        <select
          value={rm}
          onChange={(e) => setRm(e.target.value)}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 w-full"
        >
          <option value="">— blank —</option>
          {receiptModes.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
          {rm && !receiptModes.includes(rm) && <option value={rm}>{rm} (retired)</option>}
        </select>
      </td>
      <td className="px-3 py-1.5">
        <select
          value={fm}
          onChange={(e) => setFm(e.target.value)}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 w-full"
        >
          <option value="">— blank —</option>
          {accounts.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
          {fm && !accounts.includes(fm) && <option value={fm}>{fm} (retired)</option>}
        </select>
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        {dirty && (
          <button
            type="button"
            onClick={() => onSave(rm, fm)}
            className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Save
          </button>
        )}
        {rule && !dirty && (
          <button
            type="button"
            onClick={() => onDelete(rule)}
            title="Remove rule"
            className="text-xs px-1.5 py-1 text-gray-400 hover:text-rose-600"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        {!rule && !dirty && <span className="text-[10px] text-amber-600">no rule</span>}
      </td>
    </tr>
  );
}
