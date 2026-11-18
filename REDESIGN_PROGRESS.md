# CRM Redesign — Progress

Living tracker for the full RyanCRM UI/UX redesign. **Read this first when resuming.**

## How the redesign works (layers)

Each layer reaches every route; later layers refine page by page.

1. **Tokens (done, global).** `src/app/globals.css` `@theme` overrides Tailwind's own scales: `gray-*` and `slate-*` become one cool neutral, `indigo-*` is the brand (shifted slightly toward blue), `rounded-*` is tighter, `shadow-*` is softer, plus the easing curves. Every page picks these up without markup changes.
2. **Global guards (done).**
   - All `bg-linear-to-*` / `bg-gradient-to-*` flatten to their first stop (opt out with `.keep-gradient`, used only by the landing page).
   - One focus ring, themed selection and scrollbars, tabular numerals in tables.
   - `prefers-reduced-motion` is respected; the infinite pulse/glow animations are off.
3. **Codemods (done, 367 edits / 135 files).** Removed hover-scale and hover-lift, stepped headings down one size (bold → semibold), removed backdrop-blur, raised `text-[10px]` to 11px, `tracking-widest` → `tracking-wide`, `duration-700` → 300. Script: re-creatable from the rules listed here (it skips `app/page.js`, `app/owner/**`, `components/owner/**`).
4. **Shell (done).** `src/components/Sidebars/AppSidebar.jsx` is the single sidebar:
   - collapsible rail on desktop (saved in localStorage), drawer on mobile (Esc / overlay / route change close it)
   - role-filtered sections, nested children, `aria-current`, logout
   - each role file in `components/Sidebars/*.js` is now just a config. The `sidebarOpen` / `setSidebarOpen` props are preserved.
5. **Primitives (done).** `src/components/ui/index.jsx` provides Button, Field / Input / Select / Textarea, Badge, PageHeader, Page, Panel, EmptyState, ErrorState, Skeleton, Spinner, `table` class map, and `buttonClass` / `inputClass`. Stat tiles: `src/components/dashboard/StatCard.jsx` (`MetricCard` wraps it).
5b. **Shared components (done).**
   - `Toast.js` (50 pages): toasts now stack per position instead of overlapping. White surface with a semantic icon, aria-live, pause on hover. Same API.
   - `InputField.js` (16 forms): shared input styling, combobox ARIA, Esc/Enter keys, segmented radio, X-icon chips. Same props.
5c. **More codemods (done).**
   - Focus rings unified to brand (371 edits / 81 files).
   - Modal scrims unified to `bg-gray-950/40 overlay-in`, plus a CSS dialog entrance (70 overlays / 58 files).
   - Gradient icon tiles → neutral (9).
   - Native checkbox / radio `accent-color` = brand.
6. **Page passes (in progress).** Per route: adopt PageHeader / Panel / primitives, fix hierarchy, states (loading / empty / error), a11y labels, and remove decoration. Never touch fetch logic, API calls, or role checks.

## Design decisions

- **Mode:** Operate. Light theme. Clinic front desk, finance and management staff on office monitors in daylight, all day.
- **Color:** Restrained. Cool neutral ground (`gray-50` page, white surfaces, `gray-200` borders), one accent (`indigo-600`). Semantic hues only for meaning: emerald = paid / positive, rose = error / overdue / negative, amber = pending / warning, blue / purple / teal for status categories that already exist.
- **Type:** Geist (next/font). Page title `text-xl font-semibold tracking-tight`. Panel title `text-sm font-semibold`. Body `text-sm`. Meta `text-xs text-gray-500`. Numbers `tabular-nums`.
- **Surfaces:** `bg-white border border-gray-200 rounded-xl`, no shadow at rest. Shadows only for floating layers (menus, modals, drawers).
- **Motion:** 150–200ms, ease-out `cubic-bezier(0.23,1,0.32,1)`; drawers `cubic-bezier(0.32,0.72,0,1)`. Press feedback `active:scale-[0.98]`. No hover lifts, no infinite animations.
- **Bans:** gradient fills, glass/blur, icon-in-gradient-tile headers, emoji as icons, colored side-stripes on cards, rainbow quick-action grids, fake/placeholder data.

