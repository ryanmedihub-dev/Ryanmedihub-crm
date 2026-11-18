"use client";

export default function TransactionSectionCard({ title, subtitle, icon: Icon, children, className = "" }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 px-5 py-5 ${className}`}>
      {title && (
        <div className="mb-4">
          <h3 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-gray-400" />}
            {title}
          </h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
