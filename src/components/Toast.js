"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { X, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";

const ToastContext = createContext(null);

const POSITIONS = {
  "top-right": "top-4 right-4 items-end",
  "top-left": "top-4 left-4 items-start",
  "bottom-right": "bottom-4 right-4 items-end flex-col-reverse",
  "bottom-left": "bottom-4 left-4 items-start flex-col-reverse",
  "top-center": "top-4 left-1/2 -translate-x-1/2 items-center",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2 items-center flex-col-reverse",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ type = "info", message, title, duration = 5000, position = "top-right" }) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message, title, duration, position }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      success: (message, title = "Success", options = {}) => addToast({ type: "success", message, title, ...options }),
      error: (message, title = "Error", options = {}) => addToast({ type: "error", message, title, ...options }),
      warning: (message, title = "Warning", options = {}) => addToast({ type: "warning", message, title, ...options }),
      info: (message, title = "Info", options = {}) => addToast({ type: "info", message, title, ...options }),
    }),
    [addToast]
  );

  // Group per position so concurrent toasts stack instead of overlapping.
  const byPosition = toasts.reduce((acc, t) => {
    const p = POSITIONS[t.position] ? t.position : "top-right";
    (acc[p] = acc[p] || []).push(t);
    return acc;
  }, {});

  return (
    <ToastContext.Provider value={value}>
      {children}
      {Object.entries(byPosition).map(([pos, list]) => (
        <div
          key={pos}
          aria-live="polite"
          className={`fixed z-[100] flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))] pointer-events-none ${POSITIONS[pos]}`}
        >
          {list.map((t) => (
            <Toast key={t.id} {...t} onClose={() => removeToast(t.id)} />
          ))}
        </div>
      ))}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

const CONFIG = {
  success: { icon: CheckCircle2, color: "text-emerald-600" },
  error: { icon: XCircle, color: "text-rose-600" },
  warning: { icon: AlertTriangle, color: "text-amber-600" },
  info: { icon: Info, color: "text-indigo-600" },
};

function Toast({ type, message, title, duration, onClose }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!(duration > 0) || paused) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose, paused]);

  const { icon: Icon, color } = CONFIG[type] || CONFIG.info;

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="toast-in pointer-events-auto w-full bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 flex items-start gap-3"
    >
      <Icon className={`w-[18px] h-[18px] mt-px shrink-0 ${color}`} aria-hidden />
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-medium text-gray-900">{title}</p>}
        {message && <p className={`text-sm text-gray-600 break-words ${title ? "mt-0.5" : ""}`}>{message}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
        className="shrink-0 -mr-1 p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default Toast;
