"use client";
import { Suspense, useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SearchableSelect from "@/components/SearchableSelect";
import BankRoutingFields from "@/components/BankRoutingFields";
import ExternalPartyFields from "@/components/ExternalPartyFields";
import TaxBreakdownFields from "@/components/TaxBreakdownFields";
import useMasterData from "@/lib/useMasterData";
import ReceiptUpload from "@/components/ReceiptUpload";
import RevenueSection from "@/components/RevenueSection";
import ContraEntryForm from "@/components/ContraEntryForm";
import SuspenseEntryForm from "@/components/SuspenseEntryForm";
import IncentiveTabSwitcher from "@/components/IncentiveTabSwitcher";
import { useSession } from "next-auth/react";
import { maskPhone } from "@/utils/phoneUtils";
import { PAYABLE_EXPENSE_DROPDOWN_CATEGORIES } from "@/constants/expenseCategories";
import { getPayableContext } from "@/lib/entryForm/getPayableContext";
import { getAdvanceContext } from "@/lib/entryForm/getAdvanceContext";
import { buildExpensePayload } from "@/lib/entryForm/buildTransactionPayload";
import { validateExpenseEntry } from "@/lib/entryForm/validateExpenseEntry";
import AdvanceSettlementPanel from "@/components/finance/AdvanceSettlementPanel";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Scissors,
  Heart,
  Pill,
  Receipt,
  Users,
  HeartPulse,
  Home,
  Wallet,
  ArrowLeftRight,
  HelpCircle,
  Gift,
} from "lucide-react";

const PATIENT_EXPENSE_SUBTYPES = ["Patient Meals", "PATIENT EMI"];

const getPaymentIdConfig = (method) => {
  if (method === "card")
    return { placeholder: "Please enter card last no.", required: true };
  if (method?.toLowerCase() === "bajaj_loan")
    return { placeholder: "Please add the reference id", required: true };
  if (method?.toLowerCase() === "fibe_loan")
    return { placeholder: "Please add the reference id", required: true };
  if (method === "cash")
    return { placeholder: "Please add transaction id", required: false };
  if (method === "including-package")
    return { placeholder: "N/A — included in package", required: false };
  return { placeholder: "Please add transaction id", required: true };
};

const getTodayIST = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const resolveDefaultBranch = (branch) =>
  branch && branch !== "All" && branch !== "Collab" ? branch : "Delhi";

export default function AdminCreateTransactionPage() {
  return (
    <Suspense fallback={null}>
      <AdminCreateTransactionPageInner />
    </Suspense>
  );
}

function resolveExpenseSection(expenseHead) {
  if (expenseHead === "Salary" || expenseHead === "Incentive") return "agent";
  if (expenseHead === "Commision") return "patient";
  if (PAYABLE_EXPENSE_DROPDOWN_CATEGORIES.includes(expenseHead)) return "rent";
  return "other";
}

function AdminCreateTransactionPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const {
    getExpenseTypes,
    getMethodOptions,
    withLegacyMethod,
    payableExpenseDropdownCategories: mdPayableDropdown,
    directPaymentCategories: mdDirect,
  } = useMasterData();
  const OTHER_EXPENSE_CATEGORIES_DYN = mdDirect.filter(
    (cat) => cat !== "Patient Related Expenses" && cat !== "Incentive",
  );

  const [activeTab, setActiveTab] = useState("transplant");
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [patients, setPatients] = useState([]);
  const [patientSearching, setPatientSearching] = useState(false);
  const [patientCache, setPatientCache] = useState({});
  const patientDebounceRef = useRef(null);
  const [medicines, setMedicines] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeSearching, setEmployeeSearching] = useState(false);
  const [employeeCache, setEmployeeCache] = useState({});
  const employeeDebounceRef = useRef(null);
  const [payableAction, setPayableAction] = useState("none");
  const [selectedPayableId, setSelectedPayableId] = useState("");
  const [allowOverpayment, setAllowOverpayment] = useState(false);
  const [payableDueDate, setPayableDueDate] = useState("");
  const [payablePeriodMonth, setPayablePeriodMonth] = useState("");
  const [payablePeriodYear, setPayablePeriodYear] = useState("");
  const [openPayables, setOpenPayables] = useState([]);
  const [payablesLoading, setPayablesLoading] = useState(false);
  const [payableSummary, setPayableSummary] = useState(null);
  const [secondaryPayableSummary, setSecondaryPayableSummary] = useState(null);
  const [expandedPayableId, setExpandedPayableId] = useState(null);
  const [expandedPayableTx, setExpandedPayableTx] = useState([]);
  const [expandedPayableTxLoading, setExpandedPayableTxLoading] = useState(false);
  const [payableRefreshKey, setPayableRefreshKey] = useState(0);
  const [openAdvances, setOpenAdvances] = useState([]);
  const [advanceAllocations, setAdvanceAllocations] = useState({}); // { [advanceId]: amount }

  const [transplantData, setTransplantData] = useState({
    patient: "",
    procedure: "Sapphire FUE",
    paymentType: "Booking",
    amount: "",
    discount: 0,
    method: "cash",
    paymentId: "",
    date: getTodayIST(),
    branch: resolveDefaultBranch(session?.user?.branch),
    remarks: "",
    receiptMode: "",
    furtherMode: "",
    receipts: [],
    externalParty: { name: "", method: "", partyKind: "MANUAL", partyRefId: "" },
  });

  const [serviceData, setServiceData] = useState({
    patient: "",
    patientName: "",
    patientPhone: "",
    isWalkIn: false,
    discount: 0,
    method: "cash",
    paymentId: "",
    date: getTodayIST(),
    branch: resolveDefaultBranch(session?.user?.branch),
    remarks: "",
    receiptMode: "",
    furtherMode: "",
    receipts: [],
    externalParty: { name: "", method: "", partyKind: "MANUAL", partyRefId: "" },
  });

  const [serviceItems, setServiceItems] = useState([
    {
      id: Date.now(),
      procedure: "PRP",
      quantity: 1,
      perSessionCost: "",
      totalAmount: 0,
    },
  ]);

  const [medicineData, setMedicineData] = useState({
    patient: "",
    patientName: "",
    patientPhone: "",
    isWalkIn: false,
    discount: 0,
    method: "cash",
    paymentId: "",
    date: getTodayIST(),
    branch: resolveDefaultBranch(session?.user?.branch),
    remarks: "",
    receiptMode: "",
    furtherMode: "",
    receipts: [],
    externalParty: { name: "", method: "", partyKind: "MANUAL", partyRefId: "" },
  });

  const [medicineItems, setMedicineItems] = useState([
    {
      id: Date.now(),
      medicineId: "",
      medicineName: "",
      quantity: 1,
      perUnitCost: "",
      totalAmount: 0,
    },
  ]);

  const [expenseData, setExpenseData] = useState({
    expenseSection: "agent",
    expenseCategory: "",
    expenseType: "",
    isVendor: false,
    vendorId: "",
    expenseGiverName: "",
    amount: "",
    method: "cash",
    paymentId: "",
    date: getTodayIST(),
    branch: resolveDefaultBranch(session?.user?.branch),
    remarks: "",
    furtherMode: "",
    externalParty: { name: "", method: "", partyKind: "MANUAL", partyRefId: "" },

    agentSubTab: "salary",
    employeeId: "",
    salaryMonth: new Date().getMonth() + 1,
    salaryYear: new Date().getFullYear(),

    patientSubTab: "commission",
    patientId: "",
    receiverType: "Patient",
    receiverId: "",
    receiverName: "",

    payableCategory: "Rent",
    rentSubType: "",
    payableVendorId: "",
    includeGST: false,
    gstRate: "",
    gstAmount: "",
    includeTDS: false,
    tdsCategory: "",
    tdsRate: "",
    tdsAmount: "",


    receipts: [],
  });

  useEffect(() => {
    const category = searchParams.get("category");
    const branch = searchParams.get("branch");
    const furtherMode = searchParams.get("furtherMode");
    const expenseHead = searchParams.get("expense");
    const expenseTypeParam = searchParams.get("expenseType");
    if (!category && !branch && !furtherMode && !expenseHead) return;

    const tabByCategory = { TRANSPLANT: "transplant", SERVICE: "service", MEDICINE: "medicine", EXPENSE: "expense" };
    const tab = tabByCategory[category];
    if (tab) setActiveTab(tab);

    const patch = {};
    if (branch) patch.branch = branch;
    if (furtherMode) patch.furtherMode = furtherMode;

    if (tab === "transplant" && Object.keys(patch).length) {
      setTransplantData((d) => ({ ...d, ...patch }));
    } else if (tab === "service" && Object.keys(patch).length) {
      setServiceData((d) => ({ ...d, ...patch }));
    } else if (tab === "medicine" && Object.keys(patch).length) {
      setMedicineData((d) => ({ ...d, ...patch }));
    } else if (tab === "expense" || (!category && (expenseHead || furtherMode || branch))) {
      const section = expenseHead ? resolveExpenseSection(expenseHead) : undefined;
      setExpenseData((d) => ({
        ...d,
        ...patch,
        ...(section ? { expenseSection: section } : {}),
        ...(section === "rent" ? { payableCategory: expenseHead, rentSubType: expenseTypeParam || "" } : {}),
        ...(section === "other" ? { expenseCategory: expenseHead, expenseType: expenseTypeParam || "" } : {}),
      }));
      if (!category) setActiveTab("expense");
    }
  }, []);

  const fetchPatients = async (term = "") => {
    setPatientSearching(true);
    try {
      const params = new URLSearchParams({ limit: 30 });
      if (term) params.set("search", term);
      const res = await fetch(`/api/patients/get-patient?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPatients(data.patients || []);
      }
    } catch (error) {
      console.error("Error fetching patients:", error);
    } finally {
      setPatientSearching(false);
    }
  };

  const handlePatientSearch = (term) => {
    clearTimeout(patientDebounceRef.current);
    patientDebounceRef.current = setTimeout(() => fetchPatients(term), 350);
  };

  const addToPatientCache = (patientObj) => {
    if (patientObj)
      setPatientCache((prev) => ({ ...prev, [patientObj._id]: patientObj }));
  };

  const patientOptions = useMemo(() => {
    const resultIds = new Set(patients.map((p) => p._id));
    const cached = Object.values(patientCache).filter(
      (p) => !resultIds.has(p._id),
    );
    return [...cached, ...patients];
  }, [patients, patientCache]);

  const patientPicker = {
    options: patientOptions,
    searching: patientSearching,
    onSearch: handlePatientSearch,
    addToCache: addToPatientCache,
  };

  const fetchEmployees = async (term = "") => {
    setEmployeeSearching(true);
    try {
      const params = new URLSearchParams({ limit: 30 });
      if (term) params.set("search", term);
      const res = await fetch(`/api/employees/get?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch (error) {
      console.error("Error fetching employees:", error);
    } finally {
      setEmployeeSearching(false);
    }
  };

  const handleEmployeeSearch = (term) => {
    clearTimeout(employeeDebounceRef.current);
    employeeDebounceRef.current = setTimeout(() => fetchEmployees(term), 350);
  };

  const addToEmployeeCache = (empObj) => {
    if (empObj)
      setEmployeeCache((prev) => ({ ...prev, [empObj._id]: empObj }));
  };

  const employeeOptions = useMemo(() => {
    const resultIds = new Set(employees.map((e) => e._id));
    const cached = Object.values(employeeCache).filter(
      (e) => !resultIds.has(e._id),
    );
    return [...cached, ...employees];
  }, [employees, employeeCache]);

  const formatEmployeeOption = (emp) =>
    `${emp.name}${emp.employeeId ? ` (${emp.employeeId})` : ""} — ${emp.role}${emp.phone ? " · " + emp.phone : ""}`;

  useEffect(() => {
    const fetchData = async () => {
      setFetchLoading(true);
      try {
        fetchPatients("");
        fetchEmployees("");

        await Promise.all([
          (async () => {
            try {
              const res = await fetch("/api/stocks/get");
              if (res.ok) {
                const d = await res.json();
                setMedicines(d.data || d.stocks || []);
              }
            } catch {}
          })(),
          (async () => {
            try {
              const res = await fetch("/api/vendors/get");
              if (res.ok) {
                const d = await res.json();
                setVendors(d.data || d.vendors || []);
              }
            } catch {}
          })(),
        ]);
      } finally {
        setFetchLoading(false);
      }
    };
    fetchData();
  }, []);

  const payableContext = getPayableContext({ expenseData, employees, employeeCache, patients, patientCache, vendors });
  const advanceContext = getAdvanceContext({ expenseData, employees, employeeCache, patients, patientCache, vendors });

  const selectedAgentEmployee = expenseData.employeeId
    ? employeeCache[expenseData.employeeId] ||
      employeeOptions.find((e) => e._id === expenseData.employeeId) ||
      null
    : null;

  useEffect(() => {
    if (activeTab !== "expense" || !payableContext) {
      setPayableSummary(null);
      setSecondaryPayableSummary(null);
      setOpenPayables([]);
      return;
    }

    const ctx = payableContext;
    setPayablesLoading(true);

    const summaryParams = new URLSearchParams({
      purpose: ctx.purpose,
      payeeKind: ctx.payeeKind,
    });
    if (ctx.payeeRefId) summaryParams.set("payeeRefId", ctx.payeeRefId);
    else summaryParams.set("payeeLabel", ctx.payeeLabel);

    const listParams = new URLSearchParams({
      purpose: ctx.purpose,
      payeeKind: ctx.payeeKind,
      limit: "50",
    });
    if (ctx.payeeRefId) listParams.set("payeeRefId", ctx.payeeRefId);
    else listParams.set("payeeLabel", ctx.payeeLabel);
    if (ctx.payeeKind === "VENDOR" && ctx.expenseSubType) {
      summaryParams.set("expenseSubType", ctx.expenseSubType);
      listParams.set("expenseSubType", ctx.expenseSubType);
    }

    const requests = [
      fetch(`/api/payables/summary?${summaryParams}`).then((r) => r.json()),
      fetch(`/api/payables/list?${listParams}`).then((r) => r.json()),
    ];

    if (expenseData.expenseSection === "agent") {
      const otherPurpose = ctx.purpose === "SALARY" ? "INCENTIVE" : "SALARY";
      const otherParams = new URLSearchParams({
        purpose: otherPurpose,
        payeeKind: "EMPLOYEE",
        payeeRefId: ctx.payeeRefId,
      });
      requests.push(fetch(`/api/payables/summary?${otherParams}`).then((r) => r.json()));
    }

    Promise.all(requests)
      .then(([summaryData, listData, secondaryData]) => {
        if (summaryData.success) setPayableSummary(summaryData.byPayee || summaryData.overall);
        if (listData.success) setOpenPayables(listData.payables || []);
        if (secondaryData?.success) setSecondaryPayableSummary(secondaryData.byPayee || secondaryData.overall);
        else setSecondaryPayableSummary(null);
      })
      .catch((error) => console.error("Error fetching payable data:", error))
      .finally(() => setPayablesLoading(false));
  }, [
    activeTab,
    expenseData.expenseSection,
    expenseData.agentSubTab,
    expenseData.employeeId,
    expenseData.patientSubTab,
    expenseData.patientId,
    expenseData.receiverType,
    expenseData.receiverId,
    expenseData.payableCategory,
    expenseData.rentSubType,
    expenseData.payableVendorId,
    expenseData.expenseCategory,
    expenseData.expenseType,
    payableRefreshKey,
  ]);

  useEffect(() => {
    // The incentive sub-tab is pay-only — there's no "create payable" path here, so default
    // straight to recording a payment against an existing open incentive payable.
    const incentivePayOnly =
      expenseData.expenseSection === "agent" && expenseData.agentSubTab === "incentive";
    setPayableAction(incentivePayOnly ? "pay" : "none");
    setSelectedPayableId("");
    setAllowOverpayment(false);
    setExpandedPayableId(null);
    setAdvanceAllocations({});
  }, [
    expenseData.expenseSection,
    expenseData.agentSubTab,
    expenseData.employeeId,
    expenseData.patientSubTab,
    expenseData.receiverType,
    expenseData.receiverId,
    expenseData.payableCategory,
    expenseData.rentSubType,
  ]);

  // A stale allocation carried across a payable switch is the obvious bug — clear it.
  useEffect(() => {
    setAdvanceAllocations({});
  }, [selectedPayableId, payableAction]);

  // Open advances for whoever this expense is paid to — only relevant when recording a
  // payment against a specific payable (settling an advance needs a payableId).
  useEffect(() => {
    if (activeTab !== "expense" || !advanceContext?.refId || payableAction !== "pay") {
      setOpenAdvances([]);
      return;
    }
    const params = new URLSearchParams({
      partyKind: advanceContext.kind,
      partyRefId: advanceContext.refId,
    });
    let cancelled = false;
    fetch(`/api/advances/open-for-party?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setOpenAdvances(d.success ? d.advances || [] : []);
      })
      .catch(() => {
        if (!cancelled) setOpenAdvances([]);
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    payableAction,
    advanceContext?.kind,
    advanceContext?.refId,
    expenseData.expenseSection,
    expenseData.agentSubTab,
    payableRefreshKey,
  ]);

  useEffect(() => {
    setExpenseData((d) => (d.payableVendorId ? { ...d, payableVendorId: "" } : d));
  }, [expenseData.expenseSection, expenseData.payableCategory]);

  /* ---- advance settlement derived state ---- */
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const selectedPayableForSettle = openPayables.find((p) => p._id === selectedPayableId) || null;

  // {advanceId, amount, remaining}[] — only ticked advances, keyed to their live `remaining`.
  const advanceAllocList = Object.entries(advanceAllocations)
    .filter(([, v]) => v !== "" && v != null)
    .map(([advanceId, amount]) => {
      const adv = openAdvances.find((a) => a._id === advanceId);
      return { advanceId, amount: round2(amount), remaining: adv ? adv.remaining : 0 };
    });
  const hasAdvanceAllocations = advanceAllocList.length > 0;
  const advanceApplied = round2(advanceAllocList.reduce((s, a) => s + a.amount, 0));
  const advanceNet =
    selectedPayableForSettle != null
      ? round2((selectedPayableForSettle.pending || 0) - advanceApplied)
      : round2(parseFloat(expenseData.amount || 0) - advanceApplied);

  // §4.4 — while advances are ticked, the Amount field IS the net (cash leaving the account).
  // Auto-set it and lock the input; the caption tells the user to untick to edit.
  useEffect(() => {
    if (!hasAdvanceAllocations) return;
    const nextStr = String(advanceNet);
    setExpenseData((d) => (d.amount === nextStr ? d : { ...d, amount: nextStr }));
  }, [hasAdvanceAllocations, advanceNet]);

  const toggleExpandPayable = async (payableId) => {
    if (expandedPayableId === payableId) {
      setExpandedPayableId(null);
      return;
    }
    setExpandedPayableId(payableId);
    setExpandedPayableTxLoading(true);
    try {
      const params = new URLSearchParams({ payableId, limit: "50" });
      const res = await fetch(`/api/transactions/get-all?${params}`);
      if (res.ok) {
        const data = await res.json();
        setExpandedPayableTx(data.transactions || []);
      }
    } catch (error) {
      console.error("Error fetching payable transactions:", error);
    } finally {
      setExpandedPayableTxLoading(false);
    }
  };

  const handleCreatePayable = async () => {
    const ctx = payableContext;
    if (!ctx) return;
    if (!expenseData.amount || parseFloat(expenseData.amount) <= 0) {
      alert("Enter the amount owed first");
      return;
    }
    const needsPeriod = ["SALARY", "RENT", "ELECTRICITY", "COLLAB_CLINIC", "TAX"].includes(ctx.purpose);
    const period =
      ctx.purpose === "SALARY"
        ? { month: expenseData.salaryMonth, year: expenseData.salaryYear }
        : payablePeriodMonth && payablePeriodYear
          ? { month: parseInt(payablePeriodMonth), year: parseInt(payablePeriodYear) }
          : null;
    if (needsPeriod && !period) {
      alert("Select the month and year this payable is for");
      return;
    }
    if (["INCENTIVE", "PATIENT_COMMISSION"].includes(ctx.purpose) && !ctx.relatedPatient) {
      alert("Select the related patient first");
      return;
    }
    if (expenseData.includeTDS && !expenseData.tdsCategory) {
      alert("Select the TDS category first");
      return;
    }
    if (expenseData.includeTDS && !expenseData.tdsRate && !expenseData.tdsAmount) {
      alert("Enter a TDS rate or a TDS amount");
      return;
    }
    if (expenseData.includeGST && !expenseData.gstRate && !expenseData.gstAmount) {
      alert("Enter a GST rate or a GST amount");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/payables/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payee: { kind: ctx.payeeKind, refId: ctx.payeeRefId, label: ctx.payeeLabel },
          purpose: ctx.purpose,
          expenseCategory: ctx.expenseCategory,
          expenseSubType: ctx.expenseSubType,
          period,
          relatedPatient: ctx.relatedPatient,
          totalAmount: expenseData.amount,
          dueDate: payableDueDate || undefined,
          branch: ctx.branch,
          remarks: expenseData.remarks,
          ...(expenseData.includeGST
            ? {
                includeGST: true,
                gstRate: expenseData.gstRate || undefined,
                gstAmount: expenseData.gstAmount || undefined,
              }
            : {}),
          ...(expenseData.includeTDS
            ? {
                includeTDS: true,
                tdsCategory: expenseData.tdsCategory,
                tdsRate: expenseData.tdsRate || undefined,
                tdsAmount: expenseData.tdsAmount || undefined,
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(
          expenseData.includeTDS
            ? `Payable created — vendor ${formatCurrency(data.payable?.totalAmount)} + linked TDS ${formatCurrency(data.tdsPayable?.totalAmount)}.`
            : "Payable created — this amount is now recorded as owed.",
        );
        setPayableAction("none");
        setExpenseData((d) => ({
          ...d,
          amount: "",
          includeGST: false,
          gstRate: "",
          gstAmount: "",
          includeTDS: false,
          tdsCategory: "",
          tdsRate: "",
          tdsAmount: "",
        }));
        setPayableDueDate("");
        setPayablePeriodMonth("");
        setPayablePeriodYear("");
        setPayableRefreshKey((k) => k + 1);
      } else {
        alert(data.error || "Failed to create payable");
      }
    } catch {
      alert("Failed to create payable");
    } finally {
      setLoading(false);
    }
  };

  const renderPayableActions = () => {
    const ctx = payableContext;
    if (!ctx) return null;
    const needsPeriodPicker = ["RENT", "ELECTRICITY", "COLLAB_CLINIC", "TAX"].includes(ctx.purpose);
    const selectedPayable = openPayables.find((p) => p._id === selectedPayableId);
    const overBalance =
      selectedPayable && parseFloat(expenseData.amount || 0) > selectedPayable.pending;
    // Incentive sub-tab: pay-only against an existing open incentive payable. No create path.
    const payOnly =
      expenseData.expenseSection === "agent" && expenseData.agentSubTab === "incentive";

    const payableLabel = (p) =>
      `${p.expenseSubType || p.expenseCategory}${p.period ? ` (${p.period.month}/${p.period.year})` : ""} — Pending ${formatCurrency(p.pending)}`;

    return (
      <div className="mt-4 pt-4 border-t border-gray-100">
        {!payOnly && (
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setPayableAction(payableAction === "create" ? "none" : "create")}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              payableAction === "create"
                ? "bg-amber-500 text-white border-amber-500"
                : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
            }`}
          >
            + Create Payable
          </button>
          <button
            type="button"
            onClick={() => setPayableAction(payableAction === "pay" ? "none" : "pay")}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              payableAction === "pay"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
            }`}
          >
            Record Payment
          </button>
        </div>
        )}

        {payOnly && (
          <p className="text-xs font-semibold text-indigo-700 mb-3">
            Select an open incentive payable to pay
          </p>
        )}

        {payableAction === "create" && !payOnly && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-3 mb-4">
            <p className="text-xs text-amber-800">
              Records that this amount is now due — no money moves yet. The Amount field above is
              how much is owed.
            </p>
            {needsPeriodPicker && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={payablePeriodMonth}
                  onChange={(e) => setPayablePeriodMonth(e.target.value)}
                  className="px-2 py-1.5 border border-amber-300 rounded-lg text-sm"
                >
                  <option value="">Month</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1).toLocaleString("en", { month: "long" })}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={payablePeriodYear}
                  onChange={(e) => setPayablePeriodYear(e.target.value)}
                  placeholder="Year"
                  className="px-2 py-1.5 border border-amber-300 rounded-lg text-sm"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-amber-800 mb-1">
                Due Date (optional)
              </label>
              <input
                type="date"
                value={payableDueDate}
                onChange={(e) => setPayableDueDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-amber-300 rounded-lg text-sm"
              />
            </div>

            <TaxBreakdownFields
              tone="amber"
              allowTDS={ctx.purpose !== "TAX"}
              baseAmount={expenseData.amount}
              value={expenseData}
              onChange={(patch) => setExpenseData((d) => ({ ...d, ...patch }))}
            />

            <button
              type="button"
              onClick={handleCreatePayable}
              disabled={loading}
              className="w-full py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
            >
              Save as Owed
            </button>
          </div>
        )}

        {payableAction === "pay" && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-3 mb-4">
            <p className="text-xs text-indigo-800">
              Logs money actually paid out now, against an existing payable. The Amount field
              above is how much is being paid.
            </p>
            <select
              value={selectedPayableId}
              onChange={(e) => setSelectedPayableId(e.target.value)}
              className="w-full px-2 py-1.5 border border-indigo-300 rounded-lg text-sm"
            >
              <option value="">Select open payable…</option>
              {openPayables
                .filter((p) => p.status !== "Paid")
                .map((p) => (
                  <option key={p._id} value={p._id}>
                    {payableLabel(p)}
                  </option>
                ))}
            </select>
            {payOnly &&
              !payablesLoading &&
              openPayables.filter((p) => p.status !== "Paid").length === 0 && (
                <p className="text-xs text-indigo-700">
                  No open incentive payables for this employee — raise one from the Incentive
                  tab first.
                </p>
              )}
            {overBalance && (
              <label className="flex items-center gap-2 text-xs text-amber-700">
                <input
                  type="checkbox"
                  checked={allowOverpayment}
                  onChange={(e) => setAllowOverpayment(e.target.checked)}
                />
                Amount exceeds pending balance ({formatCurrency(selectedPayable.pending)}) — allow
                overpayment
              </label>
            )}
          </div>
        )}

        {payableAction === "pay" && selectedPayableId && openAdvances.length > 0 && (
          <AdvanceSettlementPanel
            advances={openAdvances}
            selectedPayable={selectedPayable}
            allocations={advanceAllocations}
            onChange={setAdvanceAllocations}
            disabled={loading}
          />
        )}

        {!payablesLoading && openPayables.length === 0 && ctx.payeeKind === "VENDOR" && (
          <p className="text-xs text-gray-400 italic">No open bills for this vendor.</p>
        )}

        {openPayables.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              History
            </p>
            <div className="space-y-1.5">
              {openPayables.map((p) => (
                <div key={p._id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpandPayable(p._id)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <span className="text-gray-700 truncate">
                      {p.expenseSubType || p.expenseCategory}
                      {p.period ? ` (${p.period.month}/${p.period.year})` : ""}
                    </span>
                    <span className="flex items-center gap-2 shrink-0 ml-2">
                      <span
                        className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${
                          p.status === "Paid"
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : p.status === "Overdue"
                              ? "bg-red-100 text-red-700 border-red-200"
                              : p.status === "Partially Paid"
                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        {p.status}
                      </span>
                      <span className="font-semibold text-rose-600">
                        {formatCurrency(p.pending)}
                      </span>
                    </span>
                  </button>
                  {expandedPayableId === p._id && (
                    <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-xs">
                      {expandedPayableTxLoading ? (
                        <p className="text-gray-400">Loading…</p>
                      ) : expandedPayableTx.length === 0 ? (
                        <p className="text-gray-400">No payments recorded yet.</p>
                      ) : (
                        <ul className="space-y-1">
                          {expandedPayableTx.map((tx) => (
                            <li key={tx._id} className="flex justify-between">
                              <span className="text-gray-600">
                                {new Date(tx.date).toLocaleDateString("en-IN")} ·{" "}
                                {(tx.method || "").replace(/_/g, " ").toUpperCase()} ·{" "}
                                {tx.createdBy?.name || "—"}
                              </span>
                              <span className="font-semibold text-gray-900">
                                {formatCurrency(tx.amount)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const sessionBranch = session?.user?.branch;
  useEffect(() => {
    if (!sessionBranch) return;
    const b = resolveDefaultBranch(sessionBranch);
    setTransplantData((d) => ({ ...d, branch: b }));
    setServiceData((d) => ({ ...d, branch: b }));
    setMedicineData((d) => ({ ...d, branch: b }));
    setExpenseData((d) => ({ ...d, branch: b }));
  }, [sessionBranch]);

  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount || 0);

  const formatPatientOption = (patient) =>
    `${patient.personal?.name || "N/A"} - ${maskPhone(patient.personal?.phone, session?.user?.role) || "N/A"} | Package: ${formatCurrency(patient?.payments?.totalAmount)} | Received: ${formatCurrency(patient?.payments?.amountReceived)} | Pending: ${formatCurrency(patient?.payments?.pendingAmount)}`;

  const handleSaveTransplant = async () => {
    if (!transplantData.patient) {
      alert("Please select a patient");
      return;
    }
    if (!transplantData.amount) {
      alert("Please enter amount");
      return;
    }
    if (transplantData.method !== "cash" && !transplantData.paymentId) {
      alert(
        transplantData.method === "card"
          ? "Please enter card last no."
          : transplantData.method?.toLowerCase() === "bajaj_loan" ||
              transplantData.method?.toLowerCase() === "fibe_loan"
            ? "Please add the reference id"
            : "Please add transaction id",
      );
      return;
    }
    if (
      transplantData.method === "paid_to_external" &&
      (!transplantData.externalParty.name || !transplantData.externalParty.method)
    ) {
      alert("Please enter the receiver's name and payment method");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/transactions/transplant/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: transplantData.patient,
          procedure: transplantData.procedure,
          paymentType: transplantData.paymentType,
          amount: transplantData.amount,
          discount: transplantData.discount,
          method: transplantData.method,
          paymentId: transplantData.paymentId,
          branch: transplantData.branch,
          date: transplantData.date,
          remarks: transplantData.remarks,
          receiptMode: transplantData.receiptMode,
          furtherMode: transplantData.furtherMode,
          receipts: transplantData.receipts,
          receivableAllocationChoice: transplantData.receivableAllocationChoice,
          externalParty:
            transplantData.method === "paid_to_external" ? transplantData.externalParty : undefined,
        }),
      });
      if (res.ok) {
        alert("Transplant transaction saved!");
        router.push("/admin/transactions");
      } else {
        const d = await res.json();
        alert(d.error || "Failed to create transaction");
      }
    } catch {
      alert("Failed to save transplant transaction");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveService = async () => {
    if (!serviceData.isWalkIn && !serviceData.patient) {
      alert("Please select a patient");
      return;
    }
    if (
      serviceData.isWalkIn &&
      (!serviceData.patientName || !serviceData.patientPhone)
    ) {
      alert("Please enter patient name and phone");
      return;
    }
    for (const item of serviceItems) {
      if (!item.perSessionCost || parseFloat(item.perSessionCost) <= 0) {
        alert("Please enter valid per session cost for all services");
        return;
      }
    }
    if (serviceData.method !== "cash" && !serviceData.paymentId) {
      alert(
        serviceData.method === "card"
          ? "Please enter card last no."
          : serviceData.method?.toLowerCase() === "bajaj_loan" ||
              serviceData.method?.toLowerCase() === "fibe_loan"
            ? "Please add the reference id"
            : "Please add transaction id",
      );
      return;
    }
    if (
      serviceData.method === "paid_to_external" &&
      (!serviceData.externalParty.name || !serviceData.externalParty.method)
    ) {
      alert("Please enter the receiver's name and payment method");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/transactions/service/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: serviceData.isWalkIn ? null : serviceData.patient,
          patientName: serviceData.patientName,
          patientPhone: serviceData.patientPhone,
          services: serviceItems.map((i) => ({
            procedure: i.procedure,
            quantity: i.quantity,
            perSessionCost: parseFloat(i.perSessionCost),
            totalAmount: parseFloat(i.totalAmount),
          })),
          discount: serviceData.discount,
          method: serviceData.method,
          paymentId: serviceData.paymentId,
          branch: serviceData.branch,
          date: serviceData.date,
          remarks: serviceData.remarks,
          receiptMode: serviceData.receiptMode,
          furtherMode: serviceData.furtherMode,
          receipts: serviceData.receipts,
          receivableAllocationChoice: serviceData.receivableAllocationChoice,
          externalParty: serviceData.method === "paid_to_external" ? serviceData.externalParty : undefined,
        }),
      });
      if (res.ok) {
        alert("Service transactions saved!");
        router.push("/admin/transactions");
      } else {
        const d = await res.json();
        alert(d.error || "Failed to create transactions");
      }
    } catch {
      alert("Failed to save service transactions");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMedicine = async () => {
    if (!medicineData.isWalkIn && !medicineData.patient) {
      alert("Please select a patient");
      return;
    }
    if (
      medicineData.isWalkIn &&
      (!medicineData.patientName || !medicineData.patientPhone)
    ) {
      alert("Please enter customer name and phone");
      return;
    }
    for (const item of medicineItems) {
      if (!item.medicineId) {
        alert("Please select medicine for all items");
        return;
      }
      if (!item.perUnitCost || parseFloat(item.perUnitCost) <= 0) {
        alert("Please enter valid price for all medicines");
        return;
      }
    }
    if (
      medicineData.method !== "cash" &&
      medicineData.method !== "including-package" &&
      !medicineData.paymentId
    ) {
      alert(
        medicineData.method === "card"
          ? "Please enter card last no."
          : medicineData.method?.toLowerCase() === "bajaj_loan" ||
              medicineData.method?.toLowerCase() === "fibe_loan"
            ? "Please add the reference id"
            : "Please add transaction id",
      );
      return;
    }
    if (
      medicineData.method === "paid_to_external" &&
      (!medicineData.externalParty.name || !medicineData.externalParty.method)
    ) {
      alert("Please enter the receiver's name and payment method");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/transactions/medicine/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: medicineData.isWalkIn ? null : medicineData.patient,
          patientName: medicineData.patientName,
          patientPhone: medicineData.patientPhone,
          medicines: medicineItems.map((i) => ({
            medicineId: i.medicineId,
            quantity: i.quantity,
            perUnitCost: parseFloat(i.perUnitCost),
            totalAmount: parseFloat(i.totalAmount),
          })),
          discount: medicineData.discount,
          method: medicineData.method,
          paymentId: medicineData.paymentId,
          branch: medicineData.branch,
          date: medicineData.date,
          remarks: medicineData.remarks,
          receiptMode: medicineData.receiptMode,
          furtherMode: medicineData.furtherMode,
          receipts: medicineData.receipts,
          receivableAllocationChoice: medicineData.receivableAllocationChoice,
          externalParty: medicineData.method === "paid_to_external" ? medicineData.externalParty : undefined,
        }),
      });
      if (res.ok) {
        alert("Medicine sales saved!");
        router.push("/admin/transactions");
      } else {
        const d = await res.json();
        alert(d.error || "Failed to create transactions");
      }
    } catch {
      alert("Failed to save medicine sales");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExpense = async () => {
    const error = validateExpenseEntry({
      expenseData,
      payableAction,
      selectedPayableId,
      advanceAllocations: advanceAllocList,
      selectedPayable: selectedPayableForSettle,
    });
    if (error) {
      alert(error);
      return;
    }
    setLoading(true);
    try {
      // With advances ticked, one action spans two documents — route through the orchestrator.
      const endpoint = hasAdvanceAllocations
        ? "/api/transactions/expense/create-with-settlement"
        : "/api/transactions/expense/create";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildExpensePayload({
            expenseData,
            payableAction,
            selectedPayableId,
            allowOverpayment,
            advanceAllocations: advanceAllocList,
            employees,
            employeeCache,
            patients,
            patientCache,
            patientOptions,
            employeeOptions,
            vendors,
          }),
        ),
      });
      if (res.ok) {
        alert(
          hasAdvanceAllocations && advanceNet === 0
            ? "Advance settled — payable closed with no cash movement."
            : "Expense transaction created successfully!",
        );
        router.push("/admin/transactions");
      } else {
        const d = await res.json();
        alert(d.error || "Failed to create transaction");
      }
    } catch {
      alert("Failed to save expense transaction");
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading data...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <main className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            <div className="mb-6 flex justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Create Transaction
                </h1>
                <p className="text-gray-600 mt-1">
                  Create new transaction record
                </p>
              </div>
              <button
                onClick={() => router.back()}
                className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            </div>

            <div className="mb-6 border-b border-gray-200">
              <div className="flex gap-4 flex-wrap">
                {[
                  { id: "transplant", label: "Transplant", icon: Scissors },
                  { id: "service", label: "Service (PRP/GFC)", icon: Heart },
                  { id: "medicine", label: "Medicine Sale", icon: Pill },
                  { id: "expense", label: "Expense", icon: Receipt },
                  { id: "incentive", label: "Incentive", icon: Gift },
                  { id: "contra", label: "Contra Entry", icon: ArrowLeftRight },
                  { id: "suspense", label: "Suspense", icon: HelpCircle },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`px-6 py-3 font-medium border-b-2 transition-colors ${activeTab === id ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      {label}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {activeTab === "transplant" && (
              <RevenueSection
                category="TRANSPLANT"
                data={transplantData}
                onChange={setTransplantData}
                picker={patientPicker}
                patientLabel={patientOptions.find((p) => p._id === transplantData.patient)?.personal?.name}
                onSave={handleSaveTransplant}
                saving={loading}
                saveLabel="Save Transaction"
              />
            )}

            {activeTab === "service" && (
              <RevenueSection
                category="SERVICE"
                data={serviceData}
                onChange={setServiceData}
                picker={patientPicker}
                items={serviceItems}
                onItemsChange={setServiceItems}
                patientLabel={
                  serviceData.isWalkIn
                    ? serviceData.patientName
                    : patientOptions.find((p) => p._id === serviceData.patient)?.personal?.name
                }
                onSave={handleSaveService}
                saving={loading}
                saveLabel="Save Services"
              />
            )}

            {activeTab === "medicine" && (
              <RevenueSection
                category="MEDICINE"
                data={medicineData}
                onChange={setMedicineData}
                picker={patientPicker}
                items={medicineItems}
                onItemsChange={setMedicineItems}
                medicines={medicines}
                patientLabel={
                  medicineData.isWalkIn
                    ? medicineData.patientName
                    : patientOptions.find((p) => p._id === medicineData.patient)?.personal?.name
                }
                onSave={handleSaveMedicine}
                saving={loading}
                saveLabel="Save Medicines"
              />
            )}

            {activeTab === "incentive" && (
              <IncentiveTabSwitcher picker={patientPicker} />
            )}

            {activeTab === "contra" && <ContraEntryForm />}

            {activeTab === "suspense" && <SuspenseEntryForm />}

            {activeTab === "expense" && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 flex flex-wrap gap-2">
                  {[
                    { id: "agent", label: "Employees", icon: Users },
                    { id: "patient", label: "Patient", icon: HeartPulse },
                    { id: "rent", label: "Journal Vouncher", icon: Home },
                    { id: "other", label: "Direct Payments", icon: Wallet },
                  ].map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() =>
                        setExpenseData({
                          ...expenseData,
                          expenseSection: section.id,
                          expenseType: "",
                          amount: "",
                          employeeId: "",
                          patientId: "",
                          receiverId: "",
                          receiverName: "",
                          rentSubType: "",
                                              })
                      }
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        expenseData.expenseSection === section.id
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <section.icon className="w-4 h-4" />
                      {section.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">
                    {expenseData.expenseSection === "agent" && (
                      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex gap-2 mb-4">
                          {["salary", "incentive"].map((sub) => (
                            <button
                              key={sub}
                              type="button"
                              onClick={() =>
                                setExpenseData({
                                  ...expenseData,
                                  agentSubTab: sub,
                                  expenseType: "",
                                })
                              }
                              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
                                expenseData.agentSubTab === sub
                                  ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                                  : "bg-gray-50 text-gray-600 border border-transparent"
                              }`}
                            >
                              {sub}
                            </button>
                          ))}
                        </div>

                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Employee <span className="text-red-500">*</span>
                        </label>
                        <SearchableSelect
                          options={employeeOptions}
                          value={expenseData.employeeId}
                          onChange={(v, obj) => {
                            addToEmployeeCache(obj);
                            setExpenseData((d) => ({
                              ...d,
                              employeeId: v,
                              ...(d.agentSubTab === "salary" &&
                              obj?.salaryStructure?.baseSalary
                                ? { amount: String(obj.salaryStructure.baseSalary) }
                                : d.agentSubTab === "incentive" && obj?.incentiveRate
                                  ? { amount: String(obj.incentiveRate) }
                                  : {}),
                            }));
                          }}
                          placeholder="Search and select an employee..."
                          valueKey="_id"
                          formatOption={formatEmployeeOption}
                          onSearch={handleEmployeeSearch}
                          searching={employeeSearching}
                        />

                        {selectedAgentEmployee && (
                          <p className="mt-2 text-xs text-gray-500">
                            {selectedAgentEmployee.employeeId ? (
                              <>
                                Employee ID{" "}
                                <span className="font-semibold text-gray-700">
                                  {selectedAgentEmployee.employeeId}
                                </span>
                                {selectedAgentEmployee.role ? " · " : ""}
                              </>
                            ) : null}
                            {selectedAgentEmployee.role}
                          </p>
                        )}

                        {expenseData.employeeId && (
                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs font-medium text-gray-500 mb-2">
                                {expenseData.agentSubTab === "salary" ? "Salary" : "Incentive"}
                              </p>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Owed</span>
                                <span className="font-semibold text-gray-900">
                                  {payablesLoading ? "…" : formatCurrency(payableSummary?.totalOwed)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Paid</span>
                                <span className="font-semibold text-emerald-700">
                                  {payablesLoading ? "…" : formatCurrency(payableSummary?.totalPaid)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Pending</span>
                                <span className="font-bold text-rose-600">
                                  {payablesLoading ? "…" : formatCurrency(payableSummary?.totalPending)}
                                </span>
                              </div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs font-medium text-gray-500 mb-2">
                                {expenseData.agentSubTab === "salary" ? "Incentive" : "Salary"}
                              </p>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Owed</span>
                                <span className="font-semibold text-gray-900">
                                  {payablesLoading
                                    ? "…"
                                    : formatCurrency(secondaryPayableSummary?.totalOwed)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Paid</span>
                                <span className="font-semibold text-emerald-700">
                                  {payablesLoading
                                    ? "…"
                                    : formatCurrency(secondaryPayableSummary?.totalPaid)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Pending</span>
                                <span className="font-bold text-rose-600">
                                  {payablesLoading
                                    ? "…"
                                    : formatCurrency(secondaryPayableSummary?.totalPending)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {expenseData.agentSubTab === "incentive" && (
                          <div className="mt-4 rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-xs text-indigo-800">
                            Records a payment against one of this employee&apos;s open incentive
                            payables. Incentive payables are raised from the{" "}
                            <span className="font-semibold">Incentive</span> tab (patient-based
                            or target-based) — not here.
                          </div>
                        )}

                        {expenseData.agentSubTab === "salary" && (
                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Salary Month
                              </label>
                              <select
                                value={expenseData.salaryMonth}
                                onChange={(e) =>
                                  setExpenseData({
                                    ...expenseData,
                                    salaryMonth: parseInt(e.target.value),
                                  })
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(
                                  (m) => (
                                    <option key={m} value={m}>
                                      {new Date(2000, m - 1).toLocaleString(
                                        "en",
                                        { month: "long" },
                                      )}
                                    </option>
                                  ),
                                )}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Salary Year
                              </label>
                              <input
                                type="number"
                                value={expenseData.salaryYear}
                                onChange={(e) =>
                                  setExpenseData({
                                    ...expenseData,
                                    salaryYear: parseInt(e.target.value),
                                  })
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                          </div>
                        )}

                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Amount (₹) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            value={expenseData.amount}
                            onChange={(e) =>
                              setExpenseData({
                                ...expenseData,
                                amount: e.target.value,
                              })
                            }
                            min="0"
                            readOnly={hasAdvanceAllocations}
                            className={`w-full px-3 py-2 border border-gray-300 rounded-lg ${
                              hasAdvanceAllocations ? "bg-gray-100 text-gray-500" : ""
                            }`}
                            placeholder="0"
                          />
                          {hasAdvanceAllocations && (
                            <p className="mt-1 text-xs text-gray-500">
                              Auto-calculated from payable pending − advance applied. Untick every
                              advance to edit.
                            </p>
                          )}
                        </div>
                        {expenseData.agentSubTab === "incentive" && (
                          <p className="text-xs text-gray-500 mt-2">
                            Optional note on what the incentive is for can go
                            in Remarks below.
                          </p>
                        )}
                        {renderPayableActions()}
                      </div>
                    )}

                    {expenseData.expenseSection === "patient" && (
                      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex gap-2 mb-4">
                          {["commission", "refund", "expense"].map((sub) => (
                            <button
                              key={sub}
                              type="button"
                              onClick={() =>
                                setExpenseData({
                                  ...expenseData,
                                  patientSubTab: sub,
                                  expenseType: "",
                                })
                              }
                              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
                                expenseData.patientSubTab === sub
                                  ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                                  : "bg-gray-50 text-gray-600 border border-transparent"
                              }`}
                            >
                              {sub}
                            </button>
                          ))}
                        </div>

                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Patient <span className="text-red-500">*</span>
                        </label>
                        <SearchableSelect
                          options={patientOptions}
                          value={expenseData.patientId}
                          onChange={(v, obj) => {
                            addToPatientCache(obj);
                            setExpenseData({ ...expenseData, patientId: v });
                          }}
                          placeholder="Search and select a patient..."
                          valueKey="_id"
                          formatOption={formatPatientOption}
                          onSearch={handlePatientSearch}
                          searching={patientSearching}
                        />

                        {expenseData.patientSubTab === "commission" && (
                          <>
                            <div className="mt-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Commission Type{" "}
                                <span className="text-red-500">*</span>
                              </label>
                              <select
                                value={expenseData.expenseType}
                                onChange={(e) =>
                                  setExpenseData({
                                    ...expenseData,
                                    expenseType: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              >
                                <option value="">Select Type</option>
                                {getExpenseTypes("Commision").map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="mt-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Paid To
                              </label>
                              <div className="flex gap-2 mb-2">
                                {["Patient", "Employee", "MANUAL"].map(
                                  (type) => (
                                    <button
                                      key={type}
                                      type="button"
                                      onClick={() =>
                                        setExpenseData({
                                          ...expenseData,
                                          receiverType: type,
                                          receiverId: "",
                                          receiverName: "",
                                        })
                                      }
                                      className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                                        expenseData.receiverType === type
                                          ? "bg-indigo-600 text-white"
                                          : "bg-gray-100 text-gray-600"
                                      }`}
                                    >
                                      {type === "MANUAL" ? "Manual" : type}
                                    </button>
                                  ),
                                )}
                              </div>
                              {expenseData.receiverType === "Patient" && (
                                <SearchableSelect
                                  options={patientOptions}
                                  value={expenseData.receiverId}
                                  onChange={(v, obj) => {
                                    addToPatientCache(obj);
                                    setExpenseData({
                                      ...expenseData,
                                      receiverId: v,
                                    });
                                  }}
                                  placeholder="Search and select a patient..."
                                  valueKey="_id"
                                  formatOption={formatPatientOption}
                                  onSearch={handlePatientSearch}
                                  searching={patientSearching}
                                />
                              )}
                              {expenseData.receiverType === "Employee" && (
                                <SearchableSelect
                                  options={employeeOptions}
                                  value={expenseData.receiverId}
                                  onChange={(v, obj) => {
                                    addToEmployeeCache(obj);
                                    setExpenseData({
                                      ...expenseData,
                                      receiverId: v,
                                    });
                                  }}
                                  placeholder="Search and select an employee..."
                                  valueKey="_id"
                                  formatOption={formatEmployeeOption}
                                  onSearch={handleEmployeeSearch}
                                  searching={employeeSearching}
                                />
                              )}
                              {expenseData.receiverType === "MANUAL" && (
                                <input
                                  type="text"
                                  value={expenseData.receiverName}
                                  onChange={(e) =>
                                    setExpenseData({
                                      ...expenseData,
                                      receiverName: e.target.value,
                                    })
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                  placeholder="Enter payee name"
                                />
                              )}
                            </div>
                          </>
                        )}

                        {expenseData.patientSubTab === "expense" && (
                          <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Expense Type{" "}
                              <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={expenseData.expenseType}
                              onChange={(e) =>
                                setExpenseData({
                                  ...expenseData,
                                  expenseType: e.target.value,
                                })
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            >
                              <option value="">Select Type</option>
                              {PATIENT_EXPENSE_SUBTYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {expenseData.patientSubTab === "commission" &&
                          expenseData.receiverId && (
                            <div className="mt-4 bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Owed</span>
                                <span className="font-semibold text-gray-900">
                                  {payablesLoading ? "…" : formatCurrency(payableSummary?.totalOwed)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Paid</span>
                                <span className="font-semibold text-emerald-700">
                                  {payablesLoading ? "…" : formatCurrency(payableSummary?.totalPaid)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Pending</span>
                                <span className="font-bold text-rose-600">
                                  {payablesLoading ? "…" : formatCurrency(payableSummary?.totalPending)}
                                </span>
                              </div>
                            </div>
                          )}

                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Amount (₹) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            value={expenseData.amount}
                            onChange={(e) =>
                              setExpenseData({
                                ...expenseData,
                                amount: e.target.value,
                              })
                            }
                            min="0"
                            readOnly={hasAdvanceAllocations}
                            className={`w-full px-3 py-2 border border-gray-300 rounded-lg ${
                              hasAdvanceAllocations ? "bg-gray-100 text-gray-500" : ""
                            }`}
                            placeholder="0"
                          />
                          {hasAdvanceAllocations && (
                            <p className="mt-1 text-xs text-gray-500">
                              Auto-calculated from payable pending − advance applied. Untick every
                              advance to edit.
                            </p>
                          )}
                        </div>
                        {expenseData.patientSubTab === "commission" && renderPayableActions()}
                      </div>
                    )}

                    {expenseData.expenseSection === "rent" && (
                      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Category <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={expenseData.payableCategory}
                          onChange={(e) =>
                            setExpenseData({
                              ...expenseData,
                              payableCategory: e.target.value,
                              rentSubType: "",
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
                        >
                          {mdPayableDropdown.filter((cat) => cat !== "Incentive").map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>

                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {expenseData.payableCategory} Sub-type <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={expenseData.rentSubType}
                          onChange={(e) =>
                            setExpenseData({
                              ...expenseData,
                              rentSubType: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        >
                          <option value="">Select</option>
                          {getExpenseTypes(expenseData.payableCategory).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>

                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Vendor <span className="text-gray-400 font-normal">(optional — leave blank for the shared bucket)</span>
                          </label>
                          <SearchableSelect
                            options={vendors}
                            value={expenseData.payableVendorId}
                            onChange={(v) => setExpenseData({ ...expenseData, payableVendorId: v })}
                            placeholder="Search a vendor to see their individual bills…"
                            valueKey="_id"
                            formatOption={(v) => `${v.name} - ${v.contact}`}
                          />
                          {expenseData.payableVendorId && (
                            <p className="text-xs text-gray-400 mt-1">
                              Showing only this vendor's own bills under "{expenseData.payableCategory}" — clear the
                              vendor to go back to the shared bucket.
                            </p>
                          )}
                        </div>

                        {expenseData.rentSubType && (
                          <div className="mt-4 bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">Owed</span>
                              <span className="font-semibold text-gray-900">
                                {payablesLoading ? "…" : formatCurrency(payableSummary?.totalOwed)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">Paid</span>
                              <span className="font-semibold text-emerald-700">
                                {payablesLoading ? "…" : formatCurrency(payableSummary?.totalPaid)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">Pending</span>
                              <span className="font-bold text-rose-600">
                                {payablesLoading ? "…" : formatCurrency(payableSummary?.totalPending)}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Amount (₹) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            value={expenseData.amount}
                            onChange={(e) =>
                              setExpenseData({
                                ...expenseData,
                                amount: e.target.value,
                              })
                            }
                            min="0"
                            readOnly={hasAdvanceAllocations}
                            className={`w-full px-3 py-2 border border-gray-300 rounded-lg ${
                              hasAdvanceAllocations ? "bg-gray-100 text-gray-500" : ""
                            }`}
                            placeholder="0"
                          />
                          {hasAdvanceAllocations && (
                            <p className="mt-1 text-xs text-gray-500">
                              Auto-calculated from payable pending − advance applied. Untick every
                              advance to edit.
                            </p>
                          )}
                        </div>
                        {renderPayableActions()}
                      </div>
                    )}

                    {expenseData.expenseSection === "other" && (
                      <>
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                          <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            Vendor Information
                          </h3>
                          <div className="mb-4">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={!expenseData.isVendor}
                                onChange={(e) =>
                                  setExpenseData({
                                    ...expenseData,
                                    isVendor: !e.target.checked,
                                  })
                                }
                                className="rounded border-gray-300 text-indigo-600"
                              />
                              <span className="text-sm font-medium text-gray-700">
                                Enter Manually
                              </span>
                            </label>
                          </div>
                          {expenseData.isVendor ? (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Select Vendor{" "}
                                <span className="text-red-500">*</span>
                              </label>
                              <SearchableSelect
                                options={vendors}
                                value={expenseData.vendorId}
                                onChange={(v) =>
                                  setExpenseData({ ...expenseData, vendorId: v })
                                }
                                placeholder="Choose a vendor"
                                valueKey="_id"
                                formatOption={(v) => `${v.name} - ${v.contact}`}
                              />
                            </div>
                          ) : (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Payee Name{" "}
                                <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={expenseData.expenseGiverName}
                                onChange={(e) =>
                                  setExpenseData({
                                    ...expenseData,
                                    expenseGiverName: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                placeholder="Enter payee name"
                              />
                            </div>
                          )}
                        </div>

                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                          <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            Expense Details
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Expense Category{" "}
                                <span className="text-red-500">*</span>
                              </label>
                              <select
                                value={expenseData.expenseCategory}
                                onChange={(e) =>
                                  setExpenseData({
                                    ...expenseData,
                                    expenseCategory: e.target.value,
                                    expenseType: "",
                                  })
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              >
                                <option value="">Select Category</option>
                                {OTHER_EXPENSE_CATEGORIES_DYN.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Expense Type{" "}
                                <span className="text-red-500">*</span>
                              </label>
                              <select
                                value={expenseData.expenseType}
                                onChange={(e) =>
                                  setExpenseData({
                                    ...expenseData,
                                    expenseType: e.target.value,
                                  })
                                }
                                disabled={!expenseData.expenseCategory}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                              >
                                <option value="">Select Type</option>
                                {getExpenseTypes(
                                  expenseData.expenseCategory,
                                ).map((type) => (
                                  <option key={type} value={type}>
                                    {type}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Amount (₹){" "}
                                <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="number"
                                value={expenseData.amount}
                                onChange={(e) =>
                                  setExpenseData({
                                    ...expenseData,
                                    amount: e.target.value,
                                  })
                                }
                                min="0"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                placeholder={
                                  expenseData.includeGST ? "Base amount (excl. GST)" : "Enter amount"
                                }
                              />
                            </div>
                          </div>

                          <div className="mt-4">
                            <TaxBreakdownFields
                              tone="plain"
                              allowTDS={false}
                              baseAmount={expenseData.amount}
                              value={expenseData}
                              onChange={(patch) => setExpenseData((d) => ({ ...d, ...patch }))}
                            />
                          </div>

                          {expenseData.expenseCategory === "Taxes" &&
                            expenseData.expenseType && (
                              <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Owed</span>
                                    <span className="font-semibold text-gray-900">
                                      {payablesLoading
                                        ? "…"
                                        : formatCurrency(payableSummary?.totalOwed)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Paid</span>
                                    <span className="font-semibold text-emerald-700">
                                      {payablesLoading
                                        ? "…"
                                        : formatCurrency(payableSummary?.totalPaid)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Pending</span>
                                    <span className="font-bold text-rose-600">
                                      {payablesLoading
                                        ? "…"
                                        : formatCurrency(payableSummary?.totalPending)}
                                    </span>
                                  </div>
                                </div>
                                {renderPayableActions()}
                              </div>
                            )}
                        </div>
                      </>
                    )}

                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Transaction Details
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Payment Method
                          </label>
                          <select
                            value={expenseData.method}
                            onChange={(e) =>
                              setExpenseData({
                                ...expenseData,
                                method: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            {withLegacyMethod(
                              getMethodOptions("EXPENSE"),
                              expenseData.method,
                            ).map((o) => (
                              <option key={o.value} value={o.value} disabled={o.disabled}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          {expenseData.method === "offset_settlement" && (
                            <p className="text-xs text-amber-600 mt-1">
                              No cash movement; settles against an existing balance
                            </p>
                          )}
                        </div>
                        {expenseData.method === "paid_by_other" && (
                          <ExternalPartyFields
                            direction="PAID_BY"
                            value={expenseData.externalParty}
                            onChange={(externalParty) =>
                              setExpenseData((prev) => ({ ...prev, externalParty }))
                            }
                          />
                        )}
                        <BankRoutingFields
                          costType="Expenses"
                          method={expenseData.method}
                          furtherMode={expenseData.furtherMode}
                          onChange={({ furtherMode }) =>
                            setExpenseData((prev) => ({ ...prev, furtherMode }))
                          }
                          collapsible
                        />
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Transaction ID
                            {getPaymentIdConfig(expenseData.method)
                              .required && (
                              <span className="text-red-500 ml-1">*</span>
                            )}
                          </label>
                          <input
                            type="text"
                            value={expenseData.paymentId}
                            onChange={(e) =>
                              setExpenseData({
                                ...expenseData,
                                paymentId: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder={
                              getPaymentIdConfig(expenseData.method)
                                .placeholder
                            }
                          />
                        </div>
                        {(
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Branch
                            </label>
                            <select
                              value={expenseData.branch}
                              onChange={(e) =>
                                setExpenseData({
                                  ...expenseData,
                                  branch: e.target.value,
                                })
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            >
                              <option value="Delhi">Delhi</option>
                              <option value="Mumbai">Mumbai</option>
                              <option value="Hyderabad">Hyderabad</option>
                              <option value="Noida">Noida</option>
                              <option value="Patna">Patna</option>
                              <option value="Gujarat">Gujarat</option>
                              <option value="Kolkata">Kolkata</option>
                              <option value="Ahmedabad">Ahmedabad</option>
                              <option value="Jaipur">Jaipur</option>
                              <option value="Bengaluru">Bengaluru</option>
                              <option value="Pune">Pune</option>
                              <option value="Lucknow">Lucknow</option>
                              <option value="Chennai">Chennai</option>
                              <option value="Jammu">Jammu</option>
                              <option value="Kashmir">Kashmir</option>
                              <option value="Ranchi">Ranchi</option>
                              <option value="Prayagraj">Prayagraj</option>
                              <option value="Chandigarh">Chandigarh</option>
                              <option value="Jalandhar">Jalandhar</option>
                              <option value="Indore">Indore</option>
                              <option value="Bhopal">Bhopal</option>
                              <option value="Nagpur">Nagpur</option>
                              <option value="Dehradun">Dehradun</option>
                            </select>
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Date
                          </label>
                          <input
                            type="date"
                            value={expenseData.date}
                            onChange={(e) =>
                              setExpenseData({
                                ...expenseData,
                                date: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Remarks
                          </label>
                          <textarea
                            value={expenseData.remarks}
                            onChange={(e) =>
                              setExpenseData({
                                ...expenseData,
                                remarks: e.target.value,
                              })
                            }
                            rows="2"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="Additional notes"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <ReceiptUpload
                            receipts={expenseData.receipts || []}
                            onChange={(receipts) =>
                              setExpenseData((prev) => ({ ...prev, receipts }))
                            }
                            section="expense"
                            patientId={expenseData.patientId || undefined}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sticky top-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Expense Summary
                      </h3>
                      <div className="space-y-3">
                        <div className="border-t border-gray-200 pt-3">
                          <div className="flex justify-between items-center">
                            <span className="text-lg font-bold text-gray-900">
                              Total Amount:
                            </span>
                            <span className="text-2xl font-bold text-indigo-600">
                              {formatCurrency(expenseData.amount)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {payableAction === "create" ? (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-6">
                          Use the <strong>Save as Owed</strong> button above to record this payable
                          — this button is for direct payments only.
                        </p>
                      ) : (
                        <button
                          onClick={handleSaveExpense}
                          disabled={loading}
                          className="w-full mt-6 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
                        >
                          {loading ? (
                            "Saving..."
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <Save className="w-4 h-4" />
                              {hasAdvanceAllocations && advanceNet === 0
                                ? "Settle & Close"
                                : payableAction === "pay"
                                  ? "Record Payment"
                                  : "Save Expense"}
                            </div>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
