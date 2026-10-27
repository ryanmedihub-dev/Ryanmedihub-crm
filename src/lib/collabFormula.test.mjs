
import assert from "node:assert/strict";
import { deriveCaseSplit, deriveCrystallisation, isCaseSettleable, round2 } from "./collabFormula.js";

const gross = 100000;
const discount = 10000;
const clinicShare = 20000;

const { netChargeable, ourShare } = deriveCaseSplit({ grossPackage: gross, discount, clinicShare });


assert.equal(netChargeable, 90000);
assert.equal(ourShare, 70000);
assert.equal(gross - discount - clinicShare, ourShare);


assert.equal(gross - netChargeable - discount, 0);


assert.equal(deriveCrystallisation({ clinicReceived: netChargeable, clinicShare }).pendingAfter, 70000);
assert.equal(deriveCrystallisation({ clinicReceived: 0, clinicShare }).payable, clinicShare);


assert.deepEqual(deriveCaseSplit({ grossPackage: gross, clinicShare }), {
  netChargeable: 100000,
  ourShare: 80000,
});



// Residue ₹1000 se kam -> case settle; usse zyada -> khula rehta hai.
assert.equal(isCaseSettleable({ packageAmount: gross, collected: 99500 }), true);
assert.equal(isCaseSettleable({ packageAmount: gross, collected: 99000 }), false);
assert.equal(isCaseSettleable({ packageAmount: gross, collected: netChargeable, discount }), true);


// Teen party: patient ne clinic ko poora package diya -> patient ka pending 0,
// aur clinic ke paas humara hissa pada hai -> unse receivable. Ulta case:
// clinic ne share se kam collect kiya -> unka payable.
const paidToClinic = netChargeable;
assert.equal(round2(netChargeable - paidToClinic), 0);
assert.equal(deriveCrystallisation({ clinicReceived: paidToClinic, clinicShare }).pendingAfter, 70000);
assert.equal(deriveCrystallisation({ clinicReceived: 5000, clinicShare }).payable, 15000);

console.log("collabFormula: ok");
