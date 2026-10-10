"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import LogoDelhi from "@/../public/logo-2.png";
import LogoMumbai from "@/../public/logo.png";

const BRANCH_LOGO = {
  Delhi:     LogoDelhi.src,
  Hyderabad: LogoDelhi.src,
  Mumbai:    LogoMumbai.src,
  Noida:     LogoDelhi.src,
  Gurgaon:   LogoDelhi.src,
};

const T = {
  navy:   "#0d1f3c",
  navyM:  "#1a3558",
  teal:   "#0e8a7b",
  tealLt: "#e6f7f5",
  red:    "#c0392b",
  purple: "#6c3483",
  blue:   "#1a5276",
  blueLt: "#eaf2f8",
  gold:   "#b7770d",
  green:  "#1e8449",
  greenLt:"#eafaf1",
  muted:  "#7f8c8d",
  border: "#dde1e7",
  text:   "#1a1f2e",
  bg:     "#f4f6f8",
  white:  "#ffffff",
};

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

const Chk = ({ checked = false, label }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, marginRight: 18 }}>
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 15, height: 15, flexShrink: 0,
      border: `1.5px solid ${checked ? T.teal : "#aab0ba"}`,
      borderRadius: 2, background: checked ? T.teal : T.white,
    }}>
      {checked && (
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
          <polyline points="1.5,4.5 4,7 7.5,2" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
    <span style={{ fontSize: 12, color: T.text }}>{label}</span>
  </span>
);

const F = ({ label, value = "" }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.9, color: T.muted, textTransform: "uppercase", marginBottom: 4 }}>
      {label}
    </div>
    <div style={{
      borderBottom: `1.5px solid ${value ? T.navy : T.border}`,
      paddingBottom: 5, minHeight: 22,
      fontSize: 12.5, color: value ? T.text : T.white,
      fontWeight: value ? 500 : 400,
      paddingLeft: value ? 3 : 0,
    }}>
      {value || " "}
    </div>
  </div>
);

const Row = ({ children, gap = 16 }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: gap }}>
    {children}
  </div>
);

const Sec = ({ title, note, accent }) => (
  <div style={{ margin: "22px 0 14px" }}>
    <div style={{ height: 1, background: `linear-gradient(90deg, ${accent} 0%, ${T.border} 100%)`, marginBottom: 10 }} />
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{ width: 5, height: 22, background: accent, borderRadius: 3, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: T.navy, textTransform: "uppercase" }}>{title}</span>
      {note && <span style={{ fontSize: 10, color: T.muted, fontStyle: "italic" }}>— {note}</span>}
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  </div>
);

const StripField = ({ label, value, accent }) => (
  <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
    <div style={{ width: 4, height: 34, background: accent, borderRadius: 2, flexShrink: 0, marginBottom: 3 }} />
    <div>
      <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{
        borderBottom: `1.5px solid ${value ? "rgba(255,255,255,.7)" : "rgba(255,255,255,.2)"}`,
        minWidth: 130, paddingBottom: 3,
        fontSize: 13, fontWeight: 600,
        color: value ? T.white : "transparent",
      }}>
        {value || " "}
      </div>
    </div>
  </div>
);

const ChkLabel = ({ label }) => (
  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.9, color: T.muted, textTransform: "uppercase", marginBottom: 8 }}>
    {label}
  </div>
);

const DURATION_MAP = {
  less_than_1_year:   "Less than 1 year",
  "1_2_years":        "1 – 2 years",
  "2_5_years":        "2 – 5 years",
  "5_10_years":       "5 – 10 years",
  more_than_10_years: "More than 10 years",
  progressive:        "Progressive",
  recent_accelerated: "Recent accelerated loss",
};

