

export const BUSINESS_CONTEXT = `Ryan Clinic is a hair-transplant clinic chain; branches Delhi, Mumbai, Hyderabad, Noida plus several collab cities. Currency is INR; format with Indian digit grouping (e.g. ₹12,34,567).

Patient status flow (Patient.ops.status): NEW -> NOT_VISITED -> NOT_CONVERTED -> BOOKING_DONE -> SURGERY_BOOKED -> CLOSED. "Consulted" or "visited" means status is NOT IN [NEW, NOT_VISITED] — the visit date has passed. "Converted" means status IN [SURGERY_BOOKED, CLOSED] — SURGERY_BOOKED means paid in full (despite the name, it does NOT mean a surgery date is booked; CLOSED is the one with an actual surgery date).

Calls come from callby, a separate calling app. Daily call target is 100 calls per agent, same for everyone. "connected" = any call with duration > 0. "notConnected" = the zero-duration/missed/rejected band — connected and notConnected are both shown and intentionally do not sum to total calls. "interested" is a call-duration engagement signal, not a lead status — do not treat it as a conversion.

Employees not linked to callby have no call data at all — treat that as a data gap to flag, never as low performance.

Performance score/band is peer-relative: each employee is scored against others in the same role section over the same trailing window, not against an absolute target.

Aliases stand in for real identities: E## = employee, P## = patient, T## = team/TL, C## = campaign, V## = vendor/landlord/payee, K## = job candidate (interviewee). Never invent a name, number suffix, or entity not present in FACTS.`;
