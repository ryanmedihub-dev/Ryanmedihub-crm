"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebars/CollabSidebar";
import usePatientPicker from "@/lib/usePatientPicker";
import RevenueSection from "@/components/RevenueSection";
import CollabCaseForm from "@/components/CollabCaseForm";
import CollabSettlementPanel from "@/components/CollabSettlementPanel";
import IncentiveEntryForm from "@/components/IncentiveEntryForm";
import { useSession } from "next-auth/react";
import { COLLAB_BRANCHES } from "@/lib/branches";
import {
  ArrowLeft,
  Scissors,
  Heart,
  Pill,
  Receipt,
  Building2,
  Gift,
} from "lucide-react";

const getTodayIST = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export default function AllTransactionsPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const [activeTab, setActiveTab] = useState("transplant");
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const picker = usePatientPicker();
  const [medicines, setMedicines] = useState([]);

  const [transplantData, setTransplantData] = useState({
    patient: "",
    procedure: "Sapphire FUE",
    paymentType: "Booking",
    amount: "",
    discount: 0,
    method: "cash",
    paymentId: "",
    date: getTodayIST(),
    branch: "",
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
    branch: "",
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
    branch: "",
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

  useEffect(() => {
    fetchData();
  }, []);

  const branchTouchedRef = useRef({
    transplant: false,
    service: false,
    medicine: false,
  });

  useEffect(() => {
    const userBranch = session?.user?.branch;
    if (!userBranch || userBranch === "All" || userBranch === "Collab") return;
    const touched = branchTouchedRef.current;
    if (!touched.transplant) setTransplantData((d) => ({ ...d, branch: userBranch }));
    if (!touched.service) setServiceData((d) => ({ ...d, branch: userBranch }));
    if (!touched.medicine) setMedicineData((d) => ({ ...d, branch: userBranch }));
  }, [session?.user?.branch]);

  const handleTransplantChange = (newData) => {
    if (newData.branch !== transplantData.branch) branchTouchedRef.current.transplant = true;
    setTransplantData(newData);
  };
  const handleServiceChange = (newData) => {
    if (newData.branch !== serviceData.branch) branchTouchedRef.current.service = true;
    setServiceData(newData);
  };
  const handleMedicineChange = (newData) => {
    if (newData.branch !== medicineData.branch) branchTouchedRef.current.medicine = true;
    setMedicineData(newData);
  };

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
      alert(transplantData.method === "card" ? "Please enter card last no." : transplantData.method?.toLowerCase() === "bajaj_loan" || transplantData.method?.toLowerCase() === "fibe_loan" ? "Please add the reference id" : "Please add transaction id");
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
        router.push("/collab/transactions");
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
      alert(serviceData.method === "card" ? "Please enter card last no." : serviceData.method?.toLowerCase() === "bajaj_loan" || serviceData.method?.toLowerCase() === "fibe_loan" ? "Please add the reference id" : "Please add transaction id");
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
        router.push("/collab/transactions");
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
    if (medicineData.method !== "cash" && medicineData.method !== "including-package" && !medicineData.paymentId) {
      alert(medicineData.method === "card" ? "Please enter card last no." : medicineData.method?.toLowerCase() === "bajaj_loan" || medicineData.method?.toLowerCase() === "fibe_loan" ? "Please add the reference id" : "Please add transaction id");
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
        router.push("/collab/transactions");
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

  if (fetchLoading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 min-w-0 flex items-center justify-center">
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

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            <div className="mb-6 flex justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-gray-900">
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
                  onClick={() => setActiveTab("collabCase")}
                  className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                    activeTab === "collabCase"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Collab Case
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
                    Settlement
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
                onChange={handleTransplantChange}
                picker={picker}
                patientLabel={picker.options.find((p) => p._id === transplantData.patient)?.personal?.name}
                onSave={handleSaveTransplant}
                saving={loading}
                saveLabel="Save Transaction"
                branches={COLLAB_BRANCHES}
              />
            )}

            {activeTab === "service" && (
              <RevenueSection
                category="SERVICE"
                data={serviceData}
                onChange={handleServiceChange}
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
                branches={COLLAB_BRANCHES}
              />
            )}

            {activeTab === "medicine" && (
              <RevenueSection
                category="MEDICINE"
                data={medicineData}
                onChange={handleMedicineChange}
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
                branches={COLLAB_BRANCHES}
              />
            )}

            {activeTab === "collabCase" && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-4xl">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">New Collab Case</h3>
                <p className="text-sm text-gray-500 mb-5">
                  Books the full package as gross revenue and derives the clinic payable or
                  receivable from what each side actually collected.
                </p>
                <CollabCaseForm
                  onSuccess={(data) => {
                    const derived =
                      data.derived === "PAYABLE"
                        ? `Payable of ₹${Number(data.derivedAmount).toLocaleString("en-IN")} created`
                        : data.derived === "RECEIVABLE"
                          ? `Receivable of ₹${Number(data.derivedAmount).toLocaleString("en-IN")} created`
                          : "no payable or receivable needed";
                    alert(`Collab case created — ${derived}`);
                    router.push("/collab/transactions");
                  }}
                />
              </div>
            )}

            {activeTab === "expense" && (
              <CollabSettlementPanel onSaved={() => router.push("/collab/transactions")} />
            )}

            {activeTab === "incentive" && <IncentiveEntryForm picker={picker} />}
          </div>
        </div>
      </main>
    </div>
  );
}
