"use client";

import { Menu, Calendar, Check, X } from "lucide-react";
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
      console.log("Applying custom dates:", customDates);
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
      <div className="pr-2 lg:pr-4 pb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <Menu className="h-5 w-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-3 pl-2">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">
                  {title}
                </h2>
                <p className="text-sm text-gray-600">
                  Real-time performance metrics
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {typeof setBranch === "function" ? (
              <div className="flex items-center gap-2">
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
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
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              >
                {timeRanges.map((range) => (
                  <option key={range} value={range}>
                    {range === "Custom" ? "Custom Range" : range}
                  </option>
                ))}
              </select>

              {timeRange === "Custom" && (
                <button
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={applyCustomDate}
                        disabled={!customDates?.from || !customDates?.to}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check className="h-4 w-4" />
                        Apply
                      </button>
                      <button
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