## Out of scope / separate worlds

- `/` (`app/page.js`): public marketing landing page with its own gold visual world (Persuade mode). Untouched on purpose.
- `/owner/**`: Owner Panel v2 has its own `owner-theme.css` / `owner-ai.css` (IBM Plex) from a recent rebuild. It gets the token overrides only where it uses Tailwind gray / indigo. Bringing it fully into this system is a separate decision for the user.

## Known issues / follow-ups

- No visual QA yet: every app route is behind login and there is no browser automation in this environment. A human click-through is needed.
- Mongoose build warnings (`errors` reserved path, duplicate CollabCase index) predate this work.
- `/surgery/*` pages previously showed invented patients and figures when the API failed. Now they show empty / zero / error states. Verify the surgery APIs actually return data.
- ESLint config ignores `src/app/**/dashboard` paths (eslint could not lint them).

## Session 3 (2026-11-13) — done

- **PatientTable** (6 patient routes):
  - keyboard-sortable headers with `aria-sort` and Lucide chevrons (no Unicode ▲▼)
  - skeleton loading, EmptyState with "Clear filters", ErrorState
  - ghost row actions with descriptive aria-labels
  - filter drawer with dialog semantics, Esc to close, slide-in
  - neutral filter chips, labelled paginator
- **Transactions components:** aria-labels on icon actions, normal-case headers, denser rows, tabular amounts.
- **Codemod 5:** `font-bold/extrabold/black` → `font-semibold` (570); `<th>` normal case + medium weight (139).
- **Codemod 6:** standard surface (13), close-button names (26), neutral spinners (6), header icon tiles removed (4).
- **Not Visited (reception, collab, surgery) and Surgery Visited:** large-card grids rebuilt as dense tables on Page / PageHeader / Panel.
- **Mobile clearance is shell-level:** `.app-sidebar[data-floating] + *` gets top padding below lg, so no page needs its own offset. Topbar and PageHeader no longer indent.
- New global animation: `.drawer-in`.

## Session 4 (2026-11-17/18) — browser QA of every route

**Method.** Headless Chrome via the DevTools protocol, signed in as super-admin, local dev server against the production DB (read-only browsing: no clicks, submits or exports).
- Every route captured at desktop 1440, tablet 834 and mobile 390, each width a fresh page load.
- In-page checks: horizontal overflow, unclipped overflowing elements, leftover gradients, text under 11px, missing h1, icon buttons with no accessible name, broken images, console errors, failed requests.
- The crawler aborts after 3 invalid pages in a row (dead server or lost session) instead of recording junk.
- Detail routes were reached with real IDs from read-only list APIs.
- 199 routes crawled; 44 re-verified after fixes; production build green.

