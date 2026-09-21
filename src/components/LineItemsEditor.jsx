"use client";

import SearchableSelect from "@/components/SearchableSelect";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";

const SERVICE_PROCEDURES = ["PRP", "GFC", "Alopecia", "Canacot", "Headwash", "Other"];
const SERVICE_LABELS = { PRP: "PRP", GFC: "GFC", Alopecia: "ALOPECIA", Canacot: "CANACOT", Headwash: "HEADWASH", Other: "OTHER" };

const blankItem = (kind) =>
  kind === "service"
    ? { id: Date.now(), procedure: "PRP", quantity: 1, perSessionCost: "", totalAmount: 0 }
    : { id: Date.now(), medicineId: "", medicineName: "", quantity: 1, perUnitCost: "", totalAmount: 0 };

const rateField = (kind) => (kind === "service" ? "perSessionCost" : "perUnitCost");

export default function LineItemsEditor({ kind, items, onChange, medicines = [] }) {
  const rf = rateField(kind);

  const addItem = () => onChange([...items, blankItem(kind)]);

  const removeItem = (id) => {
    if (items.length === 1) {
      alert(`At least one ${kind === "service" ? "service" : "medicine"} is required`);
      return;
    }
    onChange(items.filter((i) => i.id !== id));
  };

  const updateItem = (id, field, value) => {
    onChange(
      items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (kind === "medicine" && field === "medicineId" && value) {
          const med = medicines.find((m) => m._id === value);
          if (med) {
            updated.medicineName = med.name;
            if (!updated.perUnitCost) updated.perUnitCost = med.soldAmt || med.mrp || "";
          }
        }
        if (field === "quantity" || field === rf) {
          const qty = parseFloat(field === "quantity" ? value : updated.quantity);
          const price = parseFloat(field === rf ? value : updated[rf]);
          updated.totalAmount = !isNaN(qty) && !isNaN(price) ? qty * price : 0;
        }
        return updated;
      }),
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {kind === "service" ? "Service Items" : "Medicine Items"}
        </h3>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus size={18} />
          {kind === "service" ? "Add Service" : "Add Medicine"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">#</th>
              <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">
                {kind === "service" ? "Service Type" : "Medicine"}
              </th>
              <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Quantity</th>
              <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">
                {kind === "service" ? "Per Session Cost" : "Per Unit Cost"}
              </th>
              <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Total</th>
              <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-3 px-2 text-sm text-gray-600">{index + 1}</td>
                <td className="py-3 px-2">
                  {kind === "service" ? (
                    <select
                      value={item.procedure}
                      onChange={(e) => updateItem(item.id, "procedure", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {SERVICE_PROCEDURES.map((p) => (
                        <option key={p} value={p}>{SERVICE_LABELS[p]}</option>
                      ))}
                    </select>
                  ) : (
                    <SearchableSelect
                      options={medicines}
                      value={item.medicineId}
                      onChange={(v) => updateItem(item.id, "medicineId", v)}
                      placeholder="Select medicine"
                      valueKey="_id"
                      formatOption={(m) => `${m.name} (Stock: ${m.totalQuantity}) - MRP: ${formatCurrency(m.mrp)}`}
                      className="w-full"
                    />
                  )}
                </td>
                <td className="py-3 px-2">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </td>
                <td className="py-3 px-2">
                  <input
                    type="number"
                    value={item[rf]}
                    onChange={(e) => updateItem(item.id, rf, e.target.value)}
                    min="0"
                    placeholder="₹"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </td>
                <td className="py-3 px-2">
                  <div className="font-semibold text-indigo-600">{formatCurrency(item.totalAmount)}</div>
                </td>
                <td className="py-3 px-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={items.length === 1}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
