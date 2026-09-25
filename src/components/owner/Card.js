export default function Card({
  title,
  subtitle,
  actions,
  className = "",
  style,
  children,
  variant = "glass", // every owner Card is glass by default now — pass variant="" to opt out
}) {
  return (
    <div className={`card${variant ? ` card-${variant}` : ""}${className ? ` ${className}` : ""}`} style={style}>
      {(title || subtitle || actions) && (
        <div className="card-title">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