**Fixed (found in the rendered UI):**
- **Sideways scroll on 6 pages.** A table's sr-only header label escaped its scroller (now `relative overflow-x-auto`), and 93 `<main className="flex-1">` were missing `min-w-0`.
- **84 icon-only buttons had no accessible name.** Codemod adds aria-labels from the icon (View/Edit/Delete/Close/Clear search/Prev/Next…).
- **Patient-form steppers (8 forms).** The active step used a dynamic Tailwind class (`bg-${color}-600`, never generated), completed steps were red-950, no labels. Rebuilt with brand states, `aria-current="step"`, responsive.
- **Counsellor role had no shell.** Added `CounsellorSidebar`; removed `px-24`/`px-12` page padding and the in-page logout.
- **Blue/violet gradient banners on 11 add/edit pages** became plain headers (content kept: back button, patient ID, last-updated). Edit headers wrap on mobile; form padding is mobile-friendly.
- **Role callouts with dynamic colors + side stripe** (employee update pages) became neutral.
- **Off-brand primary buttons (75+):** violet, emerald, blue, teal, black, amber, orange and `#00845A` → indigo. Rose kept for destructive actions.
- **Colorful stat cards:** collab/reception/stock transactions, PRP ×3, HR KPI tiles ×5, super-admin interviews and performance, TransactionTable, StaffTable → shared `StatCard` or neutral tiles. Numbers never wrap mid-digit.
- **HR violet accent (74)** → indigo; rainbow position chart → single color.
- **Report cards** (admin + super-admin): no top stripes, neutral download buttons, labelled favorite toggle.
- **Patient table:** sentence-case status badges, no wrapping cells, right-aligned money, labelled per-page select.
- **Misc:** duplicate mobile menu button on transactions pages removed; all-caps form labels (34) → sentence case; Transactions page got a real h1; sidebar footer shows the signed-in role; nav scrollbar visible; admin P&L / cash tiles unified.

**Left as-is, with reason:**
- `/owner/**` renders in its own dark theme, which includes gradient-text titles. It is a separate world by earlier decision, and many owner APIs refuse super-admin (401/403), so those pages show error states for this account. Review the owner panel signed in as owner.
- `/super-admin/lead-funnel` returns 500: the backend cannot reach the external Callby service from local dev ("Failed to fetch filter options from Callby"). Not a UI defect.
- Consultation forms keep their 1px fading section rules (print-document detailing).
- `/owner/employees/leadership/[tlNameKey]` was not reachable (needs a team-lead key, not an ID).

**Small follow-ups:** decorative icon tiles remain in the HR "Applied Online" and admin "Payroll & Staff" headers; 10px chart axis labels (recharts default) could go to 11px.

## Session 5 (2026-11-18) — structural redesign pass, verified in the browser

**Why.** The user judged sessions 1–4 superficial. This pass fixed structure (layout, hierarchy, density, motion) rather than CSS alone. Skills used: Impeccable (Operate mode, craft floor), Emil Kowalski's `animate` (motion rules), the dataviz skill (validated chart palette). The Taste skill (`design-taste-frontend`) targets marketing sites, so only its general anti-template rules applied.

**Root causes fixed globally:**
- **Tailwind v4 bare `border` = currentColor.** Every bare `border` / `border-b` rendered near-black. `globals.css` has the v4 upgrade-guide compatibility rule (`@layer base`, border-color gray-200).
- **Negative money** showed as `₹-1,41,864`, and some amounts had 3 decimals. `formatCurrency` (`lib/financeUI.js`) now prints `-₹1,41,864`, max 2 decimals.
- **Dev server gotcha.** Turbopack's Tailwind scanner stopped seeing new classes in edited JS files. Touching or adding an `@source` line in `globals.css` forced a rescan (the line was removed after).

**System additions:**
- Motion layer in `globals.css`: `.page-in` (route entrance via `app/admin/template.jsx` + `.app-sidebar + *`), `.press`, `.stagger`, `.expand` (grid-rows accordion). Reduced motion keeps opacity fades and drops movement.
- Recharts axis, grid and tooltip themed globally.
- `scale-in` no longer starts from `scale(0)`.
- Sidebar: Ctrl/⌘K page search (`PageSearch` in `AppSidebar.jsx`, role-filtered, no animation by design), indigo-tint active state, uppercase group labels, bottom fade mask on the nav.
- `components/ui`: new `FormSection` + `FormActions` (settings-style form layout with a sticky action bar).
- `StatCard`: icon tiles removed. KPI rows are hairline-divided strips (`gap-px bg-gray-100` grid) instead of separate cards.
- `InputField`: new `hint` prop.
- Chart palette: inflow `#3d50e0` / outflow `#d97706` (validated: CVD ΔE 33, contrast ≥ 3:1). Multi-series uses the dataviz 8-slot palette in fixed order.

