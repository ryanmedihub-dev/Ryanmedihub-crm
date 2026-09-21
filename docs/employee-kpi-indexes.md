# Owner panel rework — indexes

## Employee KPI rework (Task 1)

Two compound indexes, backing the queries `buildAgentMetrics`/`buildCompensationMetrics` in
`src/lib/owner/employeeReportQuery.js` already ran — they just didn't have a good index to
run on.

| Index | Model | Backs |
|---|---|---|
| `{ "personal.reference": 1, "ops.status": 1, "personal.visitDate": -1 }` | `Patient` | Grouping referred patients by referring employee, bounded by visit date, counted by status (`referred`/`visited`/`converted` on the Agent metrics). The existing `{ "personal.reference": 1 }` index is only a prefix and leaves the status/date work to a fetch-and-filter. |
| `{ "payee.kind": 1, "payee.refId": 1, purpose: 1, "period.year": 1, "period.month": 1, isCancelled: 1 }` | `Payable` | `buildCompensationMetrics`: EMPLOYEE payables for a cohort of employees over a pay-month window, split by purpose (salary vs. incentive). |

## Campaign lead upload (Task 2)

`src/models/CampaignLead.js` is a brand-new, empty collection, so these ship as ordinary
schema indexes with nothing to backfill:

| Index | Backs |
|---|---|
| `{ campaign: 1, phoneNormalized: 1 }` (unique) | One row per phone per campaign — makes re-uploading the same export a no-op instead of a duplicate. |
| `{ leadDate: -1 }` | Date-range filtering on the attribution report. |
| `{ platform: 1, branch: 1, leadDate: -1 }` | Filtering the report by platform/branch. |

## Deploying

No separate build step needed. Mongoose's default `autoIndex` behavior issues the
`createIndex` calls for any new schema index the next time the app connects, and MongoDB
(4.2+, which Atlas runs) builds indexes online by default — reads/writes aren't blocked while
it builds. Nothing here needs a manual script.

## Phone-normalization parity (Task 2)

`src/lib/uploads/__checks__/phoneParity.js` asserts `normalizePhone` (`src/lib/phone.js`)
produces the same 10-digit result across the phone formats campaign leads, patients, and
callby call logs actually show up in (`+91 …`, leading `0`, 12-digit with country code, spacing/
dashes). Run it with `node src/lib/uploads/__checks__/phoneParity.js` — it's a plain assertion
script, no test framework, same convention as `scripts/test/owner-dates.test.mjs`.
