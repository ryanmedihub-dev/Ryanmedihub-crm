// Exports every Employee and Vendor document to a two-sheet Excel workbook — Name,
// Object ID, and their respective "type" field (Employee.role = post, Vendor.DealsIn =
// deals in), plus a few other identifying columns.
//
// Read-only: only ever runs .find() against the live database, never writes anything —
// no test-DB safety gate needed (compare scripts/entry-acceptance/_harness.mjs, which
// exists because those scripts create documents).
//
// Usage:  node --env-file=.env scripts/export-employees-vendors.mjs [output/path.xlsx]

import mongoose from "mongoose";
import XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

const MONGODB_URI = "mongodb://sachindashzer:user8520@ac-pu86ixj-shard-00-00.hwjor1r.mongodb.net:27017,ac-pu86ixj-shard-00-01.hwjor1r.mongodb.net:27017,ac-pu86ixj-shard-00-02.hwjor1r.mongodb.net:27017/?ssl=true&replicaSet=atlas-ool7b4-shard-0&authSource=admin&appName=crm";
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI (run with: node --env-file=.env scripts/export-employees-vendors.mjs)");
  process.exit(1);
}

function autoWidth(sheet, rows) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  sheet["!cols"] = headers.map((h) => {
    const longest = Math.max(h.length, ...rows.map((r) => String(r[h] ?? "").length));
    return { wch: Math.min(Math.max(longest + 2, 10), 45) };
  });
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  const employees = await mongoose.connection
    .collection("employees")
    .find({}, { projection: { name: 1, role: 1, branch: 1, phone: 1, email: 1, isactive: 1 } })
    .sort({ name: 1 })
    .toArray();

  const vendors = await mongoose.connection
    .collection("vendors")
    .find({}, { projection: { name: 1, DealsIn: 1, contact: 1, email: 1, address: 1, gstNumber: 1 } })
    .sort({ name: 1 })
    .toArray();

  const employeeRows = employees.map((e) => ({
    Name: e.name || "",
    "Object ID": String(e._id),
    Post: e.role || "",
    Branch: e.branch || "",
    Phone: e.phone || "",
    Email: e.email || "",
    Active: e.isactive === false ? "No" : "Yes",
  }));

  const vendorRows = vendors.map((v) => ({
    Name: v.name || "",
    "Object ID": String(v._id),
    "Deals In": v.DealsIn || "",
    Contact: v.contact ?? "",
    Email: v.email || "",
    Address: v.address || "",
    "GST Number": v.gstNumber || "",
  }));

  const wb = XLSX.utils.book_new();

  const empSheet = XLSX.utils.json_to_sheet(employeeRows);
  autoWidth(empSheet, employeeRows);
  XLSX.utils.book_append_sheet(wb, empSheet, "Employees");

  const venSheet = XLSX.utils.json_to_sheet(vendorRows);
  autoWidth(venSheet, vendorRows);
  XLSX.utils.book_append_sheet(wb, venSheet, "Vendors");

  const outPath = path.resolve(
    process.cwd(),
    process.argv[2] || `scripts/exports/employees-vendors-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  XLSX.writeFile(wb, outPath);

  console.log(`Wrote ${employeeRows.length} employees and ${vendorRows.length} vendors to ${outPath}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