export default function ConsultationFormPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    fetch(`/api/admin/patient-data?id=${id}`)
      .then((r) => r.json())
      .then((d) => { setPatient(d.patient || d); setLoading(false); })
      .catch(() => { setError("Failed to load patient"); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", fontFamily: "sans-serif", color: T.muted }}>
      Loading…
    </div>
  );
  if (error || !patient) return (
    <div style={{ color: T.red, textAlign: "center", marginTop: 40, fontFamily: "sans-serif" }}>
      {error || "Patient not found"}
    </div>
  );

  const p  = patient.personal    || {};
  const c  = patient.counselling || {};
  const date     = fmt(p.visitDate);
  const branch   = p.branch         || "";
  const hairType = c.hairlossType   || "";
  const area     = c.areaofConcern  || "";
  const duration = DURATION_MAP[c.hairlossduration] || c.hairlossduration || "";

  const page = {
    width: "210mm", height: "297mm",
    margin: "0 auto 28px",
    background: T.white,
    fontFamily: "'Arial', 'Helvetica Neue', sans-serif",
    color: T.text,
    boxSizing: "border-box",
    overflow: "hidden",
    position: "relative",
    display: "flex",
    flexDirection: "column",
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .np { display: none !important; }
          .pw { box-shadow: none !important; margin: 0 !important; }
          @page { size: A4; margin: 0; }
          body { margin: 0; background: #fff; }
          .p2  { page-break-before: always; }
          .dark-hdr, .dark-hdr * { color: #ffffff !important; }
        }
        @media screen {
          body { background: #7a8fa8; padding: 24px 0; }
          .pw  { box-shadow: 0 8px 40px rgba(0,0,0,.32); }
        }
      `}</style>

      <div className="np" style={{ position: "sticky", top: 0, zIndex: 30, background: T.navy, padding: "11px 24px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 2px 10px rgba(0,0,0,.35)" }}>
        <Link href={`/collab/patients/${id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,.75)", fontSize: 13, textDecoration: "none", fontFamily: "sans-serif" }}>
          <ArrowLeft size={16} /> Back
        </Link>
        <div style={{ flex: 1 }} />
        {p.name && <span style={{ fontSize: 12, color: "rgba(255,255,255,.55)", fontFamily: "sans-serif" }}>{p.name}</span>}
        <button onClick={() => window.print()} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 22px", background: T.teal, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "sans-serif" }}>
          <Printer size={15} /> Print
        </button>
      </div>

      <div style={page} className="pw">

        <div className="dark-hdr" style={{
          background: "#202020",
          padding: "8px 7mm",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <img
              src={BRANCH_LOGO[branch] || LogoDelhi.src}
              alt="Clinic Logo"
              style={{ height: 70, width: "auto", objectFit: "contain" }}
            />
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.white, letterSpacing: 1.5, textTransform: "uppercase", lineHeight: 1.3 }}>
              Hair Transplant<br />Consultation Form
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
              <span style={{ fontSize: 8.5, padding: "2px 9px", background: "rgba(255,255,255,.12)", borderRadius: 10, color: "rgba(255,255,255,.65)", letterSpacing: 0.4 }}>CONFIDENTIAL</span>
              <span style={{ fontSize: 8.5, padding: "2px 9px", background: "rgba(255,255,255,.12)", borderRadius: 10, color: "rgba(255,255,255,.65)", letterSpacing: 0.4 }}>MEDICAL RECORD</span>
            </div>
          </div>
        </div>

        <div className="dark-hdr" style={{background: "#202020", padding: "12px 18mm", display: "flex", gap: 48, alignItems: "center", borderBottom: `3px solid white`,borderTop: `1px solid white`, flexShrink: 0 }}>
          <StripField label="Date of Consultation" value={date}   accent={T.teal} />
          <StripField label="Clinic Location"       value={branch} accent="#e8a020" />
        </div>

        <div style={{ padding: "0 18mm", flex: 1, paddingBottom: "12mm" }}>

          <Sec title="Patient Personal Details" accent={T.teal} />

          <F label="Full Name" value={p.name} />

          <Row>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.9, color: T.muted, textTransform: "uppercase", marginBottom: 4 }}>Age</div>
              <div style={{ borderBottom: `1.5px solid ${p.age ? T.navy : T.border}`, paddingBottom: 5, minHeight: 22, fontSize: 12.5, color: p.age ? T.text : T.white, fontWeight: p.age ? 500 : 400, paddingLeft: p.age ? 3 : 0 }}>
                {p.age || " "}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.9, color: T.muted, textTransform: "uppercase", marginBottom: 8 }}>Gender</div>
              <div style={{ display: "flex" }}>
                <Chk checked={p.gender === "MALE"}   label="Male"   />
                <Chk checked={p.gender === "FEMALE"} label="Female" />
                <Chk checked={p.gender === "OTHERS"} label="Other"  />
              </div>
            </div>
          </Row>

          <Row>
            <F label="Contact Number" value={p.phone} />
            <F label="Email ID"       value={p.email} />
          </Row>
          <Row>
            <F label="Occupation / Profession" value={p.profession} />
            <F label="WhatsApp Number (if different)" value="" />
          </Row>

          <Sec title="Medical History" accent={T.red} />

          <F label="Any Existing Medical Conditions (BP, Diabetes, Thyroid, etc.)" />
          <F label="Current Medications" />
          <F label="Allergies (Medicines, Anesthesia, etc.)" />
          <Row>
            <F label="Past Surgeries (if any)" />
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.9, color: T.muted, textTransform: "uppercase", marginBottom: 8 }}>Smoking / Alcohol Habit</div>
              <div style={{ display: "flex" }}>
                <Chk checked={false} label="Yes" />
                <Chk checked={false} label="No"  />
              </div>
            </div>
          </Row>
          <F label="If Yes, How Frequently" />

          <Sec title="Hair Loss Details" accent={T.purple} />

          <Row>
            <F label="Hair Loss Duration (Since When)" value={duration} />
            <div />
          </Row>

          <Row gap={20}>
            <div style={{ marginBottom: 14 }}>
              <ChkLabel label="Type of Hair Loss" />
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <Chk checked={hairType === "male_pattern"}      label="Male Pattern Baldness"    />
                <Chk checked={hairType === "female_pattern"}    label="Female Pattern Hair Loss" />
                <Chk checked={hairType === "traction_alopecia"} label="Patchy / Alopecia Areata" />
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <Chk checked={hairType === "other"} label="Others:" />
                  <span style={{ borderBottom: `1px solid ${T.border}`, flex: 1, minWidth: 50, display: "inline-block" }}>&nbsp;</span>
                </span>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <ChkLabel label="Areas of Concern" />
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <Chk checked={area === "frontal" || area === "hairline"} label="Front Hairline" />
                <Chk checked={area === "crown"}                          label="Crown Area"     />
                <Chk checked={area === "mid_scalp"}                      label="Mid-Scalp"      />
                <Chk checked={area === "beard"}                          label="Beard"          />
                <Chk checked={area === "eyebrows"}                       label="Eyebrows"       />
              </div>
            </div>
          </Row>

        </div>

        <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: "7px 18mm", background: T.bg, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 9, color: T.muted, letterSpacing: 0.2 }}>Ryan Clinic · Confidential Patient Record · Not for Distribution</span>
          <span style={{ fontSize: 9, color: T.muted }}>Page 1 of 2</span>
        </div>
      </div>

      <div style={page} className="pw p2">

        <div className="dark-hdr" style={{ background: "#202020", padding: "12px 18mm", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `3px solid ${T.teal}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: T.white, fontFamily: "Georgia,serif" }}>R</span>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.white, letterSpacing: 0.5 }}>Ryan Clinic</div>
              <div style={{ fontSize: 8.5, color: "white", letterSpacing: 1.5, textTransform: "uppercase" }}>Hair Transplant Consultation Form · Page 2</div>
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "white" }}>
            {date && <span>{date}</span>}
            {date && branch && <span style={{ margin: "0 8px" }}>·</span>}
            {branch && <span>{branch}</span>}
          </div>
        </div>

        <div style={{ padding: "0 18mm", flex: 1, paddingBottom: "12mm" }}>

          <div style={{ marginTop: 18, marginBottom: 14 }}>
            <ChkLabel label="Any Previous Treatments Tried" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px 0" }}>
              <Chk checked={false} label="Minoxidil"       />
              <Chk checked={false} label="Finasteride"     />
              <Chk checked={false} label="PRP"             />
              <Chk checked={false} label="GFC"             />
              <Chk checked={false} label="Hair Transplant" />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Chk checked={false} label="Others:" />
                <span style={{ borderBottom: `1px solid ${T.border}`, flex: 1, minWidth: 60, display: "inline-block" }}>&nbsp;</span>
              </span>
            </div>
          </div>

          <Row>
            <div style={{ marginBottom: 14 }}>
              <ChkLabel label="Family History of Baldness" />
              <div style={{ display: "flex" }}>
                <Chk checked={false} label="Yes" />
                <Chk checked={false} label="No"  />
              </div>
            </div>
            <F label="If Yes, Relationship" />
          </Row>

          <Sec title="Scalp Examination" note="To be filled by the examining Doctor" accent={T.blue} />

          <div style={{ background: T.blueLt, border: `1px solid #b3d4e8`, borderLeft: `4px solid ${T.blue}`, borderRadius: 5, padding: "12px 14px 2px", marginBottom: 6 }}>
            <Row>
              <F label="Donor Area Density" />
              <F label="Scalp Condition"    />
            </Row>
            <F label="Grafts Required (Approx.)" />
            <div style={{ marginBottom: 14 }}>
              <ChkLabel label="Technique Suggested" />
              <div style={{ display: "flex" }}>
                <Chk checked={false} label="FUE"          />
                <Chk checked={false} label="DHI"          />
                <Chk checked={false} label="Sapphire FUE" />
              </div>
            </div>
            <F label="Clinical Notes"        />
            <F label="Hairline Design Notes" />
          </div>

          <Sec title="Cost Estimate & Plan" accent={T.gold} />

          <Row>
            <F label="Approx. Grafts Required" />
            <F label="Quoted Cost (₹)"         />
          </Row>

          <div style={{ marginBottom: 14 }}>
            <ChkLabel label="Technique Finalized" />
            <div style={{ display: "flex" }}>
              <Chk checked={false} label="FUE"               />
              <Chk checked={false} label="DHI"               />
              <Chk checked={false} label="Turkey Expert DHI" />
            </div>
          </div>

          <Row>
            <div style={{ marginBottom: 14 }}>
              <ChkLabel label="EMI Option" />
              <div style={{ display: "flex" }}>
                <Chk checked={false} label="Yes" />
                <Chk checked={false} label="No"  />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <ChkLabel label="Add-ons Suggested" />
              <div style={{ display: "flex" }}>
                <Chk checked={false} label="PRP"         />
                <Chk checked={false} label="GFC"         />
                <Chk checked={false} label="Medications" />
              </div>
            </div>
          </Row>

          <Sec title="Patient Declaration" accent={T.green} />

          <div style={{ background: T.greenLt, border: `1px solid #a9dfbf`, borderLeft: `4px solid ${T.green}`, borderRadius: 5, padding: "12px 16px", marginBottom: 22, fontSize: 12, lineHeight: 1.75, color: "#1a472a" }}>
            I have been explained about the hair transplant procedure, its benefits, possible risks, expected
            outcomes, and post-operative care requirements. I understand the information provided and
            agree to proceed with the consultation and next steps as advised by the doctor.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px 48px" }}>
            {["Patient Signature", "Date", "Doctor's Signature", "Consultant Name"].map((lbl) => (
              <div key={lbl}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.9, color: T.muted, textTransform: "uppercase", marginBottom: 24 }}>{lbl}</div>
                <div style={{ borderTop: `1.5px solid ${T.navy}` }} />
              </div>
            ))}
          </div>

        </div>

        <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: "7px 18mm", background: T.bg, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 9, color: T.muted, letterSpacing: 0.2 }}>Ryan Clinic · Confidential Patient Record · Not for Distribution</span>
          <span style={{ fontSize: 9, color: T.muted }}>Page 2 of 2</span>
        </div>
      </div>
    </>
  );
}
