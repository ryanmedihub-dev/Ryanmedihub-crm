"use client";

import { useState } from "react";
import IncentiveEntryForm from "@/components/IncentiveEntryForm";
import TargetIncentiveForm from "@/components/TargetIncentiveForm";
import { HeartPulse, Target } from "lucide-react";

/**
 * The "Incentive" tab body: two inner modes — a per-patient incentive (tops up the monthly
 * INCENTIVE payable) and a target-based incentive (raises its own standalone payable).
 * Shared by the admin / reception / stock transaction-create pages.
 */
export default function IncentiveTabSwitcher({ picker }) {
  const [mode, setMode] = useState("patient"); // "patient" | "target"

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 flex flex-wrap gap-2">
        {[
          { id: "patient", label: "Patient Based Incentive", icon: HeartPulse },
          { id: "target", label: "Target Based Incentive", icon: Target },
        ].map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === m.id
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <m.icon className="w-4 h-4" />
            {m.label}
          </button>
        ))}
      </div>

      {mode === "patient" ? (
        <IncentiveEntryForm picker={picker} />
      ) : (
        <TargetIncentiveForm />
      )}
    </div>
  );
}
