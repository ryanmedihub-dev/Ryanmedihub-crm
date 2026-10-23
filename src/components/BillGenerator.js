"use client";

import { useEffect, useState } from "react";
import Logo from "@/../public/logo-2.png";
import Logo2 from "@/../public/logo.png";
import { COLLAB_BRANCHES } from "@/lib/branches";
import {
  Loader2,
  Printer,
  Download,
  X as CloseIcon,
  FileText as Bill,
} from "lucide-react";

const CLINIC_BRANCHES = {
  Delhi: {
    img: Logo,
    name: "RYAN CLINIC",
    address: "CD 163, Block CD, Dakshini Pitampura",
    city: "Pitampura, Delhi, 110034",
    phone: "9911111247",
    website: "https://clinicryan.com",
    gstin: "07LYSP2547H2ZI",
  },
  Mumbai: {
    img: Logo2,
    name: "LA DOLCE HAIRTRANSPLANT CLINIC",
    address:
      "Bunglow No 168,S.V.P Nagar,Four Bunglow, Mhada, Andheri West, Mumbai 400053",
    phone: "8828202830",
    website: "https://clinicryan.com",
    gstin: "27ATAS4922Q1Z2",
  },
  Hyderabad: {
    img: Logo,
    name: "RYAN CLINIC",
    address:
      "2nd Floor, 8-2, 316/A/6/A, Road No. 14, above SBI bank, beside Asha hospital",
    city: "GS Nagar, Nandi Nagar, Banjara Hills, Hyderabad, Telangana 500034",
    phone: "9989497410",
    website: "https://clinicryan.com",
    gstin: "07LYSP2547H2ZI",
  },
  Noida: {
    img: Logo,
    name: "RYAN CLINIC",
    address: "Ryan Clinic, Noida",
    city: "Noida, Uttar Pradesh",
    phone: "",
    website: "https://clinicryan.com",
    gstin: "",
  },
  Gurgaon: {
    img: Logo,
    name: "RYAN CLINIC",
    address: "Ryan Clinic, Gurgaon",
    city: "Gurgaon, Haryana",
    phone: "",
    website: "https://clinicryan.com",
    gstin: "",
  },
  ...Object.fromEntries(
    COLLAB_BRANCHES.map((city) => [
      city,
      {
        img: Logo,
        name: "RYAN CLINIC",
        address: "",
        city,
        phone: "",
        website: "https://clinicryan.com",
        gstin: "",
      },
    ])
  ),
};

const formatDateForDisplay = (date) => {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
};

const formatDateTime = (date) => {
  if (!date) return "N/A";

  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
};


const formatCurrency = (amount) => {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const s = {
  page: {
    maxWidth: "800px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    padding: "32px",
    fontFamily: "Arial, sans-serif",
    fontSize: "14px",
    color: "#111111",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "24px",
    paddingBottom: "16px",
    borderBottom: "2px solid #d1d5db",
  },
  clinicName: {
    fontSize: "22px",
    fontWeight: "bold",
    marginBottom: "8px",
    margin: "0 0 8px 0",
  },
  smallText: { fontSize: "13px", color: "#374151", margin: "2px 0" },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    marginBottom: "24px",
  },
  patientName: {
    fontSize: "17px",
    fontWeight: "bold",
    margin: "0 0 8px 0",
  },
  textRight: { textAlign: "right" },
  sectionTitle: {
    textAlign: "center",
    fontSize: "18px",
    fontWeight: "bold",
    marginBottom: "16px",
  },
  subTitle: {
    fontSize: "15px",
    fontWeight: "bold",
    marginBottom: "8px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: "24px",
  },
  th: {
    border: "1px solid #9ca3af",
    padding: "8px 12px",
    backgroundColor: "#f3f4f6",
    fontWeight: "bold",
    fontSize: "13px",
  },
  td: {
    border: "1px solid #9ca3af",
    padding: "8px 12px",
    fontSize: "13px",
  },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: "8px",
  },
  footerRow: { margin: "4px 0", fontSize: "13px" },
  bold: { fontWeight: "bold" },
  red: { color: "#dc2626", fontWeight: "bold" },
};

