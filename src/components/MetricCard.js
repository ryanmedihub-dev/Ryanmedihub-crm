"use client";

import StatCard from "@/components/dashboard/StatCard";

// Legacy API ({ color: "from-x-500 to-x-600" }) kept for existing callers.
export default function MetricCard({ title, value, icon, color, trend, onClick }) {
  return <StatCard title={title} value={value} icon={icon} tone={color} trend={trend} onClick={onClick} />;
}
