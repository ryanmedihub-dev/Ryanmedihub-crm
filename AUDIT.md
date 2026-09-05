# Entry Surface Audit

Every claim below is cited `file:line` and was read directly from the repo (not inferred from naming or prior summaries). Where a check was time-boxed to a lighter pass, that's stated explicitly under the surface it applies to — nothing here is guessed.

## Summary

- **Surfaces audited:** 16 (the §0.5 list), plus the 4 category-specific delete routes and the shared reversal path, which the reversal/delete cross-cutting check pulled in.
- **CONFLICT findings:** 4 (B1's period-lock asymmetry counted once; N6; N7; N10's furtherMode/receiptMode split is folded into the cross-cutting table, not double-counted here).
- **CLIENT_ONLY findings:** 2 (N6 — external-party validation; the back-date `min` attribute on `<input type="date">`, which is UI-only and correctly backstopped server-side, so not a real gap — see Cross-cutting: Back-date guard).
- **SERVER_ONLY findings:** several, all *additional* server checks the client doesn't pre-validate (branch enum checks, master-data enum checks) — these are safe-by-default (server rejects, nothing corrupts) and are noted inline rather than defect-listed.
- **Blocking defects (would corrupt books):** 4 (B1–B4).
- **Major / Minor defects:** 11 (N1–N11).

---

## Blocking defects

### B1 — Medicine sales and direct receivable receipts never update `patient.payments`; the generic reversal path then wrongly debits it anyway

**Files:**
- `src/app/api/transactions/medicine/create/route.js` — no `patient.payments` block anywhere in the file (confirmed end-to-end read; compare `service/create/route.js:207-258`, which has one).
- `src/app/api/receivables/[id]/receipt/route.js` — same omission; the route derives `patient` from the receivable (`:110-112`) and stamps it onto the created Transaction (`:117`), but never touches `Patient.payments`.
- `src/lib/reverseTransaction.js:166-186` — on **any** reversal of a `costType: "Revenue"` transaction that has a `patient`, unconditionally does `patient.payments.amountReceived -= Math.abs(requested)` (clamped to 0 at `:173`). This runs regardless of *which* creation route produced the original transaction.

**Repro:**
1. Sell medicine to a patient (Medicine tab, any create page). `patient.payments.amountReceived` is unchanged (bug already live — a wrong balance today, independent of reversal).
2. Reverse that medicine transaction (`POST /api/transactions/[id]/reverse`).
3. `reverseTransaction.js:171-172` subtracts the reversed amount from `patient.payments.amountReceived` — a figure that was never incremented in step 1. If the patient has other legitimate revenue (Transplant/Service) contributing to that same field, their contribution is silently reduced by an unrelated medicine sale's amount.

**Impact:** `Patient.payments.amountReceived` / `.pendingAmount` — the figures the patient page and any dashboard reading them directly (not via receivable/payable aggregation) show — become wrong. Direction of error: under-reported after step 1 alone (medicine revenue invisible to the patient ledger); over-reported-as-owed (or driven to 0 and masking a real shortfall) after step 2. This is a wrong balance by the audit's own definition.

**Fix direction:** either (a) make `medicine/create` and `receivables/[id]/receipt` update `patient.payments` the same way `transplant/create`/`service/create` do, or (b) make `reverseTransaction.js` conditional on the transaction's actual creation path having populated `patient.payments` in the first place (e.g. gate on `transactionCategory !== "MEDICINE"` and absence of a bare `receivableId`-only receipt marker) — but (a) is the safer fix since it also closes the day-one under-reporting, not just the reversal corruption.

### B2 — Reversing a Medicine sale never restores stock, unlike deleting one

**Files:**
- `src/lib/reverseTransaction.js` — no `Stock` import, no stock mutation anywhere in the file.
- `src/app/api/transactions/[id]/reverse/route.js` — no `Stock` import either; delegates entirely to `reverseTransaction()`.
- Compare `src/app/api/transactions/medicine/delete/route.js:106-112`, which correctly does `Stock.findByIdAndUpdate(medicineId, {$inc:{totalQuantity: quantityToRestore}})` before deleting.

**Repro:** Sell medicine (stock decremented, `medicine/create/route.js:225-229`). Reverse the sale instead of deleting it. Stock stays decremented — the unit is gone from inventory even though the sale that consumed it was undone.

**Impact:** Inventory (`Stock.totalQuantity`) permanently understated by the quantity of every medicine sale that's ever reversed (as opposed to hard-deleted). A wrong balance — the stock figure — by the audit's definition.

**Fix direction:** teach `reverseTransaction()` (or a category-aware wrapper in the `[id]/reverse` route) to restore stock when `original.transactionCategory === "MEDICINE"`, mirroring `medicine/delete`'s logic.

### B3 — `collab-settlement/settlements/create` is not atomic; a partial failure is reported as success

**File:** `src/app/api/collab-settlement/settlements/create/route.js:72-190`.

- `settlement.save()` happens first (`:84`), unconditionally.
- The per-allocation loop that generates the actual `Transactions` documents (`:90-179`, one `EXPENSE` or `Revenue` transaction per case) runs **outside any Mongo session** — no `dbSession.withTransaction`, unlike every other multi-document write path in this codebase (Transplant/Service/Medicine create, Advances/Borrowings create, TDS-split Payables create all use one).
- It's wrapped only in `try { ... } catch (txError) { console.error(...) }` (`:89, 188-190`) — the catch **does not re-throw, does not roll back the already-saved settlement, and does not change the HTTP response**. Execution falls through to `return NextResponse.json({message:"Settlement recorded", ...}, {status:201})` (`:192-195`) regardless.

**Repro:** Submit a settlement covering 5 cases where case #3's linked payable/receivable has since been deleted or otherwise causes `Transactions.create` to throw (a plausible real-world race — someone cancels a case's payable in another tab while the settlement is being recorded). Cases 1–2 get their transactions; case 3 throws; cases 4–5 never run. The client receives `201 { message: "Settlement recorded" }` — no error, no partial-failure indication beyond an unlogged (to the client) mismatch between `settlement.coveredCases` (5 entries) and `settlement.generatedTransactions` (2 entries).

**Impact:** An orphaned/inconsistent document — the settlement claims to cover 5 cases but only 2 have the money movement to back it up. Reconciling this after the fact requires manually diffing `coveredCases` against `generatedTransactions`, which no UI surface currently does automatically (confirmed: the response only returns `skippedAllocations` for the *known, deliberate* skip case — no path/skippedAllocations, not the *unknown, thrown-exception* case).

**Fix direction:** wrap `:72-184` in a single `mongoose.startSession()` / `withTransaction`, matching the pattern already used four other places in this codebase. If a partial-success UX is actually wanted (some cases settle, others need retry), that has to be a deliberate, visible response shape — not a silently-swallowed exception.

### B4 — Revenue and Expense transaction **creation** never checks the period lock

**Files:** `transactions/transplant/create/route.js` (imports at `:1-15`), `transactions/service/create/route.js` (`:1-13`), `transactions/medicine/create/route.js` (`:1-13`), `transactions/expense/create/route.js` (`:1-14`) — none import `periodLock`/`checkPeriodLock`/`loadClosedPeriodSnapshot`. `checkPeriodLock` (`src/lib/periodLock.js:73-102`) takes no role parameter — it isn't an intentional admin exemption, unlike `backDateGuard`.