function ServiceInvoice({ transaction, patient, consultant, branch }) {
  const clinic = CLINIC_BRANCHES[branch] || CLINIC_BRANCHES.Delhi;
  const grossAmount = parseFloat(transaction.amount) || 0;
  const discount = parseFloat(transaction.discount) || 0;
  const netAmount = grossAmount - discount;
  const invoiceNo = `#INV${transaction._id.slice(-5).toUpperCase()}`;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.clinicName}>{clinic.name}</h1>
          <p style={s.smallText}>{clinic.address}</p>
          {clinic.city && <p style={s.smallText}>{clinic.city}</p>}
          <p style={s.smallText}><strong>Phone:</strong> {clinic.phone}</p>
          <p style={s.smallText}><strong>Website:</strong> {clinic.website}</p>
          <p style={s.smallText}><strong>GST No:</strong> {clinic.gstin}</p>
        </div>
        <div style={s.textRight}>
          <img src={clinic.img.src} alt="Logo" width={120} height={120} />
        </div>
      </div>

      <div style={s.twoCol}>
        <div>
          <h2 style={s.patientName}>{patient.name}</h2>
          <p style={s.smallText}>{patient.gender}, {patient.age} Years</p>
          <p style={s.smallText}>📞 {patient.phone}</p>
        </div>
        <div style={s.textRight}>
          <p style={s.smallText}><strong>Date:</strong> {formatDateTime(transaction.date)}</p>
          <p style={s.smallText}><strong>Invoice No:</strong> {invoiceNo}</p>
        </div>
      </div>

      <h3 style={s.sectionTitle}>Invoice</h3>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, textAlign: "left" }}>S No.</th>
            <th style={{ ...s.th, textAlign: "left" }}>Services & Products</th>
            <th style={{ ...s.th, textAlign: "left" }}>Consultant</th>
            <th style={{ ...s.th, textAlign: "center" }}>Qty</th>
            <th style={{ ...s.th, textAlign: "right" }}>Unit Cost (INR)</th>
            <th style={{ ...s.th, textAlign: "right" }}>Discount (INR)</th>
            <th style={{ ...s.th, textAlign: "right" }}>Total Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={s.td}>1</td>
            <td style={s.td}>Service {transaction.procedure}</td>
            <td style={s.td}>{consultant}</td>
            <td style={{ ...s.td, textAlign: "center" }}>{transaction.quantity || 1}</td>
            <td style={{ ...s.td, textAlign: "right" }}>{grossAmount.toFixed(2)}</td>
            <td style={{ ...s.td, textAlign: "right" }}>{discount.toFixed(2)}</td>
            <td style={{ ...s.td, textAlign: "right", fontWeight: "bold" }}>{netAmount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <h4 style={s.subTitle}>Paid Amounts:</h4>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, textAlign: "left" }}>Date</th>
            <th style={{ ...s.th, textAlign: "left" }}>Payment Mode</th>
            <th style={{ ...s.th, textAlign: "right" }}>Amount Paid (INR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={s.td}>{formatDateForDisplay(transaction.date)}</td>
            <td style={{ ...s.td, textTransform: "capitalize" }}>{transaction.method}</td>
            <td style={{ ...s.td, textAlign: "right", fontWeight: "bold" }}>{netAmount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div style={s.footer}>
        <div>
          <p style={{ ...s.footerRow, fontWeight: "bold" }}>Authorized Signatory</p>
          <p style={{ ...s.footerRow, marginTop: "32px", color: "#6b7280", fontSize: "12px" }}>Print &nbsp; Back</p>
        </div>
        <div style={s.textRight}>
          <p style={s.footerRow}><strong>Total:</strong> <span style={{ marginLeft: "16px" }}>{formatCurrency(netAmount)}</span></p>
          <p style={s.footerRow}><strong>Tax:</strong> <span style={{ marginLeft: "16px" }}>0</span></p>
          <p style={s.footerRow}><strong>Amount Paid:</strong> <span style={{ marginLeft: "16px" }}>{formatCurrency(netAmount)}</span></p>
          <p style={{ ...s.footerRow, fontWeight: "bold" }}><strong>Balance:</strong> <span style={{ marginLeft: "16px" }}>₹0.00</span></p>
        </div>
      </div>
    </div>
  );
}

