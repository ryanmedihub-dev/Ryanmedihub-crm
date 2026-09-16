// The confirmed Patient.ops.status mapping for Owner Panel v2, Part 3 — one
// documented module, not a mapping re-guessed per page.
//
// Patient.ops.status is DERIVED by src/models/Patient.js's pre('save') hook,
// never written directly. The enum has 7 values; only 6 are reachable —
// CONSULTED is declared but the hook can never produce it (confirmed: 0 of
// 7,671 patients have it as of this write-up). The hook's actual logic, in
// priority order:
//   surgery.surgeryDate set                         -> CLOSED
//   totalAmount > 0 AND pendingAmount <= 0           -> SURGERY_BOOKED  (fully paid)
//   amountReceived > 0                               -> BOOKING_DONE    (any payment)
//   counsellor assigned AND amountReceived === 0     -> NOT_CONVERTED
//   visitDate in the past (none of the above)        -> NOT_VISITED
//   otherwise                                        -> NEW
//
// SURGERY_BOOKED is a misleading name — it does NOT mean a surgery date is
// set (that's CLOSED); it means the patient paid in full. Confirmed with the
// user (2026, this session) against live counts:
//   NEW=3 NOT_VISITED=444 NOT_CONVERTED=1748 BOOKING_DONE=1290
//   SURGERY_BOOKED=1842 CLOSED=2344
export const PATIENT_STATUSES = [
  "NEW", "NOT_VISITED", "NOT_CONVERTED", "BOOKING_DONE", "SURGERY_BOOKED", "CLOSED",
];

export const PATIENT_STATUS_LABELS = {
  NEW: "New",
  NOT_VISITED: "Not Visited",
  NOT_CONVERTED: "Not Converted",
  BOOKING_DONE: "Booking Done",
  SURGERY_BOOKED: "Converted", // see explanation below — this is the confirmed page name
  CLOSED: "Surgery Done",
  CONSULTED: "Consulted", // unreachable in practice; kept for completeness if ever seen
};

// One sentence per status — shown on the detail page header and any badge
// tooltip, so "what does this status mean" never has to be looked up in code.
export const PATIENT_STATUS_EXPLANATION = {
  NEW: "Just added — no visit date has passed yet and nothing else has happened.",
  NOT_VISITED: "Their visit date has passed with no counsellor assigned and no payment.",
  NOT_CONVERTED: "Seen by a counsellor but has not paid anything.",
  BOOKING_DONE: "Has paid something (a token/partial payment) but not the full package.",
  SURGERY_BOOKED: "Paid in full (pending amount is zero or less) — the financial conversion point. Despite the name, this does not mean a surgery date is set.",
  CLOSED: "Has an actual surgery date recorded — the terminal status regardless of payment state.",
  CONSULTED: "In the schema's enum but never produced by the save-hook — should not appear on real data.",
};

// The ONE definition of "converted" for every rate/KPI in the owner panel
// (agents, counsellors, patients landing, marketing ROAS/CAC, lead recovery,
// Sanya). Confirmed with the user 2026-09-16: paid in full or surgery done.
// The /owner/patients/converted LIST is narrower (SURGERY_BOOKED only, see
// PRESET_STATUS) because CLOSED patients have their own Surgery Done page.
export const CONVERTED_STATUSES = ["SURGERY_BOOKED", "CLOSED"];
export const isConverted = (status) => CONVERTED_STATUSES.includes(status);

// Confirmed with the user (this session): which status backs each of Part 3's
// six list pages. `null` means no status filter (the All page).
export const PRESET_STATUS = {
  all: null,
  notConverted: "NOT_CONVERTED", // NOT_VISITED is a different, earlier failure mode — excluded
  bookingDone: "BOOKING_DONE",
  converted: "SURGERY_BOOKED", // NOT also CLOSED — confirmed with the user
  surgeryDone: "CLOSED",
  // "direct" has no status filter at all — see PATIENT_DIRECT_REFERENCE_NAME below.
};

export const PRESET_TITLES = {
  all: "All Patients",
  notConverted: "Not Converted",
  bookingDone: "Booking Done",
  converted: "Converted",
  surgeryDone: "Surgery Done",
  direct: "Direct",
};

// "Direct" = personal.reference points at the Employee named exactly this —
// a deliberate sentinel (1,457 patients), confirmed with the user. The 2,011
// patients with NO personal.reference at all are a separate data-quality gap,
// not counted as Direct — see the Part 3 write-up.
export const PATIENT_DIRECT_REFERENCE_NAME = "Ryan";
