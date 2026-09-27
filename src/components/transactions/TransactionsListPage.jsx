"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";

import { useToast } from "@/components/Toast";
import BillGenerator from "@/components/BillGenerator";
import { formatCurrency } from "@/lib/financeUI";
import { METHOD_LABELS } from "@/constants/paymentMethods";
import ReverseTransactionModal from "@/components/finance/ReverseTransactionModal";
import SuspenseManager from "@/components/SuspenseManager";
import ContraManager from "@/components/ContraManager";

import {
  VALID_CATEGORIES,
  NON_TRANSACTION_TABS,
  MULTI_FILTER_KEYS,
  FILTER_KEYS,
  defaultFilters,
  filtersFromParams,
  filterEquals,
  matchingPreset,
  getPresetRange,
  getTodayDate,
  calculateNetAmount,
  formatDateForDisplay,
  formatTime,
  getPatientName,
  getPatientPhone,
  getMedicineName,
  getExpenseGiverName,
} from "./transactionsHelpers";
import { PageHeader, KPIBar, CategoryNavigation, TransactionToolbar } from "./TransactionToolbarUI";
import FilterPanel from "./TransactionFilterPanel";
import { EmptyState, Pagination } from "./TransactionTableChrome";
import DesktopTable from "./DesktopTable";
import MobileTransactionCard from "./MobileTransactionCard";

