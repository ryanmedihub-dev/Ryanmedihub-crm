import InlineNotice from "./InlineNotice";
import { fmtDateTime } from "@/lib/owner/format";

// Every Marketing page shows this (Owner Panel v2, Part 4) — there is no
// Meta/Google API integration (a deliberate decision), so every number on
// these pages is hand-typed. An owner making a budget call needs to know
// whether they're looking at platform truth or someone's data entry.
export default function ManualDataNotice({ lastUpdatedAt, lastUpdatedBy }) {
  return (
    <InlineNotice kind="info" title="Hand-entered figures">
      These numbers are entered by hand — there is no live Meta/Google connection.
      {lastUpdatedAt && (
        <> Last entry: {fmtDateTime(lastUpdatedAt)}{lastUpdatedBy ? ` by ${lastUpdatedBy}` : ""}.</>
      )}
    </InlineNotice>
  );
}
