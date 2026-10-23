"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Search, Plus, Pencil, Trash2, X, Mail, Phone, Store, Download, RefreshCw, SlidersHorizontal,
} from "lucide-react";
import Sidebar from "@/components/Sidebars/StockSidebar";
import { useToast } from "@/components/Toast";
import {
  Page, Card, Stats, Btn, IconBtn, Chip, DataTable, Empty, Modal, Row,
  input, num, day, td, tr,
} from "@/components/stocks/ui";

export default function VendorsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const toast = useToast();

  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDealsIn, setFilterDealsIn] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => { fetchVendors(); }, []);

  const fetchVendors = async (overrides = {}) => {
    try {
      setLoading(true);
      const q = overrides.search ?? searchTerm;
      const cat = overrides.dealsIn ?? filterDealsIn;
      const params = new URLSearchParams();
      if (q) params.append("search", q);
      if (cat) params.append("dealsIn", cat);

      const res = await fetch(`/api/vendors/get${params.toString() ? `?${params}` : ""}`);
      const data = await res.json();
      if (data.success) setVendors(data.data || data.vendors || []);
    } catch {
      toast.error("Could not load vendors");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/vendors/delete?id=${toDelete._id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success(`${toDelete.name} removed`);
        setToDelete(null);
        fetchVendors();
      } else {
        toast.error(data.message || "Could not remove the vendor");
      }
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterDealsIn("");
    fetchVendors({ search: "", dealsIn: "" });
  };

  const downloadExcel = async () => {
    try {
      setDownloading(true);
      const { utils, writeFile } = await import("xlsx");
      const rows = vendors.map((v) => ({
        Name: v.name || "",
        Contact: v.contact || "",
        Email: v.email || "",
        "Deals In": v.DealsIn || "",
        "GST Number": v.gstNumber || "",
        Address: v.address || "",
        "Created At": day(v.createdAt),
      }));
      const wb = utils.book_new();
      const ws = utils.json_to_sheet(rows);
      ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 20 }));
      utils.book_append_sheet(wb, ws, "Vendors");
      writeFile(wb, `vendors_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error("Could not build the export");
    } finally {
      setDownloading(false);
    }
  };

  const categories = [...new Set(vendors.map((v) => v.DealsIn).filter(Boolean))];
  const hasFilters = searchTerm || filterDealsIn;
  const weekAgo = Date.now() - 7 * 86400000;
  const recentCount = vendors.filter((v) => new Date(v.createdAt).getTime() > weekAgo).length;

  return (
    <Page
      sidebar={Sidebar}
      section="Vendors"
      title="Vendors"
      lead="Suppliers you buy stock from"
      actions={
        <>
          <IconBtn icon={RefreshCw} label="Refresh" onClick={() => { setRefreshing(true); fetchVendors(); }} disabled={refreshing} />
          <Btn icon={Download} busy={downloading} onClick={downloadExcel} disabled={!vendors.length}>Export</Btn>
          <Btn variant="primary" icon={Plus} onClick={() => router.push("/stocks/vendors/create")}>New vendor</Btn>
        </>
      }
    >
      <Stats
        items={[
          { label: "Vendors", value: num(vendors.length) },
          { label: "Categories", value: num(categories.length) },
          { label: "Added this week", value: num(recentCount) },
          { label: "With GST on file", value: num(vendors.filter((v) => v.gstNumber).length) },
        ]}
      />

      <Card flush>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email or phone"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchVendors()}
              className={`${input} pl-9`}
            />
          </div>

          <input
            type="text"
            list="vendor-categories"
            placeholder="Any category"
            value={filterDealsIn}
            onChange={(e) => setFilterDealsIn(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchVendors()}
            className={`${input} w-48`}
          />
          <datalist id="vendor-categories">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>

          <div className="ml-auto flex items-center gap-2">
            {hasFilters && <Btn variant="ghost" icon={X} onClick={clearFilters}>Clear</Btn>}
            <Btn variant="primary" icon={SlidersHorizontal} onClick={() => fetchVendors()}>Apply</Btn>
          </div>
        </div>
      </Card>

      <Card flush title={loading ? "Vendors" : `${num(vendors.length)} ${vendors.length === 1 ? "vendor" : "vendors"}`} note={hasFilters ? "Filtered view" : null}>
        <DataTable
          minWidth={820}
          loading={loading && "Loading vendors"}
          head={["Vendor", "Contact", "Category", "GST", "Added", { label: "", align: "right" }]}
          empty={
            !loading && vendors.length === 0 ? (
              <Empty
                icon={Store}
                title={hasFilters ? "No vendors match" : "No vendors yet"}
                hint={hasFilters ? "Clear the filters to see everyone." : "Add the suppliers you buy stock from."}
                action={
                  hasFilters ? (
                    <Btn icon={X} onClick={clearFilters}>Clear filters</Btn>
                  ) : (
                    <Btn variant="primary" icon={Plus} onClick={() => router.push("/stocks/vendors/create")}>New vendor</Btn>
                  )
                }
              />
            ) : null
          }
        >
          {vendors.map((vendor) => (
            <tr key={vendor._id} className={tr}>
              <td className={`${td} font-medium text-slate-900`}>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">
                    {vendor.name?.charAt(0).toUpperCase()}
                  </span>
                  <span className="whitespace-nowrap">{vendor.name}</span>
                </div>
              </td>
              <td className={td}>
                {vendor.contact || vendor.email ? (
                  <div className="space-y-0.5">
                    {vendor.contact && (
                      <p className="flex items-center gap-1.5 whitespace-nowrap text-slate-700">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />{vendor.contact}
                      </p>
                    )}
                    {vendor.email && (
                      <p className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />{vendor.email}
                      </p>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className={td}>
                {vendor.DealsIn ? <Chip>{vendor.DealsIn}</Chip> : <span className="text-slate-300">—</span>}
              </td>
              <td className={`${td} font-mono text-xs text-slate-600`}>
                {vendor.gstNumber || <span className="font-sans text-slate-300">—</span>}
              </td>
              <td className={`${td} whitespace-nowrap text-slate-500`}>{day(vendor.createdAt)}</td>
              <td className={td}>
                <div className="flex justify-end gap-0.5">
                  <IconBtn icon={Pencil} label="Edit vendor" onClick={() => router.push(`/stocks/vendors/edit/${vendor._id}`)} />
                  {session?.user?.role === "admin" && (
                    <IconBtn icon={Trash2} tone="rose" label="Delete vendor" onClick={() => setToDelete(vendor)} />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </Card>

      {toDelete && (
        <Modal
          title="Delete vendor"
          onClose={() => setToDelete(null)}
          footer={
            <>
              <Btn onClick={() => setToDelete(null)} disabled={deleting}>Keep vendor</Btn>
              <Btn variant="danger" icon={Trash2} busy={deleting} onClick={handleDelete}>Delete</Btn>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{toDelete.name}</span> will be removed from the vendor list. Past purchases
            keep their record, but you cannot undo this.
          </p>
          <div className="mt-4">
            {toDelete.contact && <Row label="Contact">{toDelete.contact}</Row>}
            {toDelete.DealsIn && <Row label="Category">{toDelete.DealsIn}</Row>}
            {toDelete.gstNumber && <Row label="GST">{toDelete.gstNumber}</Row>}
          </div>
        </Modal>
      )}
    </Page>
  );
}
