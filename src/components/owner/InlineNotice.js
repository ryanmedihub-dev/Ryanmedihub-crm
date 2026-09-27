
export default function InlineNotice({ kind = "warn", title, children, action, onClose }) {
  return (
    <div className={`inline-notice${kind !== "warn" ? ` ${kind}` : ""}`} role={kind === "error" ? "alert" : "status"}>
      <div>
        {title && <strong>{title}</strong>}
        {children && <p className={title ? "inline-notice-body" : "inline-notice-body no-title"}>{children}</p>}
      </div>
      {(action || onClose) && (
        <div className="inline-notice-actions">
          {action}
          {onClose && (
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={onClose}>×</button>
          )}
        </div>
      )}
    </div>
  );
}
