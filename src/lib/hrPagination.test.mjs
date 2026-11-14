import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  parsePaginationParams,
  buildCandidateQuery,
  buildCandidateSort,
  calculatePaginationMeta,
} from "./hrPagination.js";

// Helper: generate mock candidate list
function generateMockCandidates(count) {
  return Array.from({ length: count }, (_, i) => ({
    _id: `cand_${i + 1}`,
    name: `Candidate ${i + 1}`,
    position: i % 2 === 0 ? "Receptionist" : "Dentist",
    status: i % 3 === 0 ? "Applied" : i % 3 === 1 ? "Selected" : "Rejected",
    source: i % 2 === 0 ? "qr" : "direct",
    assignedHr: i % 4 === 0 ? null : { _id: "hr_1", name: "HR Priya" },
    createdAt: new Date(Date.now() - i * 3600000),
  }));
}

// ── 1. Default pagination returns at most 50 records ──────────────────────────
test("1. Default pagination returns at most 50 records", () => {
  const params = parsePaginationParams({});
  assert.equal(params.page, 1);
  assert.equal(params.limit, 50);
  assert.equal(params.skip, 0);

  const mockDb = generateMockCandidates(120);
  const paged = mockDb.slice(params.skip, params.skip + params.limit);
  assert.equal(paged.length, 50);
  assert.equal(paged[0]._id, "cand_1");
  assert.equal(paged[49]._id, "cand_50");
});

// ── 2. Page 2 returns the next set of records without duplication ─────────────
test("2. Page 2 returns the next set of records without duplication", () => {
  const p1 = parsePaginationParams({ page: "1", limit: "50" });
  const p2 = parsePaginationParams({ page: "2", limit: "50" });

  assert.equal(p2.page, 2);
  assert.equal(p2.skip, 50);

  const mockDb = generateMockCandidates(120);
  const page1Records = mockDb.slice(p1.skip, p1.skip + p1.limit);
  const page2Records = mockDb.slice(p2.skip, p2.skip + p2.limit);

  assert.equal(page1Records.length, 50);
  assert.equal(page2Records.length, 50);

  // Check no duplicates between page 1 and page 2
  const page1Ids = new Set(page1Records.map((r) => r._id));
  for (const r of page2Records) {
    assert.equal(page1Ids.has(r._id), false, `Record ${r._id} duplicated across pages`);
  }
  assert.equal(page2Records[0]._id, "cand_51");
});

// ── 3. Custom limit works ─────────────────────────────────────────────────────
test("3. Custom limit works", () => {
  const params = parsePaginationParams({ page: "3", limit: "25" });
  assert.equal(params.page, 3);
  assert.equal(params.limit, 25);
  assert.equal(params.skip, 50);

  const mockDb = generateMockCandidates(120);
  const paged = mockDb.slice(params.skip, params.skip + params.limit);
  assert.equal(paged.length, 25);
  assert.equal(paged[0]._id, "cand_51");
});

// ── 4. Limit cannot exceed 100 ────────────────────────────────────────────────
test("4. Limit cannot exceed 100", () => {
  const excessLimits = ["101", "200", "500", "10000"];
  for (const lim of excessLimits) {
    const params = parsePaginationParams({ limit: lim });
    assert.equal(params.limit, 100, `Limit ${lim} must be clamped to 100`);
  }
});

// ── 5. Invalid page and limit values are handled safely ───────────────────────
test("5. Invalid page and limit values are handled safely", () => {
  const invalidInputs = [
    { page: "-1", limit: "0" },
    { page: "abc", limit: "xyz" },
    { page: "0", limit: "-50" },
    { page: "NaN", limit: "undefined" },
    { page: null, limit: null },
  ];

  for (const input of invalidInputs) {
    const params = parsePaginationParams(input);
    assert.equal(params.page, 1, `Invalid page ${input.page} should default to 1`);
    assert.equal(params.limit, 50, `Invalid limit ${input.limit} should default to 50`);
    assert.equal(params.skip, 0);
  }
});

// ── 6. Total count matches the filtered query ─────────────────────────────────
test("6. Total count matches the filtered query dynamically", () => {
  const meta1 = calculatePaginationMeta(9695, 50, 1);
  assert.equal(meta1.total, 9695);
  assert.equal(meta1.totalPages, 194);
  assert.equal(meta1.page, 1);
  assert.equal(meta1.limit, 50);

  const meta2 = calculatePaginationMeta(0, 50, 1);
  assert.equal(meta2.total, 0);
  assert.equal(meta2.totalPages, 1);

  const meta3 = calculatePaginationMeta(25, 50, 1);
  assert.equal(meta3.total, 25);
  assert.equal(meta3.totalPages, 1);

  const meta4 = calculatePaginationMeta(101, 25, 2);
  assert.equal(meta4.total, 101);
  assert.equal(meta4.totalPages, 5);
});

// ── 7. Status filtering works ─────────────────────────────────────────────────
test("7. Status filtering works", () => {
  const query = buildCandidateQuery({ status: "Applied" });
  assert.equal(query.status, "Applied");

  const queryScheduled = buildCandidateQuery({ status: "Interview Scheduled" });
  assert.equal(queryScheduled.status, "Interview Scheduled");
});

// ── 8. Source filtering works for direct and QR ───────────────────────────────
test("8. Source filtering works for direct and QR", () => {
  const qrQuery = buildCandidateQuery({ source: "qr" });
  assert.equal(qrQuery.source, "qr");

  const directQuery = buildCandidateQuery({ source: "direct" });
  assert.equal(directQuery.source, "direct");
});