function MedicineInvoice({ transactions, patient, consultant, branch }) {
  const clinic = CLINIC_BRANCHES[branch] || CLINIC_BRANCHES.Delhi;
  const firstTransaction = transactions[0];
  const invoiceNo = `#INV${firstTransaction._id.slice(-5).toUpperCase()}`;

  let netTotal = 0;
  transactions.forEach((t) => { netTotal += parseFloat(t.amount) || 0; });

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.clinicName}>{clinic.name}</h1>
          <p style={s.smallText}>{clinic.address}</p>
          {clinic.city && <p style={s.smallText}>{clinic.city}</p>}
          <p style={s.smallText}><strong>Phone:</strong> {clinic.phone}</p>
          <p style={s.smallText}><strong>Website:</strong> {clinic.website}</p>
          <p style={s.smallText}><strong>GST No:</strong> {clinic.gstin}</p>
        </div>
        <div style={s.textRight}>
          <img src={clinic.img.src} alt="Logo" width={120} height={120} />
        </div>
      </div>

      <div style={s.twoCol}>
        <div>
          <h2 style={s.patientName}>{patient.name}</h2>
          <p style={s.smallText}>{patient.gender},</p>
          <p style={s.smallText}>📞 {patient.phone}</p>
        </div>
        <div style={s.textRight}>
          <p style={s.smallText}><strong>Date:</strong> {formatDateTime(firstTransaction.date)}</p>
          <p style={s.smallText}><strong>Invoice No:</strong> {invoiceNo}</p>
        </div>
      </div>

      <h3 style={s.sectionTitle}>Invoice</h3>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, textAlign: "left" }}>S No.</th>
            <th style={{ ...s.th, textAlign: "left" }}>Services & Products</th>
            <th style={{ ...s.th, textAlign: "left" }}>Consultant</th>
            <th style={{ ...s.th, textAlign: "center" }}>Qty</th>
            <th style={{ ...s.th, textAlign: "right" }}>Unit Cost (INR)</th>
            <th style={{ ...s.th, textAlign: "right" }}>Discount (INR)</th>
            <th style={{ ...s.th, textAlign: "right" }}>Total Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t, idx) => {
            const net = parseFloat(t.amount) || 0;
            const disc = parseFloat(t.discount) || 0;
            const gross = net + disc;
            return (
              <tr key={idx}>
                <td style={s.td}>{idx + 1}</td>
                <td style={s.td}>Product {t.medicineName}</td>
                <td style={s.td}>{consultant}</td>
                <td style={{ ...s.td, textAlign: "center" }}>{t.quantity || 1}</td>
                <td style={{ ...s.td, textAlign: "right" }}>{gross.toFixed(2)}</td>
                <td style={{ ...s.td, textAlign: "right" }}>{disc.toFixed(2)}</td>
                <td style={{ ...s.td, textAlign: "right", fontWeight: "bold" }}>{net.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h4 style={s.subTitle}>Paid Amounts:</h4>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, textAlign: "left" }}>Date</th>
            <th style={{ ...s.th, textAlign: "left" }}>Payment Mode</th>
            <th style={{ ...s.th, textAlign: "right" }}>Amount Paid (INR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={s.td}>{formatDateForDisplay(firstTransaction.date)}</td>
            <td style={{ ...s.td, textTransform: "capitalize" }}>{firstTransaction.method}</td>
            <td style={{ ...s.td, textAlign: "right", fontWeight: "bold" }}>{netTotal.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div style={s.footer}>
        <div>
          <p style={{ ...s.footerRow, fontWeight: "bold" }}>Authorized Signatory</p>
          <p style={{ ...s.footerRow, marginTop: "32px", color: "#6b7280", fontSize: "12px" }}>Print &nbsp; Back</p>
        </div>
        <div style={s.textRight}>
          <p style={s.footerRow}><strong>Total:</strong> <span style={{ marginLeft: "16px" }}>{formatCurrency(netTotal)}</span></p>
          <p style={s.footerRow}><strong>Tax:</strong> <span style={{ marginLeft: "16px" }}>0</span></p>
          <p style={s.footerRow}><strong>Amount Paid:</strong> <span style={{ marginLeft: "16px" }}>{formatCurrency(netTotal)}</span></p>
          <p style={{ ...s.footerRow, fontWeight: "bold" }}><strong>Balance:</strong> <span style={{ marginLeft: "16px" }}>₹0.00</span></p>
        </div>
      </div>
    </div>
  );
}

function TransplantInvoice({ transactions, patient, consultant, branch, packageAmount, packageDiscount }) {
  const clinic = CLINIC_BRANCHES[branch] || CLINIC_BRANCHES.Delhi;
  const firstTransaction = transactions[0] || {};
  const invoiceNo = `#INV${firstTransaction._id?.slice(-5).toUpperCase() || "00000"}`;

  const packageTotal = parseFloat(packageAmount) || 0;
  const discountOnPackage = parseFloat(packageDiscount) || 0;
  const amountAfterDiscount = packageTotal - discountOnPackage;
  const totalPaid = transactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
  const pending = amountAfterDiscount - totalPaid;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.clinicName}>{clinic.name}</h1>
          <p style={s.smallText}>{clinic.address}</p>
          {clinic.city && <p style={s.smallText}>{clinic.city}</p>}
          <p style={s.smallText}><strong>Phone:</strong> {clinic.phone}</p>
          <p style={s.smallText}><strong>Website:</strong> {clinic.website}</p>
          <p style={s.smallText}><strong>GST No:</strong> {clinic.gstin}</p>
        </div>
        <div style={s.textRight}>
          <img src={clinic.img.src} alt="Logo" width={120} height={120} />
        </div>
      </div>

      <div style={s.twoCol}>
        <div>
          <h2 style={s.patientName}>{patient.name}</h2>
          <p style={s.smallText}>{patient.gender},</p>
          <p style={s.smallText}><strong>Phone:</strong> {patient.phone}</p>
          <p style={s.smallText}><strong>Branch:</strong> {branch}</p>
        </div>
        <div style={s.textRight}>
          <p style={s.smallText}><strong>Date:</strong> {formatDateTime(firstTransaction.date)}</p>
          <p style={s.smallText}><strong>Invoice No:</strong> {invoiceNo}</p>
        </div>
      </div>

      <h3 style={s.sectionTitle}>Invoice</h3>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, textAlign: "left" }}>S No.</th>
            <th style={{ ...s.th, textAlign: "left" }}>Services & Products</th>
            <th style={{ ...s.th, textAlign: "left" }}>Consultant</th>
            <th style={{ ...s.th, textAlign: "center" }}>Qty</th>
            <th style={{ ...s.th, textAlign: "right" }}>Package Cost (INR)</th>
            <th style={{ ...s.th, textAlign: "right" }}>Discount (INR)</th>
            <th style={{ ...s.th, textAlign: "right" }}>After Discount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={s.td}>1</td>
            <td style={s.td}>Service {firstTransaction.procedure || "Hair Transplant"}</td>
            <td style={s.td}>{consultant}</td>
            <td style={{ ...s.td, textAlign: "center" }}>1</td>
            <td style={{ ...s.td, textAlign: "right" }}>{packageTotal.toFixed(2)}</td>
            <td style={{ ...s.td, textAlign: "right" }}>{discountOnPackage.toFixed(2)}</td>
            <td style={{ ...s.td, textAlign: "right", fontWeight: "bold" }}>{amountAfterDiscount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      {patient.additionalbenefits?.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <h4 style={s.subTitle}>Package Includes:</h4>
          <ul style={{ margin: "0", paddingLeft: "20px" }}>
            {patient.additionalbenefits.map((benefit, idx) => (
              <li key={idx} style={{ fontSize: "13px", color: "#374151", marginBottom: "4px" }}>
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h4 style={s.subTitle}>Paid Amounts:</h4>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, textAlign: "left" }}>Date</th>
            <th style={{ ...s.th, textAlign: "left" }}>Payment Mode</th>
            <th style={{ ...s.th, textAlign: "right" }}>Amount Paid (INR)</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t, idx) => (
            <tr key={idx}>
              <td style={s.td}>{formatDateForDisplay(t.date)}</td>
              <td style={{ ...s.td, textTransform: "capitalize" }}>{t.method}</td>
              <td style={{ ...s.td, textAlign: "right" }}>{parseFloat(t.amount || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={s.footer}>
        <div>
          <p style={{ ...s.footerRow, fontWeight: "bold" }}>Authorized Signatory</p>
        </div>
        <div style={s.textRight}>
          <p style={{ ...s.footerRow, fontWeight: "bold" }}><strong>Total Amount:</strong> <span style={{ marginLeft: "16px" }}>{formatCurrency(amountAfterDiscount)}</span></p>
          <p style={s.footerRow}><strong>Received:</strong> <span style={{ marginLeft: "16px" }}>{formatCurrency(totalPaid)}</span></p>
          <p style={{ ...s.footerRow, color: "#dc2626", fontWeight: "bold" }}><strong>Pending:</strong> <span style={{ marginLeft: "16px" }}>{formatCurrency(pending)}</span></p>
          <p style={s.footerRow}><strong>Tax:</strong> <span style={{ marginLeft: "16px" }}>0</span></p>
        </div>
      </div>
    </div>
  );
}

export default function BillGenerator({ transactionId, onClose }) {
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);

  useEffect(() => {
    if (transactionId) fetchTransactionData();
  }, [transactionId]);

  const fetchTransactionData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/transactions/invoice-data?id=${transactionId}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error || "Failed to fetch invoice data");
      setInvoiceData(result.data);
    } catch (error) {
      console.error("Error fetching transaction:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => window.print();

  const handleDownloadPDF = async () => {
    try {
      setGenerating(true);
      const element = document.getElementById("bill-content");

      const scrollContainer = element.parentElement;
      const prevMaxH = scrollContainer.style.maxHeight;
      const prevOverflow = scrollContainer.style.overflow;
      scrollContainer.style.maxHeight = "none";
      scrollContainer.style.overflow = "visible";

      const opt = {
        margin: [10, 10, 10, 10],
        filename: `Invoice_${transactionId}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          onclone: (clonedDoc) => {
            clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((el) => el.remove());
            clonedDoc.querySelectorAll("style").forEach((el) => el.remove());
          },
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };

      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf().set(opt).from(element).save();

      scrollContainer.style.maxHeight = prevMaxH;
      scrollContainer.style.overflow = prevOverflow;
    } catch (error) {
      console.error("PDF generation error:", error);
      alert("Failed to generate PDF. Please try printing instead.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading invoice data...</p>
        </div>
      </div>
    );
  }

  if (error || !invoiceData) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CloseIcon className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Error Loading Invoice</h3>
            <p className="text-gray-600 mb-4">{error || "Transaction not found"}</p>
            <button onClick={onClose} className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all font-medium">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { category, branch, transactions, patient, consultant, isBatch, packageAmount, packageDiscount } = invoiceData;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full my-8">
        <div className="bg-linear-to-r from-indigo-600 to-purple-600 px-6 py-4 rounded-t-2xl flex items-center justify-between no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Bill className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {category === "TRANSPLANT" ? "Transplant Invoice" : category === "SERVICE" ? "Service Invoice" : category === "MEDICINE" ? "Medicine Invoice" : "Invoice"}
              </h2>
              <p className="text-white/80 text-sm">
                {isBatch && category === "MEDICINE"
                  ? `Batch Invoice (${transactions.length} items)`
                  : category === "TRANSPLANT"
                    ? `Complete Payment History (${transactions.length} payments)`
                    : "Print or download invoice"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <CloseIcon className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="p-6 max-h-150 overflow-y-auto">
          <div id="bill-content" style={{ backgroundColor: "#ffffff" }}>
            {category === "TRANSPLANT" ? (
              <TransplantInvoice transactions={transactions} patient={patient} consultant={consultant} branch={branch} packageAmount={packageAmount} packageDiscount={packageDiscount} />
            ) : category === "SERVICE" ? (
              <ServiceInvoice transaction={transactions[0]} patient={patient} consultant={consultant} branch={branch} />
            ) : category === "MEDICINE" ? (
              <MedicineInvoice transactions={transactions} patient={patient} consultant={consultant} branch={branch} />
            ) : (
              <ServiceInvoice transaction={transactions[0]} patient={patient} consultant={consultant} branch={branch} />
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex gap-3 no-print">
          <button onClick={handlePrint} className="flex-1 px-6 py-3 bg-linear-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all font-semibold flex items-center justify-center gap-2">
            <Printer className="w-5 h-5" />
            Print Invoice
          </button>
          <button onClick={handleDownloadPDF} disabled={generating} className="flex-1 px-6 py-3 bg-linear-to-r from-emerald-500 to-green-600 text-white rounded-xl hover:from-emerald-600 hover:to-green-700 transition-all font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {generating ? (
              <><Loader2 className="w-5 h-5 animate-spin" />Generating...</>
            ) : (
              <><Download className="w-5 h-5" />Download PDF</>
            )}
          </button>
          <button onClick={onClose} className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-all font-semibold">
            Close
          </button>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          html, body { height: auto !important; overflow: visible !important; }
          body * { visibility: hidden !important; }
          #bill-content, #bill-content * { visibility: visible !important; }
          #bill-content {
            position: fixed !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 10mm !important;
            margin: 0 !important;
            background: white !important;
            box-shadow: none !important;
          }
          @page { margin: 0.5cm; size: A4; }
        }
      `}</style>
    </div>
  );
}