"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, DataTable, Badge, InlineNotice, Skeleton, ErrorState } from "@/components/owner";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, fmtDate } from "@/lib/owner/format";

// Moved from /owner/patients/journey (Owner Panel v2, Part 3) — the canonical
// patient detail page, reached by clicking a row on any of the six Patients
// list pages. Same render this page always had; now keyed by route param
// instead of search-then-open, and reads /api/owner/patients/[id].

const names = (arr) => (Array.isArray(arr) && arr.length ? arr.map((e) => e?.name).filter(Boolean).join(", ") : "—");

// The forward path. NOT_VISITED / NOT_CONVERTED are EXITS from it (a CLOSED
// patient never "passed" them), so they render as a branch, not as steps.
const JOURNEY_STEPS = ["NEW", "BOOKING_DONE", "SURGERY_BOOKED", "CLOSED"];
const EXIT_STATUSES = { NOT_VISITED: "after registration — visit date passed", NOT_CONVERTED: "after counselling — nothing paid" };
const STEP_LABEL = {
  NEW: "New", NOT_VISITED: "Not Visited", NOT_CONVERTED: "Not Converted",
  BOOKING_DONE: "Booking Done", SURGERY_BOOKED: "Converted", CLOSED: "Surgery Done",
};

function Field({ label, value }) {
  return (
    <div className="metric-pair">
      <span className="muted">{label}</span>
      <span>{value ?? "—"}</span>
    </div>
  );
}

function JourneyStrip({ status }) {
  const exited = EXIT_STATUSES[status];
  const currentIndex = exited ? 0 : JOURNEY_STEPS.indexOf(status);
  return (
    <>
      <div className="journey" style={{ gridTemplateColumns: `repeat(${JOURNEY_STEPS.length}, 1fr)` }}>
        {JOURNEY_STEPS.map((step, i) => (
          <div
            key={step}
            className={`journey-step${i < currentIndex ? " done" : ""}${i === currentIndex && !exited ? " current" : ""}`}
          >
            <strong>{STEP_LABEL[step]}</strong>
            <span>{i === currentIndex && !exited ? "Current" : i < currentIndex ? "Passed" : ""}</span>
          </div>
        ))}
      </div>
      {exited && (
        <p className="muted" style={{ margin: "8px 0 0" }}>
          <Badge kind="bad">{STEP_LABEL[status]}</Badge> Left the path {exited}.
        </p>
      )}
    </>
  );
}

// The list page that opened this record passes ?back=<preset>&backq=<its query>.
const BACK_BASES = {
  all: "/owner/patients/all", notConverted: "/owner/patients/not-converted", bookingDone: "/owner/patients/booking-done",
  converted: "/owner/patients/converted", surgeryDone: "/owner/patients/surgery-done", direct: "/owner/patients/direct",
};
function useBackHref() {
  const sp = useSearchParams();
  const base = BACK_BASES[sp.get("back")] || "/owner/patients/all";
  const q = sp.get("backq");
  return q ? `${base}?${q}` : base;
}