**Repro:** Close a period covering account X in Close Book. From any create surface (admin or any of the 4 role pages), create a new Transplant/Service/Medicine/Expense transaction dated inside that closed period, routed through account X. It saves without error.

**Impact:** The whole point of closing a period — that its balance is final and reconciled — no longer holds. The closed period's account balance (and anything downstream that trusts "closed = frozen", e.g. a signed-off P&L) becomes wrong the moment a new transaction lands in it, silently. This is the highest-volume entry path in the system, so the exposure window is constant, not edge-case.

**Cross-reference:** extends to 4 more routes with the same gap — see Cross-cutting: Period lock, and N10 below.

**Fix direction:** add the same `checkPeriodLock`/`periodLockResponse` call these four routes are missing, at the same point `expense/update` already has it (`expense/update/route.js`, confirmed present at top of file).

---

## Non-blocking defects

### N1 (Major) — `expenseGiver.refId` is destroyed on every edit of an EMPLOYEE/PATIENT-linked expense

**Files:** `src/models/Transactions.js:40-53` (schema supports `refId`) · `src/app/api/transactions/expense/create/route.js:94-97` (create requires it) · `src/app/admin/transactions/edit/[id]/page.jsx:359,372` (load collapses type to a vendor/non-vendor boolean, discarding `type`/`refId`) · `:642-648` (save rebuilds giver as `{type: isVendor ? "VENDOR" : "MANUAL", ...}` — EMPLOYEE/PATIENT can never round-trip) · `src/app/api/transactions/expense/update/route.js:194-197` (persists a giver object with no `refId` field at all, no validation requiring/preserving it for EMPLOYEE/PATIENT unlike the create route).

**Repro:** Open any existing Salary transaction in the edit page, click Save with no changes. `expenseGiver` silently becomes `{type:"MANUAL", name:"<unchanged text>"}`.

**Why Major, not Blocking:** grepped the repo for reads of `expenseGiver.refId` — only the create route's own validation reads it. No aggregation joins on it; the money math runs through `payableId`, a separate field this same edit path leaves untouched. Today's damage is confined to audit-trail/lookup accuracy. It becomes Blocking the day any report ("all payments to this employee") starts trusting the field.

**Fix direction:** either round-trip `type`/`refId` properly through the edit page and update route (the correct fix), or, if the field is genuinely unused, formally drop it from the write path rather than leave it silently-sometimes-populated.

### N2 (Major) — Five independent lists map expense category ↔ payable purpose; `SOFTWARE_RENTAL` is unreachable/miscategorized from 2 of 3 creation paths

**Files:** `models/Payable.js:14-30` (`PAYABLE_PURPOSE_VALUES`, ground truth) · `constants/payablePurposes.js:1-17` (`PAYABLE_PURPOSES`, hand-duplicated) · `lib/entryForm/getPayableContext.js:2-12` (`PAYABLE_CATEGORY_PURPOSE`, 9/14 purposes, no `SOFTWARE_RENTAL`, no `COLLAB_CLINIC`) · `app/admin/vouchers/page.jsx:15-26` (`CATEGORY_TO_PURPOSE`, 10/14, has `COLLAB_CLINIC` but no `SOFTWARE_RENTAL`) · `components/finance/NewPayableModal.jsx:52-67` (`PURPOSE_TO_CATEGORY`, inverse direction, has all 14).

**Concrete effect:** raising a "Software Rental Expenses" payable via the admin create page's Rent section → `getPayableContext.js:91-92` returns `null`, the payable is silently never built. Via the Vouchers page → `vouchers/page.jsx:178` falls back to `purpose: "OTHER"`. Only `NewPayableModal` produces the correct `SOFTWARE_RENTAL` purpose. Any purpose-grouped report (`payableAggregation.js`'s grouped stages, category P&L) will mis-slice this spend depending on which of the three screens raised it — total payables/expenses stay right, but the category breakdown doesn't.

**Also:** label divergence — `payablePurposes.js:26` says `TAX: "Tax"`, `NewPayableModal.jsx:42` says `TAX: "Taxes"` (Minor, but proof these lists are never cross-checked).

**Fix direction:** one canonical category↔purpose source, read by all three screens and the model.

### N3 (Major) — 13 files read a master-data-backed `bankRouting` constant statically instead of through `useMasterData()`/`*Sync()`

**Backing proof:** `src/lib/masterData/index.js:127-138,183-190` — `ACCOUNTS`, `NON_CASH_METHODS`, `UNSETTLED_METHODS`, `RECEIPT_MODES`, `FURTHER_MODES` (`=ACCOUNTS`) are all master-data-backed (kinds `ACCOUNT`, `PAYMENT_METHOD.isNonCash/isUnsettled`, `RECEIPT_MODE`). `SETTLEMENT_EXCLUSION` is a static Mongo fragment with no master-data equivalent — legitimate to import directly.

Audited all 29 `from "@/constants/bankRouting"` import sites:
- 12 legitimate (`SETTLEMENT_EXCLUSION` only, in report/dashboard routes).
- 4 infra (the sync/fallback layer itself: `resolveRouting.js`, `masterData/lists.js`, `masterData/index.js`, `useMasterData.js`).
- **13 stale reads**, confirmed by checking each has no `useMasterData` import: `ACCOUNTS` direct in `ContraManager.jsx:5`, `ContraEntryForm.jsx:7`, `EditBorrowingModal.jsx:7`, `EditAdvanceModal.jsx:7`, `LoanSettlementModal.jsx:5`, `RecordAdvanceModal.jsx:8`, `SuspenseManager.jsx:5`, `SuspenseEntryForm.jsx:7`, `admin/close-book/page.jsx:5`, `admin/dashboard/page.jsx:12`; `NON_CASH_METHODS`/`UNSETTLED_METHODS` in `StatusBadges.jsx:12`, `TransactionFieldSet.jsx:8`; `UNSETTLED_METHODS, FURTHER_MODES` in `TransactionsListPage.jsx:44`.

**Why Major, not Blocking:** every write route that accepts `account`/`method` re-validates against the live `*Sync()` value server-side (confirmed on `advances/create`, `borrowings/create`, `suspense`, `account-transfers/create`). A stale client list can offer a retired account or misjudge whether a field should render, but the server rejects a mismatch — friction and confusing errors, not corrupted data.

### N4 (Major) — The admin create page is the only one of 9 expense create/edit surfaces that doesn't use the shared field component

**Files:** `DirectExpenseSection.jsx` (composes `MethodField`) is used by 3 create pages (`reception:7`, `sales:7`, `stocks:7`) and 5 edit pages (`admin/transactions/edit/[id]/page.jsx:6` + sales/reception/stocks/collab edit). `admin/transactions/create/page.jsx` reimplements the same method-select / offset_settlement note / external-party / routing / paymentId block inline at `:1997-2072`, byte-for-byte equivalent to `MethodField.jsx:36-93`.

