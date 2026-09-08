"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebars/StockSidebar";
import usePatientPicker from "@/lib/usePatientPicker";
import RevenueSection from "@/components/RevenueSection";
import DirectExpenseSection from "@/components/DirectExpenseSection";
import IncentiveTabSwitcher from "@/components/IncentiveTabSwitcher";
import { MAIN_BRANCHES } from "@/lib/branches";
import { useSession } from "next-auth/react";
import { getExpenseTypes } from "@/constants/expenseCategories";
import {
  ArrowLeft,
  Scissors,
  Heart,
  Pill,
  Receipt,
  Gift,
} from "lucide-react";

const getTodayIST = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const resolveInitialBranch = (branch) =>
  branch && branch !== "All" && branch !== "Collab" ? branch : "Delhi";

export default function AllTransactionsPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const [activeTab, setActiveTab] = useState("transplant");
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const picker = usePatientPicker();
  const [medicines, setMedicines] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [transplantData, setTransplantData] = useState({
    patient: "",
    procedure: "Sapphire FUE",
    paymentType: "Booking",
    amount: "",
    discount: 0,
    method: "cash",
    paymentId: "",
    date: getTodayIST(),
    branch: resolveInitialBranch(session?.user?.branch),
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
    branch: resolveInitialBranch(session?.user?.branch),
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
    branch: resolveInitialBranch(session?.user?.branch),
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
    expenseCategory: "",
    expenseType: "",
    isVendor: true,
    vendorId: "",
    expenseGiverName: "",
    amount: "",
    method: "cash",
    paymentId: "",
    date: getTodayIST(),
    branch: resolveInitialBranch(session?.user?.branch),
    remarks: "",
    receipts: [],
    furtherMode: "",
    externalParty: { name: "", method: "", partyKind: "MANUAL", partyRefId: "" },
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setFetchLoading(true);
    try {
      try {
        const medicinesRes = await fetch("/api/stocks/get");
        if (medicinesRes.ok) {
          const medicinesData = await medicinesRes.json();
          const stocksArray = medicinesData.data || medicinesData.stocks || [];
          setMedicines(stocksArray);
        }
      } catch (error) {
        console.error("Error fetching medicines:", error);
      }

      try {
        const vendorsRes = await fetch("/api/vendors/get");
        if (vendorsRes.ok) {
          const vendorsData = await vendorsRes.json();
          setVendors(vendorsData.data || vendorsData.vendors || []);
        }
      } catch (error) {
        console.error("Error fetching vendors:", error);
      }
    } catch (error) {
      console.error("Error in fetchData:", error);
    } finally {
      setFetchLoading(false);
    }
  };


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
        alert("Transplant transaction saved successfully!");
        router.push("/stocks/transactions");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create transaction");
      }
    } catch (error) {
      console.error("Error saving transplant:", error);
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
          services: serviceItems.map((item) => ({
            procedure: item.procedure,
            quantity: item.quantity,
            perSessionCost: parseFloat(item.perSessionCost),
            totalAmount: parseFloat(item.totalAmount),
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
        alert("Service transactions saved successfully!");
        router.push("/stocks/transactions");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create transactions");
      }
    } catch (error) {
      console.error("Error saving services:", error);
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
    if (medicineData.method !== "cash" && !medicineData.paymentId) {
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
          medicines: medicineItems.map((item) => ({
            medicineId: item.medicineId,
            quantity: item.quantity,
            perUnitCost: parseFloat(item.perUnitCost),
            totalAmount: parseFloat(item.totalAmount),
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
        alert("Medicine sales saved successfully!");
        router.push("/stocks/transactions");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create transactions");
      }
    } catch (error) {
      console.error("Error saving medicines:", error);
      alert("Failed to save medicine sales");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExpense = async () => {
    if (!expenseData.expenseCategory) {
      alert("Please select expense category");
      return;
    }
    if (
      getExpenseTypes(expenseData.expenseCategory).length > 0 &&
      !expenseData.expenseType
    ) {
      alert("Please select expense type");
      return;
    }
    if (expenseData.isVendor && !expenseData.vendorId) {
      alert("Please select a vendor");
      return;
    }
    if (!expenseData.isVendor && !expenseData.expenseGiverName) {
      alert("Please enter payee name");
      return;
    }
    if (!expenseData.amount) {
      alert("Please enter amount");
      return;
    }
    if (expenseData.method !== "cash" && !expenseData.paymentId) {
      alert(
        expenseData.method === "card"
          ? "Please enter card last no."
          : expenseData.method?.toLowerCase() === "bajaj_loan" ||
              expenseData.method?.toLowerCase() === "fibe_loan"
            ? "Please add the reference id"
            : "Please add transaction id",
      );
      return;
    }
    if (
      expenseData.method === "paid_by_other" &&
      (!expenseData.externalParty.name || !expenseData.externalParty.method)
    ) {
      alert("Please enter the sender's name and payment method");
      return;
    }

    setLoading(true);
    try {
      const vendor = vendors.find((v) => v._id === expenseData.vendorId);
      const res = await fetch("/api/transactions/expense/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });

      if (res.ok) {
        alert("Expense transaction created successfully!");
        router.push("/stocks/transactions");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create transaction");
      }
    } catch (error) {
      console.error("Error saving expense:", error);
      alert("Failed to save expense transaction");
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
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
      <Sidebar />

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
              <div className="flex gap-4">
                <button
                  onClick={() => setActiveTab("transplant")}
                  className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                    activeTab === "transplant"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Scissors className="w-4 h-4" />
                    Transplant
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab("service")}
                  className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                    activeTab === "service"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4" />
                    Service (PRP/GFC)
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab("medicine")}
                  className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                    activeTab === "medicine"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Pill className="w-4 h-4" />
                    Medicine Sale
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab("expense")}
                  className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                    activeTab === "expense"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4" />
                    Expense
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab("incentive")}
                  className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                    activeTab === "incentive"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4" />
                    Incentive
                  </div>
                </button>
              </div>
            </div>

            {activeTab === "transplant" && (
              <RevenueSection
                category="TRANSPLANT"
                data={transplantData}
                onChange={setTransplantData}
                picker={picker}
                patientLabel={picker.options.find((p) => p._id === transplantData.patient)?.personal?.name}
                onSave={handleSaveTransplant}
                saving={loading}
                saveLabel="Save Transaction"
                branches={MAIN_BRANCHES}
              />
            )}

            {activeTab === "service" && (
              <RevenueSection
                category="SERVICE"
                data={serviceData}
                onChange={setServiceData}
                picker={picker}
                items={serviceItems}
                onItemsChange={setServiceItems}
                patientLabel={
                  serviceData.isWalkIn
                    ? serviceData.patientName
                    : picker.options.find((p) => p._id === serviceData.patient)?.personal?.name
                }
                onSave={handleSaveService}
                saving={loading}
                saveLabel="Save Services"
                branches={MAIN_BRANCHES}
              />
            )}

            {activeTab === "medicine" && (
              <RevenueSection
                category="MEDICINE"
                data={medicineData}
                onChange={setMedicineData}
                picker={picker}
                items={medicineItems}
                onItemsChange={setMedicineItems}
                medicines={medicines}
                patientLabel={
                  medicineData.isWalkIn
                    ? medicineData.patientName
                    : picker.options.find((p) => p._id === medicineData.patient)?.personal?.name
                }
                onSave={handleSaveMedicine}
                saving={loading}
                saveLabel="Save Medicines"
                branches={MAIN_BRANCHES}
              />
            )}

            {activeTab === "expense" && (
              <DirectExpenseSection
                data={expenseData}
                onChange={setExpenseData}
                vendors={vendors}
                onSave={handleSaveExpense}
                saving={loading}
                saveLabel="Save Expense"
                branches={MAIN_BRANCHES}
              />
            )}

            {activeTab === "incentive" && <IncentiveTabSwitcher picker={picker} />}
          </div>
        </div>
      </main>
    </div>
  );
}