export default function PatientDetailPage() {
  const params = useParams();
  const id = params.id;
  const backHref = useBackHref();

  const { data, loading, error } = useOwnerData(`/api/owner/patients/${id}`);
  const patient = data?.patient || null;
  const statusExplanation = data?.statusExplanation || null;

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title={patient?.personal?.name || "Patient"}
          subtitle={patient?.personal?.phone}
          controls={
            <Link href={backHref} className="btn btn-link">
              ← Back to list
            </Link>
          }
        />

        <div className="content">
          {error ? (
            <ErrorState message={error} />
          ) : loading ? (
            <Card><Skeleton variant="row" count={5} style={{ height: 18, margin: "12px 0" }} /></Card>
          ) : !patient ? (
            <Card><p className="muted">Patient not found.</p></Card>
          ) : (
            <>
              <Card title={patient.personal?.name || "Patient"} subtitle={patient.personal?.phone}>
                <JourneyStrip status={patient.ops?.status} />
              </Card>

              {statusExplanation && (
                <InlineNotice kind="info" title={STEP_LABEL[patient.ops?.status] || patient.ops?.status}>
                  {statusExplanation}
                </InlineNotice>
              )}

              <div className="grid cols-2">
                <Card title="Personal">
                  <Field label="Name" value={patient.personal?.name} />
                  <Field label="Phone" value={patient.personal?.phone} />
                  <Field label="Email" value={patient.personal?.email} />
                  <Field label="Age" value={patient.personal?.age} />
                  <Field label="Gender" value={patient.personal?.gender} />
                  <Field label="Branch" value={patient.personal?.branch} />
                  <Field label="Address" value={patient.personal?.address} />
                  <Field label="Profession" value={patient.personal?.profession} />
                  <Field label="Visit Date" value={fmtDate(patient.personal?.visitDate)} />
                  <Field label="Assigned Agent" value={patient.personal?.reference?.name} />
                  <Field label="Purpose" value={patient.personal?.purpose} />
                  <Field label="Package Quoted" value={patient.personal?.packageQuoted != null ? rupee(patient.personal.packageQuoted) : "—"} />
                  <Field label="Technique Quoted" value={patient.personal?.techniqueQuoted} />
                  <Field label="Remarks" value={patient.personal?.remarks} />
                </Card>

                <Card title="Counselling">
                  <Field label="Counsellor" value={patient.counselling?.counsellor?.name} />
                  <Field label="Technique Suggested" value={patient.counselling?.techniqueSuggested} />
                  <Field label="Final Package" value={patient.counselling?.finlpackage != null ? rupee(patient.counselling.finlpackage) : "—"} />
                  <Field label="Grafts Suggested" value={patient.counselling?.graftsSuggested} />
                  <Field label="Ready for Surgery" value={patient.counselling?.readyForSurgery ? "Yes" : "No"} />
                  <Field label="Hairloss Type" value={patient.counselling?.hairlossType} />
                  <Field label="Area of Concern" value={patient.counselling?.areaofConcern} />
                  <Field label="Hairloss Reason" value={patient.counselling?.hairlossreason} />
                  <Field label="Hairloss Duration" value={patient.counselling?.hairlossduration} />
                  <Field label="Additional Benefits" value={(patient.counselling?.additionalbenefits || []).join(", ") || "—"} />
                  <Field label="Medicines" value={(patient.counselling?.medicines || []).join(", ") || "—"} />
                  <Field label="Notes" value={patient.counselling?.notes} />
                </Card>
              </div>

              <div className="grid cols-2">
                <Card title="Medical">
                  <Field label="Allergies" value={patient.medical?.allergies} />
                  <Field label="Medical History" value={patient.medical?.medicalHistory} />
                  <Field label="Blood Group" value={patient.medical?.bloodGroup} />
                  <Field label="Sugar" value={patient.medical?.sugar} />
                  <Field label="BP" value={patient.medical?.bp} />
                  <Field label="Pulse" value={patient.medical?.pulse} />
                  <Field label="Weight" value={patient.medical?.weight} />
                  <Field label="HIV" value={patient.medical?.hiv} />
                  <Field label="HCV" value={patient.medical?.hcv} />
                </Card>

                <Card title="Surgery">
                  <Field label="Surgery Date" value={fmtDate(patient.surgery?.surgeryDate)} />
                  <Field label="Location" value={patient.surgery?.location} />
                  <Field label="OT" value={patient.surgery?.OT} />
                  <Field label="Technique" value={patient.surgery?.technique} />
                  <Field label="Grafts Needed" value={patient.surgery?.graftsneed} />
                  <Field
                    label="Grafts Implanted"
                    value={patient.surgery?.graftsImplanted == null ? <Badge kind="warn">Missing</Badge> : patient.surgery.graftsImplanted}
                  />
                  <Field label="Donor Condition" value={patient.surgery?.donorCondition} />
                  <Field label="Doctor" value={names(patient.surgery?.doctor)} />
                  <Field label="Senior Tech" value={names(patient.surgery?.seniorTech)} />
                  <Field label="Implanter Right" value={names(patient.surgery?.implanterRight)} />
                  <Field label="Implanter Left" value={names(patient.surgery?.implanterLeft)} />
                  <Field label="Grafting Person" value={names(patient.surgery?.graftingPerson)} />
                  <Field label="Helper" value={names(patient.surgery?.helper)} />
                </Card>
              </div>

              <div className="grid cols-2">
                <Card title="After Surgery">
                  <Field label="Headwash Date" value={fmtDate(patient.afterSurgery?.headwashDate)} />
                  <Field label="Bandage Removal Date" value={fmtDate(patient.afterSurgery?.bandageRemovalDate)} />
                  {(patient.afterSurgery?.prp || []).length > 0 ? (
                    <DataTable
                      columns={[
                        { key: "prpNumber", label: "#" },
                        { key: "type", label: "Type" },
                        { key: "date", label: "Date", render: (r) => fmtDate(r.date) },
                      ]}
                      rows={patient.afterSurgery.prp.map((p, i) => ({ ...p, id: i }))}
                    />
                  ) : (
                    <p className="muted">No PRP/GFC sessions logged</p>
                  )}
                </Card>

                <Card title="Payments">
                  <Field label="Total Amount" value={rupee(patient.payments?.totalAmount)} />
                  <Field label="Amount Received" value={rupee(patient.payments?.amountReceived)} />
                  <Field label="Pending Amount" value={rupee(patient.payments?.pendingAmount)} />
                  <Field label="Discount" value={rupee(patient.payments?.discount)} />
                  <Field label="Medicine Amount" value={rupee(patient.payments?.medicineAmount)} />
                </Card>
              </div>

              <Card title="Recent Transactions" subtitle="Most recent 20">
                <DataTable
                  tall
                  emptyMessage="No transactions"
                  columns={[
                    { key: "date", label: "Date", render: (r) => fmtDate(r.date) },
                    { key: "procedure", label: "Procedure" },
                    { key: "costType", label: "Type" },
                    { key: "method", label: "Method" },
                    { key: "amount", label: "Amount", render: (r) => rupee(r.amount) },
                  ]}
                  rows={(patient.payments?.transactions || []).map((t) => ({ ...t, id: t._id }))}
                />
              </Card>

              <div className="grid cols-2">
                <Card title="Products">
                  <DataTable
                    emptyMessage="No products"
                    columns={[
                      { key: "stock", label: "Item", render: (r) => r.stocks?.name || "—" },
                      { key: "quantity", label: "Qty" },
                      { key: "amount", label: "Amount", render: (r) => rupee(r.amount) },
                    ]}
                    rows={(patient.products || []).map((p, i) => ({ ...p, id: i }))}
                  />
                </Card>

                <Card title="Documents">
                  <Field label="Images" value={(patient.documents?.images || []).length} />
                  <Field label="Consent Forms" value={(patient.documents?.consentForm || []).length} />
                  <Field label="Surgery Forms" value={(patient.documents?.suregeryForm || []).length} />
                  <Field label="Consult Forms" value={(patient.documents?.consultForm || []).length} />
                </Card>
              </div>

              <Card title="Audit Trail">
                <Field
                  label="Created By"
                  value={patient.createdBy?.name ? `${patient.createdBy.name} (${patient.createdBy.branch || "—"}) · ${fmtDate(patient.createdBy.date)}` : "—"}
                />
                {(patient.editors || []).length > 0 ? (
                  <DataTable
                    columns={[
                      { key: "name", label: "Editor" },
                      { key: "branch", label: "Branch" },
                      { key: "date", label: "Date", render: (r) => fmtDate(r.date) },
                    ]}
                    rows={patient.editors.map((e, i) => ({ ...e, id: i }))}
                  />
                ) : (
                  <p className="muted">No edit history</p>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
