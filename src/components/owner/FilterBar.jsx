"use client";

import { useEffect, useRef } from "react";
import { DATE_RANGES } from "@/lib/owner/filters";
import { OWNER_BRANCHES } from "@/lib/owner/filters";
import { useOwnerFilters } from "@/lib/owner/useOwnerFilters";

// One filter bar for every owner list page (Owner Panel v2, F3).
//
//   <FilterBar
//     show={["date", "branch"]}                       // which built-ins to render
//     extras={[{ key: "role", label: "Role", options: [...] }]}
//     defaults={{ branch: "All" }}                     // seeds keys absent from URL
//     onChange={({ filters, range }) => reload(filters, range)}
//   >
//     <button className="icon-btn" onClick={reload}>⟳</button>
//   </FilterBar>
//
// State lives in the URL query string (via useOwnerFilters), so a filtered view
// is bookmarkable and the browser back button steps through filter changes.
// The date range defaults to "Today".

export default function FilterBar({
  show = ["date", "branch"],
  extras = [],
  defaults,
  onChange,
  children,
}) {
  const { filters, setFilter, range } = useOwnerFilters(defaults);

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

  return (
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
        <select
          key={ex.key}
          className="control"
          aria-label={ex.label || ex.key}
          value={filters[ex.key] ?? ""}
          onChange={(e) => setFilter(ex.key, e.target.value)}
        >
          {(ex.options || []).map((o) => {
            const value = typeof o === "string" ? o : o.value;
            const label = typeof o === "string" ? o : o.label;
            return <option key={value} value={value}>{label}</option>;
          })}
        </select>
      ))}

      {children}
    </div>
  );
}
