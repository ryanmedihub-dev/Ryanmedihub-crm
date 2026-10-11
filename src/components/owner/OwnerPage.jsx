import OwnerTopbar from "./OwnerTopbar";

/**
 * Per-page header + content column. The grid shell and sidebar come from the
 * owner layout (see OwnerShell), so a page only owns its topbar and body.
 */
export default function OwnerPage({ title, subtitle, controls, aiState, children }) {
  return (
    <>
      <OwnerTopbar title={title} subtitle={subtitle} controls={controls} aiState={aiState} />
      <div className="content">{children}</div>
    </>
  );
}
