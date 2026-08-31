"use client";

import { useEffect, useRef } from "react";

export default function DrillSeam({ open, onClose, title, subtitle, children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <section
      className="seam"
      ref={ref}
      tabIndex={-1}
      role="region"
      aria-label={title || "Detail"}
    >
      <div className="seam-head">
        <div>
          {title && <h4>{title}</h4>}
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button type="button" className="link-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="seam-body">{children}</div>
    </section>
  );
}
