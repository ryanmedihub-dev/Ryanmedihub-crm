"use client";

import { useEffect, useRef, useState } from "react";
import { DATE_RANGES } from "@/lib/owner/filters";
import { OWNER_BRANCHES } from "@/lib/owner/filters";
import { useOwnerFilters } from "@/lib/owner/useOwnerFilters";

// One filter bar for every owner list page (Owner Panel v2, F3).
//
//   <FilterBar
//     show={["date", "branch"]}                       // which built-ins to render
//     extras={[{ key: "role", label: "Role", options: [...] }]}   // always-visible selects
//     advancedExtras={[                                 // tucked behind "More filters"
//       { key: "salaryMin", label: "Min salary", type: "number" },
//       { key: "dojFrom", label: "Joined from", type: "date" },
//     ]}
//     defaults={{ branch: "All" }}                     // seeds keys absent from URL
//     onChange={({ filters, range }) => reload(filters, range)}
//   >
//     <button className="icon-btn" onClick={reload}>⟳</button>
//   </FilterBar>
//
// State lives in the URL query string (via useOwnerFilters), so a filtered view
// is bookmarkable and the browser back button steps through filter changes.
// The date range defaults to "Today".
//
// Each extra/advancedExtra entry is `{ key, label, type, options?, placeholder? }`.
// `type` is one of "select" (default — needs `options`), "text", "number", "date".
// Free-text/number inputs are debounced locally so typing doesn't fire one
// request per keystroke; date/select commit immediately.

const DEBOUNCE_MS = 450;

function FilterControl({ ex, value, onCommit }) {
  const type = ex.type || "select";

  if (type === "select") {
    return (
      <select
        className="control"
        aria-label={ex.label || ex.key}
        value={value ?? ""}
        onChange={(e) => onCommit(e.target.value)}
      >
        {(ex.options || []).map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const label = typeof o === "string" ? o : o.label;
          return <option key={v} value={v}>{label}</option>;
        })}
      </select>
    );
  }

  if (type === "date") {
    return (
      <input
        type="date"
        className="control"
        aria-label={ex.label || ex.key}
        value={value || ""}
        onChange={(e) => onCommit(e.target.value)}
      />
    );
  }

  // text / number — debounced so free typing doesn't hammer the API.
  const [local, setLocal] = useState(value ?? "");
  const timer = useRef(null);
  useEffect(() => setLocal(value ?? ""), [value]);
  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  return (
    <input
      type={type === "number" ? "number" : "text"}
      className="control"
      aria-label={ex.label || ex.key}
      placeholder={ex.placeholder || ex.label || ex.key}
      value={local}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onCommit(v), DEBOUNCE_MS);
      }}
    />
  );
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Notify the page whenever the resolved filters/range change.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const sig = JSON.stringify({ filters, range });
  useEffect(() => {
    onChangeRef.current?.({ filters, range });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const showDate = show.includes("date");
  const showBranch = show.includes("branch");

  const activeAdvancedCount = advancedExtras.filter((ex) => filters[ex.key]).length;
  const clearAdvanced = () => {
    const patch = {};
    for (const ex of advancedExtras) patch[ex.key] = "";
    setFilters(patch);
  };

  return (
    <div className="filter-bar-wrap">
      <div className="filter-bar">
        {showDate && (
          <select
            className="control"
            aria-label="Date range"
            value={filters.range}
            onChange={(e) => setFilter("range", e.target.value)}
          >
            {DATE_RANGES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        )}

        {showDate && filters.range === "Custom" && (
          <>
            <input
              type="date"
              className="control"
              aria-label="From date"
              value={filters.from || ""}
              onChange={(e) => setFilter("from", e.target.value)}
            />
            <input
              type="date"
              className="control"
              aria-label="To date"
              value={filters.to || ""}
              onChange={(e) => setFilter("to", e.target.value)}
            />
          </>
        )}

        {showBranch && (
          <select
            className="control"
            aria-label="Branch"
            value={filters.branch}
            onChange={(e) => setFilter("branch", e.target.value)}
          >
            {OWNER_BRANCHES.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        )}

        {extras.map((ex) => (
          <FilterControl
            key={ex.key}
            ex={ex}
            value={filters[ex.key]}
            onCommit={(v) => setFilter(ex.key, v)}
          />
        ))}

        {advancedExtras.length > 0 && (
          <button
            type="button"
            className="btn"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((o) => !o)}
          >
            {advancedOpen ? "Hide filters ▲" : "More filters ▾"}
            {activeAdvancedCount > 0 ? ` (${activeAdvancedCount})` : ""}
          </button>
        )}

        {children}
      </div>

      {advancedOpen && advancedExtras.length > 0 && (
        <div className="filter-bar filter-bar-advanced">
          {advancedExtras.map((ex) => (
            <FilterControl
              key={ex.key}
              ex={ex}
              value={filters[ex.key]}
              onCommit={(v) => setFilter(ex.key, v)}
            />
          ))}
          {activeAdvancedCount > 0 && (
            <button type="button" className="btn" onClick={clearAdvanced}>
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
