import InlineNotice from "./InlineNotice";
import { fmtDateTime } from "@/lib/owner/format";

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