function AllTransactionsPageInner({ Sidebar }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);

  const [stats, setStats] = useState({
    ALL: { count: 0, total: 0 },
    TRANSPLANT: { count: 0, total: 0 },
    SERVICE: { count: 0, total: 0 },
    MEDICINE: { count: 0, total: 0 },
    EXPENSE: { count: 0, total: 0 },
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  const [activeCategory, setActiveCategory] =
    useState(() => {
      const category =
        searchParams.get("category");

      return VALID_CATEGORIES.has(category)
        ? category
        : "ALL";
    });

  const [appliedFilters, setAppliedFilters] =
    useState(() =>
      filtersFromParams(searchParams)
    );

  const [draftFilters, setDraftFilters] =
    useState(() =>
      filtersFromParams(searchParams)
    );

  const [tableSearch, setTableSearch] =
    useState("");

  const [debouncedSearch, setDebouncedSearch] =
    useState("");

  const [showFilters, setShowFilters] =
    useState(false);

  const [pendingOnly, setPendingOnly] =
    useState(false);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [sortConfig, setSortConfig] =
    useState({
      key: "date",
      direction: "desc",
    });

  const [expandedId, setExpandedId] =
    useState(null);

  const [expandedInfo, setExpandedInfo] =
    useState(null);

  const [expandedLoading, setExpandedLoading] =
    useState(false);

  const [deleteTarget, setDeleteTarget] =
    useState(null);

  const [reverseTarget, setReverseTarget] =
    useState(null);

  const [billTransaction, setBillTransaction] =
    useState(null);

  const searchDebounceRef = useRef(null);

  const handleSearch = (value) => {
    setTableSearch(value);

    clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current =
      setTimeout(() => {
        setDebouncedSearch(value);
        setPage(1);
      }, 400);
  };

  
  
  const buildFilterParams = useCallback(
    (overrides = {}) => {
      const p = new URLSearchParams({
        category: activeCategory,
        ...overrides,
      });

      const addArray = (key) => {
        if (appliedFilters[key]?.length) {
          p.set(key, appliedFilters[key].join(","));
        }
      };

      addArray("branch");
      addArray("paymentMethod");
      addArray("procedure");
      addArray("furtherMode");
      addArray("expenseCategory");
      addArray("expenseType");
      addArray("entryType");

      if (appliedFilters.dateFrom) p.set("dateFrom", appliedFilters.dateFrom);
      if (appliedFilters.dateTo) p.set("dateTo", appliedFilters.dateTo);
      if (debouncedSearch) p.set("search", debouncedSearch);
      if (activeCategory === "EXPENSE" && pendingOnly) p.set("approvalStatus", "PENDING");

      return p;
    },
    [activeCategory, appliedFilters, debouncedSearch, pendingOnly]
  );

  const fetchData = useCallback(
    async (refresh = false) => {
      if (
        NON_TRANSACTION_TABS.includes(
          activeCategory
        )
      ) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        refresh
          ? setRefreshing(true)
          : setLoading(true);

        setError(null);

        const p = buildFilterParams({
          page,
          limit: perPage,
          sortKey: sortConfig.key,
          sortDir: sortConfig.direction,
        });

        const res = await fetch(
          `/api/transactions/get-all?${p.toString()}`,
          {
            credentials: "include",
          }
        );

        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status}`
          );
        }

        const data = await res.json();

        if (!data.success) {
          throw new Error(
            data.message ||
              data.error ||
              "Failed to load transactions"
          );
        }

        setTransactions(
          data.transactions || []
        );

        setTotal(data.total || 0);

        if (data.stats) {
          
          
          const revenueAndExpense = ["TRANSPLANT", "SERVICE", "MEDICINE", "EXPENSE"];
          const all = revenueAndExpense.reduce(
            (acc, cat) => {
              const s = data.stats[cat] || { count: 0, total: 0 };
              return { count: acc.count + (s.count || 0), total: acc.total + (s.total || 0) };
            },
            { count: 0, total: 0 },
          );
          setStats({ ...data.stats, ALL: all });
        }
      } catch (err) {
        setError(err.message);

        toast?.error?.(
          "Unable to load transactions"
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      activeCategory,
      buildFilterParams,
      page,
      perPage,
      sortConfig,
    ]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [
    activeCategory,
    appliedFilters,
    debouncedSearch,
    pendingOnly,
    sortConfig,
  ]);

  useEffect(() => {
    if (activeCategory !== "EXPENSE") {
      setPendingOnly(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    const params = new URLSearchParams();

    if (activeCategory !== "ALL") {
      params.set(
        "category",
        activeCategory
      );
    }

    Object.entries(appliedFilters).forEach(
      ([key, value]) => {
        if (Array.isArray(value)) {
          if (value.length) {
            params.set(key, value.join(","));
          }
        } else if (value) {
          params.set(key, value);
        }
      }
    );

    const qs = params.toString();

    router.replace(
      qs ? `${pathname}?${qs}` : pathname,
      { scroll: false }
    );
  }, [
    activeCategory,
    appliedFilters,
    pathname,
    router,
  ]);

  const toggleExpand = async (row) => {
    if (expandedId === row._id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(row._id);
    setExpandedInfo(null);

    const receivableId =
      row.receivableId ||
      row.externalParty?.linkedReceivableId;

    const payableId =
      row.payableId ||
      row.externalParty?.linkedPayableId;

    if (!receivableId && !payableId) {
      return;
    }

    setExpandedLoading(true);

    try {
      const endpoint = receivableId
        ? `/api/receivables/${receivableId}`
        : `/api/payables/${payableId}`;

      const res = await fetch(endpoint);
      const data = await res.json();

      if (res.ok) {
        setExpandedInfo({
          type: receivableId
            ? "receivable"
            : "payable",
          data:
            data.receivable ||
            data.payable,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExpandedLoading(false);
    }
  };

  const handleSort = (key) => {
    setSortConfig((previous) => ({
      key,
      direction:
        previous.key === key &&
        previous.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
  };

  const clearFilters = () => {
    const defaults = defaultFilters();

    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setTableSearch("");
    setDebouncedSearch("");
    setPage(1);
  };

  const removeFilter = (key, value) => {
    const update = (filters) => {
      if (
        MULTI_FILTER_KEYS.includes(key)
      ) {
        return {
          ...filters,
          [key]: value
            ? filters[key].filter(
                (v) => v !== value
              )
            : [],
        };
      }

      
      
      if (key === "dateFrom" || key === "dateTo") {
        return { ...filters, [key]: getTodayDate() };
      }

      return {
        ...filters,
        [key]: "",
      };
    };

    setDraftFilters(update);
    setAppliedFilters(update);
  };

  
  
  const onDatePreset = (key) => {
    const range = getPresetRange(key);
    setDraftFilters((f) => ({ ...f, ...range }));
    setAppliedFilters((f) => ({ ...f, ...range }));
    setPage(1);
  };

  const activeDatePreset = matchingPreset(
    appliedFilters.dateFrom,
    appliedFilters.dateTo
  );

  const pages = Math.max(
    1,
    Math.ceil(total / perPage)
  );

  const current = Math.min(page, pages);

  const startIdx =
    (current - 1) * perPage;

  const endIdx = Math.min(
    startIdx + perPage,
    total
  );

  const hasPendingChanges =
    FILTER_KEYS.some(
      (key) =>
        !filterEquals(
          draftFilters[key],
          appliedFilters[key]
        )
    );

  const hasActiveFilters =
    MULTI_FILTER_KEYS.some(
      (key) =>
        appliedFilters[key]?.length > 0
    ) ||
    appliedFilters.dateFrom !==
      getTodayDate() ||
    appliedFilters.dateTo !==
      getTodayDate() ||
    !!tableSearch;

  
  
  const activeFilterCount =
    MULTI_FILTER_KEYS.reduce(
      (sum, key) => sum + (appliedFilters[key]?.length || 0),
      0
    ) +
    (appliedFilters.dateFrom !== getTodayDate() ? 1 : 0) +
    (appliedFilters.dateTo !== getTodayDate() ? 1 : 0);

  const openBill = (row) => {
    setBillTransaction(row);
  };

  const onEditRow = (row) => {
    router.push(`/admin/transactions/edit/${row._id}`);
  };

  
  
  
  const fetchAllMatchingFilters = async () => {
    const BATCH_SIZE = 2000;
    let batchPage = 1;
    let all = [];
    for (;;) {
      const p = buildFilterParams({
        page: batchPage,
        limit: BATCH_SIZE,
        sortKey: sortConfig.key,
        sortDir: sortConfig.direction,
      });
      const res = await fetch(`/api/transactions/get-all?${p.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || "Failed to load transactions");

      const batch = data.transactions || [];
      all = all.concat(batch);

      const grandTotal = data.total || 0;
      if (batch.length === 0 || all.length >= grandTotal) break;
      batchPage += 1;
    }
    return all;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const allRows = await fetchAllMatchingFilters();
      if (!allRows.length) {
        toast?.error?.("No transactions match the current filters");
        return;
      }

      const headers = [
        "Date",
        "Patient Name",
        "Phone",
        "Branch",
        "Category",
        "Procedure",
        "Medicine Name",
        "Quantity",
        "Payment Type",
        "Payment Method",
        "Original Amount",
        "TransID / Card No",
        "Discount",
        "Net Amount",
        "Pending Amount",
        "Remarks",
        "Created By",
        "Date & Time",
        "Total Edits",
      ];

      const dateTime = (d) => (d ? `${formatDateForDisplay(d)} ${formatTime(d)}`.trim() : "");

      const csvRows = allRows.map((row) => {
        const rowCategory = row.transactionCategory || row.category || "TRANSPLANT";
        const isExpense = rowCategory === "EXPENSE";
        const isMedicine = rowCategory === "MEDICINE";
        const discount = Number(row.discount) || 0;
        const net = calculateNetAmount(row);

        return [
          formatDateForDisplay(row.date),
          isExpense ? getExpenseGiverName(row) : getPatientName(row),
          isExpense ? "" : getPatientPhone(row),
          row.branch || "",
          rowCategory,
          isMedicine
            ? ""
            : isExpense
              ? row.expenseType || row.expense || row.expenseCategory || ""
              : row.procedure || "",
          isMedicine ? getMedicineName(row) : "",
          isMedicine ? (row.quantity ?? "") : "",
          row.paymentType || "",
          METHOD_LABELS[row.method] || row.method || "",
          Math.round((net + discount) * 100) / 100,
          row.paymentId || "",
          discount,
          net,
          row.patient?.payments?.pendingAmount ?? "",
          row.remarks || "",
          row.createdBy?.name || "",
          dateTime(row.createdBy?.date || row.createdAt),
          row.editors?.length || 0,
        ];
      });

      const csv = [headers, ...csvRows]
        .map((line) => line.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions_${activeCategory.toLowerCase()}_${getTodayDate()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast?.success?.(`Exported ${allRows.length.toLocaleString()} transaction${allRows.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast?.error?.(err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-slate-50 ${Sidebar ? "lg:flex" : ""}`}>
        {Sidebar && <Sidebar />}
        <div className="flex-1 min-w-0 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </div>

            <p className="text-sm font-semibold text-slate-700">
              Loading transactions
            </p>

            <p className="text-xs text-slate-400 mt-1">
              Fetching your financial records...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen bg-slate-50 ${Sidebar ? "lg:flex" : ""}`}>
        {Sidebar && <Sidebar />}
        <div className="flex-1 min-w-0 flex items-center justify-center min-h-screen p-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm max-w-md w-full p-7 text-center">
          <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-rose-500" />
          </div>

          <h2 className="font-bold text-slate-900">
            Unable to load transactions
          </h2>

          <p className="text-sm text-slate-500 mt-2">
            {error}
          </p>

          <button
            onClick={() => fetchData(true)}
            className="mt-5 h-10 px-4 rounded-lg bg-slate-950 text-white text-sm font-semibold"
          >
            Try again
          </button>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-[#f6f7f9] ${
        Sidebar ? "lg:flex" : ""
      }`}
    >
      {Sidebar && <Sidebar />}

      <main
        className={
          Sidebar ? "flex-1 min-w-0" : "w-full"
        }
      >
        <div
          className={`max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 pb-5 sm:pb-7 ${
            Sidebar
              ? "pt-16 lg:pt-7"
              : "pt-5 sm:pt-7"
          }`}
        >
          <PageHeader
            activeCategory={activeCategory}
            refreshing={refreshing}
            onRefresh={() => fetchData(true)}
            onExport={handleExport}
            exporting={exporting}
            onCreate={() =>
              router.push(
                "/admin/transactions/create"
              )
            }
            hasExport={
              !NON_TRANSACTION_TABS.includes(
                activeCategory
              )
            }
          />

          <KPIBar stats={stats} />

          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-slate-200">
              <CategoryNavigation
                activeCategory={activeCategory}
                stats={stats}
                onChange={setActiveCategory}
              />
            </div>

            {!NON_TRANSACTION_TABS.includes(
              activeCategory
            ) && (
              <TransactionToolbar
                search={tableSearch}
                onSearch={handleSearch}
                showFilters={showFilters}
                onToggleFilters={() =>
                  setShowFilters((v) => !v)
                }
                pendingOnly={pendingOnly}
                onPendingToggle={() =>
                  setPendingOnly((v) => !v)
                }
                activeCategory={activeCategory}
                hasActiveFilters={
                  hasActiveFilters
                }
                activeFilterCount={activeFilterCount}
                onClear={clearFilters}
                activeDatePreset={activeDatePreset}
                onDatePreset={onDatePreset}
              />
            )}

            {showFilters &&
              !NON_TRANSACTION_TABS.includes(
                activeCategory
              ) && (
                <FilterPanel
                  activeCategory={activeCategory}
                  draftFilters={draftFilters}
                  setDraftFilters={
                    setDraftFilters
                  }
                  applyFilters={applyFilters}
                  hasPendingChanges={
                    hasPendingChanges
                  }
                  appliedFilters={
                    appliedFilters
                  }
                  removeFilter={removeFilter}
                  onReset={clearFilters}
                />
              )}

            {activeCategory === "SUSPENSE" ? (
              <SuspenseManager />
            ) : activeCategory === "CONTRA" ? (
              <ContraManager />
            ) : transactions.length === 0 ? (
              <EmptyState
                hasFilters={
                  hasActiveFilters
                }
              />
            ) : (
              <>
                <DesktopTable
                  category={activeCategory}
                  rows={transactions}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  onDelete={setDeleteTarget}
                  onReverse={setReverseTarget}
                  onBill={openBill}
                  onEdit={onEditRow}
                  expandedId={expandedId}
                  onExpand={toggleExpand}
                  linkedInfo={expandedInfo}
                  linkedLoading={
                    expandedLoading
                  }
                />

                <div className="md:hidden">
                  {transactions.map((row) => (
                    <MobileTransactionCard
                      key={row._id}
                      row={row}
                      category={activeCategory}
                      expanded={
                        expandedId === row._id
                      }
                      onExpand={() =>
                        toggleExpand(row)
                      }
                      onDelete={
                        setDeleteTarget
                      }
                      onReverse={
                        setReverseTarget
                      }
                      onBill={openBill}
                      onEdit={onEditRow}
                      linkedInfo={expandedInfo}
                      linkedLoading={expandedLoading}
                    />
                  ))}
                </div>

                <Pagination
                  page={current}
                  pages={pages}
                  perPage={perPage}
                  total={total}
                  startIdx={startIdx}
                  endIdx={endIdx}
                  setPage={setPage}
                  setPerPage={setPerPage}
                />
              </>
            )}
          </section>
        </div>
      </main>

      {}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="w-11 h-11 rounded-xl bg-rose-50 flex items-center justify-center mb-4">
              <Trash2 className="w-5 h-5 text-rose-600" />
            </div>

            <h2 className="text-lg font-bold text-slate-950">
              Delete transaction?
            </h2>

            <p className="text-sm text-slate-500 mt-2">
              This action cannot be undone.
            </p>

            <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">
                  Amount
                </span>

                <span className="font-bold text-rose-600">
                  {formatCurrency(
                    deleteTarget.amount
                  )}
                </span>
              </div>

              <div className="flex justify-between mt-2">
                <span className="text-xs text-slate-500">
                  Date
                </span>

                <span className="text-sm font-semibold text-slate-700">
                  {formatDateForDisplay(
                    deleteTarget.date
                  )}
                </span>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() =>
                  setDeleteTarget(null)
                }
                className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  try {
                    const category =
                      deleteTarget.transactionCategory ||
                      deleteTarget.category ||
                      "TRANSPLANT";

                    const endpoint =
                      category === "TRANSPLANT"
                        ? "/api/transactions/transplant/delete"
                        : category === "SERVICE"
                        ? "/api/transactions/service/delete"
                        : category === "MEDICINE"
                        ? "/api/transactions/medicine/delete"
                        : "/api/transactions/expense/delete";

                    const res = await fetch(
                      endpoint,
                      {
                        method: "DELETE",
                        headers: {
                          "Content-Type":
                            "application/json",
                        },
                        credentials: "include",
                        body: JSON.stringify({
                          transactionId:
                            deleteTarget._id,
                        }),
                      }
                    );

                    const data =
                      await res.json();

                    if (!res.ok) {
                      throw new Error(
                        data.error ||
                          "Delete failed"
                      );
                    }

                    toast.success(
                      "Transaction deleted"
                    );

                    setDeleteTarget(null);
                    fetchData(true);
                  } catch (err) {
                    toast.error(
                      err.message ||
                        "Delete failed"
                    );
                  }
                }}
                className="flex-1 h-10 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {reverseTarget && (
        <ReverseTransactionModal
          transaction={reverseTarget}
          onClose={() =>
            setReverseTarget(null)
          }
          onDone={() => fetchData(true)}
        />
      )}

      {billTransaction && (
        <BillGenerator
          transactionId={
            billTransaction.patient &&
            billTransaction.costType ===
              "Revenue"
              ? typeof billTransaction.patient ===
                "object"
                ? billTransaction.patient._id
                : billTransaction.patient
              : billTransaction._id
          }
          onClose={() =>
            setBillTransaction(null)
          }
        />
      )}
    </div>
  );
}

export default function TransactionsListPage({
  Sidebar,
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50" />
      }
    >
      <AllTransactionsPageInner
        Sidebar={Sidebar}
      />
    </Suspense>
  );
}
