"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import usePatientPicker from "@/lib/usePatientPicker";
import RevenueSection from "@/components/RevenueSection";
import DirectExpenseSection from "@/components/DirectExpenseSection";
import { useSession } from "next-auth/react";
import { getExpenseTypes } from "@/constants/expenseCategories";
import { fetchWithLinkedConfirm } from "@/lib/fetchWithLinkedConfirm";
import { payableGroupForPurpose } from "@/constants/payableGroups";
import {
  ArrowLeft,
  Scissors,
  Heart,
  Pill,
  Receipt,
  Loader2,
  CheckCircle,
} from "lucide-react";

export default function EditTransactionPage() {
  const router = useRouter();
  const params = useParams();
  const transactionId = params.id;
  const { data: session } = useSession();

  const [activeTab, setActiveTab] = useState("transplant");
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const picker = usePatientPicker();
  const [medicines, setMedicines] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [transaction, setTransaction] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const [linkedInfo, setLinkedInfo] = useState(null);
  const [linkedLoading, setLinkedLoading] = useState(false);

  const [transplantData, setTransplantData] = useState({
    patient: "",
    procedure: "Sapphire FUE",
    paymentType: "Booking",
    amount: "",
    discount: 0,
    method: "cash",
    paymentId: "",
    date: new Date().toISOString().split("T")[0],
    branch: session?.user?.branch || "Delhi",
    remarks: "",
    receiptMode: "",
    furtherMode: "",
    externalParty: { name: "", method: "", partyKind: "MANUAL", partyRefId: "" },
    receipts: [],
    receivableId: "",
  });

  const [serviceData, setServiceData] = useState({
    patient: "",
    patientName: "",
    patientPhone: "",
    isWalkIn: false,
    procedure: "PRP",
    quantity: 1,
    perSessionCost: "",
    discount: 0,
    method: "cash",
    paymentId: "",
    date: new Date().toISOString().split("T")[0],
    branch: session?.user?.branch || "Delhi",
    remarks: "",
    receiptMode: "",
    furtherMode: "",
    externalParty: { name: "", method: "", partyKind: "MANUAL", partyRefId: "" },
    receipts: [],
    receivableId: "",
  });

  const [medicineData, setMedicineData] = useState({
    patient: "",
    patientName: "",
    patientPhone: "",
    isWalkIn: false,
    medicineId: "",
    medicineName: "",
    quantity: 1,
    perUnitCost: "",
    discount: 0,
    method: "cash",
    paymentId: "",
    date: new Date().toISOString().split("T")[0],
    branch: session?.user?.branch || "Delhi",
    remarks: "",
    receiptMode: "",
    furtherMode: "",
    externalParty: { name: "", method: "", partyKind: "MANUAL", partyRefId: "" },
    receipts: [],
    receivableId: "",
  });

  const [expenseData, setExpenseData] = useState({
    expenseCategory: "",
    expenseType: "",
    isVendor: true,
    vendorId: "",
    expenseGiverName: "",
    amount: "",
    method: "cash",
    paymentId: "",
    date: new Date().toISOString().split("T")[0],
    branch: session?.user?.branch || "Delhi",
    remarks: "",
    receipts: [],
    furtherMode: "",
    externalParty: { name: "", method: "", partyKind: "MANUAL", partyRefId: "" },
  });

  const showToast = (message, type = "info") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "" });
    }, 3000);
  };

  useEffect(() => {
    if (transactionId) {
      fetchData();
    }
  }, [transactionId]);

  const fetchData = async () => {
    setFetchLoading(true);
    try {
      const [transRes] = await Promise.all([
        fetch(`/api/transactions/get-by-id?id=${transactionId}`),

        (async () => {
          try {
            const medicinesRes = await fetch("/api/stocks/get");
            if (medicinesRes.ok) {
              const medicinesData = await medicinesRes.json();
              setMedicines(medicinesData.data || medicinesData.stocks || []);
            }
          } catch (error) {
            console.error("Error fetching medicines:", error);
          }
        })(),

        (async () => {
          try {
            const vendorsRes = await fetch("/api/vendors/get");
            if (vendorsRes.ok) {
              const vendorsData = await vendorsRes.json();
              setVendors(vendorsData.data || vendorsData.vendors || []);
            }
          } catch (error) {
            console.error("Error fetching vendors:", error);
          }
        })(),
      ]);

      if (!transRes.ok) {
        showToast("Transaction not found", "error");
        setTimeout(() => router.back(), 2000);
        return;
      }

      const data = await transRes.json();
      if (!data.success || !data.transaction) {
        showToast("Transaction not found", "error");
        setTimeout(() => router.back(), 2000);
        return;
      }

      setTransaction(data.transaction);
      prefillFormData(data.transaction);
      fetchLinkedInfo(data.transaction);
    } catch (error) {
      console.error("Error in fetchData:", error);
      showToast("Failed to load transaction data", "error");
    } finally {
      setFetchLoading(false);
    }
  };

  const fetchLinkedInfo = async (trans) => {
    const linkedReceivableId = trans.receivableId || trans.externalParty?.linkedReceivableId;
    const linkedPayableId = trans.payableId || trans.externalParty?.linkedPayableId;
    if (!linkedReceivableId && !linkedPayableId) return;

    setLinkedLoading(true);
    try {
      if (linkedReceivableId) {
        const res = await fetch(`/api/receivables/${linkedReceivableId}`);
        const data = await res.json();
        if (res.ok) setLinkedInfo({ type: "receivable", data: data.receivable });
      } else {
        const res = await fetch(`/api/payables/${linkedPayableId}`);
        const data = await res.json();
        if (res.ok) setLinkedInfo({ type: "payable", data: data.payable });
      }
    } catch (error) {
      console.error("Error fetching linked receivable/payable:", error);
    } finally {
      setLinkedLoading(false);
    }
  };

  const prefillFormData = (trans) => {
    console.log("Transaction data:", trans);

    let category = trans.transactionCategory;

    if (!category) {
      if (trans.costType === "Revenue") {
        if (
          ["Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant"].includes(
            trans.procedure,
          )
        ) {
          category = "TRANSPLANT";
        } else if (["PRP", "GFC"].includes(trans.procedure)) {
          category = "SERVICE";
        } else if (trans.procedure === "Medicine" || trans.medicineId) {
          category = "MEDICINE";
        }
      } else if (
        trans.costType === "Expense" ||
        trans.costType === "Expenses"
      ) {
        category = "EXPENSE";
      }
    }

    const formattedDate = trans.date
      ? new Date(trans.date).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    const patientId =
      typeof trans.patient === "object" && trans.patient !== null
        ? trans.patient._id
        : trans.patient || "";
    if (
      typeof trans.patient === "object" &&
      trans.patient !== null &&
      patientId
    ) {
      picker.addToCache(trans.patient);
    }

    console.log("Category:", category);
    console.log("Patient ID:", patientId);

    switch (category) {
      case "TRANSPLANT":
        setActiveTab("transplant");
        setTransplantData({
          patient: patientId,
          procedure: trans.procedure || "Sapphire FUE",
          paymentType: trans.paymentType || "Booking",
          amount: trans.amount?.toString() || "",
          discount: trans.discount || 0,
          method: trans.method || "cash",
          paymentId: trans.paymentId || "",
          date: formattedDate,
          branch: trans.branch || "Delhi",
          remarks: trans.remarks || "",
          receiptMode: trans.receiptMode || "",
          furtherMode: trans.furtherMode || "",
          externalParty: trans.externalParty || { name: "", method: "", partyKind: "MANUAL", partyRefId: "" },
          receipts: trans.receipts || [],
          receivableId: trans.receivableId || "",
        });
        break;

      case "SERVICE":
        setActiveTab("service");
        const isServiceWalkIn = !patientId;

        setServiceData({
          patient: patientId,
          patientName: trans.patientName || "",
          patientPhone: trans.patientPhone || "",
          isWalkIn: isServiceWalkIn,
          procedure: trans.procedure || "PRP",
          quantity: trans.quantity || 1,
          perSessionCost: trans.perSessionCost?.toString() || "",
          discount: trans.discount || 0,
          method: trans.method || "cash",
          paymentId: trans.paymentId || "",
          date: formattedDate,
          branch: trans.branch || "Delhi",
          remarks: trans.remarks || "",
          receiptMode: trans.receiptMode || "",
          furtherMode: trans.furtherMode || "",
          externalParty: trans.externalParty || { name: "", method: "", partyKind: "MANUAL", partyRefId: "" },
          receipts: trans.receipts || [],
          receivableId: trans.receivableId || "",
        });

        console.log("Service Data Set:", {
          patient: patientId,
          patientName: trans.patientName,
          patientPhone: trans.patientPhone,
          isWalkIn: isServiceWalkIn,
          procedure: trans.procedure,
          quantity: trans.quantity,
          perSessionCost: trans.perSessionCost,
        });
        break;

      case "MEDICINE":
        setActiveTab("medicine");
        const isMedicineWalkIn = !patientId;

        const medicineIdValue =
          typeof trans.medicineId === "object" && trans.medicineId !== null
            ? trans.medicineId._id
            : trans.medicineId || "";

        const medicineName =
          typeof trans.medicineId === "object" && trans.medicineId !== null
            ? trans.medicineId.name
            : "";

        setMedicineData({
          patient: patientId,
          patientName: trans.patientName || "",
          patientPhone: trans.patientPhone || "",
          isWalkIn: isMedicineWalkIn,
          medicineId: medicineIdValue,
          medicineName: medicineName,
          quantity: trans.quantity || 1,
          perUnitCost: trans.perUnitCost?.toString() || "",
          discount: trans.discount || 0,
          method: trans.method || "cash",
          paymentId: trans.paymentId || "",
          date: formattedDate,
          branch: trans.branch || "Delhi",
          remarks: trans.remarks || "",
          receiptMode: trans.receiptMode || "",
          furtherMode: trans.furtherMode || "",
          externalParty: trans.externalParty || { name: "", method: "", partyKind: "MANUAL", partyRefId: "" },
          receipts: trans.receipts || [],
          receivableId: trans.receivableId || "",
        });

        console.log("Medicine Data Set:", {
          patient: patientId,
          patientName: trans.patientName,
          patientPhone: trans.patientPhone,
          isWalkIn: isMedicineWalkIn,
          medicineId: medicineIdValue,
          medicineName: medicineName,
          quantity: trans.quantity,
          perUnitCost: trans.perUnitCost,
        });
        break;

      case "EXPENSE":
        setActiveTab("expense");
        const isVendor = trans.expenseGiver?.type === "VENDOR";

        const vendorIdValue =
          typeof trans.expenseGiver?.vendorId === "object" &&
          trans.expenseGiver?.vendorId !== null
            ? trans.expenseGiver.vendorId._id
            : trans.expenseGiver?.vendorId || "";

        setExpenseData({
          expenseCategory: trans.expense || trans.expenseCategory || "",
          expenseType: trans.expenseType || "",
          isVendor: isVendor,
          vendorId: vendorIdValue,
          expenseGiverName: !isVendor ? trans.expenseGiver?.name || "" : "",
          amount: trans.amount?.toString() || "",
          method: trans.method || "cash",
          paymentId: trans.paymentId || "",
          date: formattedDate,
          branch: trans.branch || "Delhi",
          remarks: trans.remarks || "",
          receipts: trans.receipts || [],
          furtherMode: trans.furtherMode || "",
          externalParty: trans.externalParty || { name: "", method: "", partyKind: "MANUAL", partyRefId: "" },
        });
        break;

      default:
        console.warn("Could not determine transaction category", trans);
        setActiveTab("transplant");
        break;
    }
  };


  const handleUpdateTransplant = async () => {
    if (!transplantData.patient) {
      showToast("Please select a patient", "error");
      return;
    }
    if (!transplantData.amount) {
      showToast("Please enter amount", "error");
      return;
    }
    if (transplantData.method !== "cash" && !transplantData.paymentId) {
      showToast(
        transplantData.method === "card"
          ? "Please enter card last no."
          : transplantData.method?.toLowerCase() === "bajaj_loan" ||
              transplantData.method?.toLowerCase() === "fibe_loan"
            ? "Please add the reference id"
            : "Please add transaction id",
        "error",
      );
      return;
    }

    setLoading(true);
    try {
      const { res, data, cancelled } = await fetchWithLinkedConfirm("/api/transactions/transplant/update", () => ({
        transactionId: transactionId,
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
        externalParty: transplantData.method === "paid_to_external" ? transplantData.externalParty : undefined,
        receipts: transplantData.receipts,
        receivableId: transplantData.receivableId || null,
      }));

      if (res.ok) {
        showToast("Transplant transaction updated successfully!", "success");
        setTimeout(() => router.back(), 1500);
      } else if (!cancelled) {
        showToast(data.message || data.error || "Failed to update transaction", "error");
      }
    } catch (error) {
      console.error("Error updating transplant:", error);
      showToast("Failed to update transplant transaction", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateService = async () => {
    if (!serviceData.isWalkIn && !serviceData.patient) {
      showToast("Please select a patient", "error");
      return;
    }
    if (
      serviceData.isWalkIn &&
      (!serviceData.patientName || !serviceData.patientPhone)
    ) {
      showToast("Please enter patient name and phone", "error");
      return;
    }
    if (!serviceData.perSessionCost) {
      showToast("Please enter per session cost", "error");
      return;
    }
    if (serviceData.method !== "cash" && !serviceData.paymentId) {
      showToast(
        serviceData.method === "card"
          ? "Please enter card last no."
          : serviceData.method?.toLowerCase() === "bajaj_loan" ||
              serviceData.method?.toLowerCase() === "fibe_loan"
            ? "Please add the reference id"
            : "Please add transaction id",
        "error",
      );
      return;
    }

    setLoading(true);
    try {
      const { res, data, cancelled } = await fetchWithLinkedConfirm("/api/transactions/service/update", () => ({
        transactionId: transactionId,
        patientId: serviceData.isWalkIn ? null : serviceData.patient,
        patientName: serviceData.patientName,
        patientPhone: serviceData.patientPhone,
        procedure: serviceData.procedure,
        quantity: serviceData.quantity,
        perSessionCost: serviceData.perSessionCost,
        discount: serviceData.discount,
        method: serviceData.method,
        paymentId: serviceData.paymentId,
        branch: serviceData.branch,
        date: serviceData.date,
        remarks: serviceData.remarks,
        receiptMode: serviceData.receiptMode,
        furtherMode: serviceData.furtherMode,
        externalParty: serviceData.method === "paid_to_external" ? serviceData.externalParty : undefined,
        receipts: serviceData.receipts,
        receivableId: serviceData.receivableId || null,
      }));

      if (res.ok) {
        showToast("Service transaction updated successfully!", "success");
        setTimeout(() => router.back(), 1500);
      } else if (!cancelled) {
        showToast(data.message || data.error || "Failed to update transaction", "error");
      }
    } catch (error) {
      console.error("Error updating service:", error);
      showToast("Failed to update service transaction", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleMedicineSelect = (medicineId) => {
    const medicine = medicines.find((m) => m._id === medicineId);
    if (medicine) {
      setMedicineData({
        ...medicineData,
        medicineId,
        medicineName: medicine.name,
        perUnitCost: medicine.soldAmt || medicine.mrp || "",
      });
    }
  };

  const handleUpdateMedicine = async () => {
    if (!medicineData.medicineId) {
      showToast("Please select a medicine", "error");
      return;
    }
    if (!medicineData.isWalkIn && !medicineData.patient) {
      showToast("Please select a patient", "error");
      return;
    }
    if (
      medicineData.isWalkIn &&
      (!medicineData.patientName || !medicineData.patientPhone)
    ) {
      showToast("Please enter customer name and phone", "error");
      return;
    }
    if (medicineData.method !== "cash" && !medicineData.paymentId) {
      showToast(
        medicineData.method === "card"
          ? "Please enter card last no."
          : medicineData.method?.toLowerCase() === "bajaj_loan" ||
              medicineData.method?.toLowerCase() === "fibe_loan"
            ? "Please add the reference id"
            : "Please add transaction id",
        "error",
      );
      return;
    }

    setLoading(true);
    try {
      const { res, data, cancelled } = await fetchWithLinkedConfirm("/api/transactions/medicine/update", () => ({
        transactionId: transactionId,
        patientId: medicineData.isWalkIn ? null : medicineData.patient,
        patientName: medicineData.patientName,
        patientPhone: medicineData.patientPhone,
        medicineId: medicineData.medicineId,
        quantity: medicineData.quantity,
        perUnitCost: medicineData.perUnitCost,
        discount: medicineData.discount,
        method: medicineData.method,
        paymentId: medicineData.paymentId,
        branch: medicineData.branch,
        date: medicineData.date,
        remarks: medicineData.remarks,
        receiptMode: medicineData.receiptMode,
        furtherMode: medicineData.furtherMode,
        externalParty: medicineData.method === "paid_to_external" ? medicineData.externalParty : undefined,
        receipts: medicineData.receipts,
        receivableId: medicineData.receivableId || null,
      }));

      if (res.ok) {
        showToast("Medicine sale updated successfully!", "success");
        setTimeout(() => router.back(), 1500);
      } else if (!cancelled) {
        showToast(data.message || data.error || "Failed to update transaction", "error");
      }
    } catch (error) {
      console.error("Error updating medicine:", error);
      showToast("Failed to update medicine sale", "error");
    } finally {
      setLoading(false);
    }
  };

  const calculateExpenseTotal = () => {
    return parseFloat(expenseData.amount) || 0;
  };

  const handleUpdateExpense = async () => {
    if (!expenseData.expenseCategory) {
      showToast("Please select expense category", "error");
      return;
    }
    if (
      getExpenseTypes(expenseData.expenseCategory).length > 0 &&
      !expenseData.expenseType
    ) {
      showToast("Please select expense type", "error");
      return;
    }
    if (expenseData.isVendor && !expenseData.vendorId) {
      showToast("Please select a vendor", "error");
      return;
    }
    if (!expenseData.isVendor && !expenseData.expenseGiverName) {
      showToast("Please enter payee name", "error");
      return;
    }
    if (!expenseData.amount) {
      showToast("Please enter amount", "error");
      return;
    }
    if (expenseData.method !== "cash" && !expenseData.paymentId) {
      showToast(
        expenseData.method === "card"
          ? "Please enter card last no."
          : expenseData.method?.toLowerCase() === "bajaj_loan" ||
              expenseData.method?.toLowerCase() === "fibe_loan"
            ? "Please add the reference id"
            : "Please add transaction id",
        "error",
      );
      return;
    }

    setLoading(true);
    try {
      const vendor = vendors.find((v) => v._id === expenseData.vendorId);
      const { res, data, cancelled } = await fetchWithLinkedConfirm("/api/transactions/expense/update", () => ({
        transactionId: transactionId,
        expenseCategory: expenseData.expenseCategory,
        expenseType: expenseData.expenseType,
        expenseGiver: {
          type: expenseData.isVendor ? "VENDOR" : "MANUAL",
          vendorId: expenseData.isVendor ? expenseData.vendorId : "",
          name: expenseData.isVendor
            ? vendor?.name
            : expenseData.expenseGiverName,
        },
        amount: expenseData.amount,
        method: expenseData.method,
        paymentId: expenseData.paymentId,
        branch: expenseData.branch,
        date: expenseData.date,
        remarks: expenseData.remarks,
        receipts: expenseData.receipts,
        furtherMode: expenseData.furtherMode,
        externalParty: expenseData.method === "paid_by_other" ? expenseData.externalParty : undefined,
      }));

      if (res.ok) {
        if (data.warning) {
          showToast(data.warning, "info");
          setTimeout(() => router.back(), 4000);
        } else {
          showToast("Expense transaction updated successfully!", "success");
          setTimeout(() => router.back(), 1500);
        }
      } else if (!cancelled) {
        showToast(data.message || data.error || "Failed to update transaction", "error");
      }
    } catch (error) {
      console.error("Error updating expense:", error);
      showToast("Failed to update expense transaction", "error");
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-indigo-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading transaction data...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600">Transaction not found</p>
            <button
              onClick={() => router.back()}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg"
            >
              Go Back
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">

      {toast.show && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div
            className={`px-6 py-4 rounded-xl shadow-lg border-2 flex items-center gap-3 ${
              toast.type === "success"
                ? "bg-green-50 border-green-200 text-green-800"
                : toast.type === "error"
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
            }`}
          >
            {toast.type === "success" && <CheckCircle className="w-5 h-5" />}
            {toast.type === "error" && (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            <div className="mb-6 flex justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Edit Transaction
                </h1>
                <p className="text-gray-600 mt-1">
                  Update transaction details
                  {transaction?.batchId && (
                    <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
                      Batch: {transaction.batchId.slice(-8)}
                    </span>
                  )}
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
              <div className="flex gap-4">
                <button
                  disabled={true}
                  className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                    activeTab === "transplant"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Scissors className="w-4 h-4" />
                    Transplant
                  </div>
                </button>
                <button
                  disabled={true}
                  className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                    activeTab === "service"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4" />
                    Service (PRP/GFC)
                  </div>
                </button>
                <button
                  disabled={true}
                  className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                    activeTab === "medicine"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Pill className="w-4 h-4" />
                    Medicine Sale
                  </div>
                </button>
                <button
                  disabled={true}
                  className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                    activeTab === "expense"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4" />
                    Expense
                  </div>
                </button>
              </div>
            </div>

            {(linkedLoading || linkedInfo) && (
              <div className="mb-6 p-4 bg-white border border-slate-200 rounded-lg max-w-sm">
                <p className="text-sm font-semibold text-slate-700 mb-2">
                  Linked {linkedInfo?.type === "payable" ? "Payable" : "Receivable"}
                </p>
                {linkedLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                ) : linkedInfo?.data ? (
                  <dl className="space-y-1 text-sm text-slate-600">
                    <div className="flex justify-between"><dt>Total</dt><dd>₹{Number(linkedInfo.data.totalAmount || 0).toLocaleString("en-IN")}</dd></div>
                    <div className="flex justify-between">
                      <dt>{linkedInfo.type === "payable" ? "Paid" : "Received"}</dt>
                      <dd>₹{Number((linkedInfo.data.paid ?? linkedInfo.data.received) || 0).toLocaleString("en-IN")}</dd>
                    </div>
                    <div className="flex justify-between font-medium text-rose-600"><dt>Pending</dt><dd>₹{Number(linkedInfo.data.pending || 0).toLocaleString("en-IN")}</dd></div>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          linkedInfo.type === "payable"
                            ? `/admin/liabilities/payables/${payableGroupForPurpose(linkedInfo.data.purpose)}?doc=${linkedInfo.data._id}`
                            : `/admin/assets/receivables?doc=${linkedInfo.data._id}`,
                        )
                      }
                      className="mt-1 text-indigo-600 hover:underline text-xs font-medium"
                    >
                      Manage in {linkedInfo.type === "payable" ? "Liabilities" : "Assets"} →
                    </button>
                  </dl>
                ) : (
                  <p className="text-slate-400 text-sm">Not found</p>
                )}
              </div>
            )}

            {activeTab === "transplant" && (
              <RevenueSection
                key={transactionId}
                category="TRANSPLANT"
                data={transplantData}
                onChange={setTransplantData}
                picker={picker}
                patientLabel={picker.options.find((p) => p._id === transplantData.patient)?.personal?.name}
                onSave={handleUpdateTransplant}
                saving={loading}
                saveLabel="Update Transaction"
                forEdit
              />
            )}

            {activeTab === "service" && (
              <RevenueSection
                key={transactionId}
                category="SERVICE"
                data={serviceData}
                onChange={setServiceData}
                picker={picker}
                singleItem
                medicines={medicines}
                patientLabel={
                  serviceData.isWalkIn
                    ? serviceData.patientName
                    : picker.options.find((p) => p._id === serviceData.patient)?.personal?.name
                }
                onSave={handleUpdateService}
                saving={loading}
                saveLabel="Update Service"
                forEdit
              />
            )}

            {activeTab === "medicine" && (
              <RevenueSection
                key={transactionId}
                category="MEDICINE"
                data={medicineData}
                onChange={setMedicineData}
                picker={picker}
                singleItem
                medicines={medicines}
                patientLabel={
                  medicineData.isWalkIn
                    ? medicineData.patientName
                    : picker.options.find((p) => p._id === medicineData.patient)?.personal?.name
                }
                onSave={handleUpdateMedicine}
                saving={loading}
                saveLabel="Update Medicine"
                forEdit
              />
            )}

            {activeTab === "expense" && (
              <DirectExpenseSection
                key={transactionId}
                data={expenseData}
                onChange={setExpenseData}
                vendors={vendors}
                onSave={handleUpdateExpense}
                saving={loading}
                saveLabel="Update Expense"
                forEdit
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
