"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";


const features = [
  {
    icon: "👤",
    color: "gold",
    title: "Patient Lifecycle Management",
    desc: "Full journey tracking from NEW lead → CONSULTED → SURGERY_BOOKED → CLOSED. Auto-status updates with counselling and surgery data.",
    featured: false,
  },
  {
    icon: "📊",
    color: "green",
    title: "Real-time Dashboards",
    desc: "Role-specific dashboards with KPIs, growth trends, revenue charts, and agent performance — all with comparison periods.",
    featured: false,
  },
  {
    icon: "💰",
    color: "gold",
    title: "Financial Engine",
    desc: "Comprehensive transaction management across 4 categories — Transplant, Service, Medicine, and Expense — with full payment tracking, discounts, and multi-method support (UPI, Cash, Card, Banking, Bajaj Loan, Fibe Loan). Generate invoices with multiple layout formats.",
    featured: true,
  },
  {
    icon: "🏥",
    color: "blue",
    title: "Surgery Operations",
    desc: "Schedule surgeries, assign doctors and technicians by role (Senior Tech, Implanter L/R, Grafting), track grafts implanted vs needed.",
    featured: false,
  },
  {
    icon: "📦",
    color: "purple",
    title: "Inventory & Stock",
    desc: "Medicine stock with MRP, purchase/sold pricing, GST tracking, vendor management, expiry monitoring, and purchase transaction history.",
    featured: false,
  },
  {
    icon: "📋",
    color: "red",
    title: "Advanced Reporting",
    desc: "Generate filtered reports by date range, branch, and procedure type. Export to Excel with comprehensive financial breakdowns.",
    featured: false,
  },
  {
    icon: "🔍",
    color: "cyan",
    title: "Complete Audit Trail",
    desc: "Every edit logged — who changed what, previous vs new value, timestamp and branch. Immutable financial audit records.",
    featured: false,
  },
  {
    icon: "☁️",
    color: "gold",
    title: "Document Management",
    desc: "Cloudinary-powered storage for patient photos, consent forms, surgery forms, and consult forms — all linked to patient records.",
    featured: false,
  },
  {
    icon: "🔐",
    color: "green",
    title: "Secure Authentication",
    desc: "NextAuth.js with bcrypt hashing, session versioning, and instant session invalidation on password change. Branch-locked data access by default.",
    featured: false,
  },
];

const iconBg = {
  gold: "bg-[#9a6f2a]/10 border border-[#9a6f2a]/22",
  green: "bg-[#0a8f63]/10 border border-[#0a8f63]/25",
  blue: "bg-indigo-100 border border-indigo-200",
  red: "bg-red-50 border border-red-100",
  purple: "bg-purple-50 border border-purple-100",
  cyan: "bg-cyan-50 border border-cyan-100",
};

const roles = [
  {
    icon: "🛡️",
    name: "Admin",
    hdr: "from-[#7a1a0a] to-[#c23010]",
    feats: ["All branches access", "Employee management", "Financial overview", "User role management", "System-wide reports", "Audit trail access"],
  },
  {
    icon: "📈",
    name: "Sales",
    hdr: "from-[#0a2050] to-[#1a5ab8]",
    feats: ["Patient creation & leads", "Appointment booking", "Agent performance tracking", "Revenue reports", "Conversion analytics", "Upcoming appointments"],
  },
  {
    icon: "🗂️",
    name: "Reception",
    hdr: "from-[#0a3018] to-[#0a8f5a]",
    feats: ["Patient check-in", "Bill & invoice generation", "Transaction management", "Visit tracking", "Not-visited follow-ups", "Performance reports"],
  },
  {
    icon: "🔬",
    name: "Surgery",
    hdr: "from-[#280a40] to-[#6a1ab0]",
    feats: ["Surgery scheduling", "Procedure tracking", "Graft count management", "Pre-surgery checklist", "Aftercare management", "Team assignment"],
  },
  {
    icon: "💬",
    name: "Counsellor",
    hdr: "from-[#40100a] to-[#b03020]",
    feats: ["Patient consultation data", "Treatment suggestions", "Package finalization", "Hair loss assessment", "Graft recommendations", "Benefits & medicines"],
  },
  {
    icon: "📦",
    name: "Stock Manager",
    hdr: "from-[#0a2828] to-[#0a7070]",
    feats: ["Inventory management", "Medicine stock tracking", "Vendor management", "Purchase transactions", "Expiry monitoring", "Stock movement history"],
  },
];

const workflowSteps = [
  { icon: "📞", label: "Lead Captured", num: 1 },
  { icon: "📅", label: "Appointment Booked", num: 2 },
  { icon: "🩺", label: "Counselling Done", num: 3 },
  { icon: "💊", label: "Surgery Booked", num: 4 },
  { icon: "🔬", label: "Procedure Done", num: 5 },
  { icon: "✨", label: "Aftercare & PRP", num: 6 },
];

