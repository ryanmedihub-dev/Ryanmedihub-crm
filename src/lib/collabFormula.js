
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;


export function deriveCaseSplit({ grossPackage = 0, discount = 0, clinicShare = 0 } = {}) {
  const netChargeable = round2(grossPackage - discount);
  return { netChargeable, ourShare: round2(netChargeable - clinicShare) };
}

export function deriveClinicSettlement({ clinicReceived = 0, clinicShare = 0 } = {}) {
  const clinicOwesUs = round2(clinicReceived - clinicShare);

  if (clinicOwesUs > 0) {
    return { kind: "RECEIVABLE", amount: clinicOwesUs, clinicOwesUs };
  }
  if (clinicOwesUs < 0) {
    return { kind: "PAYABLE", amount: Math.abs(clinicOwesUs), clinicOwesUs };
  }
  return { kind: "NONE", amount: 0, clinicOwesUs: 0 };
}

export function deriveCrystallisation({ clinicReceived = 0, clinicShare = 0 } = {}) {
  const C = round2(clinicReceived);
  const S = round2(clinicShare);
  if (C >= S) {
    return { kind: "CLINIC_RETAINS", pendingAfter: round2(C - S), payable: 0 };
  }
  return { kind: "WE_OWE", pendingAfter: 0, payable: round2(S - C), expenseFromRetained: C };
}

// Patient ka ₹1000 se chhota residue case ko khula nahi rakhta: us point pe
// clinic ka hisaab ek net figure ban jata hai (deriveCrystallisation) —
// clinic share zyada toh unka payable, kam toh unse receivable.
export const SETTLE_RESIDUE_THRESHOLD = 1000;

export function isCaseSettleable({ packageAmount = 0, collected = 0, discount = 0 } = {}) {
  return round2(packageAmount - collected - discount) < SETTLE_RESIDUE_THRESHOLD;
}