**Pages rebuilt (each screenshotted after the change):**
- **Admin dashboard:** balance-sheet strips, P&L + cash flow strips, "How it's calculated" expanders, chart grid with Needs-attention beside the trend, desktop-only sticky filters.
- **Employees** (StaffTable, 3 role pages), **Patients** (PatientTable, 6 routes), **Transactions** (admin toolbar, underline tabs, merged detail row; plus reception, collab, sales, stocks copies), **Reports** (admin, super-admin, reception, collab → row list, branch select, segmented dates, stale "Quick reference" removed).
- **Add Employee** (admin + HR) → FormSection layout.
- **Patient record:** v4 borders, neutral payment tiles.
- **Ledger tabs** → underline. Finance components: no caps, no tone tiles, no violet.
- **PRP ×3, Collab Settlement, Vendors avatars, consult forms ×4** (hero icon removed, "Counsult" typo fixed), **StepHeader ×8** patient forms, **Super-admin performance** chart colours.

**Session 5b, remaining pages (all screenshotted after the change):**
- **Surgery reports:** removed hard-coded fake "+12% / +8% / +15%" trend badges. KPI strip; single-hue distribution bars.
- **Sales agents:** plain right-aligned table. Conversion rates are no longer all red (thresholds were 70/50 against real rates of 13–35%). Quiet View toggle; scrolls sideways at phone width instead of overlapping (bug predated this work).
- **Sales performance:** KPIs moved from the bottom (solid colour blocks) to a top strip; filters as an inline row; top-15 agent charts instead of ~260 unreadable bars; L/Cr axis ticks; validated colours.
- **HR candidates, applied, visited, selected, rejected + super-admin interviews:** neutral chips and avatars, sentence-case headers, row actions always visible.
- **Create transaction (all roles):** underline tabs on one row, quieter section cards, 40px primary buttons.
- **App-wide:** 136 hand-written input classes normalised to the system input (36px, one border, one focus ring).
- **Mobile 390px:** 15 key pages crawled, no horizontal page scroll.

**Still open:** owner panel (separate world by decision); a full narrow-width pass on every remaining route (only the 15 key pages were checked at 390px); merging the duplicated role transaction and report pages.

## Session 5c (2026-11-18): colour theme + user theme picker

The user disliked the indigo theme and chose **graphite + emerald**, plus a user picker for accent and light/dark/system.
- **Tokens** (the `globals.css` header is generated):
  - gray/slate/zinc/neutral/stone = zinc. `indigo-*` = `var(--accent-*)`, literal values per accent (emerald default, blue, violet). `white` = `var(--surface)`.
  - **Primary actions are graphite:** unlayered overrides of `bg-indigo-600` / `hover:bg-indigo-700` / `active:bg-indigo-800`, so the accent stays for focus, active nav, tabs, links and charts.
  - **Dark mode** (`html[data-mode="dark"]`): every hue scale reads reversed (50↔950). `gray-950` stays darkest, for scrims, so never use `text-gray-950`. Surface oklch(18.5%).
- **Runtime:**
  - `lib/theme.js` (client: read/save/apply, `useChartColors`).
  - `lib/themeBoot.js` (server-safe pre-paint script in the root layout `<head>`). Hooks cannot live in a module the server layout imports.
  - `components/ThemeSync.jsx` (route + OS sync).
  - The picker is in the AppSidebar footer (Palette icon). The landing page "/" and `/owner/**` are never themed.