const auditLog = [
  { dot: "#9a6f2a", name: "Transaction Updated", change: "amount: ₹70k → ₹85k", tag: "Delhi", tagColor: "#0a8f63" },
  { dot: "#0a8f63", name: "Patient Record", change: "status: CONSULTED", tag: "Mumbai", tagColor: "#9a6f2a" },
  { dot: "#818cf8", name: "Stock Updated", change: "qty: 50 → 38 units", tag: "Hyd", tagColor: "#a8998a" },
  { dot: "#9a6f2a", name: "Expense Created", change: "Vendor: MediSupply", tag: "₹12,400", tagColor: "#9a6f2a" },
  { dot: "#0a8f63", name: "Surgery Scheduled", change: "Sapphire FUE · 3000g", tag: "Delhi", tagColor: "#0a8f63" },
  { dot: "#f87171", name: "Password Changed", change: "All sessions invalidated", tag: "Security", tagColor: "#ef4444" },
  { dot: "#9a6f2a", name: "Invoice Generated", change: "patient: Rahul Sharma", tag: "₹1,20,000", tagColor: "#9a6f2a" },
];

const auditFeatures = [
  { icon: "📝", title: "Field-level Change Tracking", desc: "Previous value → new value logged for every edited field on transactions, patients, and stock records." },
  { icon: "👤", title: "Editor Identity Logging", desc: "Name, email, branch, and timestamp captured for every create and update operation across the system." },
  { icon: "🔒", title: "Immutable Audit Records", desc: "Separate Audit model for financial transactions ensures records cannot be silently altered without a trace." },
  { icon: "🏛️", title: "Session Security", desc: "Session versioning invalidates all active sessions instantly on password change — no stale access." },
];

const branches = [
  { icon: "🏛️", city: "Delhi", desc: "National Capital Region — Primary hub with full operational footprint and HQ reporting integration.", accent: "from-[#9a6f2a] to-[#b8862e]" },
  { icon: "🌊", city: "Mumbai", desc: "Financial capital operations — High-volume patient processing with dedicated branch analytics.", accent: "from-[#0a8f63] to-[#34d399]" },
  { icon: "💎", city: "Hyderabad", desc: "Tech city presence — Rapidly growing branch with advanced surgical capability tracking.", accent: "from-[#818cf8] to-[#a78bfa]" },
  { icon: "🌟", city: "Noida", desc: "NCR expansion — Newest branch with full CRM integration and cross-branch patient tracking.", accent: "from-[#ec4899] to-[#f43f5e]" },
  { icon: "✨", city: "Gurgaon", desc: "Cyber City hub — Expanding NCR presence with unified patient records and real-time reporting.", accent: "from-[#6366f1] to-[#8b5cf6]" },
];

const plans = [
  {
    name: "Starter",
    price: "4,999",
    popular: false,
    desc: "Perfect for single-branch clinics getting started with digital patient management.",
    included: ["1 Branch Location", "Up to 3 User Roles", "Patient Management", "Appointment Booking", "Basic Financial Tracking", "Invoice Generation"],
    excluded: ["Multi-Branch Dashboard", "Excel Export Reports", "Full Audit Trail", "Advanced Analytics"],
  },
  {
    name: "Professional",
    price: "9,999",
    popular: true,
    desc: "Complete solution for multi-branch hair transplant clinics with full operational control.",
    included: ["Up to 3 Branch Locations", "All 6 User Roles", "Full Patient Lifecycle", "Surgery Operations Module", "All 4 Transaction Types", "Stock & Vendor Management", "Multi-Branch Dashboard", "Excel Export Reports", "Full Audit Trail", "Advanced Analytics & KPIs"],
    excluded: [],
  },
  {
    name: "Enterprise",
    price: null,
    popular: false,
    desc: "For clinic chains with 4+ locations needing custom workflows, integrations, and dedicated support.",
    included: ["Unlimited Branches", "Custom User Roles", "Everything in Professional", "WhatsApp Notifications", "Custom Integrations", "Dedicated Onboarding", "Priority Support (SLA)", "Custom Report Builder", "Data Migration Assistance", "Monthly Strategy Reviews"],
    excluded: [],
  },
];

const testimonials = [
  { initials: "DR", name: "Dr. Rajesh Kapoor", role: "Medical Director, Delhi", grad: "from-[#9a6f2a] to-[#7a5218]", text: "RyanCRM transformed how we manage our Delhi clinic. The audit trail alone has saved us from so many disputes, and the revenue dashboards are insightful." },
  { initials: "SS", name: "Sunita Sharma", role: "Operations Head, Mumbai", grad: "from-[#0a8f63] to-[#047857]", text: "Managing three cities from one platform was previously a nightmare. Now our Mumbai team works independently while I see everything from HQ. Remarkable." },
  { initials: "AM", name: "Anil Mehta", role: "Clinic Owner, Hyderabad", grad: "from-[#818cf8] to-[#4f46e5]", text: "The patient status pipeline is brilliant. Sales, counsellors, and surgery teams are always on the same page. Patient satisfaction has noticeably improved." },
];

