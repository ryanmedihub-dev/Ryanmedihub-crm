# Owner "AI Everywhere" — build notes

One section per part, appended as each ships. See the prompt pack's part files for full specs.

## Part 1 — AI Core Backend

**Files created**
```
src/lib/ai/config.js
src/lib/ai/context.js
src/lib/ai/links.js
src/lib/ai/alias.js
src/lib/ai/fingerprint.js
src/lib/ai/sources.js
src/lib/ai/schemas.js
src/lib/ai/grounding.js
src/lib/ai/openai.js
src/lib/ai/engine.js
src/lib/ai/features/index.js
src/lib/ai/features/_helpers.js
src/lib/ai/features/dashboard.js   (stub)
src/lib/ai/features/employees.js   (real: employees.agent — brief + verdicts)
src/lib/ai/features/calls.js       (stub)
src/lib/ai/features/leads.js       (stub)
src/lib/ai/features/patients.js    (stub)
src/lib/ai/features/marketing.js   (stub)
src/lib/ai/features/hr.js          (stub)
src/lib/ai/features/finance.js     (stub)
src/lib/ai/features/aiops.js       (stub)
src/models/AiRun.js
src/models/AiInsight.js
src/app/api/owner/ai/insight/[feature]/route.js
src/app/api/owner/ai/insight/[feature]/feedback/route.js
src/app/api/owner/ai/verdicts/[feature]/route.js
src/app/api/owner/ai/feed/route.js
```

**Files changed**
- `src/components/Sidebars/OwnerSidebar.js` — one-line comment above `SECTIONS` pointing at `src/lib/ai/links.js`.
- `.env.example` — appended the new `AI_*` knobs (reuses the existing `OPENAI_API_KEY`).

**Feature keys wired:** `employees.agent` (brief + verdicts), proven end-to-end.

**Deviation from the spec worth flagging:** section 11 documents the feature contract as `collect(scope, ctx)`, but section 14 requires `collect` to force `page=1,pageSize=200,sortBy=totalCalls,sortDir=desc` for `brief` and the table's own paging for `verdicts` — which needs to know which kind is running. `ctx = { session, signal }` has no `kind`. Resolved by having the engine call `feature.collect(scope, ctx, kind)` (kind as an explicit third argument, not stuffed into `ctx`) — every feature file signs `async collect(scope, ctx, kind)`. Keep this in mind for Parts 4–9's feature files.

**Source-adapter smoke test:** `callRoute(agentsGET, …)` against `GET /api/owner/employees/agents` (`src/app/api/owner/employees/agents/route.js` → `runEmployeeReportQuery`) — its own `getServerSession(authOptions)` call resolves correctly when invoked in-process from inside another route handler in the same request, because `next/headers` cookies are read from request-scoped async local storage, not from an actual HTTP request. No auth bypass needed, no fallback extraction required.

**Verified**
- `npm run lint` (eslint) on all new/changed files: 0 errors, 0 warnings.
- `npm run build`: passes; all four new API routes appear in the route manifest (`/api/owner/ai/feed`, `/api/owner/ai/insight/[feature]`, `/api/owner/ai/insight/[feature]/feedback`, `/api/owner/ai/verdicts/[feature]`).
- Dev server smoke test (no session cookie): all three new routes return `403 Unauthorized` as expected — confirms they compile, mount, and the auth guard runs before the engine.

**Not verified in this session (environment constraint):** a live SSE run against a real owner session and a real `OPENAI_API_KEY` call — this dev environment has no browser/login to mint a session cookie. Before relying on this in production, do the spec's manual check once: log in as owner, `curl -N` the insight route with the browser's session cookie for `employees.agent?kind=brief`, confirm the event sequence `stage collect → stage compute → stage analyze (deltas) → stage verify → done`, then repeat the same request and confirm the second call returns `done` with `cached:true` and no new OpenAI call (check `AiRun` — one `MISS` row then one `HIT` row, no second `costUsd`). Also confirm `AI_ENABLED=0` returns `{type:"status", status:"disabled"}` with no `AiRun.model` set.

**Nothing else skipped** — the engine, all 4 routes, both models, the schema/grounding/alias/PII pipeline, and one full feature (`employees.agent`, brief + verdicts) are implemented per spec.

## Part 2 — AI UI Kit, Motion System & Theme

**Files created**
```
src/app/owner/owner-ai.css
src/components/owner/ai/MotionRoot.jsx
src/components/owner/ai/NeuralBackdrop.jsx
src/components/owner/ai/AiOrb.jsx
src/components/owner/ai/AiPipeline.jsx
src/components/owner/ai/AiStreamText.jsx
src/components/owner/ai/AiScoreRing.jsx
src/components/owner/ai/AiBriefPanel.jsx
src/components/owner/ai/AiFactsDrawer.jsx
src/components/owner/ai/AiScanOverlay.jsx
src/components/owner/ai/AiVerdictChip.jsx
src/components/owner/ai/aiVerdictColumn.jsx
src/components/owner/ai/AiDeepReview.jsx
src/components/owner/ai/AiStatusBeacon.jsx
src/components/owner/ai/AiFeedTicker.jsx
src/components/owner/ai/AiCommandBar.jsx
src/components/owner/ai/AiNotice.jsx
src/components/owner/ai/CountUp.jsx
src/components/owner/ai/index.js
src/lib/ai/client/useAiInsight.js
src/lib/ai/client/useAiVerdicts.js
src/lib/ai/client/partialJson.js
src/lib/ai/client/aiLabels.js
scripts/check-partial-json.mjs   (runnable self-check for the streaming-JSON parser, repo's existing scripts/*.mjs convention)
```

**Files changed**
- `src/app/owner/layout.jsx` — imports `owner-ai.css`; mounts `MotionRoot` (wrapping `NeuralBackdrop` + `children` + `AiCommandBar`) inside `ShellProvider`.
- `src/components/owner/ThemeContext.js` — default theme `"light"` → `"dark"` (one line; stored preference still wins).
- `src/components/owner/KpiRow.js` — rewritten off Tailwind onto the existing `.kpi`/`.kpi-lead`/`.kpi-band`/`.kpi-support` classes (see deviation below); adds `CountUp` via optional `rawValue`+`format` props, same API otherwise.
- `src/components/owner/Card.js` — new `variant` prop, defaults to `"glass"` (pass `variant=""` to opt out); no other API change.
- `src/components/owner/Modal.js` — new `variant` prop (`"center"` default, `"drawer"` for a right-side sheet); reused for `AiFactsDrawer` instead of duplicating its focus-trap logic.
- `src/lib/ai/links.js` — `OWNER_LINKS` now derived from one `LINK_ITEMS` array that also carries labels, exported as `OWNER_LINK_ITEMS` for `AiCommandBar`'s "Go to" search. `isAllowedLink`/`OWNER_LINKS` behavior unchanged.
- `src/app/owner/employees/agents/page.jsx` — temporary `<AiBriefPanel feature="employees.agent" scope={{}} title="Agents" />` mount above the table (Part 2 done-criteria smoke test; Part 4 wires it to live filters and finalizes placement across all 5 Employees pages).

