# Owner Panel v2 — Part 0 delivery notes

## What shipped

| Brief item | Status |
|---|---|
| A. `Employee` schema: `callbyUserId`, `dateOfJoining`, `tlName`, `managerName` | ✅ `src/models/Employee.js` (+ create/update APIs accept DOJ/TL/manager; `callbyUserId` only via the links route) |
| B. Reconciliation script | ✅ `scripts/sync-callby-links.mjs` (code-only: `Employee.employeeId` == callby's `ryanEmployeeCode`; dry-run by default) |
| C. Manual-linking UI | ✅ `/owner/employees/links` + `src/app/api/owner/callby-links/route.js` |
| D1. `<FilterBar />` (F3) | ✅ `src/components/owner/FilterBar.jsx` + `src/lib/owner/useOwnerFilters.js` — URL-query state, default range **Today**, presets incl. This Week / This Month |
| D2. `<ReportTable />` (F4) | ✅ `src/components/owner/ReportTable.jsx` + `src/lib/owner/pagination.js` — server pagination props, column toggle (persisted), CSV export, sticky first column |
| D3. currency formatter reconcile | ✅ cross-ref comments in `financeUI.js` ⇄ `owner/format.js`; no third formatter |
| E. Auth guard (F6) | ✅ verified — `layout.jsx` `getServerSession` guard + `src/proxy.js` edge guard already in place from the 2026-09-10 pass; no `middleware.js` (would break Next 16) |
| F. New nav shell + route tree + redirects (F8) | ✅ 10 collapsible sections in `OwnerSidebar.js`; every sitemap route resolves; old routes 307 via `next.config.mjs` |
| F1/F2 helpers already done | `ownerFetch.js`, `owner/format.js`, `owner/filters.js` from the prior pass — extended, not rebuilt |

**Also:** dropped the dead `chart.js` / `react-chartjs-2` entries from
`next.config.mjs` `optimizePackageImports` (deps were removed earlier).
`npm run build` passes; all 10 sections + children compile.

## Existing pages → new sitemap

Working pages were **moved** (git mv) to their new path so they keep working
unchanged; old URLs redirect via `next.config.mjs`.

| Old | New |
|---|---|
| `/owner/agent-360` | `/owner/employees/agents` |
| `/owner/staff-360` | `/owner/employees/other` |
| `/owner/leadership` | `/owner/employees/leadership` |
| `/owner/live-workforce` | `/owner/calls/live` |
| `/owner/forecast` | `/owner/calls/forecast` |
| `/owner/sim-health` | `/owner/calls/sim-health` *(Soon)* |
| `/owner/retry` | `/owner/leads/retry` *(Soon — was a redirect to live-workforce)* |
| `/owner/leaks` | `/owner/leads/leaks` |
| `/owner/patient-journey` | `/owner/patients/journey` |
| `/owner/counsellor-conversion` | `/owner/patients/counsellor-conversion` |
| `/owner/surgery-planner` | `/owner/patients/surgery-planner` |
| `/owner/ad-spend` | `/owner/marketing/ad-spend` |
| `/owner/marketing` | `/owner/marketing/platforms` (`/owner/marketing` is now the section landing) |
| `/owner/conversion` | `/owner/statistics` |
| `/owner/attendance` | `/owner/ai/attendance` *(Soon)* |
| `/owner/ai-health` | `/owner/ai/health` *(Soon)* |
| `/owner/clinical-ai-quality` | `/owner/ai/clinical-quality` *(Soon)* |
| `/owner/payroll` | `/owner/hr/payroll` *(Soon)* |
| `/owner/hr-actions` | `/owner/hr/actions` *(Soon)* |
| `/owner/dashboard`, `/owner/finance` | unchanged (rebuilt in later parts) |

Per your call, the four coming-soon stubs (sim-health, clinical-ai-quality,
payroll, hr-actions) were **kept** as labelled "Soon" entries under their
best-fit section — not deleted.

New placeholder routes (ComingSoon, tagged with the part that fills them):
`employees/counsellors|surgery|hr` (P1), `leads/retry` (P2),
`marketing/campaigns` (P4), plus a landing page per section.

---

## Answers received (2026-09-11)

1. **Manager hierarchy →** MasterData-backed TL→Manager map (kind `TL_MANAGER` or
   a small dedicated model). Built in Part 1.
2. **Attendance →** a real integration, not a punch-in feature built here. Which
   system to integrate with is still needed before Part 6 — ask then.
3. **Call target →** keep callby's live default, **100**, one number for everyone
   (not per-role).

## Reconciliation run #1 result (2026-09-10/11)

callby id field confirmed = `employeeId`; **callby exposes no phone**, so every
match was name-only. Headline match rate was 17% (57/326), but 326 counts every
active `Employee` including ~215 who can never be in callby (OT staff, doctors,
counsellors, reception, housekeeping, etc. — callby is calling-staff only). Real
caller-only match rate ≈ **52%** (57 of ~110 caller-type employees). Below the
60% conscious-decision line from the brief.

Causes: no phone to match on; dirty name variants on both sides
(`Sheetal Rathour`/`Sheetal Rathor`, etc.); callby has its own duplicate users
(`Abhishek Chandra` / `abhishek chandra`, `preeti`×2, `Kusum`×2…); ~45 unclaimed
callby users are the Collab team (`TL: Collab`) with no matching `Employee`.

**Still open:** whether to add a "SUGGESTED (review)" fuzzy-match tier to the
script before doing the rest by hand in `/owner/employees/links`, or apply the
57 confident matches and start Part 1 now with partial caller coverage.

## Resolved — nothing further blocking on these three

- **Manager hierarchy:** MasterData-backed map, not free text. Part 1 adds a
  `TL_MANAGER` mapping so one edit re-parents every agent under a TL.
- **Attendance:** an integration, not an in-house punch-in feature. **Still need:**
  which system to integrate with — ask before starting Part 6.
- **Call target:** 100, one number for everyone. No per-role/TL override.

## Open decision — reconciliation coverage before Part 1

Apply the 57 confident matches now, then choose:
- **(a)** add a fuzzy "SUGGESTED (review)" tier to the script first (should lift
  caller coverage from ~52% toward ~90% before any manual work), or
- **(b)** start Part 1 now and work through `/owner/employees/links` by hand in
  parallel, with the Agent page visibly flagging anyone not yet linked.