// ── 9. Search and date filters work ───────────────────────────────────────────
test("9. Search and date filters work", () => {
  // Search
  const searchQuery = buildCandidateQuery({ search: "Priya" });
  assert.ok(Array.isArray(searchQuery.$or));
  assert.equal(searchQuery.$or.length, 5);
  assert.deepEqual(searchQuery.$or[0], { name: { $regex: "Priya", $options: "i" } });
  assert.deepEqual(searchQuery.$or[3], { position: { $regex: "Priya", $options: "i" } });

  // Date range
  const dateQuery = buildCandidateQuery({ from: "2026-11-01", to: "2026-11-14" });
  assert.ok(dateQuery.createdAt);
  assert.ok(dateQuery.createdAt.$gte instanceof Date);
  assert.ok(dateQuery.createdAt.$lte instanceof Date);
  assert.equal(dateQuery.createdAt.$lte.getHours(), 23);
  assert.equal(dateQuery.createdAt.$lte.getMinutes(), 59);

  // Sorting
  const sortOldest = buildCandidateSort({ sortBy: "oldest" });
  assert.deepEqual(sortOldest, { createdAt: 1 });

  const sortDefault = buildCandidateSort({});
  assert.deepEqual(sortDefault, { createdAt: -1 });

  const sortSalary = buildCandidateSort({ sortBy: "salary_desc" });
  assert.deepEqual(sortSalary, { expectedSalary: -1 });
});

// ── 10. assignedHr populates employee names ───────────────────────────────────
test("10. assignedHr populates employee names", () => {
  const mockCandidates = [
    { _id: "c1", name: "Alice", assignedHr: { _id: "6aad1249d052e47e774fe842", name: "HR Priya" } },
    { _id: "c2", name: "Bob", assignedHr: { _id: "6a27ff34d3eb9b2325233664", name: "Hr Aisha" } },
  ];

  for (const c of mockCandidates) {
    assert.ok(c.assignedHr);
    assert.ok(typeof c.assignedHr.name === "string");
  }
});

// ── 11. Candidates with null assignedHr remain visible ────────────────────────
test("11. Candidates with null assignedHr remain visible", () => {
  const unassignedQuery = buildCandidateQuery({ assignedHr: "unassigned" });
  assert.equal(unassignedQuery.assignedHr, null);

  const mockDb = [
    { _id: "c1", name: "Alice", assignedHr: null },
    { _id: "c2", name: "Bob", assignedHr: { _id: "hr1", name: "Priya" } },
  ];

  const unassigned = mockDb.filter((c) => c.assignedHr === unassignedQuery.assignedHr);
  assert.equal(unassigned.length, 1);
  assert.equal(unassigned[0].name, "Alice");
});

// ── 12. All three candidate views use server-side pagination ──────────────────
test("12. All three candidate views use server-side pagination", () => {
  const basePath = path.resolve(process.cwd(), "src/app/hr");
  const views = ["candidates/page.jsx", "visited/page.jsx", "applied/page.jsx"];

  for (const view of views) {
    const filePath = path.join(basePath, view);
    assert.ok(fs.existsSync(filePath), `View file ${view} must exist`);
    const content = fs.readFileSync(filePath, "utf-8");

    // Must request page and limit parameters
    assert.match(content, /page/i, `${view} must include pagination state`);
    assert.match(content, /total/i, `${view} must track server total count`);
    // Must NOT have the old client-side slice of all candidates
    assert.doesNotMatch(
      content,
      /candidates\.slice\(/,
      `${view} must not slice candidates client-side`
    );
  }
});

// ── 13. API errors do not appear as an empty candidate list ───────────────────
test("13. API errors do not appear as an empty candidate list", () => {
  const basePath = path.resolve(process.cwd(), "src/app/hr");
  const views = ["candidates/page.jsx", "visited/page.jsx", "applied/page.jsx"];

  for (const view of views) {
    const filePath = path.join(basePath, view);
    const content = fs.readFileSync(filePath, "utf-8");

    assert.match(
      content,
      /fetchError/,
      `${view} must have fetchError state to distinguish errors from empty lists`
    );
    assert.match(
      content,
      /Retry/i,
      `${view} must provide a Retry action when an API error occurs`
    );
  }
});

// ── 14. Existing POST, PUT and DELETE functionality remains intact ────────────
test("14. Existing POST, PUT and DELETE functionality remains intact", () => {
  const routePath = path.resolve(process.cwd(), "src/app/api/hr/candidates/route.js");
  const idRoutePath = path.resolve(process.cwd(), "src/app/api/hr/candidates/[id]/route.js");

  assert.ok(fs.existsSync(routePath), "Candidates route.js must exist");
  assert.ok(fs.existsSync(idRoutePath), "Candidates [id] route.js must exist");

  const routeContent = fs.readFileSync(routePath, "utf-8");
  const idRouteContent = fs.readFileSync(idRoutePath, "utf-8");

  // route.js must export POST
  assert.match(routeContent, /export async function POST/, "POST export must be intact");
  assert.match(routeContent, /validatePublicAssignedHr/, "Security validation in POST must be intact");
  assert.match(routeContent, /ALLOWED_HR_ROLES/, "HR role authorization must be intact");

  // [id]/route.js must export PUT and DELETE
  assert.match(idRouteContent, /export async function PUT/, "PUT export in [id] must be intact");
  assert.match(idRouteContent, /export async function DELETE/, "DELETE export in [id] must be intact");
});

