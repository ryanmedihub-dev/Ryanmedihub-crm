import { Building2, Calendar, CreditCard, Landmark, Link2, Tag } from "lucide-react";
import { ALL_BRANCHES } from "@/lib/branches";
import { METHOD_LABELS } from "@/constants/paymentMethods";
import { FURTHER_MODES } from "@/constants/bankRouting";
import useMasterData from "@/lib/useMasterData";
import { ENTRY_TYPE_FILTER_OPTIONS } from "@/constants/entryTypes";
import SearchableMultiSelect from "@/components/SearchableMultiSelect";
import {
  getTodayDate,
  MULTI_FILTER_KEYS,
  NON_TRANSACTION_TABS,
  REVENUE_CATEGORIES,
  SERVICE_PROCEDURES,
  TRANSPLANT_PROCEDURES,
  UNTRACKED_FURTHER_MODE,
  formatDateForDisplay,
} from "./transactionsHelpers";
import { FilterChip } from "./TransactionBadges";

function Input({
  label,
  type = "text",
  value,
  onChange,
  icon: Icon,
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label}
      </span>

      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        )}

        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full h-10 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 ${
            Icon ? "pl-9 pr-3" : "px-3"
          }`}
        />
      </div>
    </label>
  );
}

export default function FilterPanel({
  activeCategory,
  draftFilters,
  setDraftFilters,
  applyFilters,
  hasPendingChanges,
  appliedFilters,
  removeFilter,
  onReset,
}) {
  const { expenseCategories, getExpenseTypes } = useMasterData();
  const hasAppliedFilters =
    MULTI_FILTER_KEYS.some(
      (key) => appliedFilters[key]?.length
    ) ||
    appliedFilters.dateFrom !== getTodayDate() ||
    appliedFilters.dateTo !== getTodayDate();

  const activeFilterCount = MULTI_FILTER_KEYS.reduce(
    (count, key) =>
      count + (appliedFilters[key]?.length || 0),
    0
  ) +
    (appliedFilters.dateFrom !== getTodayDate() ? 1 : 0) +
    (appliedFilters.dateTo !== getTodayDate() ? 1 : 0);

  return (
    <div className="border-b border-slate-200 bg-white">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
      >
        {}
        <div className="px-4 sm:px-6 pt-5 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 border border-slate-200">
                <svg
                  className="h-5 w-5 text-slate-700"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 5h18M6 12h12M10 19h4"
                  />
                </svg>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Filter transactions
                  </h3>

                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-slate-900 text-[10px] font-bold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </div>

                <p className="mt-0.5 text-xs text-slate-500">
                  Refine your financial records using the filters below.
                </p>
              </div>
            </div>

            {hasPendingChanges && (
              <div className="inline-flex items-center gap-2 self-start sm:self-auto rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span className="text-[11px] font-semibold text-amber-700">
                  Unsaved changes
                </span>
              </div>
            )}
          </div>
        </div>

        {}
        <div className="px-4 sm:px-6 pb-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {}
              <SearchableMultiSelect
                label="Branch"
                icon={Building2}
                allLabel="All Branches"
                value={draftFilters.branch}
                onChange={(v) =>
                  setDraftFilters((f) => ({
                    ...f,
                    branch: v,
                  }))
                }
                options={ALL_BRANCHES.map((b) => ({
                  value: b,
                  label: b,
                }))}
              />

              {}
              <Input
                label="From date"
                type="date"
                icon={Calendar}
                value={draftFilters.dateFrom}
                onChange={(v) =>
                  setDraftFilters((f) => ({
                    ...f,
                    dateFrom: v,
                  }))
                }
              />

              {}
              <Input
                label="To date"
                type="date"
                icon={Calendar}
                value={draftFilters.dateTo}
                onChange={(v) =>
                  setDraftFilters((f) => ({
                    ...f,
                    dateTo: v,
                  }))
                }
              />

              {}
              <SearchableMultiSelect
                label="Payment method"
                icon={CreditCard}
                allLabel="All Methods"
                value={draftFilters.paymentMethod}
                onChange={(v) =>
                  setDraftFilters((f) => ({
                    ...f,
                    paymentMethod: v,
                  }))
                }
                options={Object.keys(METHOD_LABELS).map((m) => ({
                  value: m,
                  label: METHOD_LABELS[m] || m,
                }))}
              />

              {}
              {!NON_TRANSACTION_TABS.includes(activeCategory) && (
                <SearchableMultiSelect
                  label="Entry type"
                  icon={Link2}
                  allLabel="All Entry Types"
                  value={draftFilters.entryType}
                  onChange={(v) =>
                    setDraftFilters((f) => ({
                      ...f,
                      entryType: v,
                    }))
                  }
                  options={ENTRY_TYPE_FILTER_OPTIONS.filter(
                    (o) => o.value
                  ).map((o) => ({
                    value: o.value,
                    label: o.label.replace(/ only$/, ""),
                  }))}
                />
              )}

              {}
              {(activeCategory === "ALL" ||
                activeCategory === "TRANSPLANT" ||
                activeCategory === "SERVICE") && (
                <SearchableMultiSelect
                  label="Procedure"
                  icon={Tag}
                  allLabel="All Procedures"
                  value={draftFilters.procedure}
                  onChange={(v) =>
                    setDraftFilters((f) => ({
                      ...f,
                      procedure: v,
                    }))
                  }
                  options={[
                    ...TRANSPLANT_PROCEDURES,
                    ...SERVICE_PROCEDURES,
                  ].map((p) => ({
                    value: p,
                    label: p,
                  }))}
                />
              )}

              {}
              {(REVENUE_CATEGORIES.includes(activeCategory) ||
                activeCategory === "EXPENSE" ||
                activeCategory === "ALL") && (
                <SearchableMultiSelect
                  label={
                    activeCategory === "EXPENSE"
                      ? "Paid from"
                      : "Received in"
                  }
                  icon={Landmark}
                  allLabel="All Accounts"
                  value={draftFilters.furtherMode}
                  onChange={(v) =>
                    setDraftFilters((f) => ({
                      ...f,
                      furtherMode: v,
                    }))
                  }
                  options={[
                    {
                      value: UNTRACKED_FURTHER_MODE,
                      label: "Untracked",
                    },
                    ...FURTHER_MODES.map((m) => ({
                      value: m,
                      label: m,
                    })),
                  ]}
                />
              )}

              {}
              {(activeCategory === "EXPENSE" ||
                activeCategory === "ALL") && (
                <>
                  <SearchableMultiSelect
                    label="Expense category"
                    allLabel="All Categories"
                    value={draftFilters.expenseCategory}
                    onChange={(v) =>
                      setDraftFilters((f) => ({
                        ...f,
                        expenseCategory: v,
                        expenseType: [],
                      }))
                    }
                    options={expenseCategories.map((c) => ({
                      value: c,
                      label: c,
                    }))}
                  />

                  {}
                  <SearchableMultiSelect
                    label="Expense type"
                    allLabel="All Types"
                    value={draftFilters.expenseType}
                    onChange={(v) =>
                      setDraftFilters((f) => ({
                        ...f,
                        expenseType: v,
                      }))
                    }
                    options={(
                      draftFilters.expenseCategory.length
                        ? [
                            ...new Set(
                              draftFilters.expenseCategory.flatMap(
                                (c) => getExpenseTypes(c)
                              )
                            ),
                          ]
                        : [
                            ...new Set(
                              expenseCategories.flatMap((c) =>
                                getExpenseTypes(c)
                              )
                            ),
                          ]
                    ).map((t) => ({
                      value: t,
                      label: t,
                    }))}
                  />
                </>
              )}
            </div>

            {}
            <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs text-slate-500">
                {hasPendingChanges ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Review your changes before applying.
                  </span>
                ) : (
                  <span>
                    Select one or more filters to narrow the results.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {onReset && (
                  <button
                    type="button"
                    onClick={onReset}
                    className="
                      h-10 px-4
                      rounded-xl
                      border border-slate-200
                      bg-white
                      text-sm font-semibold text-slate-600
                      hover:bg-slate-100
                      hover:text-slate-900
                      active:scale-[0.98]
                      transition-all duration-150
                    "
                  >
                    Reset
                  </button>
                )}

                <button
                  type="submit"
                  disabled={!hasPendingChanges}
                  className="
                    h-10 px-5
                    rounded-xl
                    bg-slate-950
                    text-white
                    text-sm font-semibold
                    shadow-sm
                    hover:bg-slate-800
                    active:scale-[0.98]
                    disabled:bg-slate-200
                    disabled:text-slate-400
                    disabled:shadow-none
                    disabled:cursor-not-allowed
                    transition-all duration-150
                  "
                >
                  Apply filters
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {}
      {hasAppliedFilters && (
        <div className="px-4 sm:px-6 pb-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="shrink-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                    <svg
                      className="h-3.5 w-3.5 text-slate-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 5h18M6 12h12M10 19h4"
                      />
                    </svg>
                  </span>

                  <span className="text-xs font-bold text-slate-700">
                    Active filters
                  </span>
                </div>
              </div>

              <div className="flex flex-1 flex-wrap gap-2">
                {}
                {appliedFilters.branch.map((v) => (
                  <FilterChip
                    key={`branch-${v}`}
                    label={`Branch: ${v}`}
                    onRemove={() =>
                      removeFilter("branch", v)
                    }
                  />
                ))}

                {}
                {appliedFilters.dateFrom && (
                  <FilterChip
                    label={`From: ${formatDateForDisplay(
                      appliedFilters.dateFrom
                    )}`}
                    onRemove={() =>
                      removeFilter("dateFrom")
                    }
                  />
                )}

                {}
                {appliedFilters.dateTo && (
                  <FilterChip
                    label={`To: ${formatDateForDisplay(
                      appliedFilters.dateTo
                    )}`}
                    onRemove={() =>
                      removeFilter("dateTo")
                    }
                  />
                )}

                {}
                {appliedFilters.paymentMethod.map((v) => (
                  <FilterChip
                    key={`method-${v}`}
                    label={`Method: ${
                      METHOD_LABELS[v] || v
                    }`}
                    onRemove={() =>
                      removeFilter("paymentMethod", v)
                    }
                  />
                ))}

                {}
                {appliedFilters.procedure.map((v) => (
                  <FilterChip
                    key={`procedure-${v}`}
                    label={`Procedure: ${v}`}
                    onRemove={() =>
                      removeFilter("procedure", v)
                    }
                  />
                ))}

                {}
                {appliedFilters.furtherMode.map((v) => (
                  <FilterChip
                    key={`account-${v}`}
                    label={`Account: ${
                      v === UNTRACKED_FURTHER_MODE
                        ? "Untracked"
                        : v
                    }`}
                    onRemove={() =>
                      removeFilter("furtherMode", v)
                    }
                  />
                ))}

                {}
                {appliedFilters.expenseCategory.map((v) => (
                  <FilterChip
                    key={`expense-category-${v}`}
                    label={`Category: ${v}`}
                    onRemove={() =>
                      removeFilter("expenseCategory", v)
                    }
                  />
                ))}

                {}
                {appliedFilters.expenseType.map((v) => (
                  <FilterChip
                    key={`expense-type-${v}`}
                    label={`Type: ${v}`}
                    onRemove={() =>
                      removeFilter("expenseType", v)
                    }
                  />
                ))}

                {}
                {appliedFilters.entryType.map((v) => (
                  <FilterChip
                    key={`entry-${v}`}
                    label={`Entry: ${
                      ENTRY_TYPE_FILTER_OPTIONS.find(
                        (o) => o.value === v
                      )?.label || v
                    }`}
                    onRemove={() =>
                      removeFilter("entryType", v)
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
