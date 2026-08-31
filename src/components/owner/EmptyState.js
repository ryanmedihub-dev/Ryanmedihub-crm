export default function EmptyState({ icon = "◍", title = "Nothing here yet", hint, action }) {
  return (
    <div className="state empty">
      <div className="state-ico" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}