const faqs = [
  { q: "Can I restrict a staff member to only see their branch data?", a: "Yes. Every non-admin user is branch-locked at the API level — not just the UI. Receptionists in Mumbai can only view and manage Mumbai data, regardless of how they access the system." },
  { q: "What transaction types does RyanCRM support?", a: "Four types: Transplant (Sapphire FUE, DHI, Turkish DHI, Beard Transplant), Service (PRP, GFC, Alopecia, Headwash, Canacot), Medicine sales, and Expenses (Vendor or manual). All support multiple payment methods." },
  { q: "Is there a mobile-friendly version?", a: "RyanCRM is fully responsive and works on all modern browsers and devices. Receptionists and sales agents frequently use it on tablets for patient check-ins and appointment booking." },
  { q: "Can I export reports to Excel?", a: "Yes, the Professional and Enterprise plans include Excel export for all financial and patient reports, with full date-range and branch filters applied." },
  { q: "How does the audit trail work for edited transactions?", a: "Every edit is captured in an editors array on the document — storing the editor's name, email, branch, date, and an array of changed fields each with their previous and new values. Separately, an immutable Audit collection records financial transactions." },
  { q: "Is my patient data secure?", a: "RyanCRM uses bcrypt password hashing, JWT sessions with version control, and role-based access at the API layer. Sessions are immediately invalidated across all devices when a password changes." },
];


function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el); } }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}