- **Charts:** inflow `--chart-in` (emerald #047857 / blue #2563eb / violet #7c3aed), outflow `--chart-out` #d97706. Each pair was validated in light and dark. Teal was rejected (chroma too low) and rose too (red as inflow reads negative).
- **Verified:** light, dark and blue accent on admin pages; a dark sweep of 9 role pages; picker popover in light and dark.

## Session 5d (2026-11-18): popups, dark mode + phone sweep, detail pages

- **Popups (13, opened with real clicks; open-only, nothing submitted) in dark and light:** filter drawers, KPI drill panel, accounts dropdown, Record Borrowing, New Collab Case, Add Session, Add Candidate, Add Incentive, New User, master-data category.
  - Fixed: drawer scrim built from `slate-900/40` turned light in dark mode (now `gray-950/40`).
  - Fixed: solid violet/purple fills and financing-module violet tints moved to the accent (purple status badges kept).
- **Dark mode at 390px across all 132 non-owner routes,** including 23 detail and edit routes with real IDs: no horizontal page scroll.
  - Fixed: gradient page wrappers on role transaction pages (navy in dark, faint blue in light).
  - Fixed: bill modal gradient header and buttons.
  - Fixed: role transaction tables (purple branch chips, blue payment-type chips, coloured row actions, empty pill when no payment type).
- **Detail and edit pages:**
  - Update Employee (admin + HR) rebuilt on FormSection.
  - Patient record for collab, reception, sales and surgery got the admin record pass.
- **Not changed, on purpose:** consultation forms and invoices are self-styled paper documents and render identically in either mode. `/owner/**` is still its own design.

## Next session — suggested order

1. Visual QA of the shell and tokens (log in as each role).
2. Remaining shared tables: `finance/DrillDownTable.jsx`, `StaffTable.jsx`, `stocks/ui.jsx` → adopt the `table` class map from `components/ui` (sticky header, right-aligned numbers).
3. List pages per role (patients, transactions, not-visited, reports) → `Page` + `PageHeader` + `Panel`.
4. Detail and edit pages (`[id]`, `edit/[id]`) and long forms (add-patient, book-consult) → `Field` grouping into sections.
5. Admin finance area (assets, liabilities, financing, close-book, receipts, payments).
6. Stocks, HR, super-admin inner pages.
7. Decide on `/owner/**` (keep its own theme or fold into tokens).

## Route checklist

`[x]` = redesigned in a page pass. Unchecked routes still get layers 1–5 (tokens, guards, codemods, shell) but not a hand pass yet.

### public (1)

- [ ] `/`

### admin (40)

- [ ] `/admin/assets`
- [ ] `/admin/assets/advances`
- [ ] `/admin/assets/cash-book`
- [ ] `/admin/assets/loan-accounts`
- [ ] `/admin/assets/receivables`
- [ ] `/admin/close-book`
- [ ] `/admin/collab-settlement`
- [ ] `/admin/collab-settlement/patient`
- [x] `/admin/dashboard` — polished pass 1
- [ ] `/admin/deleted-data`
- [ ] `/admin/employees`
- [ ] `/admin/employees/[id]`
- [ ] `/admin/employees/add-employee`
- [ ] `/admin/employees/merge`
- [ ] `/admin/employees/update/[id]`
- [ ] `/admin/financing`
- [ ] `/admin/liabilities`
- [ ] `/admin/liabilities/borrowings`
- [ ] `/admin/liabilities/payables`
- [ ] `/admin/liabilities/payables/employees`
- [ ] `/admin/liabilities/payables/other`
- [ ] `/admin/liabilities/payables/rent`
- [ ] `/admin/liabilities/suspense`
- [ ] `/admin/patient-bulk-import`
- [x] `/admin/patients` — via PatientTable pass (session 3)
- [ ] `/admin/patients/[id]`
- [ ] `/admin/patients/edit/[id]`
- [ ] `/admin/payments`
- [ ] `/admin/prp`
- [ ] `/admin/receipts`
- [ ] `/admin/reports`
- [ ] `/admin/settings/master-data`
- [ ] `/admin/stocks`
- [x] `/admin/transactions` — via transactions components pass (session 3)
- [ ] `/admin/transactions/create`
- [ ] `/admin/transactions/edit/[id]`
- [ ] `/admin/uploads`
- [ ] `/admin/vendors`
- [ ] `/admin/vendors/create`
- [ ] `/admin/vouchers`

### book-consult (1)

- [ ] `/book-consult`

### collab (15)

- [ ] `/collab/add-patient`
- [ ] `/collab/book-consult`
- [ ] `/collab/collab-settlement`
- [x] `/collab/dashboard` — polished pass 1
- [x] `/collab/not-visited` — card grid → table, primitives (session 3)
- [ ] `/collab/old-prp-patients`
- [x] `/collab/patients` — via PatientTable pass (session 3)
- [ ] `/collab/patients/[id]`
- [ ] `/collab/patients/[id]/consultation-form`
- [ ] `/collab/patients/edit/[id]`
- [ ] `/collab/prp`
- [ ] `/collab/reports`
- [ ] `/collab/transactions`
- [ ] `/collab/transactions/create`
- [ ] `/collab/transactions/edit/[id]`

### counsellor (2)

- [ ] `/counsellor/patients`
- [ ] `/counsellor/patients/edit/[id]`

### hr (11)

- [ ] `/hr/applied`
- [ ] `/hr/candidates`
- [x] `/hr/dashboard` — polished pass 1
- [ ] `/hr/employees`
- [ ] `/hr/employees/add-employee`
- [ ] `/hr/employees/update/[id]`
- [ ] `/hr/incentives`
- [ ] `/hr/rejected`
- [ ] `/hr/reports`
- [ ] `/hr/selected`
- [ ] `/hr/visited`

### login (1)

- [x] `/login` — redesigned (primitives)

### owner (66)

- [ ] `/owner/ai`
- [ ] `/owner/ai/attendance`
- [ ] `/owner/ai/attention`
- [ ] `/owner/ai/clinical-quality`
- [ ] `/owner/ai/health`
- [ ] `/owner/ai/sanya`
- [ ] `/owner/ai/suggestions`
- [ ] `/owner/calls`
- [ ] `/owner/calls/employee-report`
- [ ] `/owner/calls/forecast`
- [ ] `/owner/calls/live`
- [ ] `/owner/calls/report`
- [ ] `/owner/calls/sim-health`
- [ ] `/owner/calls/untracked`
- [ ] `/owner/dashboard`
- [ ] `/owner/employees`
- [ ] `/owner/employees/agents`
- [ ] `/owner/employees/agents/[employeeId]`
- [ ] `/owner/employees/counsellors`
- [ ] `/owner/employees/counsellors/[employeeId]`
- [ ] `/owner/employees/hr`
- [ ] `/owner/employees/hr/[employeeId]`
- [ ] `/owner/employees/leadership`
- [ ] `/owner/employees/leadership/[tlNameKey]`
- [ ] `/owner/employees/links`
- [ ] `/owner/employees/other-staff`
- [ ] `/owner/employees/other-staff/[employeeId]`
- [ ] `/owner/employees/surgery-staff`
- [ ] `/owner/employees/surgery-staff/[employeeId]`
- [ ] `/owner/finance`
- [ ] `/owner/finance/assets`
- [ ] `/owner/finance/expenses`
- [ ] `/owner/finance/liabilities`
- [ ] `/owner/finance/rent`
- [ ] `/owner/finance/salary-incentive`
- [ ] `/owner/finance/transactions`
- [ ] `/owner/hr`
- [ ] `/owner/hr/by-position`
- [ ] `/owner/hr/interviews`
- [ ] `/owner/hr/rejected`
- [ ] `/owner/hr/selected`
- [ ] `/owner/leads`
- [ ] `/owner/leads/follow-ups`
- [ ] `/owner/leads/interested`
- [ ] `/owner/leads/not-interested`
- [ ] `/owner/leads/report`
- [ ] `/owner/leads/retry`
- [ ] `/owner/leads/unattempted`
- [ ] `/owner/marketing`
- [ ] `/owner/marketing/ad-spend`
- [ ] `/owner/marketing/campaign-leads`
- [ ] `/owner/marketing/campaigns`
- [ ] `/owner/marketing/comparison`
- [ ] `/owner/marketing/performance`
- [ ] `/owner/marketing/platforms`
- [ ] `/owner/patients`
- [ ] `/owner/patients/[id]`
- [ ] `/owner/patients/all`
- [ ] `/owner/patients/booking-done`
- [ ] `/owner/patients/converted`
- [ ] `/owner/patients/counsellor-conversion`
- [ ] `/owner/patients/direct`
- [ ] `/owner/patients/not-converted`
- [ ] `/owner/patients/surgery-done`
- [ ] `/owner/patients/surgery-planner`
- [ ] `/owner/statistics`

### reception (15)

- [ ] `/reception/add-patient`
- [ ] `/reception/book-consult`
- [x] `/reception/dashboard` — polished pass 1
- [ ] `/reception/incentives`
- [x] `/reception/not-visited` — card grid → table, primitives (session 3)
- [ ] `/reception/old-prp-patients`
- [x] `/reception/patients` — via PatientTable pass (session 3)
- [ ] `/reception/patients/[id]`
- [ ] `/reception/patients/[id]/consultation-form`
- [ ] `/reception/patients/edit/[id]`
- [ ] `/reception/prp`
- [ ] `/reception/reports`
- [ ] `/reception/transactions`
- [ ] `/reception/transactions/create`
- [ ] `/reception/transactions/edit/[id]`

### register (1)

- [x] `/register` — redesigned (primitives)

### sales (12)

- [ ] `/sales/agents`
- [ ] `/sales/book-appointment`
- [x] `/sales/dashboard` — polished pass 1
- [ ] `/sales/incentives`
- [x] `/sales/patients` — via PatientTable pass (session 3)
- [ ] `/sales/patients/[id]`
- [ ] `/sales/performance`
- [ ] `/sales/reports`
- [ ] `/sales/revenue`
- [ ] `/sales/transactions`
- [ ] `/sales/transactions/create`
- [ ] `/sales/transactions/edit/[id]`

### stocks (13)

- [ ] `/stocks/addStock`
- [ ] `/stocks/audit`
- [ ] `/stocks/create`
- [ ] `/stocks/dashboard`
- [ ] `/stocks/edit/[id]`
- [ ] `/stocks/transactions`
- [ ] `/stocks/transactions/create`
- [ ] `/stocks/transactions/edit/[id]`
- [ ] `/stocks/transfer`
- [ ] `/stocks/vendors`
- [ ] `/stocks/vendors/create`
- [ ] `/stocks/vendors/edit/[id]`
- [ ] `/stocks/view/[id]`

### super-admin (12)

- [x] `/super-admin/dashboard` — polished pass 1
- [ ] `/super-admin/employees`
- [ ] `/super-admin/entries-report`
- [ ] `/super-admin/interviews`
- [ ] `/super-admin/lead-funnel`
- [ ] `/super-admin/leads`
- [ ] `/super-admin/manage-users`
- [x] `/super-admin/patients` — via PatientTable pass (session 3)
- [ ] `/super-admin/performance`
- [ ] `/super-admin/reports`
- [ ] `/super-admin/stocks`
- [x] `/super-admin/transactions` — via transactions components pass (session 3)

### surgery (9)

- [ ] `/surgery/add-patient`
- [x] `/surgery/dashboard` — polished pass 1 + fake data removed
- [ ] `/surgery/incentives`
- [x] `/surgery/not-visited` — card grid → table, primitives, fake data removed (session 3)
- [x] `/surgery/patients` — via PatientTable pass (session 3)
- [ ] `/surgery/patients/[id]`
- [ ] `/surgery/patients/edit/[id]`
- [ ] `/surgery/reports` — fake fallback removed only
- [x] `/surgery/visited` — card grid → table, primitives, fake data removed (session 3)
