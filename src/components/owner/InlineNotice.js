export default function InlineNotice({ kind = "warn", title, children, action }) {
  return (
    <div className={`inline-notice${kind !== "warn" ? ` ${kind}` : ""}`}>
      <div>
        {title && <strong>{title}</strong>}
        {children && <p style={{ margin: title ? "3px 0 0" : 0 }}>{children}</p>}
      </div>
      {action}
    </div>
  );
}
