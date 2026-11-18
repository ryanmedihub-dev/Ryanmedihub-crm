// Re-mounts on every admin navigation (the layout does not), so page content gets the entrance.
export default function AdminTemplate({ children }) {
  return <div className="page-in">{children}</div>;
}