function RevealDiv({ children, className = "", delay = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function SectionTag({ children, center = false }) {
  return (
    <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#9a6f2a] mb-4 ${center ? "justify-center" : ""}`}>
      <span className="block w-6 h-px bg-[#9a6f2a]" />
      {children}
    </div>
  );
}

function SectionH2({ children }) {
  return (
    <h2 className="font-cormorant text-4xl md:text-5xl font-bold leading-[1.1] mb-4 text-[#1a1510]">
      {children}
    </h2>
  );
}


export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleFaq = (i) => setOpenFaq(openFaq === i ? null : i);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=Outfit:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { font-family: 'Outfit', sans-serif; background: #f8f6f2; color: #1a1510; overflow-x: hidden; }
        .font-cormorant { font-family: 'Cormorant Garamond', serif; }
        .font-outfit { font-family: 'Outfit', sans-serif; }

        /* Animations */
        @keyframes fadeUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeLeft { from { opacity:0; transform:translateX(50px); } to { opacity:1; transform:translateX(0); } }
        @keyframes floatCard { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-8px);} }
        @keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0.3;} }
        @keyframes pulseOrb { 0%,100%{transform:scale(1) translate(0,0);opacity:1;} 50%{transform:scale(1.15) translate(20px,-20px);opacity:0.7;} }
        @keyframes barGrow { from{transform:scaleY(0);} to{transform:scaleY(1);} }

        .anim-fadeup-1 { animation: fadeUp 0.8s ease 0.2s both; }
        .anim-fadeup-2 { animation: fadeUp 0.8s ease 0.4s both; }
        .anim-fadeup-3 { animation: fadeUp 0.8s ease 0.6s both; }
        .anim-fadeup-4 { animation: fadeUp 0.8s ease 0.8s both; }
        .anim-fadeleft { animation: fadeLeft 1s ease 0.5s both; }
        .anim-float { animation: floatCard 4s ease-in-out infinite; }
        .anim-float-delay { animation: floatCard 4s ease-in-out 2s infinite; }
        .anim-blink { animation: blink 2s infinite; }
        .anim-orb { animation: pulseOrb 8s ease-in-out infinite; }
        .anim-orb-d1 { animation: pulseOrb 8s ease-in-out 3s infinite; }
        .anim-orb-d2 { animation: pulseOrb 8s ease-in-out 5s infinite; }

        /* Bar chart grow */
        .bar-fill { transform-origin: bottom; animation: barGrow 1.5s ease 1s both; }
        .bar-fill-d { transform-origin: bottom; animation: barGrow 1.5s ease 1.3s both; }

        /* Gradient text */
        .grad-text {
          background: linear-gradient(135deg, #9a6f2a, #b8862e);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* Noise overlay */
        body::before {
          content:'';
          position:fixed; inset:0;
          background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
          pointer-events:none; z-index:1000; opacity:0.2;
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:#f0ece4; }
        ::-webkit-scrollbar-thumb { background:#9a6f2a; border-radius:3px; }
      `}</style>

      <nav className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 transition-all duration-300 ${scrolled ? "bg-[#f8f6f2]/90 backdrop-blur-xl shadow-sm border-b border-black/5" : "bg-[#faf8f4]/80 backdrop-blur-md"}`}>
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <span className="font-cormorant text-2xl font-bold text-[#1a1510]">Lear<span className="text-[#9a6f2a]">CRM</span></span>
        </Link>
        <ul className="hidden md:flex items-center gap-8 list-none">
          {["features", "workflow", "roles", "pricing", "faq"].map((s) => (
            <li key={s}>
              <a href={`#${s}`} className="text-[#6b5f4e] text-sm font-medium no-underline hover:text-[#9a6f2a] transition-colors capitalize">{s}</a>
            </li>
          ))}
        </ul>
        <Link href="/login" className="no-underline px-5 py-2 rounded-lg bg-linear-to-r from-[#9a6f2a] to-[#7a5218] text-white text-sm font-semibold tracking-wide hover:shadow-lg hover:shadow-[#9a6f2a]/30 hover:-translate-y-px transition-all duration-300">
          Login →
        </Link>
      </nav>

      <section className="relative min-h-screen flex items-center pt-36 pb-24 px-6 overflow-hidden bg-linear-to-br from-[#faf8f4] via-[#f5f0e8] to-[#eef8f4]">
        <div className="anim-orb absolute w-150 h-150 rounded-full -top-48 -right-36 bg-[#9a6f2a]/8 blur-[120px] pointer-events-none" />
        <div className="anim-orb-d1 absolute w-125 h-125 rounded-full -bottom-24 -left-36 bg-[#0a8f63]/7 blur-[120px] pointer-events-none" />

        <div className="max-w-300 mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div>
            <div className="anim-fadeup-1 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#9a6f2a]/10 border border-[#9a6f2a]/22 text-xs font-semibold tracking-widest text-[#9a6f2a] uppercase mb-6">
              <span className="anim-blink w-1.5 h-1.5 rounded-full bg-[#0a8f63]" />
              Trusted by Hair Transplant Clinics
            </div>
            <h1 className="anim-fadeup-2 font-cormorant text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] mb-6 text-[#1a1510]">
              The <em className="grad-text not-italic">Complete</em><br />Clinic Operating<br />System
            </h1>
            <p className="anim-fadeup-3 text-lg text-[#6b5f4e] leading-[1.8] mb-10 max-w-125">
              RyanCRM unifies patient management, surgery tracking, financial reporting, and multi-branch operations — purpose-built for modern hair transplant clinics.
            </p>
            <div className="anim-fadeup-4 flex flex-wrap gap-4">
              <Link href="/login" className="no-underline inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-linear-to-r from-[#9a6f2a] to-[#7a5218] text-white font-bold tracking-wide hover:shadow-xl hover:shadow-[#9a6f2a]/35 hover:-translate-y-0.5 transition-all duration-300">
                Start Free Trial →
              </Link>
              <button
                onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-transparent border border-[#9a6f2a]/22 text-[#1a1510] font-medium hover:border-[#9a6f2a] hover:text-[#9a6f2a] hover:bg-[#9a6f2a]/5 transition-all duration-300"
              >
                Explore Features
              </button>
            </div>
          </div>

          <div className="anim-fadeleft relative hidden lg:block">
            <div className="anim-float-delay absolute -top-5 -right-8 z-10 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white border border-[#9a6f2a]/20 shadow-xl text-sm font-medium text-[#1a1510]">
              <span className="text-lg">✅</span>
              <div>
                <div className="text-[10px] text-[#6b5f4e]">Surgery Completed</div>
                <div className="font-bold text-xs">Rahul S. · 3200 grafts</div>
              </div>
            </div>

            <div className="relative bg-white rounded-2xl p-6 shadow-[0_8px_40px_rgba(0,0,0,0.08)] border border-black/7">
              <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl bg-linear-to-r from-transparent via-[#9a6f2a] to-transparent" />

              <div className="flex items-center justify-between mb-5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#6b5f4e]">Dashboard Overview</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#0a8f63]/10 border border-[#0a8f63]/25 text-[10px] font-semibold text-[#0a8f63]">● Live</span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  { val: "₹4.2L", label: "Today's Revenue", trend: "▲ 18%" },
                  { val: "24", label: "Appointments", trend: "▲ 5%" },
                  { val: "8", label: "Surgeries Today", trend: "▲ 33%" },
                  { val: "92%", label: "Conversion Rate", trend: "▲ 12%" },
                ].map((s) => (
                  <div key={s.label} className="bg-[#f8f5f0] border border-black/6 rounded-xl p-3.5">
                    <div className="font-cormorant text-3xl font-bold text-[#9a6f2a] leading-none">{s.val}</div>
                    <div className="text-[11px] text-[#6b5f4e] mt-1">{s.label}</div>
                    <div className="text-[10px] font-semibold text-[#0a8f63] mt-1.5">{s.trend}</div>
                  </div>
                ))}
              </div>

              <div className="text-[10px] font-bold uppercase tracking-widest text-[#6b5f4e] mb-2">7-Day Revenue</div>
              <div className="flex items-end gap-1.5 h-14 mb-5">
                {[40, 60, 35, 80, 55, 90, 70].map((h, i) => (
                  <div key={i} className="flex-1 bg-[#f0ece4] rounded relative overflow-hidden" style={{ height: "100%" }}>
                    <div
                      className={`absolute bottom-0 left-0 right-0 rounded bg-linear-to-t from-[#9a6f2a] to-[#9a6f2a]/20 ${i === 6 ? "bar-fill-d" : "bar-fill"}`}
                      style={{ height: `${h}%` }}
                    />
                  </div>
                ))}
              </div>

              <div className="text-[10px] font-bold uppercase tracking-widest text-[#6b5f4e] mb-2.5">Recent Patients</div>
              <div className="flex flex-col gap-2">
                {[
                  { initials: "AS", name: "Arjun Sharma", status: "Surgery Booked", statusCls: "bg-[#9a6f2a]/10 text-[#9a6f2a]", grad: "from-[#9a6f2a] to-[#7a5218]" },
                  { initials: "PK", name: "Priya Kumar", status: "Closed", statusCls: "bg-[#0a8f63]/10 text-[#0a8f63]", grad: "from-[#0a8f63] to-[#047857]" },
                  { initials: "RV", name: "Rohan Verma", status: "Consulted", statusCls: "bg-indigo-100 text-indigo-600", grad: "from-[#818cf8] to-[#4f46e5]" },
                ].map((p) => (
                  <div key={p.name} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-[#f5f2ec]">
                    <div className={`w-7 h-7 rounded-full bg-linear-to-br ${p.grad} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>{p.initials}</div>
                    <span className="text-xs font-medium text-[#1a1510] flex-1">{p.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${p.statusCls}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="anim-float absolute -bottom-5 -left-10 z-10 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white border border-[#9a6f2a]/20 shadow-xl text-sm font-medium text-[#1a1510]">
              <span className="text-lg">💰</span>
              <div>
                <div className="text-[10px] text-[#6b5f4e]">Payment Received</div>
                <div className="font-bold text-xs text-[#9a6f2a]">₹85,000 · UPI</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="px-6 pb-20">
        <RevealDiv className="max-w-300 mx-auto grid grid-cols-2 md:grid-cols-4 rounded-2xl overflow-hidden border border-black/8 shadow-[0_4px_24px_rgba(0,0,0,0.06)] divide-x divide-black/6">
          {[
            { num: "6+", label: "User Roles" },
            { num: "3", label: "Branch Locations" },
            { num: "4", label: "Transaction Types" },
            { num: "100%", label: "Audit Trail" },
          ].map((s) => (
            <div key={s.label} className="bg-white py-8 px-6 text-center hover:bg-[#faf7f2] transition-colors">
              <div className="font-cormorant text-4xl font-bold text-[#9a6f2a] leading-none">{s.num}</div>
              <div className="text-xs text-[#6b5f4e] mt-2 font-medium">{s.label}</div>
            </div>
          ))}
        </RevealDiv>
      </div>

      <section id="features" className="py-28 px-6">
        <div className="max-w-300 mx-auto">
          <RevealDiv>
            <SectionTag>Platform Features</SectionTag>
            <SectionH2>Everything your clinic needs,<br /><span className="font-cormorant italic text-[#b8862e]">in one place</span></SectionH2>
            <p className="text-[#6b5f4e] text-lg leading-[1.7] max-w-xl">From the first patient inquiry to post-surgery aftercare — RyanCRM covers every touchpoint in your clinical workflow.</p>
          </RevealDiv>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-14">
            {features.map((f, i) => (
              <RevealDiv
                key={f.title}
                delay={((i % 3) + 1) * 80}
                className={`group relative bg-white border border-black/7 rounded-2xl p-8 cursor-default shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:border-[#9a6f2a]/25 hover:-translate-y-1 hover:shadow-[0_20px_60px_rgba(0,0,0,0.1)] transition-all duration-400 overflow-hidden ${f.featured ? "lg:row-span-2 bg-linear-to-br from-[#fffdf7] to-[#faf7ef] border-[#9a6f2a]/20 shadow-[0_4px_20px_rgba(154,111,42,0.08)]" : ""}`}
              >
                <div className="absolute inset-0 bg-linear-to-br from-[#9a6f2a]/4 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none rounded-2xl" />
                <div className={`w-13 h-13 rounded-[14px] flex items-center justify-center text-2xl mb-5 ${iconBg[f.color]}`} style={{ width: 52, height: 52 }}>{f.icon}</div>
                <h3 className={`font-cormorant font-semibold text-[#1a1510] mb-3 ${f.featured ? "text-2xl" : "text-xl"}`}>{f.title}</h3>
                <p className="text-sm text-[#6b5f4e] leading-[1.75]">{f.desc}</p>
              </RevealDiv>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="py-28 px-6 bg-[#f0ece4]">
        <div className="max-w-300 mx-auto">
          <RevealDiv className="text-center">
            <SectionTag center>Patient Journey</SectionTag>
            <SectionH2>From <span className="italic text-[#b8862e]">enquiry</span> to aftercare</SectionH2>
            <p className="text-[#6b5f4e] text-lg leading-[1.7] max-w-xl mx-auto">RyanCRM maps your entire patient pipeline automatically — status updates as data is entered, no manual intervention needed.</p>
          </RevealDiv>

          <RevealDiv className="relative mt-14">
            <div className="absolute top-7 left-[10%] right-[10%] h-px bg-linear-to-r from-transparent via-[#9a6f2a] to-transparent hidden md:block" />
            <div className="grid grid-cols-3 md:grid-cols-6 gap-y-8 gap-x-2">
              {workflowSteps.map((step) => (
                <div key={step.num} className="group text-center relative">
                  <div className="relative w-14 h-14 rounded-full bg-white border border-black/10 flex items-center justify-center text-2xl mx-auto mb-4 z-10 shadow-[0_2px_12px_rgba(0,0,0,0.06)] group-hover:bg-[#9a6f2a]/10 group-hover:border-[#9a6f2a] group-hover:scale-110 transition-all duration-300">
                    {step.icon}
                    <div className="absolute -top-1.5 -right-1 w-4.5 h-4.5 rounded-full bg-[#9a6f2a] text-white flex items-center justify-center text-[9px] font-black" style={{ width: 18, height: 18 }}>{step.num}</div>
                  </div>
                  <div className="text-[11px] font-semibold text-[#6b5f4e] group-hover:text-[#9a6f2a] transition-colors leading-tight">{step.label}</div>
                </div>
              ))}
            </div>
          </RevealDiv>
        </div>
      </section>

      <section id="roles" className="py-28 px-6">
        <div className="max-w-300 mx-auto">
          <RevealDiv>
            <SectionTag>Access Control</SectionTag>
            <SectionH2>Every role has its<br /><span className="italic text-[#b8862e]">tailored workspace</span></SectionH2>
            <p className="text-[#6b5f4e] text-lg leading-[1.7] max-w-xl">Precise permissions ensure each team member sees exactly what they need — and nothing more.</p>
          </RevealDiv>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-14">
            {roles.map((r, i) => (
              <RevealDiv key={r.name} delay={(i % 3) * 80}
                className="group bg-white border border-black/7 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:-translate-y-1.5 hover:shadow-[0_24px_60px_rgba(0,0,0,0.12)] hover:border-[#9a6f2a]/20 transition-all duration-400"
              >
                <div className={`bg-linear-to-br ${r.hdr} p-8 min-h-30 flex flex-col justify-end`}>
                  <div className="text-4xl mb-2">{r.icon}</div>
                  <div className="font-cormorant text-2xl font-bold text-white">{r.name}</div>
                </div>
                <div className="p-6">
                  <ul className="flex flex-col gap-2.5">
                    {r.feats.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-[#6b5f4e]">
                        <span className="text-[#9a6f2a] text-[8px]">✦</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </RevealDiv>
            ))}
          </div>
        </div>
      </section>

      <section className="py-28 px-6 bg-[#f0ece4]">
        <div className="max-w-300 mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <RevealDiv>
            <SectionTag>Trust & Compliance</SectionTag>
            <SectionH2>Full <span className="italic text-[#b8862e]">transparency</span><br />with every change</SectionH2>
            <p className="text-[#6b5f4e] text-lg leading-[1.7] max-w-xl mb-8">Every financial and patient record change is logged with the editor's identity, timestamp, branch, and exact field-level differences.</p>
            <div className="flex flex-col gap-4">
              {auditFeatures.map((a) => (
                <div key={a.title} className="flex gap-4 p-4 bg-white rounded-xl border border-black/7 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-[#9a6f2a]/20 hover:bg-[#fdfbf7] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all duration-300">
                  <div className="w-10 h-10 rounded-[10px] bg-[#9a6f2a]/10 border border-[#9a6f2a]/22 flex items-center justify-center text-lg shrink-0">{a.icon}</div>
                  <div>
                    <div className="font-semibold text-sm text-[#1a1510] mb-0.5">{a.title}</div>
                    <div className="text-xs text-[#6b5f4e] leading-[1.6]">{a.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </RevealDiv>

          <RevealDiv delay={200} className="relative bg-white rounded-2xl p-6 border border-black/7 shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-[#9a6f2a] to-transparent" />
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6b5f4e] mb-4">Recent Audit Log</div>
            <div className="flex flex-col divide-y divide-black/5">
              {auditLog.map((row, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 text-xs">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: row.dot }} />
                  <div className="flex-1 font-medium text-[#1a1510]">{row.name}</div>
                  <div className="text-[#6b5f4e] text-[11px]">{row.change}</div>
                  <div className="font-bold ml-auto text-[11px]" style={{ color: row.tagColor }}>{row.tag}</div>
                </div>
              ))}
            </div>
          </RevealDiv>
        </div>
      </section>

      <section className="py-28 px-6">
        <div className="max-w-300 mx-auto">
          <RevealDiv className="text-center">
            <SectionTag center>Multi-Branch</SectionTag>
            <SectionH2>One system, <span className="italic text-[#b8862e]">three cities</span></SectionH2>
            <p className="text-[#6b5f4e] text-lg leading-[1.7] max-w-xl mx-auto">Branch-isolated data with centralized admin reporting. Each location operates independently while HQ sees the complete picture.</p>
          </RevealDiv>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-14">
            {branches.map((b, i) => (
              <RevealDiv key={b.city} delay={i * 100}
                className="relative bg-white border border-black/7 rounded-2xl p-10 text-center shadow-[0_2px_12px_rgba(0,0,0,0.05)] hover:-translate-y-1 hover:border-[#9a6f2a]/20 hover:shadow-[0_16px_48px_rgba(0,0,0,0.1)] transition-all duration-400 overflow-hidden"
              >
                <div className={`absolute bottom-0 left-0 right-0 h-0.75 bg-linear-to-r ${b.accent}`} />
                <div className="text-5xl mb-4">{b.icon}</div>
                <div className="font-cormorant text-3xl font-bold text-[#1a1510] mb-2">{b.city}</div>
                <div className="text-sm text-[#6b5f4e] leading-[1.7]">{b.desc}</div>
              </RevealDiv>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-28 px-6 bg-[#f0ece4]">
        <div className="max-w-300 mx-auto">
          <RevealDiv className="text-center">
            <SectionTag center>Pricing Plans</SectionTag>
            <SectionH2>Simple, <span className="italic text-[#b8862e]">transparent</span> pricing</SectionH2>
            <p className="text-[#6b5f4e] text-lg leading-[1.7] max-w-xl mx-auto">Scale your CRM as your clinic grows. No hidden charges, no per-feature fees — everything included at each tier.</p>
          </RevealDiv>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-14 items-start">
            {plans.map((plan, i) => (
              <RevealDiv key={plan.name} delay={i * 100}
                className={`relative rounded-2xl p-10 border transition-all duration-400 hover:-translate-y-1 ${
                  plan.popular
                    ? "bg-linear-to-br from-[#fffdf7] to-[#faf8f0] border-[#9a6f2a] shadow-[0_8px_40px_rgba(154,111,42,0.15)] scale-[1.03]"
                    : "bg-white border-black/8 shadow-[0_2px_16px_rgba(0,0,0,0.05)] hover:shadow-[0_16px_48px_rgba(0,0,0,0.1)]"
                } overflow-hidden`}
              >
                {plan.popular && (
                  <>
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-linear-to-r from-[#9a6f2a] to-[#b8862e]" />
                    <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-[#9a6f2a]/10 border border-[#9a6f2a]/22 text-[10px] font-bold uppercase tracking-wider text-[#9a6f2a]">Most Popular</div>
                  </>
                )}
                <div className="text-xs font-bold uppercase tracking-widest text-[#6b5f4e] mb-3">{plan.name}</div>
                <div className="font-cormorant leading-none mb-1 text-[#1a1510]">
                  {plan.price ? (
                    <span className="text-5xl font-bold"><sup className="text-2xl text-[#9a6f2a]">₹</sup>{plan.price}<span className="font-outfit text-base font-normal text-[#6b5f4e]">/month</span></span>
                  ) : (
                    <span className="text-4xl font-bold">Custom</span>
                  )}
                </div>
                <p className="text-sm text-[#6b5f4e] leading-[1.6] mt-2 mb-6">{plan.desc}</p>
                <div className="h-px bg-black/8 mb-6" />
                <ul className="flex flex-col gap-3 mb-8">
                  {plan.included.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-[#1a1510]">
                      <span className="text-[#0a8f63] shrink-0 mt-0.5">✓</span>
                      {f}
                    </li>
                  ))}
                  {plan.excluded.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-[#a8998a]">
                      <span className="text-[#d1ccc5] shrink-0 mt-0.5">✕</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className={`w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide border transition-all duration-300 ${
                    plan.popular
                      ? "bg-linear-to-r from-[#9a6f2a] to-[#7a5218] text-white border-transparent hover:shadow-[0_8px_30px_rgba(154,111,42,0.4)] hover:-translate-y-px"
                      : "bg-transparent text-[#6b5f4e] border-black/12 hover:border-[#9a6f2a] hover:text-[#9a6f2a] hover:bg-[#9a6f2a]/5"
                  }`}
                >
                  {plan.popular ? "Start Free Trial →" : plan.price ? "Get Started" : "Contact Sales"}
                </button>
              </RevealDiv>
            ))}
          </div>
          <p className="text-center mt-8 text-sm text-[#a8998a]">All plans include a 14-day free trial. No credit card required.</p>
        </div>
      </section>

      <section className="py-28 px-6">
        <div className="max-w-300 mx-auto">
          <RevealDiv className="text-center">
            <SectionTag center>Testimonials</SectionTag>
            <SectionH2>Loved by clinic <span className="italic text-[#b8862e]">operators</span></SectionH2>
          </RevealDiv>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-14">
            {testimonials.map((t, i) => (
              <RevealDiv key={t.name} delay={i * 100}
                className="bg-white border border-black/7 rounded-2xl p-8 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:border-[#9a6f2a]/20 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] transition-all duration-300"
              >
                <div className="text-[#9a6f2a] text-sm mb-2">★★★★★</div>
                <div className="font-cormorant text-5xl text-[#9a6f2a] opacity-35 leading-none mb-2">"</div>
                <p className="text-sm text-[#6b5f4e] leading-[1.8] mb-6">{t.text}</p>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full bg-linear-to-br ${t.grad} flex items-center justify-center text-xs font-bold text-white shrink-0`}>{t.initials}</div>
                  <div>
                    <div className="text-sm font-semibold text-[#1a1510]">{t.name}</div>
                    <div className="text-xs text-[#a8998a]">{t.role}</div>
                  </div>
                </div>
              </RevealDiv>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="py-28 px-6 bg-[#f8f6f2]">
        <div className="max-w-300 mx-auto">
          <RevealDiv className="text-center">
            <SectionTag center>FAQ</SectionTag>
            <SectionH2>Common <span className="italic text-[#b8862e]">questions</span></SectionH2>
          </RevealDiv>

          <RevealDiv delay={100} className="max-w-180 mx-auto mt-14 rounded-2xl overflow-hidden border border-black/6 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white border-b border-black/5 last:border-b-0">
                <button
                  onClick={() => toggleFaq(i)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left text-[#1a1510] text-sm font-medium hover:bg-[#fdfbf7] transition-colors"
                >
                  <span>{faq.q}</span>
                  <span
                    className="text-xl text-[#9a6f2a] shrink-0 transition-transform duration-300"
                    style={{ transform: openFaq === i ? "rotate(45deg)" : "rotate(0deg)" }}
                  >+</span>
                </button>
                <div
                  className="overflow-hidden transition-all duration-350 text-sm text-[#6b5f4e] leading-[1.75]"
                  style={{ maxHeight: openFaq === i ? 200 : 0, padding: openFaq === i ? "0 1.5rem 1.5rem" : "0 1.5rem" }}
                >
                  {faq.a}
                </div>
              </div>
            ))}
          </RevealDiv>
        </div>
      </section>

      <section className="relative py-28 px-6 text-center bg-linear-to-br from-[#1a0f05] via-[#2a1a08] to-[#0a1a10] overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-175 h-175 rounded-full bg-[#9a6f2a]/8 blur-[120px] pointer-events-none" />
        <div className="relative z-10">
          <RevealDiv>
            <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#9a6f2a]/60 mb-6">
              <span className="block w-6 h-px bg-[#9a6f2a]/40" />
              Get Started Today
            </div>
            <h2 className="font-cormorant text-5xl md:text-6xl font-bold text-[#f8f5ef] leading-[1.1] mb-4">
              Ready to run your clinic<br />with <em className="not-italic text-[#b8862e]">total clarity?</em>
            </h2>
            <p className="text-[#f8f5ef]/60 text-lg max-w-120 mx-auto mb-10 leading-[1.7]">
              Join clinics across Delhi, Mumbai, Hyderabad, Noida, and Gurgaon who've replaced spreadsheets and scattered tools with RyanCRM.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/login" className="no-underline inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-linear-to-r from-[#9a6f2a] to-[#7a5218] text-white font-bold tracking-wide hover:shadow-xl hover:shadow-[#9a6f2a]/30 hover:-translate-y-0.5 transition-all duration-300">
                Start 14-Day Free Trial →
              </Link>
              <a
                href="mailto:hello@RyanCRM.in"
                className="no-underline inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-[#f8f5ef]/25 text-[#f8f5ef]/80 font-medium hover:border-[#f8f5ef]/50 hover:text-[#f8f5ef] transition-all duration-300"
              >
                Talk to Sales
              </a>
            </div>
          </RevealDiv>
        </div>
      </section>

      <footer className="bg-[#f0ece4] border-t border-black/8 px-6 pt-16 pb-8">
        <div className="max-w-300 mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <span className="font-cormorant text-2xl font-bold text-[#1a1510]">Lear<span className="text-[#9a6f2a]">CRM</span></span>
              </div>
              <p className="text-sm text-[#6b5f4e] leading-[1.75] max-w-75 mb-4">The complete operating system for hair transplant clinics. Built with Next.js, MongoDB, and Tailwind CSS.</p>
              <div className="text-xs text-[#a8998a]">📍 Delhi · Mumbai · Hyderabad · Noida · Gurgaon</div>
            </div>
            {[
              { heading: "Product", links: [{ label: "Features", href: "#features" }, { label: "Patient Workflow", href: "#workflow" }, { label: "Role Access", href: "#roles" }, { label: "Pricing", href: "#pricing" }] },
              { heading: "Support", links: [{ label: "Documentation", href: "#" }, { label: "Contact Us", href: "mailto:hello@RyanCRM.in" }, { label: "System Status", href: "#" }, { label: "Changelog", href: "#" }] },
            ].map((col) => (
              <div key={col.heading}>
                <div className="text-xs font-bold uppercase tracking-widest text-[#9a6f2a] mb-4">{col.heading}</div>
                <div className="flex flex-col gap-3">
                  {col.links.map((l) => (
                    <a key={l.label} href={l.href} className="text-sm text-[#6b5f4e] no-underline hover:text-[#9a6f2a] transition-colors">{l.label}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-8 border-t border-black/8 text-xs text-[#a8998a]">
            <span>© {new Date().getFullYear()} RyanCRM. All rights reserved.</span>
            <span>Built on Next.js · MongoDB · TailwindCSS</span>
          </div>
        </div>
      </footer>
    </>
  );
}