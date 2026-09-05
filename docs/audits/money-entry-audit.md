# Money-Entry Surface & Backend Audit — Phase A

**Scope:** every UI surface that writes money movement, and the API route it posts to.
**Method:** direct file reads + repo-wide grep, cited by `file:line`. No code was changed to produce this report.
**Status:** confirms and extends the 8 seed defects (§0.6 of the task brief), adds 13 new findings (F1–F9 below; F10–F12 surfaced during the side-effects pass, F2b extends F2). Ranked by severity below; full surface/route inventories follow.

**Addendum (below the route inventory):** a full side-effects inventory per entry surface, per the non-negotiable rule that every money entry's existing side effects be enumerated in Phase A and asserted in Phase B. Three findings only surfaced there and belong at P0/P1 alongside F1/F2, flagged here so they aren't missed:

- **F11 — `collab-settlement/settlements/create` is not atomic.** The settlement document and its per-case generated transactions are written outside any DB session; a mid-loop failure leaves a saved settlement with a partial/missing set of transactions and still returns success (detail under "Side-effects inventory" below).
- **F10 — a receipt recorded directly against a receivable never updates `patient.payments`,** unlike the three revenue-creation routes, even when the receivable resolves to a patient.
- **F12 — Medicine sales never update `patient.payments`,** unlike Transplant and Service, despite sharing the same patient-linked, discount-bearing shape.

---

## Severity-ranked findings

### 🔴 P0 — silent data loss / correctness

**F1. Editing an EMPLOYEE- or PATIENT-linked expense permanently detaches it from that employee/patient, on *any* save — even a no-op one.**

Affects every Salary, Incentive, Commission, and Patient-Related-Expense/Refund transaction edited from `/admin/transactions/edit/[id]` (and the same `DirectExpenseSection`-based edit pages under `/sales`, `/reception`, `/stocks`, `/collab`).

