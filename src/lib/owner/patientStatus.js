

export const PATIENT_STATUSES = [
  "NEW", "NOT_VISITED", "NOT_CONVERTED", "BOOKING_DONE", "SURGERY_BOOKED", "CLOSED",
];

export const PATIENT_STATUS_LABELS = {
  NEW: "New",
  NOT_VISITED: "Not Visited",
  NOT_CONVERTED: "Not Converted",
  BOOKING_DONE: "Booking Done",
  SURGERY_BOOKED: "Converted", 
  CLOSED: "Surgery Done",
  CONSULTED: "Consulted", 
};

export const PATIENT_STATUS_EXPLANATION = {
  NEW: "Just added — no visit date has passed yet and nothing else has happened.",
  NOT_VISITED: "Their visit date has passed with no counsellor assigned and no payment.",
  NOT_CONVERTED: "Seen by a counsellor but has not paid anything.",
  BOOKING_DONE: "Has paid something (a token/partial payment) but not the full package.",
  SURGERY_BOOKED: "Paid in full (pending amount is zero or less) — the financial conversion point. Despite the name, this does not mean a surgery date is set.",
  CLOSED: "Has an actual surgery date recorded — the terminal status regardless of payment state.",
  CONSULTED: "In the schema's enum but never produced by the save-hook — should not appear on real data.",
};

export const CONVERTED_STATUSES = ["SURGERY_BOOKED", "CLOSED"];
export const isConverted = (status) => CONVERTED_STATUSES.includes(status);

export const VISITED_EXCLUDED_STATUSES = ["NEW", "NOT_VISITED"];

export const PRESET_STATUS = {
  all: null,
  notConverted: "NOT_CONVERTED", 
  bookingDone: "BOOKING_DONE",
  converted: "SURGERY_BOOKED", 
  surgeryDone: "CLOSED",
  
};

export const PRESET_TITLES = {
  all: "All Patients",
  notConverted: "Not Converted",
  bookingDone: "Booking Done",
  converted: "Converted",
  surgeryDone: "Surgery Done",
  direct: "Direct",
};

export const PATIENT_DIRECT_REFERENCE_NAME = "Ryan";
