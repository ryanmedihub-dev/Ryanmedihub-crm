"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Filter, X, ChevronDown, SlidersHorizontal } from "lucide-react";
import { DATE_RANGES, OWNER_BRANCHES } from "@/lib/owner/filters";
import { useOwnerFilters } from "@/lib/owner/useOwnerFilters";

const DEBOUNCE_MS = 450;

export function FilterControl({ ex, value, onCommit }) {
  const type = ex.type || "select";
  const id = `filter-${ex.key}`;
  
  
  
  const [local, setLocal] = useState(value ?? "");
  const timer = useRef(null);
  useEffect(() => setLocal(value ?? ""), [value]);
  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  if (type === "select") {
    return (
      <label className="filter-field" htmlFor={id}>
        <span>{ex.label || ex.key}</span>
        <select id={id} className="control" value={value ?? ""} onChange={(e) => onCommit(e.target.value)}>
          <option value="">{ex.placeholder || `All ${(ex.label || "").toLowerCase()}`}</option>
          {(ex.options || []).map((o) => {
            const v = typeof o === "string" ? o : o.value;
            const label = typeof o === "string" ? o : o.label;
            return (
              <option key={v} value={v}>
                {label}
              </option>
            );
          })}
        </select>
      </label>
    );
  }

  if (type === "date") {
    return (
      <label className="filter-field" htmlFor={id}>
        <span>{ex.label || ex.key}</span>
        <input type="date" id={id} className="control" value={value || ""} onChange={(e) => onCommit(e.target.value)} />
      </label>
    );
  }

  return (
    <label className="filter-field" htmlFor={id}>
      <span>{ex.label || ex.key}</span>
      <input
        type={type === "number" ? "number" : "text"}
        id={id}
        className="control"
        placeholder={ex.placeholder || `Enter ${(ex.label || "").toLowerCase()}…`}
        value={local}
        onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onCommit(v), DEBOUNCE_MS);
        }}
      />
    </label>
  );
}

function optionLabel(ex, raw) {
  const opt = (ex.options || []).find((o) => (typeof o === "string" ? o : o.value) === raw);
  if (!opt) return raw;
  return typeof opt === "string" ? opt : opt.label;
}

export default function FilterBar({
  show = ["date", "branch"],
  extras = [],
  advancedExtras = [],
  defaults,
  onChange,
  children,
}) {
  const { filters, setFilter, setFilters, range } = useOwnerFilters(defaults);
  const [open, setOpen] = useState(false);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const sig = JSON.stringify({ filters, range });
  useEffect(() => {
    onChangeRef.current?.({ filters, range });
    
  }, [sig]);

  const showDate = show.includes("date");
  const showBranch = show.includes("branch");
  const allExtras = useMemo(() => [...extras, ...advancedExtras], [extras, advancedExtras]);

  
  const chips = useMemo(() => {
    const list = [];
    if (showDate && filters.range && filters.range !== (defaults?.range || "Today")) {
      list.push({
        key: "range",
        label: filters.range === "Custom" && filters.from && filters.to ? `${filters.from} → ${filters.to}` : filters.range,
        reset: () => setFilters({ range: defaults?.range || "Today", from: "", to: "" }),
      });
    }
    if (showBranch && filters.branch && filters.branch !== (defaults?.branch || "All")) {
      list.push({ key: "branch", label: filters.branch, reset: () => setFilter("branch", defaults?.branch || "All") });
    }
    allExtras.forEach((ex) => {
      const v = filters[ex.key];
      const def = defaults?.[ex.key] ?? "";
      if (v && v !== def) {
        list.push({
          key: ex.key,
          label: `${ex.label || ex.key}: ${ex.type === "select" ? optionLabel(ex, v) : v}`,
          reset: () => setFilter(ex.key, def),
        });
      }
    });
    return list;
  }, [filters, showDate, showBranch, allExtras, defaults, setFilter, setFilters]);

  const clearAll = () => {
    const patch = {};
    allExtras.forEach((ex) => {
      patch[ex.key] = defaults?.[ex.key] ?? "";
    });
    if (showBranch) patch.branch = defaults?.branch || "All";
    if (showDate) {
      patch.range = defaults?.range || "Today";
      patch.from = "";
      patch.to = "";
    }
    setFilters(patch);
  };

  return (
    <div className="filter-panel">
      <div className="filter-panel-bar">
        <div className="filter-panel-left">
          <button type="button" className="filter-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <Filter size={14} />
            <span>Filters</span>
            {chips.length > 0 && <span className="filter-count">{chips.length}</span>}
            <ChevronDown size={14} />
          </button>

          {!open && chips.length > 0 && (
            <div className="filter-chips">
              {chips.map((c) => (
                <span key={c.key} className="filter-chip">
                  {c.label}
                  <button type="button" onClick={c.reset} aria-label={`Clear ${c.label}`}>
                    <X size={10} />
                  </button>
                </span>
              ))}
              <button type="button" className="filter-clear" onClick={clearAll}>
                Reset
              </button>
            </div>
          )}
        </div>

        {children && <div className="top-actions">{children}</div>}
      </div>

      {open && (
        <div className="filter-panel-body">
          <div className="filter-grid">
            {showDate && (
              <div className="filter-field" style={{ gridColumn: "1 / -1" }}>
                <span>Date range</span>
                <div className="filter-pills">
                  {DATE_RANGES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="filter-pill"
                      aria-pressed={filters.range === r}
                      onClick={() => setFilter("range", r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showDate && filters.range === "Custom" && (
              <>
                <label className="filter-field">
                  <span>From date</span>
                  <input type="date" className="control" value={filters.from || ""} onChange={(e) => setFilter("from", e.target.value)} />
                </label>
                <label className="filter-field">
                  <span>To date</span>
                  <input type="date" className="control" value={filters.to || ""} onChange={(e) => setFilter("to", e.target.value)} />
                </label>
              </>
            )}

            {showBranch && (
              <label className="filter-field">
                <span>Branch</span>
                <select className="control" value={filters.branch} onChange={(e) => setFilter("branch", e.target.value)}>
                  {OWNER_BRANCHES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {extras.map((ex) => (
              <FilterControl key={ex.key} ex={ex} value={filters[ex.key]} onCommit={(v) => setFilter(ex.key, v)} />
            ))}
          </div>

          {advancedExtras.length > 0 && (
            <div className="filter-panel-advanced">
              <div className="filter-panel-advanced-head">
                <SlidersHorizontal size={14} /> More filters
              </div>
              <div className="filter-grid">
                {advancedExtras.map((ex) => (
                  <FilterControl key={ex.key} ex={ex} value={filters[ex.key]} onCommit={(v) => setFilter(ex.key, v)} />
                ))}
              </div>
            </div>
          )}

          <div className="filter-panel-foot">
            {chips.length > 0 && (
              <button type="button" className="btn" onClick={clearAll}>
                Reset all
              </button>
            )}
            <button type="button" className="primary" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
