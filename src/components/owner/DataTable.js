function alignClass(align) {
  if (align === "right") return " align-right";
  if (align === "center") return " align-center";
  return "";
}

export default function DataTable({
  columns = [],
  rows = [],
  onRowClick,
  tall = false,
  loading = false,
  skeletonRows = 6,
  emptyMessage = "No data",
  sortKey,
  sortDir,
  onSort,
}) {
  const colCount = columns.length + (onRowClick ? 1 : 0) || 1;

  return (
    <div className={`table-wrap${tall ? " tall" : ""}`}>
      <table>
        <thead>
          <tr>
            {columns.map((col) => {
              const cls = `${col.sortable ? "col-sort" : ""}${alignClass(col.align)}`.trim();
              return col.sortable ? (
                <th key={col.key} className={cls || undefined}>
                  <button type="button" onClick={() => onSort?.(col.key)}>
                    {col.label}
                    {sortKey === col.key && (
                      <span className="sort-caret" aria-hidden="true">
                        {sortDir === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </button>
                </th>
              ) : (
                <th key={col.key} className={cls || undefined}>
                  {col.label}
                </th>
              );
            })}
            {onRowClick && <th aria-hidden="true" />}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={`sk-${i}`}>
                {columns.map((col) => (
                  <td key={col.key}>
                    <span className="skeleton" style={{ display: "block", height: 12, width: `${40 + ((i * 13 + col.key.length * 7) % 45)}%` }} />
                  </td>
                ))}
                {onRowClick && <td />}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td className="empty" colSpan={colCount}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row.id ?? row._id ?? i}
                className={`${onRowClick ? "clickable" : ""}${row._isTotal ? " total-row" : ""}`.trim() || undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={alignClass(col.align).trim() || undefined}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
                {onRowClick && (
                  <td className="row-chevron" aria-hidden="true">
                    ›
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
