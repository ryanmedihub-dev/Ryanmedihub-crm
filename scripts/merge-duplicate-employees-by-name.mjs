// scripts/merge-duplicate-employees-by-name.mjs
//
// For every employee that has NO employeeId, look for another live employee with the SAME
// name and the SAME post (role), case/space-insensitive. When exactly one match is found,
// merge the no-id record INTO the matched one via the merge engine — every reference
// (patient reference / counsellor / surgery team / incentive rows, payables, receivables,
// advances, borrowings, expense transactions, interview assignments) is repointed onto the
// survivor and every denormalised name is refreshed, then the retired duplicate is deleted.
//
// Nothing is lost: the merge runs in one transaction, records the exact document ids it
// touched into an EmployeeMerge log, and only deletes the duplicate after a post-merge
// verification confirms zero references still point at it. `--keep-retired` skips the delete
// (leaves the duplicate soft-retired + revertable instead).
//
// Dry run:  node --env-file=.env --experimental-loader ./scripts/entry-acceptance/_alias-loader.mjs scripts/merge-duplicate-employees-by-name.mjs
// Apply:    node --env-file=.env --experimental-loader ./scripts/entry-acceptance/_alias-loader.mjs scripts/merge-duplicate-employees-by-name.mjs --apply

import mongoose from "mongoose";
import Employee from "@/models/Employee.js";
import { buildPreview, runMerge } from "@/lib/employees/mergeEngine.js";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI (run with: node --env-file=.env --experimental-loader ./scripts/entry-acceptance/_alias-loader.mjs scripts/merge-duplicate-employees-by-name.mjs)");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const KEEP_RETIRED = process.argv.includes("--keep-retired");
const ACTOR = { name: "merge-duplicate-employees-by-name.mjs", email: "" };

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const hasId = (e) => !!(e.employeeId && String(e.employeeId).trim());

async function main() {
  await mongoose.connect(MONGODB_URI);

  const all = await Employee.find(
    { mergedInto: null },
    "name role employeeId branch createdAt patient",
  ).lean();

  // index by name|role
  const byKey = new Map();
  for (const e of all) {
    const k = `${norm(e.name)}||${norm(e.role)}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(e);
  }

  const noId = all.filter((e) => !hasId(e));
  const pairs = []; // { survivor, duplicate, reason }
  const skipped = []; // { name, why }
  const seen = new Set();

  for (const dup of noId) {
    const group = byKey.get(`${norm(dup.name)}||${norm(dup.role)}`) || [];
    const others = group.filter((e) => String(e._id) !== String(dup._id));
    if (others.length === 0) {
      skipped.push({ name: dup.name, role: dup.role, why: "no same-name/same-post match" });
      continue;
    }
    if (others.length > 1) {
      skipped.push({ name: dup.name, role: dup.role, why: `${others.length} matches — ambiguous, resolve by hand` });
      continue;
    }
    const other = others[0];
    // survivor = the one with an employeeId; if neither has one, the earlier-created record
    const [survivor, duplicate] = hasId(other)
      ? [other, dup]
      : hasId(dup)
        ? [dup, other]
        : new Date(other.createdAt) <= new Date(dup.createdAt)
          ? [other, dup]
          : [dup, other];

    const pk = [String(survivor._id), String(duplicate._id)].sort().join("|");
    if (seen.has(pk)) continue;
    seen.add(pk);
    pairs.push({
      survivor,
      duplicate,
      reason: hasId(survivor) ? "matched record has an employee ID" : "neither has an ID — kept the older record",
    });
  }

  console.log(`${noId.length} employees have no employee ID · ${pairs.length} mergeable pair(s) · ${skipped.length} skipped\n`);

  if (skipped.length) {
    console.log("Skipped:");
    for (const s of skipped) console.log(`  ${String(s.name).padEnd(28)} [${s.role || "-"}]  ${s.why}`);
    console.log("");
  }

  if (pairs.length === 0) {
    await mongoose.disconnect();
    return;
  }

  let merged = 0;
  let failed = 0;

  for (const { survivor, duplicate, reason } of pairs) {
    const pre = await buildPreview({ survivorId: String(survivor._id), duplicateId: String(duplicate._id) });
    if (!pre.success) {
      console.log(`✗ ${survivor.name}  ←  ${duplicate.name}   preview failed: ${pre.error}`);
      failed++;
      continue;
    }
    if ((pre.blockers || []).length) {
      console.log(`✗ ${survivor.name}  ←  ${duplicate.name}   BLOCKED: ${pre.blockers.join(" · ")}`);
      failed++;
      continue;
    }

    // auto-resolve conflicts with the safe default (keep both, relabel — no data loss)
    const conflictResolutions = {};
    for (const c of pre.conflicts || []) conflictResolutions[c.key] = c.defaultResolution || "KEEP_BOTH_RELABEL";
    // fill any gap on the survivor from the duplicate (employeeId, phone, email, salary, …)
    const fieldChoices = {};
    for (const f of pre.fieldDiff || []) if (f.suggest === "duplicate") fieldChoices[f.field] = "duplicate";

    const line = `${survivor.name} [${survivor.role}]  ←  ${duplicate.name}   ${pre.totalReferences} ref(s)` +
      `${pre.conflicts?.length ? `, ${pre.conflicts.length} conflict(s)→KEEP_BOTH_RELABEL` : ""}` +
      `${Object.keys(fieldChoices).length ? `, fill: ${Object.keys(fieldChoices).join("/")}` : ""}   (${reason})`;

    if (!APPLY) {
      console.log(`• ${line}`);
      continue;
    }

    const res = await runMerge({
      survivorId: String(survivor._id),
      duplicateId: String(duplicate._id),
      fieldChoices,
      conflictResolutions,
      confirmToken: pre.confirmToken,
      note: "bulk merge — no-employeeId duplicate folded by name + post",
      actor: ACTOR,
    });

    if (!res.body?.success && !res.body?.verification) {
      console.log(`✗ ${line}\n    -> merge refused: ${res.body?.error || (res.body?.blockers || []).join(" · ")}`);
      failed++;
      continue;
    }

    const clean = res.body?.verification?.clean;
    if (clean && !KEEP_RETIRED) {
      await Employee.deleteOne({ _id: duplicate._id });
      await mongoose.connection.db.collection("deletelogs").insertOne({
        entityType: "Employee",
        entityId: String(duplicate._id),
        entityName: duplicate.name || "",
        entityDetails: { role: duplicate.role, branch: duplicate.branch, mergedInto: String(survivor._id), mergeId: String(res.body.mergeId) },
        deletedBy: ACTOR,
        branch: duplicate.branch || null,
        deletedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`✓ ${line}\n    -> ${res.body.totalReferences} repointed, duplicate deleted (merge ${res.body.mergeId})`);
    } else if (clean) {
      console.log(`✓ ${line}\n    -> ${res.body.totalReferences} repointed, duplicate soft-retired (merge ${res.body.mergeId})`);
    } else {
      console.log(`⚠ ${line}\n    -> merge committed but ${JSON.stringify(res.body.verification?.stillReferenced)} still points at the duplicate — left in place, investigate`);
    }
    merged++;
  }

  console.log(`\n${APPLY ? "Applied" : "Dry run"} — ${merged} merged, ${failed} failed/blocked, ${skipped.length} skipped.`);
  if (!APPLY && pairs.length) console.log("Re-run with --apply to perform these merges.");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
