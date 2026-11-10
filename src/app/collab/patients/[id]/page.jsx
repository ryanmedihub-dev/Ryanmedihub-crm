"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { maskPhone } from "@/utils/phoneUtils";
import CollabSidebar from "@/components/Sidebars/CollabSidebar";
import { normalizeFileUrl } from "@/utils/fileUrl";
import {
  ArrowLeft,
  Download,
  Printer,
  FileText,
  Image as ImageIcon,
  Eye,
  Droplet,
  Clock,
} from "lucide-react";

const PatientProfile = () => {
  const params = useParams();
  const id = params.id;
  const { data: session } = useSession();
  const userRole = session?.user?.role || "";
  const [patientData, setPatientData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (!id) return;

    const fetchPatientData = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/admin/patient-data?id=${id}`, {
          method: "GET",
        });

        if (!res.ok) {
          router.push("/404");
          return;
        }

        const data = await res.json();

        if (data.success && data.patient) {
          console.log("Patient data received:", data.patient);
          console.log("Surgery data:", data.patient.surgery);
          setPatientData(data.patient);
        } else {
          router.push("/404");
        }
      } catch (err) {
        console.error("Error fetching patient data:", err);
        router.push("/404");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPatientData();
  }, [id, router]);

  const formatEmployeeNames = (employees) => {
    if (!employees) return "N/A";

    if (Array.isArray(employees)) {
      if (employees.length === 0) return "N/A";

      const names = employees.map((emp) => {
        if (typeof emp === "object" && emp !== null) {
          return emp.name || "Unknown";
        }
        return "Unknown";
      });

      return names.filter(name => name !== "Unknown").join(", ") || "N/A";
    }

    if (typeof employees === "object" && employees !== null && employees.name) {
      return employees.name;
    }

    return "N/A";
  };

  const formatDate = (date) => {
    if (!date) return "Not scheduled";

    try {
      const dateObj = date instanceof Date ? date : new Date(date);

      if (isNaN(dateObj.getTime())) {
        return "Invalid date";
      }

      return dateObj.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch (error) {
      console.error("Date formatting error:", error);
      return "Invalid date";
    }
  };

  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null) return "₹0";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const downloadPDF = () => {
    try {
      const iframe = document.createElement("iframe");
      iframe.style.position = "absolute";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";

      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(createPDFContent(patientData));
      iframeDoc.close();

      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();

            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          } catch (e) {
            console.error("Print error:", e);
            document.body.removeChild(iframe);
            window.print();
          }
        }, 500);
      };
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert(
        "Unable to generate PDF. Using browser print instead. Please use 'Save as PDF' in the print dialog."
      );
      window.print();
    }
  };

  const createPDFContent = (data) => {
    const formatDatePDF = (date) => {
      if (!date) return "Not scheduled";
      try {
        const dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) return "Invalid date";
        return dateObj.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      } catch (error) {
        return "Invalid date";
      }
    };

    const formatCurrencyPDF = (amount) => {
      if (amount === undefined || amount === null) return "₹0";
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
      }).format(amount);
    };

    const formatEmployeeNamesPDF = (employees) => {
      if (!employees) return "N/A";

      if (Array.isArray(employees)) {
        if (employees.length === 0) return "N/A";
        const names = employees
          .map((emp) => (typeof emp === "object" && emp !== null ? emp.name : "Unknown"))
          .filter(name => name !== "Unknown");
        return names.length > 0 ? names.join(", ") : "N/A";
      }

      if (typeof employees === "object" && employees !== null && employees.name) {
        return employees.name;
      }

      return "N/A";
    };

    let medicinesHTML = "";
    if (data.counselling?.medicines && data.counselling.medicines.length > 0) {
      const medicinesList = data.counselling.medicines
        .map(med => `<span style="background: #e3f2fd; padding: 4px 8px; margin: 2px; border-radius: 3px; display: inline-block; font-size: 12px;">${med}</span>`)
        .join(" ");
      medicinesHTML = `<div style="margin-top: 15px;"><strong>Prescribed Medicines:</strong><br>${medicinesList}</div>`;
    }

    let benefitsHTML = "";
    if (data.counselling?.additionalbenefits && data.counselling.additionalbenefits.length > 0) {
      const benefitsList = data.counselling.additionalbenefits
        .map(benefit => `<span style="background: #d4edda; padding: 4px 8px; margin: 2px; border-radius: 3px; display: inline-block; font-size: 12px;">${benefit}</span>`)
        .join(" ");
      benefitsHTML = `<div style="margin-top: 15px;"><strong>Additional Benefits:</strong><br>${benefitsList}</div>`;
    }

    let notesHTML = "";
    if (data.counselling?.notes) {
      notesHTML = `<div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 5px;"><strong>Notes:</strong><br>${data.counselling.notes}</div>`;
    }

    let referenceHTML = "";
    if (data.personal?.reference) {
      referenceHTML = `<div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 5px;"><strong>Reference:</strong> ${data.personal.reference.name || "N/A"}</div>`;
    }

    let surgeryHTML = "";
    if (data.surgery) {
      const hasSurgeryData = data.surgery.surgeryDate ||
                             data.surgery.location ||
                             data.surgery.OT ||
                             data.surgery.doctor?.length > 0;

      if (hasSurgeryData) {
        surgeryHTML = `
          <div class="grid">
            <div class="info-item"><span class="info-label">Surgery Date:</span> <span class="info-value">${formatDatePDF(data.surgery.surgeryDate)}</span></div>
            <div class="info-item"><span class="info-label">Location:</span> <span class="info-value">${data.surgery.location || "N/A"}</span></div>
            <div class="info-item"><span class="info-label">OT Number:</span> <span class="info-value">${data.surgery.OT || "N/A"}</span></div>
            <div class="info-item"><span class="info-label">Technique:</span> <span class="info-value">${data.surgery.technique || "N/A"}</span></div>
            <div class="info-item"><span class="info-label">Grafts Needed:</span> <span class="info-value">${data.surgery.graftsneed || "N/A"}</span></div>
            <div class="info-item"><span class="info-label">Grafts Implanted:</span> <span class="info-value">${data.surgery.graftsImplanted || "N/A"}</span></div>
          </div>
          <div class="info-item"><span class="info-label">Donor Condition:</span> <span class="info-value">${data.surgery.donorCondition || "N/A"}</span></div>

          <h3 style="color: #2c5aa0; margin: 20px 0 10px 0;">Surgical Team</h3>
          <div class="grid">
            <div class="info-item"><span class="info-label">Doctor(s):</span> <span class="info-value">${formatEmployeeNamesPDF(data.surgery.doctor)}</span></div>
            <div class="info-item"><span class="info-label">Senior Tech(s):</span> <span class="info-value">${formatEmployeeNamesPDF(data.surgery.seniorTech)}</span></div>
            <div class="info-item"><span class="info-label">Implanter Right(s):</span> <span class="info-value">${formatEmployeeNamesPDF(data.surgery.implanterRight)}</span></div>
            <div class="info-item"><span class="info-label">Implanter Left(s):</span> <span class="info-value">${formatEmployeeNamesPDF(data.surgery.implanterLeft)}</span></div>
            <div class="info-item"><span class="info-label">Grafting Person(s):</span> <span class="info-value">${formatEmployeeNamesPDF(data.surgery.graftingPerson)}</span></div>
            <div class="info-item"><span class="info-label">Helper(s):</span> <span class="info-value">${formatEmployeeNamesPDF(data.surgery.helper)}</span></div>
          </div>
        `;
      } else {
        surgeryHTML = '<p style="text-align: center; color: #666; padding: 20px;">No surgery details available</p>';
      }
    } else {
      surgeryHTML = '<p style="text-align: center; color: #666; padding: 20px;">No surgery details available</p>';
    }

    let prpHTML = "";
    if (data.afterSurgery?.prp && data.afterSurgery.prp.length > 0) {
      const prpRows = data.afterSurgery.prp
        .map((session, index) => `
          <tr>
            <td>${session.prpNumber || index + 1}</td>
            <td>${session.type || "PRP"}</td>
            <td>${formatDatePDF(session.date)}</td>
          </tr>
        `)
        .join("");
      prpHTML = `
        <h3 style="color: #2c5aa0; margin: 20px 0 10px 0;">PRP / GFC Sessions</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>${prpRows}</tbody>
        </table>
      `;
    } else {
      prpHTML = '<p style="color: #666; margin-top: 10px;">No PRP / GFC sessions scheduled</p>';
    }

    let transactionsHTML = "";
    if (data.payments?.transactions && data.payments.transactions.length > 0) {
      const transactionRows = data.payments.transactions
        .map(txn => `
          <tr>
            <td>${formatDatePDF(txn.date)}</td>
            <td>${txn.paymentType || "N/A"}</td>
            <td>${txn.branch || "N/A"}</td>
            <td><strong>${formatCurrencyPDF(txn.amount)}</strong></td>
          </tr>
        `)
        .join("");
      transactionsHTML = `
        <h3 style="color: #2c5aa0; margin: 20px 0 10px 0;">Transaction History</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Payment Type</th>
              <th>Branch</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>${transactionRows}</tbody>
        </table>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Patient Medical Record - ${data.personal?.name || "Unknown"}</title>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              margin: 20px;
              color: #333;
              background: #fff;
              line-height: 1.4;
            }
            .header {
              text-align: center;
              border-bottom: 3px solid #2c5aa0;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .header h1 {
              color: #2c5aa0;
              margin: 0;
              font-size: 28px;
            }
            .section {
              margin-bottom: 25px;
              border: 1px solid #ddd;
              padding: 20px;
              page-break-inside: avoid;
              border-radius: 5px;
            }
            .section h2 {
              background: #f8f9fa;
              padding: 12px 15px;
              margin: -20px -20px 20px -20px;
              border-bottom: 1px solid #ddd;
              color: #2c5aa0;
              font-size: 18px;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
              gap: 15px;
            }
            .info-item {
              margin-bottom: 12px;
              padding-bottom: 8px;
              border-bottom: 1px solid #f0f0f0;
            }
            .info-label {
              font-weight: 600;
              color: #555;
              font-size: 13px;
              display: block;
              margin-bottom: 4px;
            }
            .info-value {
              font-weight: normal;
              color: #000;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
              font-size: 13px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 10px;
              text-align: left;
            }
            th {
              background: #f8f9fa;
              font-weight: 600;
              color: #2c5aa0;
            }
            .status-badge {
              background: #d4edda;
              color: #155724;
              padding: 4px 8px;
              border-radius: 4px;
              font-size: 12px;
              font-weight: 600;
            }
            .footer {
              text-align: center;
              margin-top: 40px;
              padding-top: 20px;
              border-top: 2px solid #2c5aa0;
              font-size: 12px;
              color: #666;
            }
            .amount-positive { color: #28a745; font-weight: 600; }
            .amount-negative { color: #dc3545; font-weight: 600; }
            .amount-neutral { color: #007bff; font-weight: 600; }
            @media print {
              body { margin: 15mm; }
              .section { break-inside: avoid; }
              .header { margin-top: 0; }
            }
            @page {
              margin: 15mm;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>MEDICAL RECORD</h1>
            <p style="margin: 5px 0;"><strong>Patient ID:</strong> ${data._id || "N/A"} &nbsp; | &nbsp; <strong>Date:</strong> ${new Date().toLocaleDateString("en-IN")}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="background: #e9ecef; padding: 4px 12px; border-radius: 15px; font-weight: 600;">${(data.ops?.status || "UNKNOWN").replace("_", " ")}</span></p>
          </div>

          <!-- Patient Information -->
          <div class="section">
            <h2>PATIENT INFORMATION</h2>
            <div class="grid">
              <div class="info-item">
                <span class="info-label">Full Name:</span>
                <span class="info-value">${data.personal?.name || "N/A"}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Age & Gender:</span>
                <span class="info-value">${data.personal?.age || "N/A"} years, ${data.personal?.gender || "N/A"}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Blood Group:</span>
                <span class="info-value">${data.medical?.bloodGroup || "N/A"}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Phone:</span>
                <span class="info-value">${maskPhone(data.personal?.phone, userRole) || "N/A"}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Email:</span>
                <span class="info-value">${data.personal?.email || "N/A"}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Profession:</span>
                <span class="info-value">${data.personal?.profession || "N/A"}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Branch:</span>
                <span class="info-value">${data.personal?.branch || "N/A"}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Visit Date:</span>
                <span class="info-value">${formatDatePDF(data.personal?.visitDate)}</span>
              </div>
            </div>
            <div class="info-item">
              <span class="info-label">Address:</span>
              <span class="info-value">${data.personal?.address || "N/A"}</span>
            </div>
            ${referenceHTML}
          </div>

          <!-- Counselling Details -->
          <div class="section">
            <h2>COUNSELLING DETAILS</h2>
            <div class="grid">
              <div class="info-item"><span class="info-label">Counsellor:</span> <span class="info-value">${data.counselling?.counsellor?.name || "N/A"}</span></div>
              <div class="info-item"><span class="info-label">Technique Suggested:</span> <span class="info-value">${data.counselling?.techniqueSuggested || "N/A"}</span></div>
              <div class="info-item"><span class="info-label">Grafts Suggested:</span> <span class="info-value">${data.counselling?.graftsSuggested || "N/A"}</span></div>
              <div class="info-item"><span class="info-label">Final Package:</span> <span class="info-value amount-neutral">${formatCurrencyPDF(data.counselling?.finlpackage)}</span></div>
              <div class="info-item"><span class="info-label">Ready for Surgery:</span> <span class="info-value">${data.counselling?.readyForSurgery ? "✅ Yes" : "❌ No"}</span></div>
              <div class="info-item"><span class="info-label">Hair Loss Type:</span> <span class="info-value">${data.counselling?.hairlossType || "N/A"}</span></div>
              <div class="info-item"><span class="info-label">Area of Concern:</span> <span class="info-value">${data.counselling?.areaofConcern || "N/A"}</span></div>
              <div class="info-item"><span class="info-label">Hair Loss Duration:</span> <span class="info-value">${data.counselling?.hairlossduration || "N/A"}</span></div>
            </div>
            ${medicinesHTML}
            ${benefitsHTML}
            ${notesHTML}
          </div>

          <!-- Medical Information -->
          <div class="section">
            <h2>MEDICAL INFORMATION</h2>
            <div class="grid">
              <div>
                <h3 style="color: #2c5aa0; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Vital Signs</h3>
                <div class="grid">
                  <div class="info-item"><span class="info-label">Blood Pressure:</span> <span class="info-value">${data.medical?.bp || "N/A"}</span></div>
                  <div class="info-item"><span class="info-label">Sugar Level:</span> <span class="info-value">${data.medical?.sugar || "N/A"}</span></div>
                  <div class="info-item"><span class="info-label">Pulse Rate:</span> <span class="info-value">${data.medical?.pulse || "N/A"}</span></div>
                  <div class="info-item"><span class="info-label">Weight:</span> <span class="info-value">${data.medical?.weight || "N/A"}</span></div>
                </div>
              </div>
              <div>
                <h3 style="color: #2c5aa0; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Medical Background</h3>
                <div class="info-item"><span class="info-label">Allergies:</span> <span class="info-value">${data.medical?.allergies || "None"}</span></div>
                <div class="info-item"><span class="info-label">Medical History:</span> <span class="info-value">${data.medical?.medicalHistory || "None"}</span></div>
                <div class="info-item"><span class="info-label">HIV Status:</span> <span class="info-value">${data.medical?.hiv || "Not tested"}</span></div>
                <div class="info-item"><span class="info-label">HCV Status:</span> <span class="info-value">${data.medical?.hcv || "Not tested"}</span></div>
              </div>
            </div>
          </div>

          <!-- Surgery Information -->
          <div class="section">
            <h2>SURGERY INFORMATION</h2>
            ${surgeryHTML}
          </div>

          <!-- After Surgery Care -->
          <div class="section">
            <h2>AFTER SURGERY CARE</h2>
            <div class="grid">
              <div class="info-item"><span class="info-label">Head Wash Date:</span> <span class="info-value">${formatDatePDF(data.afterSurgery?.headwashDate)}</span></div>
              <div class="info-item"><span class="info-label">Bandage Removal Date:</span> <span class="info-value">${formatDatePDF(data.afterSurgery?.bandageRemovalDate)}</span></div>
            </div>
            ${prpHTML}
          </div>

          <!-- Payment Information -->
          <div class="section">
            <h2>PAYMENT INFORMATION</h2>
            <div class="grid">
              <div class="info-item"><span class="info-label">Total Amount:</span> <span class="info-value amount-neutral">${formatCurrencyPDF(data.payments?.totalAmount)}</span></div>
              <div class="info-item"><span class="info-label">Amount Received:</span> <span class="info-value amount-positive">${formatCurrencyPDF(data.payments?.amountReceived)}</span></div>
              <div class="info-item"><span class="info-label">Total Discount:</span> <span class="info-value amount-positive">${formatCurrencyPDF(data.payments?.discount)}</span></div>
              <div class="info-item"><span class="info-label">Pending Amount:</span> <span class="info-value amount-negative">${formatCurrencyPDF(data.payments?.pendingAmount)}</span></div>
              <div class="info-item"><span class="info-label">Medicine Amount:</span> <span class="info-value amount-neutral">${formatCurrencyPDF(data.payments?.medicineAmount)}</span></div>
            </div>
            ${transactionsHTML}
          </div>

          <!-- Documents Section -->
          <div class="section">
            <h2>DOCUMENTS UPLOADED</h2>
            <div class="grid">
              <div class="info-item">
                <span class="info-label">Patient Images:</span>
                <span class="info-value">${data.documents?.images?.length || 0} file(s)</span>
              </div>
              <div class="info-item">
                <span class="info-label">Consent Forms:</span>
                <span class="info-value">${data.documents?.consentForm?.length || 0} file(s)</span>
              </div>
              <div class="info-item">
                <span class="info-label">Surgery Forms:</span>
                <span class="info-value">${data.documents?.suregeryForm?.length || 0} file(s)</span>
              </div>
              <div class="info-item">
                <span class="info-label">Consult Forms:</span>
                <span class="info-value">${data.documents?.consultForm?.length || 0} file(s)</span>
              </div>
            </div>
          </div>

          <div class="footer">
            <p><strong>This is an electronically generated medical record. No signature required.</strong></p>
            <p>Generated on ${new Date().toLocaleDateString("en-IN")} at ${new Date().toLocaleTimeString("en-IN")}</p>
          </div>
        </body>
      </html>
    `;
  };

  if (isLoading) {
    return (
      <section className="flex min-h-screen">
        <CollabSidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />
        <main className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading patient profile...</p>
          </div>
        </main>
      </section>
    );
  }

  if (!patientData) {
    return null;
  }

  return (
    <section className="flex min-h-screen">
      <CollabSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      <main className="flex-1 px-12 py-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Patient Medical Record
              </h1>
              <p className="text-gray-600">
                Patient ID: {patientData._id} | Status:{" "}
                <span
                  className={`font-medium ${
                    patientData.ops?.status === "NEW"
                      ? "text-blue-600"
                      : patientData.ops?.status === "POST_OP"
                      ? "text-green-600"
                      : patientData.ops?.status === "CONSULTED"
                      ? "text-yellow-600"
                      : "text-gray-600"
                  }`}
                >
                  {(patientData.ops?.status || "UNKNOWN").replace("_", " ")}
                </span>
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.back()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="mr-2" size={16} />
                Back
              </button>
              <button
                onClick={downloadPDF}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="mr-2" size={16} />
                Download PDF
              </button>
              <Link
                href={`/collab/patients/${params.id}/consultation-form`}
                target="_blank"
                className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <Printer className="mr-2" size={16} />
                Consultation Form
              </Link>
            </div>
          </div>

          <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
            <div className="p-8">
              <div className="text-center border-b-2 border-gray-300 pb-6 mb-6">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  MEDICAL RECORD
                </h1>
                <div className="flex justify-between items-center text-sm text-gray-600">
                  <span>
                    Patient ID: <strong>{patientData._id}</strong>
                  </span>
                  <span>
                    Date: <strong>{new Date().toLocaleDateString()}</strong>
                  </span>
                </div>
                <div className="mt-2">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      patientData.ops?.status === "NEW"
                        ? "bg-blue-100 text-blue-800"
                        : patientData.ops?.status === "POST_OP"
                        ? "bg-green-100 text-green-800"
                        : patientData.ops?.status === "CONSULTED"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {(patientData.ops?.status || "UNKNOWN").replace("_", " ")}
                  </span>
                </div>
              </div>

              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">
                  PATIENT INFORMATION
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Full Name
                    </label>
                    <p className="text-gray-900 font-medium">
                      {patientData.personal?.name || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Age & Gender
                    </label>
                    <p className="text-gray-900 font-medium">
                      {patientData.personal?.age || "N/A"} years,{" "}
                      {patientData.personal?.gender || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Blood Group
                    </label>
                    <p className="text-gray-900 font-medium">
                      {patientData.medical?.bloodGroup || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Phone
                    </label>
                    <p className="text-gray-900 font-medium">
                      {maskPhone(patientData.personal?.phone, userRole) || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Email
                    </label>
                    <p className="text-gray-900 font-medium">
                      {patientData.personal?.email || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Profession
                    </label>
                    <p className="text-gray-900 font-medium">
                      {patientData.personal?.profession || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Branch
                    </label>
                    <p className="text-gray-900 font-medium">
                      {patientData.personal?.branch || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Visit Date
                    </label>
                    <p className="text-gray-900 font-medium">
                      {formatDate(patientData.personal?.visitDate)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Package Quoted
                    </label>
                    <p className="text-gray-900 font-medium">
                      {formatCurrency(patientData.personal?.packageQuoted)}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Address
                  </label>
                  <p className="text-gray-900 font-medium">
                    {patientData.personal?.address || "N/A"}
                  </p>
                </div>
                {patientData.personal?.reference && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Reference Source
                    </label>
                    <p className="text-gray-900 font-medium">
                      {patientData.personal.reference.name || "N/A"}
                    </p>
                  </div>
                )}
                {patientData.personal?.remarks && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Remarks
                    </label>
                    <p className="text-gray-900 font-medium bg-gray-50 p-3 rounded border">
                      {patientData.personal.remarks}
                    </p>
                  </div>
                )}
              </div>

              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">
                  COUNSELLING DETAILS
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Counsellor
                    </label>
                    <p className="font-medium">
                      {patientData.counselling?.counsellor?.name || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Technique Suggested
                    </label>
                    <p className="font-medium">
                      {patientData.counselling?.techniqueSuggested || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Grafts Suggested
                    </label>
                    <p className="font-medium">
                      {patientData.counselling?.graftsSuggested || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Final Package
                    </label>
                    <p className="font-medium text-blue-600">
                      {formatCurrency(patientData.counselling?.finlpackage)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Ready for Surgery
                    </label>
                    <p className="font-medium">
                      <span
                        className={
                          patientData.counselling?.readyForSurgery
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      >
                        {patientData.counselling?.readyForSurgery
                          ? "✓ Yes"
                          : "✗ No"}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Hair Loss Type
                    </label>
                    <p className="font-medium">
                      {patientData.counselling?.hairlossType || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Area of Concern
                    </label>
                    <p className="font-medium">
                      {patientData.counselling?.areaofConcern || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Hair Loss Reason
                    </label>
                    <p className="font-medium">
                      {patientData.counselling?.hairlossreason || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Hair Loss Duration
                    </label>
                    <p className="font-medium">
                      {patientData.counselling?.hairlossduration || "N/A"}
                    </p>
                  </div>
                </div>

                {patientData.counselling?.medicines &&
                  patientData.counselling.medicines.length > 0 && (
                    <div className="mb-4">
                      <label className="block text-sm text-gray-600 mb-2">
                        Prescribed Medicines
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {patientData.counselling.medicines.map(
                          (medicine, index) => (
                            <span
                              key={index}
                              className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded"
                            >
                              {medicine}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {patientData.counselling?.additionalbenefits &&
                  patientData.counselling.additionalbenefits.length > 0 && (
                    <div className="mb-4">
                      <label className="block text-sm text-gray-600 mb-2">
                        Additional Benefits
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {patientData.counselling.additionalbenefits.map(
                          (benefit, index) => (
                            <span
                              key={index}
                              className="bg-green-100 text-green-800 text-sm px-3 py-1 rounded"
                            >
                              {benefit}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {patientData.counselling?.notes && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Counsellor Notes
                    </label>
                    <p className="font-medium bg-gray-50 p-3 rounded border">
                      {patientData.counselling.notes}
                    </p>
                  </div>
                )}
              </div>

              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">
                  MEDICAL INFORMATION
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">
                      Vital Signs
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          Blood Pressure
                        </label>
                        <p className="font-medium">
                          {patientData.medical?.bp || "N/A"}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          Sugar Level
                        </label>
                        <p className="font-medium">
                          {patientData.medical?.sugar || "N/A"}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          Pulse Rate
                        </label>
                        <p className="font-medium">
                          {patientData.medical?.pulse || "N/A"}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          Weight
                        </label>
                        <p className="font-medium">
                          {patientData.medical?.weight || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">
                      Medical Background
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          Allergies
                        </label>
                        <p className="font-medium">
                          {patientData.medical?.allergies || "None"}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          Medical History
                        </label>
                        <p className="font-medium">
                          {patientData.medical?.medicalHistory || "None"}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          HIV Status
                        </label>
                        <p className="font-medium">
                          {patientData.medical?.hiv || "Not tested"}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          HCV Status
                        </label>
                        <p className="font-medium">
                          {patientData.medical?.hcv || "Not tested"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">
                  SURGERY INFORMATION
                </h2>

                {patientData.surgery ? (
                  (() => {
                    const hasSurgeryData =
                      patientData.surgery.surgeryDate ||
                      patientData.surgery.location ||
                      patientData.surgery.OT ||
                      (patientData.surgery.doctor && patientData.surgery.doctor.length > 0);

                    return hasSurgeryData ? (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                          {patientData.surgery.surgeryDate && (
                            <div>
                              <label className="block text-sm text-gray-600 mb-1">
                                Surgery Date
                              </label>
                              <p className="font-medium">
                                {formatDate(patientData.surgery.surgeryDate)}
                              </p>
                            </div>
                          )}
                          {patientData.surgery.location && (
                            <div>
                              <label className="block text-sm text-gray-600 mb-1">
                                Location
                              </label>
                              <p className="font-medium">
                                {patientData.surgery.location || "N/A"}
                              </p>
                            </div>
                          )}
                          {patientData.surgery.OT && (
                            <div>
                              <label className="block text-sm text-gray-600 mb-1">
                                OT Number
                              </label>
                              <p className="font-medium">
                                {patientData.surgery.OT || "N/A"}
                              </p>
                            </div>
                          )}
                          {patientData.surgery.technique && (
                            <div>
                              <label className="block text-sm text-gray-600 mb-1">
                                Technique
                              </label>
                              <p className="font-medium">
                                {patientData.surgery.technique || "N/A"}
                              </p>
                            </div>
                          )}
                          {(patientData.surgery.graftsneed || patientData.surgery.graftsneed === 0) && (
                            <div>
                              <label className="block text-sm text-gray-600 mb-1">
                                Grafts Needed
                              </label>
                              <p className="font-medium">
                                {patientData.surgery.graftsneed || "N/A"}
                              </p>
                            </div>
                          )}
                          {(patientData.surgery.graftsImplanted || patientData.surgery.graftsImplanted === 0) && (
                            <div>
                              <label className="block text-sm text-gray-600 mb-1">
                                Grafts Implanted
                              </label>
                              <p className="font-medium">
                                {patientData.surgery.graftsImplanted || "N/A"}
                              </p>
                            </div>
                          )}
                        </div>

                        {patientData.surgery.donorCondition && (
                          <div className="mb-4">
                            <label className="block text-sm text-gray-600 mb-1">
                              Donor Condition
                            </label>
                            <p className="font-medium">
                              {patientData.surgery.donorCondition || "N/A"}
                            </p>
                          </div>
                        )}

                        <div className="mb-4">
                          <h3 className="text-lg font-semibold text-gray-800 mb-3">
                            Surgical Team
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {patientData.surgery.doctor && patientData.surgery.doctor.length > 0 && (
                              <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                  Doctor(s)
                                </label>
                                <p className="font-medium">
                                  {formatEmployeeNames(patientData.surgery.doctor)}
                                </p>
                              </div>
                            )}
                            {patientData.surgery.seniorTech && patientData.surgery.seniorTech.length > 0 && (
                              <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                  Senior Technician(s)
                                </label>
                                <p className="font-medium">
                                  {formatEmployeeNames(patientData.surgery.seniorTech)}
                                </p>
                              </div>
                            )}
                            {patientData.surgery.implanterRight && patientData.surgery.implanterRight.length > 0 && (
                              <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                  Implanter Right(s)
                                </label>
                                <p className="font-medium">
                                  {formatEmployeeNames(patientData.surgery.implanterRight)}
                                </p>
                              </div>
                            )}
                            {patientData.surgery.implanterLeft && patientData.surgery.implanterLeft.length > 0 && (
                              <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                  Implanter Left(s)
                                </label>
                                <p className="font-medium">
                                  {formatEmployeeNames(patientData.surgery.implanterLeft)}
                                </p>
                              </div>
                            )}
                            {patientData.surgery.graftingPerson && patientData.surgery.graftingPerson.length > 0 && (
                              <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                  Grafting Person(s)
                                </label>
                                <p className="font-medium">
                                  {formatEmployeeNames(patientData.surgery.graftingPerson)}
                                </p>
                              </div>
                            )}
                            {patientData.surgery.helper && patientData.surgery.helper.length > 0 && (
                              <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                  Helper(s)
                                </label>
                                <p className="font-medium">
                                  {formatEmployeeNames(patientData.surgery.helper)}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                        <p className="text-gray-500 text-lg">
                          Surgery details not yet entered
                        </p>
                        <p className="text-gray-400 text-sm mt-2">
                          Surgery details will appear here once entered
                        </p>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <p className="text-gray-500 text-lg">
                      No surgery details available
                    </p>
                    <p className="text-gray-400 text-sm mt-2">
                      Surgery details will appear here once entered
                    </p>
                  </div>
                )}
              </div>

              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">
                  AFTER SURGERY CARE
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Head Wash Date
                    </label>
                    <p className="font-medium">
                      {formatDate(patientData.afterSurgery?.headwashDate)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Bandage Removal Date
                    </label>
                    <p className="font-medium">
                      {formatDate(patientData.afterSurgery?.bandageRemovalDate)}
                    </p>
                  </div>
                </div>

                {patientData.afterSurgery?.prp && patientData.afterSurgery.prp.length > 0 ? (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <Droplet className="text-blue-600" size={20} />
                      PRP / GFC Sessions
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">
                              #
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">
                              Type
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">
                              Date
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {patientData.afterSurgery.prp.map((session, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-4 py-2 text-sm">
                                {session.prpNumber || index + 1}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-sm">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  session.type === "GFC"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-blue-100 text-blue-700"
                                }`}>
                                  {session.type || "PRP"}
                                </span>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-sm flex items-center gap-1">
                                <Clock size={14} className="text-gray-500" />
                                {formatDate(session.date)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                    <Droplet className="mx-auto text-gray-400 mb-2" size={32} />
                    <p className="text-gray-500">No PRP / GFC sessions scheduled</p>
                  </div>
                )}
              </div>

              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">
                  PAYMENT INFORMATION
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <div className="bg-gray-50 p-4 rounded border text-center">
                    <label className="block text-sm text-gray-600 mb-1">
                      Total Amount
                    </label>
                    <p className="text-lg font-bold text-gray-900">
                      {formatCurrency(patientData.payments?.totalAmount)}
                    </p>
                  </div>
                  <div className="bg-green-50 p-4 rounded border text-center">
                    <label className="block text-sm text-gray-600 mb-1">
                      Amount Received
                    </label>
                    <p className="text-lg font-bold text-green-600">
                      {formatCurrency(patientData.payments?.amountReceived)}
                    </p>
                  </div>
                  <div className="bg-green-50 p-4 rounded border text-center">
                    <label className="block text-sm text-gray-600 mb-1">
                      Total Discount
                    </label>
                    <p className="text-lg font-bold text-green-600">
                      {formatCurrency(patientData.payments?.discount)}
                    </p>
                  </div>
                  <div className="bg-red-50 p-4 rounded border text-center">
                    <label className="block text-sm text-gray-600 mb-1">
                      Pending Amount
                    </label>
                    <p className="text-lg font-bold text-red-600">
                      {formatCurrency(patientData.payments?.pendingAmount)}
                    </p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded border text-center">
                    <label className="block text-sm text-gray-600 mb-1">
                      Medicine Amount
                    </label>
                    <p className="text-lg font-bold text-blue-600">
                      {formatCurrency(patientData.payments?.medicineAmount)}
                    </p>
                  </div>
                </div>

                {patientData.payments?.transactions &&
                  patientData.payments.transactions.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3">
                        Transaction History
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-gray-300">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">
                                Date
                              </th>
                              <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">
                                Payment Type
                              </th>
                              <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">
                                Branch
                              </th>
                              <th className="border border-gray-300 px-4 py-2 text-right text-sm font-medium text-gray-700">
                                Amount
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {patientData.payments.transactions.map(
                              (transaction, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="border border-gray-300 px-4 py-2 text-sm">
                                    {formatDate(transaction.date)}
                                  </td>
                                  <td className="border border-gray-300 px-4 py-2 text-sm">
                                    {transaction.paymentType || "N/A"}
                                  </td>
                                  <td className="border border-gray-300 px-4 py-2 text-sm">
                                    {transaction.branch || "N/A"}
                                  </td>
                                  <td className="border border-gray-300 px-4 py-2 text-sm text-right font-medium">
                                    {formatCurrency(transaction.amount)}
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
              </div>

              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">
                  DOCUMENTS & ATTACHMENTS
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="text-blue-600" size={20} />
                        <h3 className="font-semibold text-gray-800">
                          Patient Images
                        </h3>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          patientData.documents?.images?.length > 0
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {patientData.documents?.images?.length || 0} file(s)
                      </span>
                    </div>
                    {patientData.documents?.images?.length > 0 && (
                      <div className="space-y-2">
                        {patientData.documents.images.map((img, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-white rounded border text-sm"
                          >
                            <span className="text-gray-700 truncate">
                              Image {idx + 1}
                            </span>
                            <a
                              href={normalizeFileUrl(img)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            >
                              <Eye size={14} />
                              View
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="text-purple-600" size={20} />
                        <h3 className="font-semibold text-gray-800">
                          Consent Forms
                        </h3>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          patientData.documents?.consentForm?.length > 0
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {patientData.documents?.consentForm?.length || 0}{" "}
                        file(s)
                      </span>
                    </div>
                    {patientData.documents?.consentForm?.length > 0 && (
                      <div className="space-y-2">
                        {patientData.documents.consentForm.map((doc, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-white rounded border text-sm"
                          >
                            <span className="text-gray-700 truncate">
                              Consent {idx + 1}
                            </span>
                            <a
                              href={normalizeFileUrl(doc)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            >
                              <Eye size={14} />
                              View
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="text-red-600" size={20} />
                        <h3 className="font-semibold text-gray-800">
                          Surgery Forms
                        </h3>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          patientData.documents?.suregeryForm?.length > 0
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {patientData.documents?.suregeryForm?.length || 0}{" "}
                        file(s)
                      </span>
                    </div>
                    {patientData.documents?.suregeryForm?.length > 0 && (
                      <div className="space-y-2">
                        {patientData.documents.suregeryForm.map((doc, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-white rounded border text-sm"
                          >
                            <span className="text-gray-700 truncate">
                              Surgery Form {idx + 1}
                            </span>
                            <a
                              href={normalizeFileUrl(doc)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            >
                              <Eye size={14} />
                              View
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="text-green-600" size={20} />
                        <h3 className="font-semibold text-gray-800">
                          Consult Forms
                        </h3>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          patientData.documents?.consultForm?.length > 0
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {patientData.documents?.consultForm?.length || 0}{" "}
                        file(s)
                      </span>
                    </div>
                    {patientData.documents?.consultForm?.length > 0 && (
                      <div className="space-y-2">
                        {patientData.documents.consultForm.map((doc, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-white rounded border text-sm"
                          >
                            <span className="text-gray-700 truncate">
                              Consult {idx + 1}
                            </span>
                            <a
                              href={normalizeFileUrl(doc)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            >
                              <Eye size={14} />
                              View
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-300 text-center text-sm text-gray-600">
                <p>
                  This is an electronically generated medical record. No
                  signature required.
                </p>
                <p className="mt-1">
                  Generated on {new Date().toLocaleDateString()} at{" "}
                  {new Date().toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-center gap-4">
            <button
              onClick={downloadPDF}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Download size={20} />
              Download PDF Report
            </button>
            <Link
              href={`/collab/patients/${params.id}/consultation-form`}
              target="_blank"
              className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
            >
              <Printer size={20} />
              Print Consultation Form
            </Link>
            <button
              onClick={() => window.print()}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Printer size={20} />
              Print
            </button>
          </div>
        </div>
      </main>

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-screen">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-10 right-0 text-white text-xl font-bold hover:text-gray-300"
            >
              ✕ Close
            </button>
            <img
              src={selectedImage}
              alt="Patient document"
              className="max-w-full max-h-screen object-contain"
            />
          </div>
        </div>
      )}
    </section>
  );
};

export default PatientProfile;