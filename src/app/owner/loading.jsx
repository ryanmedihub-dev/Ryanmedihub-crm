import { KpiSkeleton, TableSkeleton } from "@/components/owner";

/**
 * Shown by Next while a page's code and data load. Only the `.main` column
 * swaps — the sidebar lives in the layout — so navigation never blanks out.
 */
export default function OwnerLoading() {
  return (
    <>
      <div className="topbar">
        <div className="topbar-loading">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-sub" />
        </div>
      </div>
      <div className="content">
        <KpiSkeleton />
        <div className="skeleton skeleton-filterbar" />
        <TableSkeleton rows={8} />
      </div>
    </>
  );
}
