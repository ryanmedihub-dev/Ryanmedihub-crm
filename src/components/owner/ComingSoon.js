export default function ComingSoon({ icon = "🧭", title = "Coming soon", message }) {
  return (
    <div className="coming-soon">
      <div className="coming-soon-inner">
        <div className="cs-ico" aria-hidden="true">{icon}</div>
        <span className="cs-tag">Not yet available</span>
        <h2>{title}</h2>
        {message && <p>{message}</p>}
      </div>
    </div>
  );
}