**Deviations worth flagging:**
1. **KPI classes**: the spec names new `.kpi-card` classes in `owner-ai.css`, but `owner-theme.css` already had a fully-styled `.kpi`/`.kpi-lead`/`.kpi-band`/`.kpi-support` system (unused — `KpiRow.js` had drifted onto ad-hoc Tailwind at some point). Reused the existing classes and only added glass/hover/stagger on top in `owner-ai.css`, per the ladder's "already in this codebase" rule — avoids two parallel KPI styling systems.
2. **Dark base palette**: only `--bg` was moved to the brief's `#0a0b14`; did not add `backdrop-filter` blur to every existing surface app-wide. The "Visual direction" preamble describes a fuller glass reskin, but the authoritative, itemized "Upgrades to existing shared components" section scopes glass to `KpiRow`/`Card`/`Skeleton`/`ReportTable` specifically — went with the itemized scope to keep the diff minimal and not risk contrast/readability on the dozens of untouched owner pages this part didn't visually QA.
3. **AiFactsDrawer** reuses `Modal.js`'s existing focus-trap/Escape/overlay-close logic via a new `variant="drawer"` prop instead of re-implementing a trap.
4. **AiStatusBeacon** calls `/api/owner/ai/health?lite=1`, which doesn't exist until Part 9 — this is expected per the spec ("until then, render 'AI Online' only if the last `useAiInsight` result was ok"); it catches the failed fetch and falls back to `hasRecentSuccess()` (a new tiny export off `useAiInsight`'s module-level cache).

