// Single, editable home for every /owner/ai/attention rule's cutoff (Owner
// Panel v2, Part 6). Retune a rule by changing a number here — no rule
// definition in the route should hardcode its own threshold elsewhere.
export const ATTENTION_THRESHOLDS = {
  // "interested" lead with no call logged in this many days or more.
  interestedNoCallDays: 2,
  // Patient sitting at BOOKING_DONE with no record update in this many days or more.
  bookingDoneStaleDays: 10,
  // Patient sitting at SURGERY_BOOKED (paid, not yet CLOSED) with no update
  // in this many days or more.
  surgeryBookedStaleDays: 14,
  // NOT_CONVERTED patient with no record update in this many days or more
  // (the /owner/patients/not-converted "stale" badge and KPI).
  notConvertedStaleDays: 14,
};