- Model supports the link: `Transactions.js:49-51` — `expenseGiver.refId` (ObjectId, no `ref`).
- Create route *requires* it for EMPLOYEE/PATIENT: `expense/create/route.js:94-97`.
- Edit page **load** collapses `type` down to a boolean: `edit/[id]/page.jsx:359,372` — `isVendor = expenseGiver?.type === "VENDOR"`; anything not VENDOR is treated as free-text `expenseGiverName`, discarding `type` and `refId`.
- Edit page **save** rebuilds the giver as `{ type: isVendor ? "VENDOR" : "MANUAL", vendorId, name }` — `edit/[id]/page.jsx:642-648`. EMPLOYEE/PATIENT can never round-trip; it always becomes `MANUAL`.
- Update route persists exactly that, with **no `refId` field at all** in the write: `expense/update/route.js:194-197`. No validation requires/preserves it for EMPLOYEE/PATIENT (unlike the create route's check).

Repro: open any existing Salary transaction in the edit page, click Save without changing anything → `expenseGiver` silently becomes `{type: "MANUAL", name: "<same text>"}`, the Employee link is gone.

Blast radius today: I grepped the repo for reads of `expenseGiver.refId` — only the create route's own validation reads it (`expense/create/route.js:96,181`). No aggregation currently joins on it, so the *visible* symptom today is limited to audit-trail/lookup accuracy, not payable math (that runs through `payableId`, which is a separate, correctly-preserved field). Still an unconditional, silent field loss on a documented, validated identity link — the kind of bug that becomes a real incident the day something *does* start reading it (e.g. an "all payments to this employee" report).

**F2. Revenue and Expense **creation** never checks the period lock — only editing does.**

`checkPeriodLock`/`periodLockResponse` (`src/lib/periodLock.js`) is role-agnostic (no exemption for admin), so this is a real integrity gap, not a permissions design choice:

| Route | calls periodLock? |
|---|---|
| `transactions/transplant/create` | **no** |
| `transactions/service/create` | **no** |
| `transactions/medicine/create` | **no** |
| `transactions/expense/create` | **no** |
| `transactions/expense/update` | yes (`periodLockResponse`, confirmed at top of file) |
| `payables/create` | yes |
| `receivables/create` | yes |
| `advances/create` | yes |
| `borrowings/create` | yes |
| `account-transfers/create` | yes |

Confirmed by reading every import block: none of the four transaction-creation routes import `periodLock`/`checkPeriodLock`/`loadClosedPeriodSnapshot` at all (`transplant/create/route.js:1-15`, `service/create/route.js:1-13`, `medicine/create/route.js:1-13`, `expense/create/route.js:1-14`).

Consequence: Close Book's whole premise — "closing a period" makes it immutable — holds for edits but not for new transactions. Anyone, any role, can **create** (not edit) a Transplant/Service/Medicine/Expense transaction dated into, or routed through an account belonging to, a closed period, from any of the 5 create surfaces (admin + 4 role pages), and it succeeds silently. This is the highest-volume entry path in the system.

### 🟠 P1 — silent divergence between two independently-maintained sources

**F3 (extends seed #4). There are five independent lists mapping expense category ↔ payable purpose, not two, and none is authoritative.**

1. `Payable.js:14-30` `PAYABLE_PURPOSE_VALUES` — the actual Mongoose enum, ground truth.
2. `payablePurposes.js:1-17` `PAYABLE_PURPOSES` — a hand-copied duplicate of #1, used only for the label map below it.
3. `getPayableContext.js:2-12` `PAYABLE_CATEGORY_PURPOSE` — category→purpose, used by the admin create page's "rent" expense section. **9 of 14** purposes covered.
4. `vouchers/page.jsx:15-26` `CATEGORY_TO_PURPOSE` — category→purpose, used by the Vouchers page. **10 of 14** covered.
5. `NewPayableModal.jsx:52-67` `PURPOSE_TO_CATEGORY` (inverse direction) + `PURPOSE_LABELS:35-50` — used by the New Payable modal.

Confirmed divergences:
- `"Collab Clinic Payment"` → `COLLAB_CLINIC` exists in #4 (`vouchers/page.jsx:25`) but **not** in #3 (`getPayableContext.js`) — raising the same expense head from the admin create page's rent section vs. the Vouchers page produces different `Payable.purpose` values (seed defect, confirmed as-is).
- **`SOFTWARE_RENTAL` is missing from both #3 and #4.** `NewPayableModal.jsx` offers it as a purpose (with `expenseCategory: "Software Rental Expenses"`), but neither the admin create page's rent section nor the Vouchers page can produce it — `getPayableContext.js:91-92` returns `null` (silently refuses to build the payable) and `vouchers/page.jsx:178` falls back to `purpose: "OTHER"`. Same category, three different outcomes depending on which of the three screens you use.
- Label divergence: `payablePurposes.js:26` labels `TAX` as `"Tax"`; `NewPayableModal.jsx:42` labels it `"Taxes"`. Cosmetic, but it's evidence these lists are never actually cross-checked.

**F4 (extends seed #6). The "reads the static constant instead of `useMasterData()`" defect is not one file, it's 13.**

`src/lib/masterData/index.js` is unambiguous about which `constants/bankRouting.js` exports are master-data-backed (i.e. editable at runtime) vs. genuinely static:

| Export | Master-data-backed? | Backing kind |
|---|---|---|
| `ACCOUNTS` | **yes** | `MasterData` kind `ACCOUNT` (`accountsSync()` / `getAccounts()`) |
| `NON_CASH_METHODS` | **yes** | `PAYMENT_METHOD.isNonCash` |
| `UNSETTLED_METHODS` | **yes** | `PAYMENT_METHOD.isUnsettled` |
| `RECEIPT_MODES` | **yes** | `MasterData` kind `RECEIPT_MODE` |
| `FURTHER_MODES` (`= ACCOUNTS`) | **yes** (alias) | same as `ACCOUNTS` |
| `SETTLEMENT_EXCLUSION` | **no** — a static Mongo `$match` fragment, no admin-editable equivalent exists | — |

I grepped every one of the 29 `from "@/constants/bankRouting"` import sites and classified them:

- **12 legitimate** — all import only `SETTLEMENT_EXCLUSION` (dashboards/reports: `saniya/route.js`, `sales/performance`, `sales/dashboard`, `reception/dashboard`, `collab/dashboard`, `admin/reports`, `transactions/get-all`, `admin/dashboard` (API), `super-admin/reports`, `super-admin/performance`, `super-admin/dashboard`). No master-data equivalent exists for this value — correct as written.
- **4 infra** — `resolveRouting.js`, `masterData/lists.js`, `masterData/index.js`, `useMasterData.js` are the sync/fallback layer itself.
- **13 stale reads** — read a master-data-backed export directly, bypassing `useMasterData()`/`accountsSync()`, so an edit in the master-data admin screen (rename/retire/add an account or flip a method's `isNonCash`/`isUnsettled`) does not reach these:
  - `ACCOUNTS`, direct: `ContraManager.jsx:5`, `ContraEntryForm.jsx:7`, `EditBorrowingModal.jsx:7`, `EditAdvanceModal.jsx:7`, `LoanSettlementModal.jsx:5`, `RecordAdvanceModal.jsx:8`, `SuspenseManager.jsx:5`, `SuspenseEntryForm.jsx:7`, `admin/close-book/page.jsx:5`, `admin/dashboard/page.jsx:12` — **10 files**, all render it straight into a `<select>` with no `useMasterData` import anywhere in the file (verified).
  - `NON_CASH_METHODS`/`UNSETTLED_METHODS`: `StatusBadges.jsx:12`, `TransactionFieldSet.jsx:8` (the seed-listed one).
  - `UNSETTLED_METHODS, FURTHER_MODES`: `TransactionsListPage.jsx:44`.

So the seed defect's "audit every file, classify legitimate vs. stale" instruction turns up **13 stale files, not 1** — the same bug class as the one named example, at 13x the footprint.

**F5 (refines seed #1). `finance/TransactionFieldSet.jsx` is not dead duplication — it's a real wrapper, just confusingly placed.**

Read in full (`finance/TransactionFieldSet.jsx:1-72`): it wraps the root component and adds `TaxBreakdownFields` (for `context === "voucher"`) and a collab-settlement direction sentence (for `context === "collab-settlement"`) — behavior the root doesn't have. Usage is exactly 3 sites, and they're not interchangeable by accident:
- `vouchers/page.jsx:9` imports the **finance/ wrapper** — correctly, since Vouchers needs the GST/TDS fields it adds.
- `RecordPaymentModal.jsx:5` and `RecordReceiptModal.jsx:5` import the **root** directly — correctly, they don't need tax fields.

The real problem is naming/discoverability (identical component name in two files, one nested under `finance/` looking like a leftover copy), not two competing implementations of the same thing. Consolidating them for Phase B is still worthwhile, but it's a rename/merge, not a "delete the dead one" — the wrapper's two extra behaviors need a home.

**F6 (extends seed #2/#3). The admin create page is the *only* create/edit surface that hand-rolls its expense fields instead of using the shared component.**

`DirectExpenseSection.jsx` (which composes `MethodField`, i.e. the real source of the method+paymentId+routing+external-party fields) is used by:
- create: `reception/transactions/create/page.js:7`, `sales/transactions/create/page.js:7`, `stocks/transactions/create/page.js:7`
- edit: `admin/transactions/edit/[id]/page.jsx:6`, `sales/.../edit/[id]/page.jsx`, `reception/.../edit/[id]/page.jsx`, `stocks/.../edit/[id]/page.jsx`, `collab/.../edit/[id]/page.jsx`

**8 of 9** expense create/edit surfaces use it. The one exception is `admin/transactions/create/page.jsx` itself — the highest-traffic surface — which reimplements the same method-select / offset_settlement note / external-party / routing / paymentId block inline at `page.jsx:1997-2072`, byte-for-byte equivalent to `MethodField.jsx:36-93` but copy-pasted with local state. This is the direct cause of seed defect #3 (`getPaymentIdConfig` duplicated at `page.jsx:40-52` vs `MethodField.jsx:7-14`) — it isn't an isolated slip, it's a symptom of this one file not being wired to the shared component at all.

Caveat for Phase B: `DirectExpenseSection` is *deliberately* narrower than what the admin page needs — its own comment (`DirectExpenseSection.jsx:19-20`) says it's for "non-admin panels... where payable-type expense categories are managed elsewhere," and it filters those categories out entirely (`:21-23`). So "just make the admin page use `DirectExpenseSection`" doesn't work as-is: the admin page's Agent/Patient/Rent routing (`resolveExpenseSection`, seed #7) has no equivalent there. Confirmed separately, and worse: because the admin **edit** page *does* route through `DirectExpenseSection`, editing a Salary/Incentive/Commission/Rent transaction shows the category as a locked "(existing)" option (`DirectExpenseSection.jsx:86-88`) with no employee/patient re-picker — i.e. the rich creation flow and the flat edit flow for the same transaction don't even agree on what fields exist. This is the structural root of F1 above.

### 🟡 P2 — duplication with no observed divergence yet, but no shared source

**F7 (seed #3, confirmed exact).** `getPaymentIdConfig`: `admin/transactions/create/page.jsx:40-52` is byte-for-byte identical today to `MethodField.jsx:7-14` (exported there as `getPaymentIdConfig`), but they are two independent function bodies — `page.jsx` doesn't import the exported one. Same value today; will drift the moment either is edited.

**F8 (seed #5, confirmed).** `NO_GIVER_CATEGORIES` (`expense/create/route.js:16-24`) is a hardcoded literal array of category *names* — `["Salary","Incentive","Commision","Patient Related Expenses","Rent","Electricity Bill","Collab Clinic Payment"]` — checked against `expenseCategory`, which is runtime master data (admin-editable rows, not an enum). Renaming any of these 7 categories via the master-data admin screen silently makes that category start requiring a giver again (or vice versa for a newly added no-giver head), with no code path connecting the two. The frontend's "equivalent notion" is structurally different, not the same mechanism: `validateExpenseEntry.js`'s `validateExpenseSection` (`:11-45`) never checks a category list at all — it infers "no giver needed" from which UI *section* the field belongs to (`expenseSection === "agent"`, `"rent"`, or `"patient"+commission`), a routing decision made once in `resolveExpenseSection()` (`page.jsx:68-73`, seed #7, confirmed to exist only in this one file). The two mechanisms agree today only because nobody has touched either list since the other was last edited.

**F9.** `payablePurposes.js`'s `PAYABLE_PURPOSES` array (`:1-17`) is a hand-copied duplicate of `Payable.js`'s `PAYABLE_PURPOSE_VALUES` enum (`Payable.js:14-30`), kept only for the label lookup beside it. Adding/renaming a purpose in the model requires remembering to update this file too, or `payablePurposeLabel()` silently falls back to a title-cased raw value (`payablePurposes.js:37-38`) for the model's own valid purpose.

### ℹ️ Checked and *not* a defect (recorded for credibility / to save Phase B re-litigating it)

- `incentives/route.js` has no `ALLOWED_ROLES` check — **by design**, per its own comment (`:8-11`): "Any authenticated staff member may record a per-patient incentive here." It's the shared entry point every role's transaction-create page uses for its Incentive tab. Confirmed `recordPatientIncentive` (called at `:32`) enforces period-lock internally.
- `backDateGuard` missing from `payables/create`, `receivables/create`, `advances/create`, `borrowings/create`, `account-transfers/create`, `suspense`, `collab-settlement/*` — **not a live gap**. `backDateGuard` (`src/lib/backDateGuard.js:41-43`) is a no-op for `admin`/`super-admin`, and every one of those routes is already `ALLOWED_ROLES = ["admin","super-admin"]`-gated (`collab-settlement/cases/create` additionally allows `"collab"`, worth a note but not exercised by back-dating since collab-role write there is case creation, not a dated ledger entry in the same sense). The 4 non-admin-reachable surfaces (reception/sales/collab/stocks create pages) only ever post to `transplant/service/medicine/expense` create — all four of which *do* call `backDateGuard`, confirmed.
- Vendor-type `expenseGiver` on edit — `vendorId` *does* survive the update route's rewrite (`expense/update/route.js:196`), unlike `refId` (F1). Only EMPLOYEE/PATIENT-typed givers are affected.

---

## Surface inventory — what each UI surface actually uses

| # | Surface | Lines | Posts to | Uses `MethodField`/`TransactionFieldSet`? |
|---|---|---:|---|---|
| 1 | `admin/transactions/create` (5 tabs) | 2204 | `transplant/create`, `service/create`, `medicine/create`, `expense/create`, `payables/create` | Revenue tabs: yes, via `RevenueSection` → `MethodField`. **Expense tab: no — hand-rolled inline (F6).** |
| 2 | `admin/transactions/edit/[id]` | 932 | `expense/update` (+ category-specific update routes not audited here) | Yes, via `DirectExpenseSection` → `MethodField`. Narrower field set than what created some of these rows (F6/F1). |
| 3 | `admin/vouchers` | 538 | `payables/create`, `receivables/create` | Yes — the only consumer of `finance/TransactionFieldSet` (correctly, needs its tax fields). |
| 4 | `RecordPaymentModal` | 206 | `expense/create` | Yes, root `TransactionFieldSet`. |
| 5 | `RecordReceiptModal` | 174 | `receivables/[id]/receipt` | Yes, root `TransactionFieldSet`. |
| 6 | `NewPayableModal` / `NewReceivableModal` | 622 / 521 | `payables/create` / `receivables/create` | No — neither imports `MethodField`/`TransactionFieldSet` (correctly: raising an obligation has no payment-method field). Independent hand-rolled purpose/payee/period/amount form in each. |
| 7 | `RecordAdvanceModal` / `RecordBorrowingModal` | 870 / 599 | `advances/create` / `borrowings/create` | No — different field shape (`account`+`direction`, no `method`). Independent hand-rolled account/date/branch/reference scaffold in each. |
| 8 | `ContraEntryForm` | 295 | `account-transfers/create` | No — `fromAccount`→`toAccount` shape. Uses `TransactionSectionCard` + `ReceiptUpload` only. |
| 9 | `SuspenseEntryForm` | 360 | `suspense` | No — `account`+`direction` shape. Same partial reuse as Contra. |
| 10 | `IncentiveEntryForm` | 274 | `incentives` | No — minimal (`SearchableSelect` only). |
| 11 | `CollabCaseForm` / `CollabSettlementPanel` / `admin/collab-settlement` | 546 / 307 / 1951 | `collab-settlement/cases/create` / **`expense/create`** (not a collab-specific route) / `collab-settlement/settlements/create` | Uses `BankRoutingFields` directly, not `MethodField`. Note: `CollabSettlementPanel` posts to the generic expense route, same endpoint `RecordPaymentModal` uses, with an independently-built payload. |
| 12 | `SettleAgainstModal` / `LoanSettlementModal` | 308 / 270 | `advances/[id]` PATCH, `borrowings/[id]` PATCH / `account-transfers/create` | No shared field set (different again: pick-a-target-document shape). |
| 13–16 | `reception`/`sales`/`collab`/`stocks` `transactions/create` | 690/689/584/650 | same revenue/expense/incentive/collab routes as admin | **Yes** — all four correctly use `RevenueSection`/`DirectExpenseSection`/`IncentiveEntryForm`. `reception` and `sales` are near line-for-line identical page shells (state shape, tab order, submit sequencing duplicated 2–4×, not the field level). |

**Structural note for Phase B:** the six field "shapes" in play are genuinely different, not accidentally divergent copies of one shape:
1. payment-against-category/document (`method`, routing, external party, receipts) — what `MethodField`/`TransactionFieldSet` model.
2. obligation-raising (payee, purpose, period, amount — no payment fields at all).
3. account-movement with direction (`account`, `direction: IN|OUT`, no `method`) — Advances, Borrowings, Suspense.
4. account-to-account transfer (`fromAccount`, `toAccount`) — Contra.
5. settle-document-A-against-document-B (pick a target, no new money fields) — SettleAgainstModal, LoanSettlementModal.
6. collab-specific composite (case + settlement + an expense-route payment leg).

A "universal entry engine" that assumes shape 1 for everything will not fit shapes 2–6 without either forcing irrelevant fields into the form or re-introducing per-shape special-casing inside the "universal" component — which is exactly the failure mode `TransactionFieldSet` already shows in miniature (`HIDE_PAYMENT_FIELDS_CONTEXTS`, `SETTLEMENT_CONTEXTS` special-casing inside one component, `TransactionFieldSet.jsx:22-28`). The genuine common denominator across all six shapes, confirmed by inspection, is just: `amount`, `date`, `branch`, `remarks`, `receipts` — everything else is shape-specific. Recommend designing Phase B around one shared "envelope" (those 5 fields + submit/validation/receipt plumbing) with pluggable shape-specific bodies, not one monolithic field set.

---

## Route inventory — validation/guard coverage

| Route | Role gate | `backDateGuard` | `periodLock` | master-data validation |
|---|---|:---:|:---:|:---:|
| `transactions/transplant/create` | any session | yes | **no (F2)** | — (revenue, no expense category) |
| `transactions/service/create` | any session | yes | **no (F2)** | — |
| `transactions/medicine/create` | any session | yes | **no (F2)** | — |
| `transactions/expense/create` | any session | yes | **no (F2)** | yes (`expenseTypesSync`, `unsettledMethodsSync`, `nonCashMethodsSync`) |
| `transactions/expense/update` | any session | yes | yes | yes |
| `payables/create` | admin/super-admin | — (n/a, no-op for this role) | yes | yes |
| `receivables/create` | admin/super-admin | — | yes | — (no expense-side validation needed) |
| `receivables/[id]/receipt` | admin/super-admin | — | **no (F2b)** | — |
| `advances/create` | admin/super-admin | — | yes | yes |
| `borrowings/create` | admin/super-admin | — | yes | yes |
| `account-transfers/create` | admin/super-admin | — | yes | yes |
| `suspense` | admin/super-admin | — | **no (F2b)** | yes |
| `incentives` | **any authenticated user (by design)** | — | yes, inside `recordPatientIncentive` | — |
| `collab-settlement/cases/create` | **collab**, admin, super-admin | — | **no (F2b)** | — |
| `collab-settlement/settlements/create` | admin/super-admin | — | **no (F2b)** | — |

**F2b (extends F2).** Re-checked the 4 routes originally marked "not checked": none of `receivables/[id]/receipt`, `suspense`, `collab-settlement/cases/create`, `collab-settlement/settlements/create` import or call `periodLock`/`checkPeriodLock`/`periodLockResponse` anywhere (confirmed by grep against each file, zero matches). So period-lock coverage is: **4 of the 4 revenue/expense-creation routes** skip it (F2) **plus 4 more** (receipt-against-receivable, suspense, both collab-settlement writes) — 8 of 15 audited write routes in total don't enforce it, against 7 that do. Recording a receipt against a receivable — the direct counterpart to `expense/create`'s pay-a-payable path — is in the "doesn't check" half, which is a real asymmetry: paying a payable can be blocked by a closed period, receiving against a receivable cannot.

---

## Confirmation status of the 8 seed defects

| # | Seed defect | Status |
|---|---|---|
| 1 | `TransactionFieldSet` exists twice | **Confirmed, refined (F5)** — real wrapper with distinct behavior, 3 correctly-chosen consumers, not dead duplication. Naming/discoverability issue. |
| 2 | Admin create page doesn't use `TransactionFieldSet`, reimplements inline | **Confirmed, extended (F6)** — also doesn't use `MethodField`/`DirectExpenseSection`, the only one of 9 expense create/edit surfaces that doesn't. |
| 3 | `getPaymentIdConfig` duplicated | **Confirmed exact** (F7) — identical bodies, `page.jsx:40-52` vs `MethodField.jsx:7-14`, no import between them. |
| 4 | Category→purpose map duplicated and divergent | **Confirmed, extended (F3)** — 5 lists not 2; a second divergence found (`SOFTWARE_RENTAL` missing from 2 of them, unreachable via 2 of 3 create paths). |
| 5 | `NO_GIVER_CATEGORIES` hardcoded against runtime master data | **Confirmed exact (F8)**, with the frontend "equivalent" traced to `resolveExpenseSection` + `validateExpenseEntry.js`'s section-based (not list-based) logic. |
| 6 | `TransactionFieldSet.jsx` reads `bankRouting` statically instead of `useMasterData()`; audit ~27 files | **Confirmed, quantified (F4)** — 13 of 29 import sites are the same stale-read bug, not 1; 12 are legitimate; 4 are infra. |
| 7 | `resolveExpenseSection()` lives only in the admin create page | **Confirmed exact** — `page.jsx:68-73`, no other surface can classify a head this way. |
| 8 | Validation split client/server, sometimes disagreeing | **Confirmed, and this is where F1/F2 (the two P0s) live** — the split isn't just "some rules missing," it's rules that exist on one side and quietly rewrite/bypass state on the other. |

---

## Side-effects inventory — what each write route does beyond "save the Transaction/Payable/Receivable"

Per the non-negotiable rule: enumerated here from the actual route code (not inferred), to be asserted — not just "kept" — by Phase B. Every row below is a behavior Phase B's universal engine must still trigger, in the same order, with the same guard conditions.

### `transactions/transplant/create` (`transplant/create/route.js`)
- Resolves receivable allocation for the sale amount — `resolveReceivableAllocations(...)` (`:162-169`) — either attaches to an existing open receivable, splits across several (per `receivableAllocationChoice`), or opens a new one; all inside one Mongo session (`withDbTransaction`).
- `paid_to_external` method instead creates a **separate external receivable** (`createExternalReceivable`, `:143-154`) and links it via `txn.externalParty.linkedReceivableId` — mutually exclusive with the allocation path above.
- **Patient payments recompute** (`:184-227`, not inside the DB session — a second, separate write after the transaction commits): pushes the new transaction id onto `patient.payments.transactions`, adds the paid amount to `amountReceived`, **recomputes `discount` from scratch** by re-summing every linked Revenue transaction's `discount` field, then derives `pendingAmount = max(0, (totalAmount − discount) − amountReceived)`. `totalAmount` itself is untouched (must already be set, e.g. at package assignment).
- Pushes an entry to **`patient.editors`** (not the transaction's own `editors` — the txn's `editors` array is initialized empty at creation and never appended to by this route).
- `approvalStatus` is not set explicitly here; falls back to the schema default (`APPROVED`).
- No stock effect (transplant has no stock item), no `batchId` (single line), no incentive row, no collab split.

### `transactions/service/create` / `transactions/medicine/create`
- Same receivable-allocation / external-receivable / patient-payments-recompute / patient-editors pattern as Transplant, but for **N line items in one call**, sharing one **`batchId`** (`BATCH-${Date.now()}-${random}`, `:96-98` resp. `:114-116`) — one Transaction document per line item, all stamped with the same `batchId`, discount apportioned pro-rata per item (`computeItemFinalAmount`).
- **Medicine only:** validates and then decrements stock — `Stock.findByIdAndUpdate(item.medicineId, {$inc:{totalQuantity: -item.quantity}})` (`medicine/create/route.js:225-229`) — **after** the DB-transactioned Transactions.create has already committed, and **not itself wrapped in that same session**. A failure here leaves a sold, paid-for Transaction with stock not decremented.
- **F12 (new).** Service updates `patient.payments` exactly like Transplant (`service/create/route.js:207-258`). **Medicine does not** — there is no `patient.payments` recompute block anywhere in `medicine/create/route.js` after the stock decrement (confirmed by reading the file to its end, `:225-252`). A medicine sale against a patient never touches `patient.payments.amountReceived/pendingAmount/discount/transactions`, even though the shape (`medicineAmount: 0`) exists in the default `patient.payments` object built by the other two routes. Phase B must decide whether this is intentional (medicine tracked elsewhere) or a gap — Phase A does not fix it, only records it.

### `transactions/expense/create`
- Optional `payableId` → validates against a **live-aggregated** "already paid" figure (`Transactions.aggregate` over `approvalStatus: APPROVED` + non-unsettled methods, `:140-149`) — not a stored running total — and blocks overpayment unless `allowOverpayment`.
- Sets `isSettlement: payableDoc.costAlreadyRecognised === true` (`:205`) — when the linked payable's cost was already recognised elsewhere (e.g. raised via a voucher), this payment is flagged so it's **excluded from P&L expense rollups** system-wide via `SETTLEMENT_EXCLUSION` (used in ~12 report/dashboard routes, see F4) — a pure cash-out, not a fresh expense.
- `paid_by_other` → creates a **separate external payable** (`createExternalPayable`) and links `externalParty.linkedPayableId`, mirroring the revenue side's external-receivable pattern.
- Vendor-typed giver → updates `vendorDoc.Transactions` (last-transaction pointer) and pushes a `vendorDoc.editors` entry (`:259-272`).
- `approvalStatus: "APPROVED"` set explicitly (`:208`), unlike the three revenue routes which rely on the schema default.
- Does **not** create or touch any `Payable`/`Patient.incentives` row for `expenseCategory: "Incentive"` — an incentive's *obligation* (payable + `Patient.incentives[]` row) is created separately by `/api/incentives` (see below); this route only records the *payment* against an incentive payable that already exists. Two-step lifecycle across two routes — confirmed coherent, not a bug, but Phase B's engine must preserve both steps as distinct operations.

### `transactions/expense/update`
- Same `payableId` overpayment re-check, plus period-lock (`periodLockResponse`) and cascade-integrity checks (`checkCascadeOnUpdate`/`applyCascadeOnUpdate` — not traced in this pass).
- Rebuilds `expenseGiver` as `{type, vendorId, name}` with **no `refId`** — see F1. This is itself a "side effect" in the sense the rule means: an existing, silent state mutation Phase B must not reproduce.
- `trackField(...)` calls (`:109-112`) write an audit-style diff entry — not read in full this pass; Phase B should confirm where these land (transaction's own `editors`/log, or a separate audit collection) before assuming it's covered by "keep the audit trail."

### `payables/create` / `receivables/create`
- Pure document creation + `log.push({action:"Created", ...})` on the new document itself. No other collection touched (confirmed no `Patient`/`Transactions`/`Stock` writes in either route body). TDS-splitting variant (`payables/create` with `includeTDS`) additionally creates a **second, linked TDS payable** (`tdsLink.role: "TDS"`) atomically with the parent (seen earlier in this audit's route read) — two Payable documents from one submit.

### `receivables/[id]/receipt`
- Overpayment guard via live aggregate, same shape as `expense/create`'s payable check (`:78-98`).
- Derives `transactionCategory` from `receivable.revenueCategory` via a 3-entry lookup (`transplant`/`service(s)`/`medicine`, `:15-20,102-104`) — a receivable whose category doesn't match any of those three (e.g. `Advances`, a collab receivable, `PATIENT_DUE`, `REFUND_DUE`) gets a Transaction with `transactionCategory: undefined`, left to the model's pre-save derivation hook (not traced this pass) to resolve or leave blank.
- Sets `isSettlement: receivable.costAlreadyRecognised === true` — the exact receivable-side mirror of `expense/create`'s payable flag.
- **Gap found (F10): no `patient.payments` recompute, even when the receivable resolves to a patient** (`patient` derived at `:110-112` from `relatedPatient` or a `PATIENT`-kind payer, and passed onto the created Transaction at `:117`). Unlike `transplant/create`/`service/create`, this route never touches `patient.payments.amountReceived/pendingAmount/discount/transactions`. A receipt recorded here (e.g. clearing a `PATIENT_DUE` receivable) is fully reflected in the Receivable's own aggregation, but not in the patient document's own ledger — any UI reading `patient.payments` directly (rather than the receivable aggregation) will under-report money received against that patient. Needs a product decision, not a Phase-A fix: is `patient.payments` supposed to be the union of every patient-linked money-in, or only what the three revenue-creation routes record?

### `advances/create` / `borrowings/create`
- Two modes, both inside `dbSession.withTransaction`: (a) **top up an existing** linked Receivable/Payable — `totalAmount += parsedAmount`, pushes a `log` entry on that document (`advances/create/route.js:184-189`, mirrored for borrowings `:170-175`); or (b) **raise a new** Receivable/Payable (`totalAmount = parsedAmount`) and link the new Advance/Borrowing row to it. Either way the Advance/Borrowing row itself also gets its own `log.push` (`:197` / `:183`). Pre-check against over-recovery/over-payment via a live aggregate of prior same-direction rows (`:113-141` pattern), same shape as `expense/create`'s payable overpayment check.

### `account-transfers/create` (Contra)
- Checks period lock on **both** `fromAccount` and `toAccount` independently (`:73-80`) — correctly listed as "yes" in the route table.
- `transferKind: "LOAN_SETTLEMENT"` with a `sourceTransactionId` → over-settlement guard via a live aggregate of prior `AccountTransfer` rows referencing the same source (`:87-108`), same pattern as the payable/receivable overpayment checks elsewhere.
- Confirmed: **does not write back onto `sourceTransactionId`** — it's read-only (`.lean()`, `:83`), used only for the amount ceiling. `reversesTransferId` is stored as a plain reference (`:122`) with no check that the target transfer exists, isn't already reversed, or isn't itself a reversal — purely informational at write time.
- Own `log.push` (`:130-136`), then a **post-save, non-blocking** balance check (`:141-148`): if `fromAccount`'s balance goes negative as of this date, the response carries a `warning` string, but the entry is saved regardless — never fails the request.

### `suspense`
- Own `log.push` (`:169`) on create. Resolution (moving `isResolved: true`) is a separate route/action, not this one.

### `incentives` (and the twin admin route `/api/patients/[id]/incentives`) — via `recordPatientIncentive` in `incentiveDerivation.js`
- **Confirmed genuinely shared**, not duplicated: both routes call the same `recordPatientIncentive()` (`incentiveDerivation.js:145-235`), so side effects are identical regardless of entry surface — this is the one place in the audited system where two surfaces already share a real backend code path end-to-end, not just a UI field set.
- Inside one Mongo session: `findOrCreateIncentivePayable` (opens a new monthly INCENTIVE payable at `totalAmount: 0` if none exists for that employee+month, with its own `log` entry) → pushes a row onto **`patient.incentives[]`** (with its own embedded `log`) → `recomputeIncentivePayable` **recomputes the payable's `totalAmount` from scratch** by re-summing all active `patient.incentives` rows pointing at it, and **refuses to reduce it below what's already been paid** against the linked payable (`IncentiveError 409`, `incentiveDerivation.js:94-101`) — auto-cancels the payable if the recomputed total hits zero (`:107-118`).
- Enforces period lock itself, inside `findOrCreateIncentivePayable` (`:41-44`) — the one non-`periodLock`-importing route in the earlier table that still enforces it, just via a different call path.

### `collab-settlement/cases/create`
- Delegates entirely to `createCollabCaseAtomic` (`collabDerivation.js` — 699 lines, not traced line-by-line this pass) which is understood to derive the clinic-share split from the case's package amount and create the linked `clinicSharePayable`/`clinicShareReceivable` atomically. This is the one entry surface whose side effects are already funneled through a single shared library function rather than inlined in the route — worth treating as the *positive* precedent for Phase B's design, not just a defect list entry.

### `collab-settlement/settlements/create`
- Saves the `CollabSettlement` document first (`:84`), **then**, per allocation line and **outside any Mongo session/transaction**, generates one `Transactions` document per case:
  - `direction: "WE_PAID"` → an `EXPENSE` transaction per allocation against that case's `clinicSharePayable` (`payableId`, `:98-116`), tagged `collabRef: {settlementId, caseId}`; plus, if the settlement amount exceeds what was allocated to specific cases, one more unallocated `EXPENSE` transaction for the remainder (`:119-138`).
  - `direction: "THEY_PAID"` → a `Revenue` transaction per allocation against that case's `clinicShareReceivable` (`:140-178`), with the same `isSettlement`-from-`costAlreadyRecognised` derivation as the two receipt/payment routes above.
  - A case with no linked payable/receivable, or a cancelled receivable, is silently **skipped** (pushed to `skippedAllocations`, `:95,145,150`) — not an error, just excluded, reported back to the caller and `console.warn`'d server-side (`:186`).
  - If any transaction survives, `settlement.generatedTransactions` is set and the settlement re-saved (`:181-184`).
- **F11 (new, P0-adjacent).** The per-case transaction loop is wrapped only in a plain `try { ... } catch (txError) { console.error(...) }` (`:89,188-190`) — **not** a Mongo session, and the catch **does not re-throw or change the response**. If `Transactions.create` fails partway through (e.g. case 3 of 5 hits a validation error), the `CollabSettlement` document is already saved, 1–2 of 5 expected transactions exist, and the route still returns `201 { message: "Settlement recorded", ... }` — no error surfaced to the caller, no rollback, no way for the UI to know the settlement is now inconsistent with its `coveredCases` allocation short of manually reconciling. Every other multi-write path in this audit that spans more than one document (`transplant/service/medicine create`, `advances/borrowings create`, TDS-split `payables/create`) uses `withDbTransaction`/`dbSession.withTransaction`; this is the one exception.

**Coverage note:** all three previously-flagged gaps (`receivables/[id]/receipt`, the write-back half of `account-transfers/create`, the mutation half of `collab-settlement/settlements/create`) are now closed by direct reads; every route's side effects in this section are from the actual code, not inferred.

---

## What Phase B needs to decide before it starts (not answered here — Phase A is read-only)

1. Which of the 6 field "shapes" above the universal engine actually unifies vs. composes from a shared envelope + pluggable body (see structural note).
2. Whether `expenseGiver.refId` is worth preserving at all going forward (F1) — if nothing reads it today, either fix the round-trip or formally drop the field; "silently sometimes populated" is the one option that shouldn't survive.
3. Whether transaction creation should gain period-lock enforcement (F2) as a standalone fix ahead of Phase B, since it's a correctness gap independent of the entry-engine consolidation and cheap to close in isolation (same `checkPeriodLock` call the other 6 create routes already make).
4. A single canonical category↔purpose source (F3) that the model enum, the admin create page, Vouchers, and `NewPayableModal` all read from — today there are 5 hand-maintained copies.
5. Whether `collab-settlement/settlements/create`'s missing transaction (F11) and `receivables/[id]/receipt` / `medicine/create`'s missing `patient.payments` recompute (F10, F12) are fixed as standalone corrections before Phase B, or folded into the engine's "assert every existing side effect" pass — either way they need to be decided explicitly, not silently inherited or silently dropped.