**Direct consequence — duplicated function, not just duplicated JSX:** `getPaymentIdConfig` exists twice — `page.jsx:40-52` and `MethodField.jsx:7-14` (exported as `getPaymentIdConfig`) — identical today, two independent bodies, no import between them.

**Caveat:** `DirectExpenseSection` is deliberately narrower (`DirectExpenseSection.jsx:19-23` — "non-admin panels... where payable-type expense categories are managed elsewhere," filters them out). The admin page's Agent/Patient/Rent routing has no equivalent there, so this isn't a drop-in swap. Worse: because the admin **edit** page does route through `DirectExpenseSection`, editing a Salary/Incentive/Commission/Rent transaction shows the category locked as "(existing)" (`DirectExpenseSection.jsx:86-88`) with no employee/patient re-picker — root structural cause of N1.

**Also noted:** the admin create page uses raw `alert()` for every validation/error message (confirmed 30+ call sites, e.g. `page.jsx:496-1082`), while every finance modal and the other 4 create pages use `toast.error()` — one more symptom of this page having grown independently of the shared patterns.

### N5 (Major) — `NO_GIVER_CATEGORIES` is a hardcoded literal list checked against runtime-editable category names

**File:** `expense/create/route.js:16-24` — `["Salary","Incentive","Commision","Patient Related Expenses","Rent","Electricity Bill","Collab Clinic Payment"]`, checked against `expenseCategory` (admin-editable master data, not an enum) at `:75`. Renaming any of these 7 via the master-data admin screen desyncs this list from reality with no code path connecting them. The frontend's parallel logic (`validateExpenseEntry.js:11-45`, `resolveExpenseSection()` in `page.jsx:68-73`) is structurally different — it infers "no giver" from which UI section a category routes to, not from this list — and the two only agree today by coincidence.

### N6 (Major, CONFLICT) — `receivables/[id]/receipt` never validates the external party, though the client requires it

Client: root `TransactionFieldSet.jsx`'s `validateTransactionFields(value, "receivable-receipt")` (`:197-220`) requires `externalParty.name`/`.method` whenever `UNSETTLED_METHODS.includes(value.method)` (`:213-217`) — this context is used by `RecordReceiptModal.jsx:118` (`context="receivable-receipt"`).
Server: `receivables/[id]/receipt/route.js` — confirmed by full read, no `validateExternalParty` import or call anywhere in the file, unlike every revenue-creation route (`transplant/create`, `service/create`, `medicine/create`) and `expense/create`, which all call it for their respective unsettled methods.

**Effect:** a request that bypasses (or has a bug in) the client check can create a receipt Transaction with `method: "paid_to_external"` and an incomplete/empty `externalParty` — not caught server-side. Doesn't corrupt the receivable's pending math (amount is still counted), but leaves an incomplete external-party record with no name/method to reconcile against.

### N7 (Minor, CONFLICT — server-backstopped) — `receivables/create`'s patient-required purposes list is wider than the client's check

Server: `receivables/create/route.js:10` — `PATIENT_REQUIRED_PURPOSES = ["PATIENT_DUE", "REFUND_DUE", "ADVANCE_RECOVERY"]`.
Client: `NewReceivableModal.jsx:159` — only checks `purpose === "PATIENT_DUE"`.

Traced the actual risk: for `REFUND_DUE`/`ADVANCE_RECOVERY` the client does have a kind-picker (`needsPatient = purpose === "PATIENT_DUE" || (needsKindPicker && effectiveKind === "PATIENT")`, `:122`) — but only enforces it for `PATIENT_DUE` at submit time. If a user picks kind=PATIENT for one of the other two purposes and leaves the patient search blank, the client lets the submit through; the server's independent `REFID_REQUIRED_KINDS` check (`payer.kind === "PATIENT"` requires `refId`, `:47-53`) still catches it — just with a less specific error message ("payer.refId is required" instead of "select the related patient"). No corruption path; ranked Minor.

### N8 (Minor) — `payablePurposes.js`'s `PAYABLE_PURPOSES` is a hand-duplicated copy of the model's enum

`payablePurposes.js:1-17` vs `Payable.js:14-30` — kept only for the label lookup beside it (`payablePurposeLabel()`, `:37-38`, falls back to a title-cased raw value if the two drift).

### N9 (Minor) — Contra's `reversesTransferId` is an unvalidated reference

`account-transfers/create/route.js:122` stores `reversesTransferId` with no check the target transfer exists, isn't already reversed, or isn't itself a reversal. Purely informational at write time — no balance effect found (confirmed `sourceTransactionId` is read-only, `:83`, not written back to).

### N10 (Major, extends B4) — Period-lock coverage is 7-of-15 audited write routes, not just the 4 in B4

Re-checked every route in the cross-cutting table below. In addition to B4's four, `receivables/[id]/receipt`, `suspense`, `collab-settlement/cases/create`, and `collab-settlement/settlements/create` also import/call nothing from `periodLock` (zero grep matches in each file). Notably, `receivables/[id]/receipt` is the direct counterpart to `expense/create`'s pay-a-payable path, which *does* check it — paying a payable can be blocked by a closed period, receiving against a receivable cannot.

### N11 (Minor) — `finance/TransactionFieldSet.jsx` is a real wrapper, not dead duplication, but confusingly located

Read in full (`:1-72`): adds `TaxBreakdownFields` (context `"voucher"`) and a collab-direction sentence (context `"collab-settlement"`) that the root component doesn't have. All 3 usages are already correct — `vouchers/page.jsx:9` uses the wrapper (needs the tax fields); `RecordPaymentModal.jsx:5`/`RecordReceiptModal.jsx:5` use the root directly (don't need them). The defect is discoverability (identical name, nested under `finance/`, reads as a stray copy), not a functional bug.

---

## Cross-cutting checks

