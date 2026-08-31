"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, DataTable, Badge, EmptyState, InlineNotice, Skeleton } from "@/components/owner";

const rupee = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const names = (arr) => (Array.isArray(arr) && arr.length ? arr.map((e) => e?.name).filter(Boolean).join(", ") : "—");

const JOURNEY_STEPS = ["NEW", "NOT_VISITED", "NOT_CONVERTED", "BOOKING_DONE", "SURGERY_BOOKED", "CLOSED"];
const STEP_LABEL = {
  NEW: "New", NOT_VISITED: "Not Visited", NOT_CONVERTED: "Not Converted",
  BOOKING_DONE: "Booking Done", SURGERY_BOOKED: "Surgery Booked", CLOSED: "Closed",
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
  const currentIndex = JOURNEY_STEPS.indexOf(status);
  return (
    <div className="journey" style={{ gridTemplateColumns: `repeat(${JOURNEY_STEPS.length}, 1fr)` }}>
      {JOURNEY_STEPS.map((step, i) => (
        <div
          key={step}
          className={`journey-step${i < currentIndex ? " done" : ""}${i === currentIndex ? " current" : ""}`}
        >
          <strong>{STEP_LABEL[step]}</strong>
          <span>{i === currentIndex ? "Current" : i < currentIndex ? "Passed" : ""}</span>
        </div>
      ))}
    </div>
  );
}

export default function PatientJourneyPage() {
  const [query, setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [patient, setPatient] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);

  const debounceRef = useRef(null);

  const runSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/owner/patient-journey?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.success) setResults(json.patients || []);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, runSearch]);

  const openPatient = async (row) => {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/owner/patient-journey/${row.id}`);
      const json = await res.json();
      if (json.success) setPatient(json.patient);
      else setError(json.message || "Failed to load patient");
    } catch {
      setError("Network error — please try again");
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Patient Journey 360°"
          subtitle="Search a patient to see their full record and current pipeline position"
        />

        <div className="content">
          <Card title="Find a patient" subtitle="Search by name or phone">
            <input
              type="text"
              className="control"
              style={{ width: "100%" }}
              placeholder="Search name or phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search patients"
            />
            {query.trim() && (
              <div style={{ marginTop: 12 }}>
                <DataTable
                  loading={searching}
                  onRowClick={openPatient}
                  emptyMessage={<EmptyState icon="✚" title="No matches" hint="Try a different name or phone number." />}
                  columns={[
                    { key: "name", label: "Name" },
                    { key: "phone", label: "Phone" },
                    { key: "branch", label: "Branch" },
                    { key: "status", label: "Status", render: (r) => <Badge kind="neutral">{r.status}</Badge> },
                  ]}
                  rows={searching ? [] : results}
                />
              </div>
            )}
          </Card>

          {!query.trim() && !patient && !detailLoading && (
            <Card>
              <EmptyState icon="✚" title="Search for a patient" hint="Type a name or phone number above to pull their full record and pipeline position." />
            </Card>
          )}

          {error && <InlineNotice kind="error">{error}</InlineNotice>}

          {detailLoading && (
            <Card><Skeleton variant="row" count={5} style={{ height: 18, margin: "12px 0" }} /></Card>
          )}

          {patient && !detailLoading && (
            <>
              <Card title={patient.personal?.name || "Patient"} subtitle={patient.personal?.phone}>
                <JourneyStrip status={patient.ops?.status} />
              </Card>

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
                  <Field label="Reference" value={patient.personal?.reference?.name} />
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
                  <Field label="Grafts Implanted" value={patient.surgery?.graftsImplanted} />
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