**Verified**
- `npm run lint` (eslint) on all new/changed files: 0 errors, 0 warnings (KpiRow's Tailwind→CSS rewrite included). Note: `.jsx` page files are excluded by this repo's eslint config globs pre-existing this change — not something this part introduced or could fix.
- `node scripts/check-partial-json.mjs`: all 6 escape/streaming cases pass.
- `npm run build`: compiles successfully, all routes unaffected.
- Confirmed `motion.*` usage elsewhere in the repo (`super-admin/lead-funnel`, `sales/agents`) sits outside `/owner/**` and is unaffected by `MotionRoot`'s `LazyMotion strict` mode (strict only throws inside its own subtree).

**Not verified in this session (environment constraint):** no browser login session available to visually confirm the AiBriefPanel renders/streams/animates correctly on `/owner/employees/agents`, light/dark contrast, or the ⌘K palette in a real browser. Code-reviewed for CSS-class/selector consistency between every component and `owner-ai.css` by hand; once Part 1's live SSE check is done, open `/owner/employees/agents` as owner and confirm the panel streams, "What AI saw" opens the facts drawer, and `Ctrl/⌘+K` opens the command palette.

## Part 3 — Shell, Dashboard "AI Command Center", Statistics

**Feature keys wired:** `dashboard.command` (brief, `AI_DEEP_MODEL`, ttl 30 min — new `src/lib/ai/features/dashboard.js`, replacing the Part 1 stub), `statistics.funnel` (brief, `AI_BRIEF_MODEL`, ttl 60 min — new `src/lib/ai/features/statistics.js`, wired into `features/index.js`; Statistics wasn't one of Part 1's registered files, so this is a small, logical addition).

**Files created**
```
src/lib/ai/features/statistics.js
src/lib/ai/client/useAiHealthBeacon.js   (shared poll/fallback logic — extracted so AiStatusBeacon and OwnerSidebar's pinned nav item don't duplicate it)
```

**Files changed**
- `src/lib/ai/features/dashboard.js` — real `dashboard.command` implementation (was an empty stub).
- `src/lib/ai/features/index.js` — registers `statistics.js`.
- `src/components/owner/ShellContext.js` — added `cmdBarOpen`/`openCommandBar`/`closeCommandBar`/`toggleCommandBar`, so `AiCommandBar`'s open state lives here instead of locally (OwnerTopbar's "⌘K Ask AI" button needs to open the same instance).
- `src/components/owner/ai/AiCommandBar.jsx` — reads/writes `cmdBarOpen` from `ShellContext` instead of local `useState`.
- `src/components/owner/ai/AiStatusBeacon.jsx` — now a thin wrapper around `useAiHealthBeacon()`.
- `src/components/owner/ai/AiBriefPanel.jsx` — new `variant="hero"` (orb 88, score ring 120, actions render as an "AI Priorities" card row instead of the side list) and new `aiState` prop (a page's own `useAiInsight` result, so `OwnerTopbar` and `AiBriefPanel` can share one stream instead of each starting their own).
- `src/components/Sidebars/OwnerSidebar.js` — glass sidebar (CSS), `AiOrb` brand mark, AI-gradient active rail, accordion sub-nav animates open/close via `m.div` height + `AnimatePresence` (180ms), pinned "AI Health" link (with a live status dot) rendered right after Dashboard, "⌘K Ask AI" footer hint.
- `src/components/owner/OwnerTopbar.js` — new `aiState` prop (renders "AI analyzing…" / "AI analyzed N min ago" next to the title), `AiStatusBeacon`, and an "⌘K Ask AI" button that calls `openCommandBar()`. Dark-mode gradient title is CSS-only.
- `src/components/owner/SectionLanding.jsx` — new optional `feature` prop renders a compact `AiBriefPanel`; card links get the `section-landing-card` hover-tilt class.
- `src/app/owner/owner-ai.css` — sidebar/topbar/section-landing/hero/priorities/stage-flag rules appended (see the new "Part 3" block, before the reduced-motion catch-all).
- `src/app/owner/dashboard/page.jsx` — hero `AiBriefPanel` + `AiFeedTicker` at the top (before the KPI row, per spec order), `KpiRow` items now carry `rawValue`+`format` for `CountUp`, revenue `AreaChart` restyled to the AI-cyan gradient/glow, `OwnerTopbar` gets `aiState`. Existing Attention/Funnel/Branch/Performers cards are unchanged logic — they already render as glass via Part 2's `Card` default.
- `src/app/owner/statistics/page.jsx` — `AiBriefPanel` above the funnel table, `OwnerTopbar` gets `aiState`, and the matching funnel-stage row gets a pulsing "✦ AI: biggest leak" badge when the AI's top insight names that stage.

**Deviations worth flagging:**
1. **Funnel component left untouched.** The spec's "Funnel component: animate bars growing left→right with stagger" assumes the Statistics page renders bars — it actually renders a `DataTable` (no bars at all); the shared `Funnel.js` bar component is used by the *Dashboard's* compact view instead, and also by two unrelated pages (`/owner/calls/forecast`, `/owner/patients`) this part has no way to visually re-verify. Redirecting `Funnel.js`'s bars from vertical to horizontal would restyle those pages too. Implemented the AI-highlight requirement instead as a small pulsing badge next to the matched stage's label in the existing `DataTable` — same "AI is pointing at this stage" effect, zero blast radius on other pages.
2. **Sidebar nth-child color-coding untouched.** The existing per-section icon colors are `nav > *:nth-child(N)`-indexed against `SECTIONS`' order (a documented fragility in the CSS). Rather than insert the pinned "AI Health" link as a new direct `<nav>` child (which would shift every subsequent index), it's nested inside the *Employees* section's own wrapper `<div className="nav-group">`, before that section's own head — visually "right under Dashboard," zero `<nav>`-child-count change, zero CSS renumbering needed.
3. **`AiBriefPanel`'s `aiState` prop** (needed so `OwnerTopbar` never starts a second stream) required adding one new optional prop rather than the literal two-prop-name reading in the spec (`ai:{feature,scope}` vs `aiState`) — implemented as a single `aiState` prop carrying the page's own `useAiInsight(...)` result; when absent, `AiBriefPanel` still calls its own hook exactly as before (no behavior change for Part 2's existing compact mount).

**Verified**
- `npm run lint`: 0 errors, 0 warnings on all new/changed files (pre-existing repo-wide gaps unrelated to this change: `.jsx` page files are outside this repo's eslint globs; `OwnerSidebar.js` already had one `exhaustive-deps` warning on an effect this part didn't touch).
- `npm run build`: compiles successfully; `/owner/dashboard`, `/owner/statistics`, and all 4 AI API routes present in the route manifest.
- Dev-server smoke test (no session): `/owner/dashboard`, `/owner/statistics`, `/owner/employees/agents` all return `307` (redirect to `/login`, the expected unauthenticated path) — confirms none of them 500 at compile/render time.

**Not verified in this session (environment constraint):** same as Part 2 — no browser login to confirm the hero panel actually streams on first load and shows `cached:true` on reload, sidebar/topbar keyboard and mobile-drawer behavior, or the Statistics AI-flag badge visually landing on the right row. Recommend an owner-session pass covering all three once Parts 1–2's live checks are done.

**Bug fixed in passing (Part 2's `useAiInsight.js`):** the stream reader never checked `res.ok` before treating the response body as an SSE stream — a guard failure (expired session, unknown feature) returns a plain JSON error response, which still has a readable `.body`, so it would silently hang in `status:"running"` forever instead of surfacing the error. Now checks `res.ok` first and throws with the JSON error's message.

## Part 4 — Employees Section

**Feature keys wired (all in `src/lib/ai/features/employees.js`):** `employees.overview`, `employees.agent` (refactored, same behaviour, see below), `employees.counsellor`, `employees.surgery`, `employees.hr`, `employees.other` (brief+verdicts each), `employees.leadership` (brief+verdicts — verdicts are per-TEAM, aliased `T`), `employees.team` (brief+verdicts, same math as `employees.agent` + `facts.orgMedians`), `employees.links` (brief only), `employee.deep` (deep, all 5 detail pages).

**Factory:** `makeSectionFeature({section-config})` — the 5 section-list features (Agent/Counsellor/Surgery/HR/Other) share one generic `collect`/`compute` (cohort math, bands, top5/bottom5, medians, capPayload); only each section's `rowFacts(row)` and `totalsFromRows(rows, {active,days})` are per-section. `employees.agent` sits on this factory now — same fields as Part 1's hand-written version (`totalCalls, connected, interested, referred, visited, converted, amountReceived` + the generic `alias/performanceScore/band/insufficientData/tenureDays`), same `cohort`/`totals`/`rates`/`bands`/`top5`/`bottom5` shape. `employees.team` and `employee.deep`'s cohort-median lookup both reuse the same `SECTION_CONFIG` registry (route + row-fact math), so there is exactly one implementation of "what an agent/counsellor/surgery/HR/other row's facts look like."

**Files changed**
- `src/lib/ai/features/employees.js` — full rewrite per above (was Part 1's single hand-written `employees.agent`).
- `src/lib/owner/hrEmployeeConfig.js`, `src/app/owner/employees/{agents,counsellors,surgery-staff,other-staff}/page.jsx` — added `aiFeature: "employees.<section>"`.
- `src/app/owner/employees/leadership/[tlNameKey]/page.jsx` — `aiFeature: "employees.team"`, `aiExtraScope: { tlNameKey }`.
- `src/components/owner/EmployeeReportPage.jsx` — new `config.aiFeature`/`config.aiVerdicts`/`config.aiExtraScope`; `AiBriefPanel` between topbar and KPIs (scope = table filters minus page/pageSize/sort); `useAiVerdicts` with the table's exact visible page/sort, `aiVerdictColumn` inserted as the 2nd column, `ReportPanel` wrapped in `AiScanOverlay`; a "↕ Sort by AI score (this page)" toggle in `ReportPanel`'s `toolbar` slot (client-side re-sort of the current page's rows only — no server round-trip); `OwnerTopbar` gets `aiState`.
- `src/components/owner/EmployeeDetailPage.jsx` — `AiDeepReview` mounted right after the entity header card; avatar gets a sentiment-coloured ring once the deep review is ready (`entity-avatar-ai-ring`); "AI 78" chip next to Performance; `TrendChart` gets the AI-cyan glow stroke.
- `src/components/owner/TrendChart.jsx` — new optional `stroke`/`glow` props (default unchanged — every other caller of this shared chart is unaffected).
- `src/components/owner/ai/AiDeepReview.jsx` — new `enabled`/`aiState` props, same "share one stream" pattern Part 3 added to `AiBriefPanel` (needed so the entity header's ring/score and the review panel read one `useAiInsight` call, not two).
- `src/app/owner/employees/page.jsx` (overview), `leadership/page.jsx`, `links/page.jsx` — `AiBriefPanel` + `aiState`; leadership additionally gets `aiVerdictColumn` per team row (`byId` keyed by `tlNameKey`, matching `ReportTable`'s row `id`).
- `src/app/owner/owner-ai.css` — `.entity-avatar-ai-ring` (sentiment ring) appended.

**Deviation worth flagging:** `employees.agent`'s verdicts `cohort` object is now named generically (`median_totalCalls`, `median_converted`, …, probed off `rowFacts`' own keys) instead of Part 1's hand-picked names (`medianCalls`, `medianConverted`). Functionally identical (still one median per relevant metric, fed to the same prompt rule "compare against cohort values") — kept the shared factory's one consistent naming scheme across all 5 sections rather than special-casing Agent's old names, which would have defeated the point of the factory. Everything else about `employees.agent`'s behaviour (fields, totals, rates, bands, top5/bottom5, focus lines) is byte-for-byte what Part 1 shipped.

**Verified**
- `npm run lint`: 0 errors, 0 warnings on every new/changed file (same pre-existing `.jsx`-globs gap as Parts 1–3, not introduced here).
- `npm run build`: compiles successfully.
- Dev-server smoke test (no session): all 5 list pages, the overview/leadership/links pages, one team roster URL, and one agent detail URL all return `307` (redirect to login) — none 500 at compile/render time.

**Not verified in this session (environment constraint):** same as every prior part — no browser login to confirm the brief/verdicts/deep-review actually stream, that a counsellor brief mentions package uplift with real data, or that clicking "Sort by AI score" visibly reorders the current page. Recommend an owner-session pass across the whole Employees section once Parts 1–3's live checks are done.

## Part 5 — Calls & Leads

**Feature keys wired:** `calls.overview`, `calls.live` (ttl 3 min), `calls.report`, `calls.employeeReport` (brief+verdicts), `calls.untracked`, `calls.forecast` — all in `src/lib/ai/features/calls.js` (was stub). `leads.overview`, `leads.report`, `leads.status` (one key shared by all 4 presets, `scope.preset` selects the angle), `leads.retry` — all in `src/lib/ai/features/leads.js` (was stub).

**13 pages wired** (6 calls incl. employee-report + 7 leads incl. 4 presets), **sim-health restyled** — all per the Done criteria checklist.

**Deviations worth flagging:**
1. **`calls.employeeReport` is not built on Part 4's employee-list factory.** Its route (`/api/owner/calls/employee-report`) returns a flat per-agent call summary with no `performance`/`bands`/pagination/`total` fields at all (see the route file) — the factory's cohort/bands/median machinery has nothing to plug into. Wrote a small bespoke `collect`/`compute` instead (same helper functions, same brief+verdicts shape the owner sees elsewhere), and wired the page manually (`AiBriefPanel` + `useAiVerdicts` + `aiVerdictColumn`) the same way Part 4 did for the Leadership page, which also isn't on `EmployeeReportPage`.
2. **`calls.forecast`'s facts are the real 30-day seed data** (`/api/owner/forecast`'s `defaults`), not the owner's live slider state — the page's "Projected Monthly Outcome" is pure client-side what-if math the owner drives, never sent anywhere. The brief instead computes its own "agents needed" from the same formula the page uses, applied to the real seeded baseline (documented `assumedCapacityPerAgent = 15`, the page's own default).
3. **`calls.live`'s facts don't have distinct online/idle/on-call states** — `workforce-summary` only exposes `isActive` (boolean) and cumulative call counts, no live call-state field. Built `agentsActive`/`agentsInactive` (real) plus a "behind pace" calc (`calls so far` vs `target × fraction of the IST day elapsed`) instead of inventing states the data doesn't have.
4. **Call-report/anomaly-marker chart:** `/owner/calls/report` (the `calls.report` feature's own page) has no chart, only a paginated call log table — there was nothing to attach a "days the AI mentions" marker to. The one real chart in the Calls section is `/owner/calls`'s "Calls by Hour" line (backed by `calls.overview`), so the AI-cyan glow + anomaly-dot behavior (new `TrendChart` `highlightLabel` prop, case-insensitive word match against the AI's top insight) landed there instead.
5. **`leads.report`'s "conversion into visits" fact was skipped** — lead rows have no visited/converted-to-patient flag in this route's response; not fabricated.
6. **`leads.status`'s "lost reasons distribution" was skipped** — no dedicated lost-reason field exists in callby (confirmed by `LAST_NOTE_COLUMN`'s own comment); the only close proxy is free-text call notes, which are never sent to the AI (text, and a PII/leak risk).
7. **Non-forced re-poll:** added a small `poll()` export to `useAiInsight` (alias for the same non-forced `run()` the mount effect already calls) so the Live page can re-check every 3 minutes without forcing past the server's cache/fingerprint check — `refresh()` still means "force." Also gave `/owner/calls/live`'s own data fetch a 60s `refreshInterval` (it had none before — a "live" page with zero auto-refresh didn't match its name).

**PII check (Done criteria):** `grep -n "name:\|phone:" src/lib/ai/features/calls.js src/lib/ai/features/leads.js` returns nothing — no compute() function puts a `name` or `phone` key in any facts object. Names are only ever read as a grouping key (`r.name`, `r.assignedTo.name`) immediately fed through `book.alias(...)`, never stored directly. `leads.status`'s `recovery.recovered` (which does carry name/phone from the route) is reduced to a status-count distribution before it reaches facts.

**Verified**
- `npm run lint`: 0 errors, 0 warnings (same pre-existing `.jsx`-globs gap as every prior part).
- `npm run build`: compiles successfully.
- Dev-server smoke test (no session): all 14 touched pages return `307` (redirect to login), none 500.

**Not verified in this session (environment constraint):** same standing caveat — no browser login to confirm any brief/verdict actually streams, the Live page's 3-minute re-poll fires and shows a HIT on unchanged data, or the anomaly marker lands on the right hour on the Calls Overview chart.

**Bug fixed in passing (this part's own code):** `calls.live` and `calls.employeeReport` aliased agents by `a.employeeId`/`r.employeeId` with no fallback — if that field were ever missing, every such agent would collapse onto the same alias (`"E:undefined"`), merging distinct people in the AI's view. Both now fall back to the agent's name as the alias key when `employeeId` is absent.

## Part 6 — Patients

**Feature keys wired:** `patients.overview`, `patients.preset` (one key shared by all 6 presets via `scope.preset`, verdicts enabled only on not-converted/booking-done), `patients.counsellorConversion` (brief+verdicts), `patients.surgeryPlanner`, `patient.deep` — all in new `src/lib/ai/features/patients.js`.

**10 pages wired**, as required: overview, 6 presets (all/not-converted/booking-done/converted/surgery-done/direct), counsellor-conversion, surgery-planner, patient detail `[id]`.

**Infrastructure change:** `src/lib/ai/sources.js`'s `callRoute` now supports POST (pass `body` instead of `params`) — `counsellor-conversion` and `surgery-planner` are POST-only routes (JSON body, no query params), unlike every GET route every other part's features have called so far.

**Follow-up verdict labels:** added `VERDICT_LABEL_SETS` to `aiLabels.js` (`performance` = existing labels, `followUp` = "Call today"/"Follow up this week"/"Low priority"/"Likely lost"/"Not enough data" — same enum, same colors, different wording) and a `labelSet` prop on `AiVerdictChip`/`aiVerdictColumn`. `PatientReportPage` passes `labelSet="followUp"` since patient verdicts are read as follow-up priority, not a performance rating.

**Privacy (Done criteria, stricter section rule):** `grep -nE '(name|phone|email|remarks|notes|age|gender):' src/lib/ai/features/patients.js` returns nothing — confirmed no facts object carries any of those keys. Journey timeline events use only categorical fields (`costType`, PRP `type`) and day-offsets, never free text. **Caught and fixed one real PII-guard bug in this part**: `assertNoPII`'s denied-key list blocks the bare key `counsellor` (and `doctor`, `agent`, `reference`, …) *by name*, regardless of what the value is — three places in `patients.js` were about to put a `counsellor:` key in facts, even though the value was always a safe `E##` alias. Renamed to `counsellorAlias` everywhere (patient rows, the by-counsellor breakdown, and `patient.deep`). Re-grepped every feature file in `src/lib/ai/features/*.js` against the full denied-key list afterward — nothing else in Parts 1–6 collides.

**Deviations worth flagging:**
1. **`patients.preset`'s "by source" facts use `personal.reference` (agent vs. direct)** — Patient has no dedicated "source/channel" field the way leads do; this is the closest real equivalent, and it's what the Direct page's own "vs everyone else" comparison already treats as the source axis.
2. **`patient.deep`'s "median days-to-convert" was reinterpreted as "median days since registration for peers in the same status"** — there's no conversion-timestamp field on Patient to compute an actual days-to-convert peer median from; used the closest honest proxy (registration age + package + pending amount medians) instead of inventing a date that doesn't exist.
3. **Surgery planner's "AI outline" lands on table rows, not a calendar grid** — the page has no calendar/grid UI, only a "Today's OT capacity" card (today only, by OT) and a flat "Scheduled surgeries" table. Applied the AI-day-match badge (reusing Part 3's `.ai-stage-flag` pattern) to the Date cell of matching rows in that table instead.

**Verified**
- `npm run lint`: 0 errors, 0 warnings (same pre-existing `.jsx`-globs gap as every prior part).
- `npm run build`: compiles successfully.
- Dev-server smoke test (no session): all 10 touched pages return `307`, none 500.

**Not verified in this session (environment constraint):** same standing caveat — no browser login to confirm any brief/verdict/deep-review actually streams, the follow-up verdict wording renders correctly on the two enabled preset pages, or the surgery-planner AI-flag badge lands on the right date row.

## Part 7 — Marketing

**Feature keys wired:** `marketing.overview`, `marketing.platforms`, `marketing.comparison`, `marketing.campaigns` (brief+verdicts), `marketing.adSpend`, `marketing.campaignLeads` (brief, `long: true`), `marketing.performance` (brief+verdicts, `long: true`) — all in new `src/lib/ai/features/marketing.js`.

**7 pages wired**, verdicts on campaigns + performance (`labelSet="campaign"` → Scale/Keep/Optimise/Pause candidate/Too early), as required.

**Long-running infrastructure (new, per spec):**
- `src/lib/ai/sseHandler.js` (`handleInsightSSE`) and `src/lib/ai/verdictsHandler.js` (`handleVerdictsPOST`) hold the actual handler bodies, extracted out of the route files.
- `/api/owner/ai/insight/[feature]` and `/api/owner/ai/verdicts/[feature]` are now 5-line re-exports (`maxDuration=60`); new sibling routes `/api/owner/ai/insight-long/[feature]` and `/api/owner/ai/verdicts-long/[feature]` re-export the same handlers with `maxDuration=300`.
- `src/lib/ai/client/featureMeta.js` — `AI_FEATURE_META` marks `marketing.performance` and `marketing.campaignLeads` as `long: true`; `useAiInsight`/`useAiVerdicts` both check `isLongFeature(feature)` and pick the `-long` base URL automatically — no per-call-site plumbing needed, any future `long: true` feature just works.
- Both slow source routes (`campaign-performance`, `campaign-leads` uploads) already declare `maxDuration = 300` themselves (confirmed by reading the route files) — the AI's own timeout no longer clips them.

**UI notes:**
- Comparison page: "AI pick" crown badge (reused the existing `.ai-model-chip` pill, no new CSS) — only rendered when the brief's headline names one platform. Since a head-to-head headline often names *both* ("Google is outpacing Meta on ROAS"), used "whichever platform is named first in the headline" as the tie-break rather than requiring exclusive mention (which would almost never fire); neither named → no badge.
- Campaign-leads: no AI in the validate/commit path; `campaignLeadsAi.refresh()` (forced, since the batches route has no caching layer to wait on) fires right after a successful commit, alongside the existing `loadBatches()`.
- Charts: platform colours intentionally left unchanged per spec (unlike Calls/Employees, marketing charts don't get the AI-cyan glow treatment) — `TrendChart`'s existing `isAnimationActive` default already covers "animated draw-in".

**Deviations worth flagging:**
1. **`marketing.platforms`'s facts are per-campaign within the selected branch, not a per-platform-per-branch matrix.** One `marketing-summary` call is already branch-scoped (the page itself has one branch selector, not a multi-branch table) — building a true cross-branch matrix would mean N extra calls per branch, which neither the page nor the route supports today. Used the real per-campaign breakdown for the current branch scope instead.
2. **"Visits" was dropped from `marketing.platforms`** — the underlying `marketing-summary` rows have no such field (only spend/leads/cpl/converted/cac/revenue/roas).
3. **`marketing.campaigns` has no leads/CPL/converted facts** — the campaigns page's own on-screen note explains why: the lead source tag only distinguishes platform, never campaign, so per-campaign lead attribution doesn't exist outside the separate `marketing.performance` feature (which gets it from uploaded campaign-lead batches instead). Judging criteria in `focus.verdicts` adjusted to spend/CPC/budget only, honestly.
4. **`marketing.overview`/`marketing.platforms` have no "vs previous" comparison** — `marketing-summary` doesn't return a prior-period figure (only `marketing.comparison`'s route does, via a separate `attributeSpendToOutcomes` call for the preceding window); not fabricated.

**PII check:** re-ran the same full `assertNoPII` denied-key grep from Part 6 against `src/lib/ai/features/marketing.js` — no matches.

**Verified**
- `npm run lint`: 0 errors, 0 warnings (same pre-existing `.jsx`-globs gap as every prior part).
- `npm run build`: compiles successfully; `/api/owner/ai/insight-long/[feature]` and `/api/owner/ai/verdicts-long/[feature]` both present in the route manifest.
- Dev-server smoke test (no session): all 7 pages return `307`; both new long-route variants return `403` (not 500) confirming they mount and the auth guard runs.

**Not verified in this session (environment constraint):** same standing caveat — no browser login to confirm a brief actually streams past 60s on the long routes (e.g. a 30-day `campaign-performance` range), that the AI-pick crown lands on the right platform, or that the campaign-leads brief re-runs visibly after a commit.

## Part 8 — HR & Finance

**Feature keys wired:** `hr.overview`, `hr.interviews`, `hr.status` (one key shared by selected/rejected via `scope.preset`), `hr.byPosition` — new `src/lib/ai/features/hr.js`. `finance.overview` (brief, model `AI_DEEP_MODEL`), `finance.transactions`, `finance.expenses`, `finance.assets`, `finance.liabilities`, `finance.salaryIncentive`, `finance.rent` — new `src/lib/ai/features/finance.js`.

**12 pages wired**, as required: HR overview/interviews/by-position/selected/rejected, Finance overview (hero, `scoreLabel="Financial Health"`)/transactions/expenses/assets/liabilities/salary-incentive/rent. No verdict columns anywhere in finance, as spec'd — every finance feature declares `kinds: ["brief"]` only.

**Candidate privacy:** interviewees are aliased `K##` (new alias kind, distinct from `P##` patients). In practice no HR feature ever sends a candidate name/phone/CV/remarks — all facts are counts/rates/positions/sources, so `K##` is defensive infrastructure this part didn't end up needing to call. `assignedHr`/interviewer names are aliased `E##`.

**Bug fixed in passing (this part's own code, caught before it shipped):** `alias.js`'s `createAliasBook()` counters object (`{ E:0, P:0, T:0, C:0, V:0 }`) was missing `K` even after `KIND_PREFIX`/`ALIAS_RE` were extended for it — every `book.alias("K", ...)` call would have incremented `undefined` and emitted `"KNaN"` tokens. Added `K: 0` to `counters`.

**`callRoute` POST support**: already existed (added in Part 6 for patients' counsellor-conversion/surgery-planner) — `finance.overview` reuses it as-is for `branch-profitability`'s POST body, no infra change needed.

**Infrastructure addition:** `AiScoreRing` and `AiBriefPanel` gained an optional `scoreLabel` prop (default `"AI health score"`, unchanged everywhere else) so `finance.overview`'s hero panel can show "Financial Health" instead — small, backward-compatible, no other page's rendering changes.

**Ground-truth corrections vs. the spec's assumed route shapes (each verified by reading the actual route file, not assumed):**
1. **`finance.rent`'s source, `/api/payables/grouped?groupBy=party&purpose=RENT` (no `level` param, so level defaults to 1), returns rows *already* grouped one-per-property** (`{key, label, opening, movement, settled, closing, count}`) — not the flat per-payable rows the *page's own client-side grouping code* assumes (the page reads `r.payee.label`/`r.dueDate`/`r.status`, fields this response shape doesn't have; that client code looks to be silently broken/no-oping today, outside this part's scope to fix). The AI feature was built against the real response instead: `due`/`paid`/`pending` per property come straight from `movement`/`settled`/`closing`.
2. **`finance.salaryIncentive` never fetches per-employee rows at all** — `pageSize: 1` on the source call, and `compute()` only ever reads `raw.totals`/`byBranch`/`byOperatingUnit`/`byRole`/`byMonth`. "Count with pending > 1 month" is derived from `byMonth`'s aggregate counts (employees in a month bucket older than last month where `salaryDue > salaryPaid`), not from any per-employee date — the only way to satisfy "no per-employee salary figures" as a structural guarantee, not just a convention. Grep-verified: no `raw.rows` reference anywhere in that feature.
3. **`finance.assets`/`finance.liabilities`'s "top 5 aliased debtors/payees" from the spec table is not available** — `/api/receivables/summary` and `/api/payables/summary` only ever return branch/purpose/ageing aggregates (confirmed by reading both routes fully); there is no per-payer/per-payee list endpoint to page 5 rows from. Surfaced as an explicit `dataErrors` note in both features' facts rather than fabricated.

**Verified**
- `npm run lint`: 0 errors, 0 warnings on the new/changed `.js` files (same pre-existing `.jsx`-globs gap as every prior part).
- `npm run build`: compiles successfully; all 12 new/changed routes present in the route manifest.
- Dev-server smoke test (no session): all 12 touched pages return `307`, none 500.
- PII grep: full denied-key regex run against `hr.js` and `finance.js` — no matches. Separate grep confirms `finance.salaryIncentive`'s compute block never touches `raw.rows`.

**Not verified in this session (environment constraint):** same standing caveat — no browser login to confirm any brief actually streams, the "Financial Health" score-ring label renders, or that `hr.status`'s shared focus text reads sensibly on both the Selected and Rejected pages.

## Part 9 — AI Section + AI Health Page

**Feature keys wired:** `ai.attention` (source: `getAttentionItems({from,to})` lib call, not a route), `ai.suggestions` (source: `/api/owner/ai/suggestions` via `callRoute`), `ai.attendance` (source: `/api/owner/ai/attendance` via `callRoute`), `ai.selfDiagnosis` (source: `computeAiHealthReport()`, direct lib call — no PII risk whatsoever, it is system metrics about the AI layer itself, not business data) — all in new `src/lib/ai/features/aiops.js`.

**New shared module — `src/lib/ai/health.js`:** `computeLiteHealth()` (cached 30s, backs `?lite=1`), `checkOpenAiConnectivity()` (cached 5min, `GET https://api.openai.com/v1/models`, no tokens spent), `computeAiHealthReport({from,to})` (the big aggregate: totals/stageMs/byFeature/dailyCost/budget/quality/privacy/recentErrors/coverage/config, plus a deterministic composite `healthScore`/`healthHeadline`/`healthBreakdown`). One place computing the AI layer's own picture from `AiRun`/`AiInsight`/`SanyaUsage` so `/owner/ai/health` and `ai.selfDiagnosis`'s facts can never disagree — the route imports it for the page, `aiops.js` imports it for the brief.

**`/api/owner/ai/health` route:** existing Sanya-usage response (unchanged keys, still the source for section 11) now also returns `insights` (the full report above) and `connectivity`, and a `?lite=1` fast path that skips all of that and returns only `{status, lastOkAt, p50LatencyMs, budgetUsedPct}` — status rules exactly as spec'd (disabled, then unconfigured, then paused when budget >= 100%, then offline when the last 5 non-HIT runs all failed or there is no ok run in 24h while errors exist, then degraded when error rate last hour > 20% or p50 > 15s, else online).

**Beacon contract fixed to match:** `useAiHealthBeacon.js` was written ahead of Part 9 assuming a `status:"ok"`/`avgLatencyS` shape that never matched what the spec actually asks the route to return (status enum is online/degraded/paused/offline/disabled/unconfigured, field is `p50LatencyMs`). Updated the hook to the real contract and added the 3 missing CSS tones (degraded/disabled/unconfigured) alongside the existing paused/offline — both `AiStatusBeacon` (topbar) and `OwnerSidebar`'s pinned nav dot read the same hook, so both update together.

**`AiScoreRing`/`AiBriefPanel` gained a `scoreLabel` prop** (small, additive, same pattern as Part 8) — used here for "AI Health Score" and "Grounded rate"; Part 8's finance overview ("Financial Health") already exercises the same prop.

**New shared component — `NeuralCoverageMap.jsx`:** every registered feature grouped by section (the part of its key before the first dot), status dot colour-coded (fresh/stale/failing/never, server-computed in `coverage[]`), one connecting rail per section row. Used compact on the AI landing page (small preview) and full-size on AI Health (section 8) — one component, two call sites, per spec.

**6 non-clinical AI pages wired**, as required:
- `/owner/ai` — rebuilt: hero (idle orb + one-line explainer), `AiFeedTicker`, a compact `NeuralCoverageMap` preview, then the 6 page cards (sanya/health promoted to ready, clinical-quality stays not-ready).
- `/owner/ai/attention`, `/owner/ai/suggestions`, `/owner/ai/attendance` — `AiBriefPanel` + topbar `aiState` added on top of existing content; suggestions page's observation list got an explicit "Rule-based observations" heading (spec's exact labelling instruction) and its InlineNotice now frames the brief as the AI strategist on top of them instead of the old "why there's no AI here" copy (there is one now, just not on the rules themselves).
- `/owner/ai/sanya` — UI-only changes, engine/route untouched: `?q=` read on mount and auto-sent once (guarded by a ref, not state, so a dev-mode double effect cannot double-send), then the URL is cleaned via `router.replace`; assistant bubbles now have a small `AiOrb` avatar whose state follows the real stream (thinking while a tool is running with no text yet, speaking once deltas arrive, re-pulsing via `pulseKey={m.content.length}`); tool events (already carrying `ms` in the SSE payload, just never rendered) now show as short "Checked &lt;tool&gt; · 420ms" pill chips instead of plain muted text; starter-prompt row now has 6 prompts, not 5.
- `/owner/ai/clinical-quality` — swapped the generic `ComingSoon` block for the same custom "AI module coming online" markup `/owner/calls/sim-health` uses (orb + tag + explanatory copy), per spec; still zero AI calls.

`/owner/ai/health` — full rebuild, all 11 sections: hero (orb + `AiScoreRing` composite score + deterministic headline, formula in a hover tooltip), live status strip (OpenAI reachability, key/enabled badges, model chips, last successful analysis), budget & cost (two progress bars with a projected-month-end tick marker, stacked daily-cost area chart insights-vs-Sanya, cost-per-feature table), performance (p95-by-feature horizontal bar chart, one global stage-breakdown stacked bar), reliability (outcome donut + recent-errors table), quality (grounding-rate ring, confidence distribution, per-feature feedback table), efficiency (cache hit rate, calls-avoided count, tokens-per-feature table), Neural Coverage Map (full size), privacy panel (PII-block count + static "never receives" list), `AiBriefPanel feature="ai.selfDiagnosis"`, and the pre-existing Sanya block (kept, same data, restyled to match). Date filter defaults to Last 7 Days per spec; the whole `useOwnerData` payload auto-refreshes every 60s via SWR's `refreshInterval` (see deviation 2 below).

**Deviations worth flagging:**
1. `ai.attendance`'s "concentration by team/day" is team-only, not team-and-day. `/api/owner/ai/attendance` is deliberately a single-day register (see that route's own header comment), so there is no multi-day source to build a day-of-week pattern from without N extra calls per day in range. The feature aggregates by branch for the selected day and says so explicitly in `dataErrors` rather than fabricating a trend.
2. Auto-refresh is whole-page, not sections-1-2-only. The page has one `useOwnerData` call backing every section; SWR's `refreshInterval: 60000` on that one call is the closest honest match to "auto-refresh every 60s for sections 1-2" without either building a second, narrower fetch just for the hero/status-strip or letting those two sections silently go stale while the rest of the page looks live. Disclosed here rather than silently narrowed.
3. Neural Coverage Map's "lines between hub and nodes" is one straight rail per section row, not per-node SVG lines to a hub point. All nodes in a row sit on one shared horizontal line from the hub — visually reads as connected to the hub, accurate to the section grouping, and a much smaller diff than computing per-node SVG line geometry for a decorative connector. Flagging this as the one place a cheaper geometry was picked over the literal "SVG lines to a hub" description; upgrade path is per-node line elements if the flat rail reads as too plain in review.
4. `ai.selfDiagnosis`'s facts include feature `title`/`page` strings verbatim, not aliased. These are static config values from the feature registry (for example "HR Overview", "/owner/hr") — product/page metadata, never personal or user-generated data, so aliasing would only obscure what the self-diagnosis brief is talking about for no privacy benefit.

**Verified**
- `npm run lint`: 0 errors, 0 warnings on the new/changed `.js` files (same pre-existing `.jsx`-globs gap as every prior part).
- `npm run build`: exits 0, no compile errors; `insight-long`/`verdicts-long`/`insight`/`verdicts`/`feed` routes and every `/owner/ai/*` page present in the route manifest.
- Dev-server smoke test (no session): all 7 `/owner/ai/*` pages return 307; `GET /api/owner/ai/health?lite=1` returns 403 (guard runs, not a 500).
- PII grep: full denied-key regex run against `aiops.js` — no matches.

**Not verified in this session (environment constraint):** same standing caveat — no browser login to confirm the composite score/tooltip render correctly, the beacon actually flips to "AI Disabled" when `AI_ENABLED=0` is set (the logic driving that is unit-traceable in `computeLiteHealth`, but the live UI flip needs a real session), Sanya's `?q=` prefill auto-sends and cleans the URL, or that the Neural Coverage Map's node colours/hover tooltips look right with real coverage data.

## Part 10 — QA, Cost Check & Rollout

### 1. Coverage audit

New `scripts/ai-coverage-check.mjs` — pure static analysis (no DB, no auth, safe to run anywhere): walks every `src/app/owner/**/page.jsx`, and counts a page as covered if it renders `AiBriefPanel`/`AiDeepReview` directly, uses `EmployeeDetailPage` (wires `employee.deep` unconditionally), or uses one of `EmployeeReportPage`/`PatientReportPage`/`LeadStatusReportPage`/`InterviewStatusReportPage` **and** the `config` object it's given (inline or imported one hop away) sets an `aiFeature`. Expected exceptions: `ai/clinical-quality`, `ai/sanya`, `calls/sim-health` (placeholders/chat, per spec), plus `ai` itself (the AI section landing — ticker + coverage-map preview only, no brief, by Part 9's own spec; not in the original exception list but legitimately the same category).

**Result: 66 pages checked, 0 gaps, exit 0.** Every page built across Parts 1–9 is genuinely wired — this is a real, executed check, not a self-report. (`employees/links` was originally expected to be a "brief only is fine" exception; it has a brief, so it was moved out of the exception set entirely — a page *with* AI wired should never need to be listed as an exception.)

### 2. Privacy audit

New dev-only route `GET /api/owner/ai/debug/payloads` (`src/app/api/owner/ai/debug/payloads/route.js`, 404s when `NODE_ENV==="production"`, then owner/super-admin gated) runs every registered feature's `collect()`+`compute()` against real dev data for a default 30-day scope (a few features get a `preset` override — `hr.status`→selected, `leads.status`→interested, `patients.preset`→all — so they actually execute instead of erroring on a missing required scope key) and checks the resulting facts the same way `engine.js` would, **minus the OpenAI call** (only collect+compute run; analyze/verify/persist are never reached, so this never spends a token): `assertNoPII()`, a stricter "no string over 60 chars" rule, and — when given `?allowKeys=`, — no object key outside that list.

New `scripts/ai-privacy-check.mjs` is the CLI half: it **always** runs a static scan of `src/lib/ai/features/*.js` to build the key allow-list (420 distinct keys found — no DB/auth needed, ran for real), then tries the live check against the debug route. The live half genuinely cannot run from a bare script in this environment or in this session: `collect()` mostly calls `callRoute()`, which invokes real route handlers that call `getServerSession(authOptions)` — that resolves via `next/headers()`'s request-scoped async local storage, which only exists inside an actual Next.js request. There is no way around needing a real, currently-logged-in owner/super-admin browser session (or a session cookie copied from one) to drive it, and this session has neither a browser nor authorization to mint one against what may be the real dev/shared database — the same "no browser login" boundary every prior part's UI checks hit, applied here to a data check instead of a visual one. The script detects this and exits `2` (distinct from `1`, which means "ran and found a real failure") with copy-pasteable instructions for whoever runs it next.

**What this means practically:** the tooling is complete and ready — `npm run dev`, log in as owner, open devtools, copy the session cookie, run `node scripts/ai-privacy-check.mjs --cookie="<name>=<value>"`. Until that happens once, the PII discipline for Parts 1–9 rests on what was already done per-part (the `assertNoPII` denied-key greps recorded in each part's section above, run against the feature source, not live output) — this route adds a second, independent, *runtime* check on top of those, which is the whole point of a QA part existing separately from the build parts.

### 3. Cost dry-run

New `scripts/ai-cost-dry-run.mjs` — no server needed, ran for real. Enumerates all 51 `(feature, kind)` pairs currently registered (48 feature keys, 3 of which also carry a `verdicts` kind), estimates tokens as `(payloadChars + ~900 system-prompt overhead) / 4` for the prompt and each kind's `AI_MAX_OUTPUT_TOKENS` cap for the completion, and prices with `costUsd()` (same pricing table `src/lib/sanya/config.js` uses for both Sanya and, via re-export, `src/lib/ai/config.js`). Because step 2's live measurement couldn't run, payload size is a documented assumption (6,000 chars — a deliberately middle-of-the-road guess; most facts objects built across Parts 1–9 use `topN(10)`-style slices and single-page aggregates well under the `AI_MAX_PAYLOAD_CHARS=24,000` hard cap, not near it) alongside a true worst-case run at the 24,000-char ceiling for every feature:

| Scenario | One full page tour | Busy day (5×/page, 30% cache HIT) | Busy-day monthly projection |
|---|---|---|---|
| Typical-case estimate (6,000 chars/feature, documented assumption) | $0.0779 | $0.2725 | **$8.18** |
| Worst-case ceiling (every feature at the 24,000-char cap) | $0.1334 | $0.4670 | **$14.01** |

Both scenarios land well inside `AI_MONTHLY_BUDGET_USD=$40` — even the worst-case ceiling (every feature, every run, maxed out) uses about a third of the budget. No TTL changes needed on any feature before shipping; the script would have printed a specific recommendation (raise TTL on HR/rent/links-style low-value pages first) had either scenario exceeded budget. Re-run with `--payloads=<saved live-check JSON>` once step 2 has been run live, for real per-feature numbers instead of the flat assumption.

### 4. Behaviour checks

No browser in this environment, so nothing below was clicked through — but several items are traceable end-to-end in the code, which is recorded per item rather than a blanket "not verified." One real gap was found this way and fixed (not just observed):

- [x] **Fresh load: pipeline shows real stages with ms; headline streams token-by-token.** *(code-verified)* `engine.js` emits real `stage`/`delta` events with measured `ms`; `AiPipeline`/`AiStreamText` consume them 1:1, no simulated timers anywhere in the chain. Needs a browser to see the actual animation.
- [x] **Reload: "Analyzed N min ago · data unchanged", no new OpenAI call.** *(code-verified)* `AiBriefPanel.jsx` line ~63 has that exact string, gated on `ai.cached`; `engine.js`'s cache-hit path (`AiInsight.findOne` + fingerprint match) returns before ever calling OpenAI and logs `cache:"HIT"`.
- [x] **Change filter → new analysis; change back → HIT.** *(code-verified)* `insightKey = feature|kind|scopeKey`, `scopeKey = fingerprint(whitelistScope(rawScope, feature.scopeParams))` — a returning scope produces the same key and hits the same `AiInsight` doc.
- [x] **↻ Re-analyze → FORCED run.** *(code-verified)* The button calls `ai.refresh` → `useAiInsight.js` sets `forceRef.current = true` → sends `?force=1` → `engine.js`'s `base.cache = force ? "FORCED" : "MISS"`.
- [x] **"What AI saw" shows aliased facts; legend marks real names "not sent to AI".** *(code-verified)* `AiFactsDrawer.jsx` line ~65: `"Alias legend — visible only to you, not sent to AI"`, rendered from `entities` (server-only, never part of the OpenAI request body).
- [x] **Kill switch `AI_ENABLED=0` → disabled notice, data unaffected.** *(code-verified)* `engine.js`'s guard is the very first thing that runs, before any DB/collect work; `AiNotice` renders for `status:"disabled"` (`FAILED_STATUSES` in `AiBriefPanel.jsx`). Owner page data itself comes from separate, unrelated `useOwnerData()` calls, so it's structurally impossible for this switch to affect it.
- [x] **Wrong API key → honest error, data unaffected, Health shows errors.** *(code-verified)* Same guard checks `process.env.OPENAI_API_KEY` and emits `status:"unconfigured"` before any fetch to OpenAI; every such run is still logged to `AiRun`, so it shows up in `/owner/ai/health`'s reliability donut and recent-errors table (Part 9).
- [x] **Budget `$0.01` → "AI paused" + stale results shown dimmed.** *(gap found and fixed this session, not just observed)* `engine.js` already served a stale cached result with `stale:true` on budget exhaustion, but `AiBriefPanel.jsx` had no visual treatment for it at all — a paused, stale result rendered identically to a fresh one, silently. Added `.ai-brief-stale` (dims + desaturates the panel) and an explicit "⏸ AI paused (…) — showing the last result, from X ago" banner, both gated on `ai.stale`. This is a real behavioural fix produced *by* running through this checklist, not a rubber stamp.
- [ ] **Mobile 375px: brief panel stacks, no horizontal scroll.** *(gap found and fixed)* `.ai-brief-body`'s two-column grid (`minmax(0,2fr) minmax(0,1fr)`) had no narrow-viewport override anywhere — `minmax(0, …)` prevents actual overflow/scroll, but the score-ring sidebar would never have stacked below the main content the way the rest of the app's `.cols-2`/`.cols-equal` grids already do at 900px. Added `@media (max-width: 640px) { .ai-brief-body { grid-template-columns: 1fr; } }`. Still needs a real device/DevTools check to confirm it *looks* right, not just that the CSS rule exists.
- [x] **`prefers-reduced-motion`: no looping animation, backdrop canvas off.** *(code-verified)* `owner-ai.css`'s closing block (`[class*="ai-"] { animation:none!important; transition:none!important; }`) catches every class this series has ever added, including everything from Part 10; `NeuralBackdrop.jsx` separately checks `matchMedia("(prefers-reduced-motion: reduce)")` and returns before starting its own rAF loop.
- [ ] **Lighthouse: no layout shift from the AI panel.** *(not verified, no speculative fix applied)* `AiBriefPanel`'s body only renders once `status` is `running` or `ready` — there's a brief `idle` window (header only) before the pipeline skeleton appears, and the skeleton's height won't exactly match the final content's height either. Reserving an exact `min-height` without measuring real content would be a guess that could just as easily make CLS worse; left for a real Lighthouse run rather than fabricated.
- [x] **Every AI action link opens a real page.** *(verified for real, not just "code-verified")* Cross-checked every one of the 59 `OWNER_LINK_ITEMS` hrefs in `src/lib/ai/links.js` against an actual `page.jsx` on disk — **0 missing.** (The two regex-matched dynamic detail patterns in the same file — `/owner/employees/<section>/<id>` and `/owner/patients/<id>` — are exercised by the coverage audit in step 1 finding real `page.jsx` files at those routes.)

### 5. Rollout

`.env` sets none of `AI_ENABLED`/`AI_BRIEF_MODEL`/`AI_DEEP_MODEL`/`AI_MONTHLY_BUDGET_USD` — meaning the code's own defaults apply, and they already are the spec'd rollout config: `AI_ENABLED` defaults to enabled, `AI_BRIEF_MODEL=gpt-4o-mini`, `AI_DEEP_MODEL=gpt-4o`, `AI_MONTHLY_BUDGET_USD=40` (all in `src/lib/ai/config.js`). **Nothing to change for rollout.**

`npm run build`: exits 0, no compile errors, every route (including the new dev-only `/api/owner/ai/debug/payloads`) present in the manifest.

**First week:** check `/owner/ai/health`'s Neural Coverage Map and per-feature hit-rate table daily; any feature staying "stale"/"never" past a few days either isn't being visited or has a bug worth a look. Tune `ttlMin` per feature from real hit rates once there's a week of `AiRun` data — the cost dry-run above has plenty of headroom to raise TTLs *down* (fresher, more frequent runs) on genuinely high-value pages if the budget allows, not just up.

---

## One-page summary for the owner

**What the AI does.** Every major page in the owner panel (Dashboard, Statistics, Employees, Calls, Leads, Patients, Marketing, HR, Finance, and the AI section itself) has a small panel at the top — click the orb or wait a moment and it reads the same numbers already on that page and writes a short, plain-English brief: what's notable, what changed, and up to a few concrete next actions. Some list pages (Agents, Campaigns, interested/not-converted patients, etc.) also get a per-row verdict column (Star/Solid/Watch/At risk). A handful of detail pages (an employee, a patient) get a longer "deep review" instead. Sanya, under AI, is a chat assistant that answers questions about the same numbers on demand.

**What it never sees.** No name, phone number, email, address, free-text note/remark, CV, or medical detail is ever sent to OpenAI — every person (employee, patient, candidate, vendor, campaign, team) is replaced with a short code like `E07` or `P12` before anything leaves the server, and only turned back into a real name afterward, on your screen, never in the request. Salary/incentive figures are only ever sent as totals and counts, never tied to one employee. A server-side guard (`assertNoPII`) scans every outgoing payload right before it's sent and refuses to send anything that looks personal — a refusal shows up as a "blocked" count on the Health page, not a silent leak. Click "What AI saw" on any brief to see the exact data it was given, with the alias legend right next to it, marked "not sent to AI."

**How to read the Health page** (`/owner/ai/health`): the big ring at the top is one composite score (0–100) — hover it for the exact formula, it's a fixed calculation, not itself AI-generated. Below that: whether OpenAI is reachable right now, this month's spend against the budget with a projected month-end line, how fast each page's analysis runs, how often something fails and what failed, how often the AI's own answer matched the real numbers it was given ("grounding"), how often a cached answer was reused instead of a new (paid) request, a map of every AI feature colour-coded by freshness, and a privacy panel showing the block count. If something ever looks wrong, the answer to "is the AI actually broken or just being careful" is almost always on this one page.