| Check | Finding |
|---|---|
| **Method semantics** (`isNonCash`/`isUnsettled` honoured consistently) | Backed by `PAYMENT_METHOD.isNonCash`/`.isUnsettled` (`masterData/index.js:340-346`). Entry validation (`TransactionFieldSet.jsx`, `MethodField.jsx`, every create route) reads these live server-side; only the 3 client files in N3 read stale literals, backstopped by server re-validation. Not traced into P&L / account-balances / close-book / ageing's own use of these flags this pass — flagged as unverified depth beyond entry validation. |
| **`furtherMode`/`receiptMode`** | Every settlement-shaped route (`transplant/service/medicine/create`, `expense/create`, `receivables/[id]/receipt`) requires `furtherMode` when the method isn't in `nonCashMethodsSync()` (identical pattern each time, e.g. `expense/create/route.js:68-73`). `account-transfers/create` requires both `fromAccount`/`toAccount` unconditionally (they *are* the furtherMode-equivalent). `advances/create`/`borrowings/create`/`suspense` require `account` unconditionally (same role). No route found that silently allows an empty required-routing field through to save — every one of the above returns 400. Aggregations that would break on an empty `furtherMode` (account-balance, close-book ledger) were not re-derived this pass. |
| **Settlement flag (`isSettlement`)** | Set from `payableDoc.costAlreadyRecognised === true` / `receivable.costAlreadyRecognised === true` identically in 3 places: `expense/create/route.js:205`, `receivables/[id]/receipt/route.js:128`, `collab-settlement/settlements/create/route.js:172`. `reverseTransaction.js:139` mirrors the original's `isSettlement` onto the reversal — correct, keeps a reversed settlement excluded from P&L too. No path found that should set it and doesn't. |
| **Payable/Receivable linkage** | `resolveReceivableAllocations()` (`receivableAllocation.js:84-124`) **never creates a new receivable** — it only allocates against existing open ones for the patient, or returns `receivableId: null` if none exist. (Correction to this audit's own earlier draft, which assumed it could open one — verified by full read.) So a fresh Transplant/Service/Medicine sale with no open receivable gets no receivable link at all; a receivable must be raised separately (Vouchers / `NewReceivableModal`). This is coherent by design, not a defect. Did **not** re-derive "paid == sum of linked transactions" against a live sample of documents this pass (would require DB access this audit didn't use) — the aggregation logic itself (`payableAggregation.js`/`receivableAggregation.js`) was read and traces correctly to `Transactions.aggregate` sums keyed on `payableId`/`receivableId`; flagged as unverified against real data. |
| **Overpayment** (`allowOverpayment`/`allowOverRecovery`/`allowOverSettlement`) | Honoured identically everywhere it exists: `expense/create` (`payableId` path), `receivables/[id]/receipt`, `advances/create` (recovery), `borrowings/create` (repayment), `account-transfers/create` (`LOAN_SETTLEMENT` kind) — same shape each time: live aggregate of prior same-direction amounts, block unless the flag is set. No route found that accepts the flag param but ignores it, or should honour it and doesn't. |
| **Branch scoping** | Every audited write route either requires `branch` against `ALL_BRANCHES` (`payables/create`, `receivables/create`, `advances/create`, `borrowings/create`, `suspense`, `account-transfers/create`) or falls back to `session.user.branch`/`receivable.branch` when omitted. None of the write routes call `resolveBranchFilter` (that's a *read*-path helper for scoping list queries to a user's branch) — on write, every route trusts the client-sent `branch`, with no server-side check that a non-admin's session branch matches the transaction's branch. Not established whether this is exploitable (would need to know if any role below admin can submit an arbitrary `branch` and have it accepted) — the four role-duplicated create pages appear to lock the branch field to the session's own branch client-side (`resolveInitialBranch`/`resolveDefaultBranch` patterns), but that's client-only; no server-side re-assertion found. **Recommend a follow-up check before Phase B**, not resolved here. |
| **Role gates** | Tabulated in full below. One write route has no role check by design and is documented as such: `incentives/route.js` (`:8-11` comment — intentionally open to any authenticated user, shared with the admin-only twin route via the same `recordPatientIncentive`). `medicine/delete/route.js` has **no `ALLOWED_ROLES` check at all** — only `if (!session)` (`:16-21`) — any authenticated user, any role, can hard-delete a medicine transaction and trigger its stock restore. Not confirmed whether this is intentional (parity with `incentives`) or an oversight; flagged for Phase B decision, not fixed here. |
| **Period lock** | Full table in B4/N10: 7 of 15 write routes call it (`expense/update`, `payables/create`, `receivables/create`, `advances/create`, `borrowings/create`, `account-transfers/create`, `incentives` via `findOrCreateIncentivePayable`); 8 don't (`transplant/service/medicine/expense create`, `receivables/[id]/receipt`, `suspense`, both `collab-settlement` writes). |
| **Back-date guard** | `backDateGuard` (role-exempting for admin/super-admin) is called by exactly the 4 revenue/expense-*create*+*update* routes reachable from non-admin roles (`transplant/service/medicine/expense create`, `expense/update`) — confirmed present in each. The admin-only routes (payables/receivables/advances/borrowings/contra/suspense/collab/incentives create) don't call it, but since `backDateGuard` is a no-op for admin/super-admin and those routes are already `ALLOWED_ROLES=["admin","super-admin"]`-gated, this isn't a live gap. `collab-settlement/cases/create` additionally allows role `"collab"` (`:9`) and also doesn't call `backDateGuard` — worth a second look since `collab` is a non-admin role reaching a write route with no back-date restriction at all; case creation doesn't directly move money on a specific ledger date the way a transaction does, so impact is unclear — flagged, not resolved. Client-side, `RevenueSection.jsx`'s `BranchDateRemarks:260-305` sets `min={canBackDate ? undefined : todayIST}` on the date input (`:285`) — a UI nudge only, correctly backstopped server-side, not a real gap. |
| **Audit trail** (`editors[]`/`log[]`) | Every document model with a `log[]` (Payable, Receivable, Advance, Borrowing, AccountTransfer, SuspenseEntry) gets a `log.push({action:"Created",...})` on every create route audited, with no exception found. `Transactions.editors[]` itself is initialized empty at creation (by design — `createdBy` covers authorship) and only appended to on genuine edits (`expense/update/route.js:109-112` `trackField` calls — not traced to their landing structure this pass) and on reversal (`reverseTransaction.js:156-161`, marks `isReversed`). `Patient.editors[]` is appended on every Transplant/Service create (`:218-224`/`:243-249`) but — consistent with B1 — **not** on Medicine create or on `receivables/[id]/receipt`, since those routes don't touch the patient document at all. |
| **Receipts** (`receipts[]` survives create→edit→delete) | Confirmed present as a field on every create route's transaction doc build. Edit: `expense/update/route.js` destructures and persists `receipts` from the request body — the edit page must resend the full array or it's lost; not confirmed whether `admin/transactions/edit/[id]/page.jsx` reloads and resends the existing array correctly (loaded at `:341` as `trans.receipts \|\| []`, appears to round-trip). Delete: all 4 category delete routes hard-delete the Transaction document — `receipts[]` (and any Cloudinary assets it references) are not separately cleaned up or preserved anywhere; simply gone with the document. Not established whether Cloudinary assets are orphaned (no delete route calls a Cloudinary API) — flagged, not confirmed either way. |
| **Tax** (GST display-only per `NOTES.md`) | `NOTES.md:8` states GST is "display-only, by design." Grepped every server-side `gstAmount`/`includeGST`/`taxDetails` usage: `payables/create/route.js` folds GST into `tax.invoiceTotal` (the vendor's own payable amount — GST owed *to* the vendor, not a separate GST-payable-to-the-government document); `expense/create/route.js:206` stores `taxDetails` on the Transaction purely for reporting (`admin/logs/route.js:82-83` reads it for CSV export only). No path found that creates a distinct "GST payable"/"GST receivable" document — confirms no contradiction of the NOTES.md claim. |
| **Reversal & delete** | See B1/B2 for the Medicine-specific corruption. Cascade coverage (`cascadeIntegrity.js:6-15` `creatorLinks()`) is deliberately scoped to transactions that *created* a linked Payable/Receivable via `externalParty`/`collabRef` (the `paid_to_external`/`paid_by_other`/collab flows) — ordinary payments-against-an-existing-document (`payableId`/`receivableId` set via allocation) are correctly excluded from cascade concern (`isPaymentOnly()`, `:152-157`) since deleting a payment doesn't strand the document it paid against. Full reversal blocks on cascade (`reverseTransaction.js:103-113`); partial reversal doesn't need to (original isn't zeroed). Delete routes (`transplant/service/medicine/expense delete`) were confirmed to exist (225/167/177/178 lines respectively) but only `medicine/delete` was read in full this pass — the other three's cascade/period-lock/stock-analogue behavior is unverified, flagged for a follow-up read before Phase B if they're in scope. |
| **Multi-line (`batchId`)** | Service/Medicine share one `batchId` per submit (`BATCH-${Date.now()}-${random}`) across N line items, each its own Transaction document (`service/create/route.js:96-98,120-163`; `medicine/create/route.js:114-116,138-183`). **Not wrapped in a single all-or-nothing guarantee beyond the Mongo session** `withDbTransaction`/`withExternalPartyLink` already provides for the whole create call — if the session commits, all N documents exist; if it fails, none do. Medicine's stock decrement loop (`:225-229`) runs **after** that session has already committed and is itself un-sessioned — a failure there leaves all N transactions saved with some subset of stock un-decremented (a narrower version of B3's non-atomicity pattern, on the create side rather than collab-settlement). Delete-by-`batchId` (`medicine/delete/route.js:36-47,148-152`) does restore stock for every matched row before the `deleteMany`, and is symmetric. |
| **Duplicated pages** | See Divergence matrix below. |

---

## Surface-by-surface

### S1 — Admin create (`admin/transactions/create/page.jsx`, 2204 lines) — 7 tabs, not 5

Confirmed via the actual tab array (`:1127-1133`): **Transplant, Service, Medicine, Expense, Incentive, Contra Entry, Suspense** — plus 4 sub-sections inside Expense (`:1213-1216`: Employees/agent, Patient, Journal Voucher/rent, Direct Payments/other). Contra and Suspense are embedded here as full tabs (`<ContraEntryForm />`/`<SuspenseEntryForm />`, `:1205,1207`) — none of the 4 role-duplicated pages have these two tabs (consistent with those routes being admin-only).

#### S1a — Transplant / Service / Medicine tabs (via `RevenueSection`)
**Fields rendered:** patient (picker, walk-in allowed for Service/Medicine, not Transplant), procedure/payment-type (Transplant only), line items or single quantity+rate (Service/Medicine), discount, method + paymentId + routing + external-party (via `MethodField`), receivable-allocation choice (`ReceivableLinkField`, patient-linked only, not shown when editing), branch/date/remarks, receipts. Required markers (`*`) present on: procedure, payment type, amount (Transplant); service/medicine type, quantity is not marked `*` in the JSX despite being functionally required.
**Client validation:** inline in the admin page's own submit handlers (`:820-1041`), not a shared function — `alert()`-based, not `toast`. Requires patient-or-walkin-details, procedure/medicine selected, valid per-item cost, external-party name+method when `paid_by_other`. No shared function name to cite — this page defines its own copy per tab.
**Server validation:** `transplant/create/route.js:52-94`, `service/create/route.js:56-94`, `medicine/create/route.js:57-112` (medicine additionally checks live stock quantity, `:89-104`).
**Parity:** MATCH on the rules both sides implement; server is strictly additive (patient-existence DB check, procedure enum, stock-sufficiency) — none of that is a CONFLICT since the client never claims otherwise.
**Payload (Transplant, exact):**
```json
{
  "patientId": "...", "procedure": "Sapphire FUE", "paymentType": "Booking",
  "amount": 50000, "discount": 0, "method": "cash", "paymentId": "",
  "branch": "Delhi", "date": "2026-09-04", "remarks": "",
  "receiptMode": "", "furtherMode": "Cash Book", "receipts": [],
  "receivableAllocationChoice": { "mode": "auto" }, "externalParty": {}
}
```
**Side effects:** see the Side-effects section of the prior audit pass (`docs/audits/money-entry-audit.md`) — receivable allocation, patient.payments recompute (Transplant/Service only — **not Medicine**, see B1), patient.editors push, no incentive/collab/batchId (Transplant); shared `batchId` + stock decrement (Medicine only, no patient.payments touch, see B1).
**Failure modes:** allocation failure inside the session → whole create call fails, nothing saved (400, caught explicitly at `transplant/create/route.js:176-181` style `catch` blocks). Post-session patient-recompute failure (a second, un-sessioned write) → transaction(s) already committed, patient ledger stale; not caught/reported distinctly from a full failure.

#### S1b — Expense tab → Agent → Salary/Incentive
**Fields:** employee (SearchableSelect), incentive type (Incentive only) + related patient (Incentive only), amount, method+paymentId+routing+external-party (hand-rolled, `:1997-2072`, not `MethodField` — see N4), branch/date/remarks, receipts.
**Client validation:** `validateExpenseSection`/`validateExpenseEntry` (`lib/entryForm/validateExpenseEntry.js:11-45`) — requires `employeeId`; for Incentive sub-tab, requires `expenseType` and `patientId`.
**Server validation:** `expense/create/route.js:75-106` — `NO_GIVER_CATEGORIES` excludes Salary/Incentive from needing a giver at all (N5), but this flow always sends one (`buildTransactionPayload.js:28-43` — `expenseGiver: {type:"EMPLOYEE", refId, name}`) so the exclusion never bites here in practice.
**Parity:** MATCH.
**Payload (exact, Salary):**
```json
{
  "expenseCategory": "Salary", "expenseType": "Salary",
  "expenseGiver": { "type": "EMPLOYEE", "refId": "...", "name": "..." },
  "amount": "45000", "method": "cash", "paymentId": "", "branch": "Delhi",
  "date": "2026-09-04", "remarks": "", "receipts": [], "furtherMode": "Cash Book",
  "externalParty": undefined
}
```
**Side effects / failure modes:** see B4 (no period lock on create), N1 (this is exactly the giver shape that gets destroyed on later edit).

#### S1c — Expense tab → Patient → Commission / Refund / Expense
**Payload shape:** `buildTransactionPayload.js:45-104` — `expenseCategory: "Commision"` (with `commissionReceiver` duplicating `expenseGiver`) or `"Patient Related Expenses"` (giver is always the patient, `patientGiver` built at `:80-84`). Confirms N5's frontend/backend agreement is coincidental, not by shared source, but doesn't diverge for this specific flow today.

#### S1d — Expense tab → Rent → payable-category expenses
**Payload:** `buildTransactionPayload.js:106-113` — `expenseCategory: expenseData.payableCategory` sourced from `getPayableContext.js`'s category list; no giver sent at all (relies on `NO_GIVER_CATEGORIES` server-side, N5).

#### S1e — Expense tab → Other → direct/vendor expenses
**Payload:** `buildTransactionPayload.js:115-133` — vendor-or-manual giver, optional GST via `computeTaxBreakdown`. `expenseGiver.type: expenseData.isVendor ? "VENDOR" : "MANUAL"` — never `EMPLOYEE`/`PATIENT` from this path, so N1 doesn't apply to expenses raised here (only to Salary/Incentive/Commission/Patient-expense ones).

#### S1f — Incentive tab
Delegates to `IncentiveEntryForm` — see S10.

#### S1g — Contra / Suspense tabs
Delegate to `ContraEntryForm`/`SuspenseEntryForm` — see S8/S9. Only reachable on this page (admin-only routes; the 4 role pages don't render these tabs at all).

### S2 — Admin edit (`admin/transactions/edit/[id]/page.jsx`, 932 lines)
Routes to `DirectExpenseSection` for Expense-category transactions (`:916`); category-specific fields for Transplant/Service/Medicine were not traced line-by-line this pass beyond confirming the file posts to `expense/update` for the Expense path and (per the ground truth's route list) presumably category-specific update routes for the others — **not verified this pass**.
**Fields/validation for the Expense path:** `:600-633` — category/type required, vendor-or-manual payee name required, amount required, paymentId required unless cash (mirrors `getPaymentIdConfig`, duplicated per N4).
**Server:** `expense/update/route.js` — same shape, plus `periodLockResponse` and cascade checks.
**Parity:** MATCH on the rules present; the *giver* round-trip itself is where N1 lives (a state-loss bug, not a validation-parity gap — both sides agree on what "valid" looks like, they just don't agree on what "the same value" looks like across load→save).
**Payload:** identical shape to S1b/e's expense payloads minus the fields DirectExpenseSection doesn't collect (no employee/patient re-picker — see N4's cross-reference).

### S3 — Vouchers (`admin/vouchers/page.jsx`, 538 lines)
**Fields:** party mode (existing party / manual), category, sub-type, amount, due date, branch, remarks, plus `finance/TransactionFieldSet`'s GST/TDS fields (voucher context).
**Client validation:** `:147-236` — party required, amount>0, category required (payable path)/purpose required (receivable path), plus `TaxBreakdownFields`'s own field-level checks (not traced this pass).
**Server:** `payables/create/route.js:50-129` or `receivables/create/route.js:38-62`, both read in full above.
**Parity:** MATCH on the base fields. N2 applies here specifically: `CATEGORY_TO_PURPOSE` (`:15-26`) is this page's own copy of the category↔purpose map, missing `SOFTWARE_RENTAL`.
**Payload (payable, exact fields sent, `:196-207` area):** `payee`, `purpose` (via `CATEGORY_TO_PURPOSE[category] || "OTHER"`), `expenseCategory`, `expenseSubType`, `relatedPatient` (conditional), `totalAmount`, `dueDate`, `branch`, `remarks`, plus GST/TDS fields when the tax section is used.
**Side effects:** payables/receivables create + optional TDS-split payable (two documents from one submit — noted in the earlier audit pass).

### S4 — `RecordPaymentModal` (206 lines) — full read
**Fields:** amount (pre-filled to `payable.pending`), date, method+paymentId+routing+external-party (via root `TransactionFieldSet`, context `"payable-payment"`), branch, remarks, receipts, allow-overpayment checkbox (conditional on `overBalance`).
**Client validation:** `validateTransactionFields(fields, "payable-payment")` (`TransactionFieldSet.jsx:197-220`) — amount>0, method required, branch required, `furtherMode` required unless non-cash method (settlement context), external-party required for unsettled methods.
**Server validation:** `expense/create/route.js` — see S1b/e; additionally the live overpayment aggregate (`:140-161`).
**Parity:** MATCH.
**Payload (exact, `:64-84`):**
```json
{
  "expenseCategory": "...", "expenseType": "...", "amount": "...",
  "method": "...", "paymentId": "...", "branch": "...", "date": "...",
  "receiptMode": "...", "furtherMode": "...", "receipts": [],
  "externalParty": { "...": "..." },
  "remarks": "...", "patientId": "... or undefined",
  "expenseGiver": "buildGiverForPayable(payable) — see below",
  "payableId": "...", "allowOverpayment": false
}
```
`buildGiverForPayable` (`:26-32`) correctly reconstructs `{type:"EMPLOYEE"|"PATIENT", refId, name}` or `{type:"VENDOR", vendorId, name}` or `{type:"MANUAL", name}` from `payable.payee` — a **third**, independent giver-construction function (alongside `getPayableContext.js` and `buildTransactionPayload.js`), correct today, one more place N1-style logic would need fixing if the shape ever changes.
**Side effects/failure modes:** identical to S1b/e's expense-create side effects (this route IS `expense/create`).

### S5 — `RecordReceiptModal` (174 lines) — full read
**Fields/validation:** symmetric to S4, context `"receivable-receipt"`.
**Server:** `receivables/[id]/receipt/route.js` — full read above.
**Parity: CONFLICT — N6** (external-party validation exists client-side, absent server-side for this one route).
**Payload (exact, `:46-53`):** spreads the whole `fields` state object + `allowOverpayment` — `{amount, date, method, paymentId, branch, receiptMode, furtherMode, remarks, receipts, externalParty, allowOverpayment}`. Server destructures the same names (`:35-47`) — full field coverage, no dropped/unread fields either direction.
**Side effects:** overpayment guard, `isSettlement` derivation, `transactionCategory` lookup from `revenueCategory` (undefined if it's not transplant/service/medicine) — **no `patient.payments` touch, see B1.**

### S6 — `NewPayableModal` (622 lines, full read earlier) / `NewReceivableModal` (521 lines, full read this pass)
**Fields:** purpose-driven payee section (Employee/Patient/Vendor/Manual/Collab-branch depending on purpose), period (month/year, purpose-conditional), amount, due date, branch, remarks. No payment-method fields at all — correct, these only raise an obligation.
**Client validation:** `NewPayableModal.jsx:186-207`; `NewReceivableModal.jsx:145-162`.
**Server validation:** `payables/create/route.js:50-129`; `receivables/create/route.js:38-62`.
**Parity:** MATCH for `NewPayableModal`. **CONFLICT — N7** for `NewReceivableModal` (patient-required purposes list narrower client-side than server's, server-backstopped, Minor).
**Payload (Receivable, exact, `:169-179`):** `payer`, `purpose`, `revenueCategory`, `period` (conditional), `relatedPatient` (conditional), `totalAmount`, `dueDate`, `branch`, `remarks`. Server reads every one of these; none sent-but-unread, none required-but-unsent (given N7's caveat).
**Side effects:** pure document creation + `log.push`; TDS-split creates a second linked Payable (payable side only).

### S7 — `RecordAdvanceModal` (870 lines) / `RecordBorrowingModal` (599 lines) — validation blocks + full route read
**Fields:** account, amount, party (kind-driven picker: Employee/Vendor/Patient/Other), subType (new advance/loan only), branch, date, reference, remarks, receipts, allow-over-recovery/overpayment checkbox.
**Client validation:** `RecordAdvanceModal.jsx:135-168`; `RecordBorrowingModal` mirrors it (confirmed via grep, not re-read line-by-line — same shape: account required, amount>0, party required, subType required for new advances, over-recovery/overpayment gate).
**Server validation:** `advances/create/route.js` / `borrowings/create/route.js`, both read in full above — symmetric, MATCH. Server additionally validates `branch` against `ALL_BRANCHES` (client doesn't pre-check — SERVER_ONLY, safe, not a conflict) and `subType` against `ADVANCE_TYPES`/`expenseTypesSync("Borrowings")` (master-data-backed on the borrowing side, a static constants list `ADVANCE_TYPES` on the advance side — not traced further this pass).
**Payload (Advance, exact, `:205-220`):** `direction`, `account`, `amount`, `party`, `receivableId` (conditional), `subType` (conditional), `branch`, `date`, `reference`, `remarks`, `allowOverRecovery`. Server reads every field.
**Side effects:** top-up-existing-or-raise-new Receivable/Payable, both branches sessioned (`withTransaction`), each side gets its own `log` entry (full detail in the earlier audit pass's Side-effects Inventory). `excludeFromPnl: true` on the newly-raised document — loan principal correctly kept out of P&L.

### S8 — `ContraEntryForm` (295 lines, full read) / `LoanSettlementModal` (270 lines, validation block read)
**Fields:** fromAccount, toAccount, amount, date, branch, reference, remarks, receipts (basic form); `LoanSettlementModal` additionally: settlement ID (mapped to `reference`), `sourceTransactionId`, `transferKind`.
**Client validation:** `ContraEntryForm.jsx:56-68` — both accounts required, must differ, amount>0. `LoanSettlementModal.jsx:55-58` — toAccount, amount>0, settlementId (reference) required, branch-or-company-level required.
**Server validation:** `account-transfers/create/route.js`, full read above — MATCH on all client-checked rules; server adds `accountsSync()` membership (client uses the stale `ACCOUNTS` literal per N3, backstopped), period-lock on both accounts, and the `LOAN_SETTLEMENT` over-settlement guard.
**Payload (Contra, exact):** the whole `data` state object — `fromAccount, toAccount, amount, date, branch, reference, remarks, receipts`. Server-only fields (`sourceTransactionId`, `transferKind`, `reversesTransferId`, `allowOverSettlement`) are never sent by the basic form (correctly `undefined`/absent) but are sent by `LoanSettlementModal` for its specialized flow (confirmed via its own `body: JSON.stringify` block, not re-quoted here).
**Side effects/failure modes:** own `log.push`, no write-back on `sourceTransactionId` (N9), post-save non-blocking negative-balance warning (never fails the request).

### S9 — `SuspenseEntryForm` (360 lines, validation + payload read)
**Fields:** account, direction, amount, date, branch, reference, remarks, receipts.
**Client/server validation:** MATCH — `SuspenseEntryForm.jsx:53-54` vs `suspense/route.js:133-151`, checked side by side above; identical rule set (account enum, direction enum, amount>0, branch enum).
**Payload:** the whole `data` object, same field names both sides.
**Side effects:** own `log.push`; resolution (`isResolved`) is a separate action/route, not this one.

### S10 — `IncentiveEntryForm` (274 lines, validation + payload read)
**Fields:** patient, employee, purpose, amount, date, remarks. No branch field collected (server falls back to `patient.personal?.branch`).
**Client validation:** `canSubmit` gate (`:59-60`) — patientId, employeeId, purpose, amount>0.
**Server validation:** `recordPatientIncentive()` (`incentiveDerivation.js:145-235`) — same four checks plus employee-existence and period-lock (internal). MATCH.
**Payload (exact, `:70-77`):** `patient, employee, purpose, amount, date, remarks`.
**Side effects:** shared code path with `/api/patients/[id]/incentives` (confirmed identical, not duplicated) — opens/tops-up the monthly INCENTIVE payable, pushes `patient.incentives[]`, recomputes the payable's total from all active rows, refuses to reduce below what's already paid, auto-cancels at zero. The one place in the audited system with a genuinely shared, non-duplicated backend path across two entry surfaces.

### S11 — `CollabCaseForm` (546 lines) / `CollabSettlementPanel` (307 lines) / `admin/collab-settlement/page.jsx` (1951 lines) — targeted validation reads
**Fields (case):** patient, clinic, procedure, clinic share, discount, our-received, clinic-received, method/paymentId/routing, date, remarks.
**Client validation:** not traced field-by-field this pass beyond confirming `CollabCaseForm.jsx` posts to `collab-settlement/cases/create` with a `setError` pattern (no `toast`) — a **third** error-surfacing convention alongside `alert()` (S1) and `toast.error()` (everywhere else).
**Server validation:** `collab-settlement/cases/create/route.js`, full read above — patient/clinic/procedure required, clinic must be a `COLLAB_BRANCHES` member, patient must have a package set (`payments.totalAmount > 0`), discount bounded `[0, grossPackage]`, clinic share bounded `[0, totalPackage]`, collected amounts non-negative and not exceeding the package. This is the most heavily server-validated create route in the audit — worth noting as a positive precedent.
**Settlement client validation:** `admin/collab-settlement/page.jsx:1716-1724` mirrors the server's own checks in `settlements/create/route.js:60-63` almost verbatim (amount valid, allocations don't exceed settlement total, reference required) — MATCH.
**Side effects/failure modes:** case creation delegates atomically to `createCollabCaseAtomic` (699-line `collabDerivation.js`, not traced line-by-line — the one entry surface whose side effects are already funneled through one shared library function, a positive precedent for Phase B). Settlement creation is **not atomic — B3.**

### S12 — `SettleAgainstModal` (308 lines, full read in an earlier session of this audit) / `LoanSettlementModal` — see S8
Not re-read this pass; per earlier full read, patches `Advance`/`Borrowing` documents via PATCH to link/unlink a settlement target, with server-side amount caps against both the target payable/receivable's pending and the advance/borrowing's own recoverable balance — no new findings surfaced re-reading the route logic already covered in the earlier `advance-payable-partial-settlement` work.

### S13–S16 — `reception`/`sales`/`collab`/`stocks` `transactions/create` (690/689/584/650 lines)
See Divergence matrix below in place of a full field-by-field repeat — all four correctly reuse `RevenueSection`/`DirectExpenseSection`/`IncentiveEntryForm` (unlike S1's Expense tab), so their per-field validation/payload is identical to S1a's revenue path and to `DirectExpenseSection`'s expense path (itself validated the same way `expense/create` expects). The divergence that matters is at the page-orchestration level, not the field level.

---

## Divergence matrix — the 5 duplicated create pages

Not a line-by-line diff (the pages range 584–2204 lines; a full diff would be unreadable) — a behavior/field-level comparison built from each page's tab list, shared-component usage, and branch-handling code, verified by direct reads and targeted greps cited per row.

| Aspect | admin | reception | sales | collab | stocks |
|---|---|---|---|---|---|
| Tabs present | Transplant, Service, Medicine, Expense (4 sub-sections), Incentive, **Contra**, **Suspense** (`page.jsx:1127-1133`) | Transplant, Service, Medicine, Expense, Incentive (`create/page.js` tab greps) | same as reception | Transplant, Service, Medicine, **CollabCase**, Expense, Incentive (`collab/.../page.js` tab greps) | Transplant, Service, Medicine, Expense — **no Incentive tab** (`stocks/.../page.js` tab greps) |
| Expense field source | Hand-rolled inline (`page.jsx:1997-2072`) — **N4** | `DirectExpenseSection` (`:7`) | `DirectExpenseSection` (`:7`) | `DirectExpenseSection` (`:7`) | `DirectExpenseSection` (`:7`) |
| Expense category scope | Full: Agent/Patient/Rent/Other, including payable-raising categories | Direct-payment categories only (`DirectExpenseSection.jsx:19-23` filters out payable-type categories) | same as reception | same as reception | same as reception |
| Branch default helper | `resolveDefaultBranch()` (`page.jsx:57-58`) | `resolveInitialBranch()` (`reception/.../page.js:24-25`) — **same logic, independently named/duplicated function** | not independently re-read; reception/sales share near-identical line positions per the earlier audit pass (690 vs 689 lines) — presumed same pattern, not reconfirmed this pass | not re-read this pass | not re-read this pass |
| Branch re-sync on session load | Not found (no `branchTouchedRef` or equivalent effect in `page.jsx`) | `branchTouchedRef` effect (`reception/.../page.js:132,140-149`) re-syncs all 4 form states to the session branch unless the user has manually touched the field | presumed same as reception, not reconfirmed | not reconfirmed | not reconfirmed |
| Error surfacing | `alert()` (30+ sites, e.g. `page.jsx:496-1082`) | `toast`-based (per shared-component convention; not independently re-verified this pass) | same presumption | `setError()` in `CollabCaseForm`/`CollabSettlementPanel` (a third convention) | not re-verified |
| Contra/Suspense access | Yes, inline tabs | No | No | No | No |
| Collab case entry | No | No | No | Yes, via `CollabCaseForm` + `CollabSettlementPanel` | No |
| Incentive entry | Yes | Yes | Yes | Yes | **No** |
| Role reachable | admin, super-admin | reception (+ session branch lock) | sales | collab | stocks |

**Caveat:** the "not re-read this pass" cells mean I've established the pattern exists in admin and reception (both fully read) and am relying on the earlier audit pass's structural observation ("reception and sales are near line-for-line identical, 690 vs 689 lines, same tab order at nearly the same line numbers") for sales; collab and stocks were read only for tab lists and shared-component imports, not their full submit/validation bodies. **If a field-exact diff of collab/stocks against admin/reception is required, that's follow-up work, not covered at full rigor here.**

---

## Master-data drift

Every place a runtime-editable list is read from a hardcoded constant instead of `useMasterData()`/`*Sync()`, confirmed by checking `masterData/index.js`'s `rebuildSnapshot()` for which constants have a live backing kind:

| Constant | Master-data kind | Stale-read locations |
|---|---|---|
| `ACCOUNTS` (`constants/bankRouting.js:1-13`) | `ACCOUNT` | `ContraManager.jsx:5`, `ContraEntryForm.jsx:7`, `EditBorrowingModal.jsx:7`, `EditAdvanceModal.jsx:7`, `LoanSettlementModal.jsx:5`, `RecordAdvanceModal.jsx:8`, `SuspenseManager.jsx:5`, `SuspenseEntryForm.jsx:7`, `admin/close-book/page.jsx:5`, `admin/dashboard/page.jsx:12` |
| `NON_CASH_METHODS` (`:15-20`) | `PAYMENT_METHOD.isNonCash` | `StatusBadges.jsx:12`, `TransactionFieldSet.jsx:8` |
| `UNSETTLED_METHODS` (`:22`) | `PAYMENT_METHOD.isUnsettled` | `StatusBadges.jsx:12`, `TransactionFieldSet.jsx:8`, `TransactionsListPage.jsx:44` |
| `FURTHER_MODES` (`:26`, alias of `ACCOUNTS`) | `ACCOUNT` | `TransactionsListPage.jsx:44` |
| `RECEIPT_MODES` (`:28-37`) | `RECEIPT_MODE` | none found reading it directly outside the infra layer |
| Category↔purpose maps (N2) | `EXPENSE_CATEGORY.payablePurpose` conceptually, but no such field exists on the `MasterData` row today — these maps are **not master-data-backed at all**, they're pure hardcoded literals in application code, one layer below the constants-vs-masterdata question. Flagged separately as N2, not double-counted here. | `getPayableContext.js:2-12`, `vouchers/page.jsx:15-26`, `NewPayableModal.jsx:52-67`, `payablePurposes.js:1-17` |
| `NO_GIVER_CATEGORIES` (N5) | Same situation — checked against `EXPENSE_CATEGORY` values (which *are* master-data-backed) but the "no giver needed" property itself has no master-data field; it's a separate hardcoded list. | `expense/create/route.js:16-24` |

**Legitimate, not drift:** `SETTLEMENT_EXCLUSION` (no master-data equivalent exists — a static Mongo query fragment) and the 4 infra files (`resolveRouting.js`, `masterData/lists.js`, `masterData/index.js`, `useMasterData.js`) that constitute the sync/fallback layer itself.

---

## What wasn't fully verified this pass (explicit, not silently assumed)

- **Branch scoping on write** — no route was found to re-assert a non-admin's session branch against the submitted `branch` field; not confirmed whether this is exploitable.
- **Account-balances / close-book / ageing's own use of `isNonCash`/`isUnsettled`** — traced only as far as entry validation; not re-derived into those specific aggregations.
- **Paid == sum of linked transactions, against real data** — the aggregation logic reads correctly by inspection; not run against a live document sample.
- **Receipts through delete** — confirmed hard-delete removes the Transaction (and with it `receipts[]`); not confirmed whether the underlying Cloudinary assets are separately cleaned up or orphaned.
- **`admin/transactions/edit/[id]/page.jsx`'s Transplant/Service/Medicine edit paths** — only the Expense path was traced in full.
- **`transplant/service/expense delete` routes** (as opposed to `medicine/delete`, which was read in full) — existence confirmed, cascade/period-lock/role-check behavior not individually re-verified.
- **Collab/stocks create pages' full submit bodies** — tab lists and shared-component imports confirmed; field-by-field validation not re-read line-by-line (see Divergence matrix caveat).

---

## Phase B, Step 2 — contradictions and decisions recorded per the guardrails

- **`scripts/ensure-indexes.js` does not exist in this repo.** The Phase B brief's §4 refers to it as an existing style precedent; it isn't one. Followed the `.mjs` / `node --env-file=.env` convention established in `scripts/bulk-payables/` instead.
- **There is no seeded test database.** Only `MONGODB_URI` is configured, and it is the live Atlas cluster the whole app runs against. The 4 acceptance scripts written this step (`scripts/entry-acceptance/06,08,18,19-*.mjs`) are complete but have not been executed — they refuse to run without a separate `ENTRY_ACCEPTANCE_MONGODB_URI` + an explicit `ENTRY_ACCEPTANCE_CONFIRM=I_UNDERSTAND`. See `scripts/entry-acceptance/README.md` for the full 27-scenario status.
- **`guards.js`'s branch-scope check is new, additive behaviour with no legacy precedent** (this audit found no write route enforcing it). Implemented conservatively, mirroring `resolveBranchFilter`'s existing read-side rule — applies only to entries submitted through the new `/api/entries/create` dispatcher, which nothing posts to yet. Flagging for explicit confirmation before any UI is migrated onto it.
- **B3 (`collab-settlement/settlements/create` non-atomicity) and B1 (patient.payments gaps) were preserved exactly, not fixed**, in `entryCore/createCollabSettlement.js` / `createRevenue.js` / `settleReceivable.js` — per the guardrail against silently fixing a defect whose fix would change reported figures. They remain open decisions.

---

Stopping here per the brief. Waiting for review/approval before any Phase B work.
