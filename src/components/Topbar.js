"use client";

import { Calendar, Check, X } from "lucide-react";
import { useState } from "react";

export default function Topbar({
  title,
  setSidebarOpen,
  timeRange,
  setTimeRange,
  branch,
  setBranch,
  customDates,
  setCustomDates,
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const branches = ["All", "Delhi", "Mumbai", "Hyderabad", "Noida", "Gurgaon"];
  const timeRanges = ["Today", "Yesterday", "Last 7 Days", "Custom"];

  const handleCustomDateChange = (field, value) => {
    setCustomDates((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const applyCustomDate = () => {
    if (customDates?.from && customDates?.to) {
      setShowDatePicker(false);
    }
  };

  const handleCancelCustomDates = () => {
    setTimeRange("Today");
    setCustomDates({ from: "", to: "" });
    setShowDatePicker(false);
  };

  return (
    <section>
      {/* Pages give their <main> pt-16 on mobile to clear the sidebar menu button. */}
      <div className="pb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">{title}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Performance for the selected period</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {typeof setBranch === "function" ? (
              <div className="flex items-center gap-2">
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  aria-label="Branch"
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:border-gray-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-transparent text-sm"
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b === "All" ? "All Branches" : b}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex items-center gap-2 relative">
              <select
                value={timeRange}
                onChange={(e) => {
                  setTimeRange(e.target.value);
                  if (e.target.value !== "Custom") {
                    setShowDatePicker(false);
                  }
                }}
                aria-label="Date range"
              className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:border-gray-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-transparent text-sm"
              >
                {timeRanges.map((range) => (
                  <option key={range} value={range}>
                    {range === "Custom" ? "Custom Range" : range}
                  </option>
                ))}
              </select>

              {timeRange === "Custom" && (
                <button
                  type="button"
                  aria-label="Pick custom dates"
                  aria-expanded={showDatePicker}
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="p-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
                >
                  <Calendar className="h-4 w-4" />
                </button>
              )}

              {showDatePicker && timeRange === "Custom" && (
                <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50 min-w-75">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        From Date
                      </label>
                      <input
                        type="date"
                        value={customDates?.from || ""}
                        onChange={(e) =>
                          handleCustomDateChange("from", e.target.value)
                        }
                        className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        To Date
                      </label>
                      <input
                        type="date"
                        value={customDates?.to || ""}
                        onChange={(e) =>
                          handleCustomDateChange("to", e.target.value)
                        }
                        min={customDates?.from}
                        className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15 transition-[border-color,box-shadow] duration-150"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={applyCustomDate}
                        disabled={!customDates?.from || !customDates?.to}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check className="h-4 w-4" />
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelCustomDates}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
