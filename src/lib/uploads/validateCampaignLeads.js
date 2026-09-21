// The one validation pipeline for the campaign-lead bulk upload. /validate calls it and
// returns the results; /commit calls it again from scratch (never trusting the client's
// payloads) before creating anything. SERVER ONLY. Mirrors src/lib/uploads/validatePipeline.js's
// shape ({ summary, results }, canonicalHash/rowHash per row) — much simpler than the payable
// pipeline since there's no payee resolution, no tax, no period lock.

import crypto from "node:crypto";
import CampaignLead from "@/models/CampaignLead";
import { normalizePhone } from "@/lib/phone";
import { parseCampaignLeadRow, MAX_ROWS } from "@/lib/uploads/campaignLeadRowMapper";

export { MAX_ROWS };

function canonicalHash(payload) {
  const sortDeep = (v) => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === "object") {
      return Object.keys(v)
        .sort()
        .reduce((acc, k) => {
          acc[k] = sortDeep(v[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return crypto.createHash("sha256").update(JSON.stringify(sortDeep(payload))).digest("hex");
}

/**
 * @param rows      array of raw sheet-row objects (header key -> cell value)
 * @param campaign  the loaded AdCampaign document (caller has already confirmed it exists —
 *                  campaign existence is a request-level guard, not a per-row concern)
 * @returns { summary, results }
 */
export async function runValidateCampaignLeads(rows, campaign) {
  const parsed = rows.map((raw, i) => parseCampaignLeadRow(raw || {}, i + 2));

  const normalizedPhones = [];
  for (const row of parsed) {
    if (!row.phone) continue;
    const n = normalizePhone(row.phone);
    if (n) normalizedPhones.push(n);
  }
  const uniquePhones = [...new Set(normalizedPhones)];

  // Batched, not per-row: (a) already uploaded for THIS campaign — skipped, not an error,
  // this is the normal case when a marketer re-uploads a cumulative export; (b) uploaded
  // against a DIFFERENT campaign — a non-blocking warning naming that campaign, the cross-
  // campaign overlap an owner wants visibility into.
  const [sameCampaign, otherCampaignRows] = await Promise.all([
    uniquePhones.length
      ? CampaignLead.find({ campaign: campaign._id, phoneNormalized: { $in: uniquePhones } })
          .select("phoneNormalized")
          .lean()
      : Promise.resolve([]),
    uniquePhones.length
      ? CampaignLead.find({ campaign: { $ne: campaign._id }, phoneNormalized: { $in: uniquePhones } })
          .select("phoneNormalized campaign")
          .populate("campaign", "name")
          .lean()
      : Promise.resolve([]),
  ]);
  const existingInCampaign = new Set(sameCampaign.map((r) => r.phoneNormalized));
  const otherCampaignByPhone = new Map();
  for (const r of otherCampaignRows) {
    if (!otherCampaignByPhone.has(r.phoneNormalized)) {
      otherCampaignByPhone.set(r.phoneNormalized, r.campaign?.name || "another campaign");
    }
  }

  const seenInFile = new Map(); // normalizedPhone -> first rowNumber
  const results = [];

  for (const row of parsed) {
    const errors = [...row.errors];
    const warnings = [];

    const phoneNormalized = row.phone ? normalizePhone(row.phone) : null;
    if (row.phone && (!phoneNormalized || phoneNormalized.length !== 10)) {
      errors.push(`Phone "${row.phone}" does not normalize to a 10-digit number.`);
    }

    let alreadyExists = false;
    let otherCampaignName = null;
    let dupOfRow = null;

    if (phoneNormalized) {
      if (existingInCampaign.has(phoneNormalized)) {
        alreadyExists = true;
        warnings.push("Already uploaded for this campaign — will be skipped on import.");
      }
      if (otherCampaignByPhone.has(phoneNormalized)) {
        otherCampaignName = otherCampaignByPhone.get(phoneNormalized);
        warnings.push(`This phone was also uploaded against "${otherCampaignName}" — counted in both.`);
      }
      const firstRow = seenInFile.get(phoneNormalized);
      if (firstRow) {
        dupOfRow = firstRow;
        warnings.push(`Duplicate of row ${firstRow} within this file — only the first is imported.`);
      } else {
        seenInFile.set(phoneNormalized, row.rowNumber);
      }
    }

    const payload = phoneNormalized
      ? {
          campaign: campaign._id,
          platform: campaign.platform,
          branch: campaign.branch,
          name: row.name,
          phone: row.phone,
          phoneNormalized,
          email: row.email,
          city: row.city,
          leadDate: row.leadDate,
          extraDetails: row.extraDetails,
        }
      : null;

    const result = {
      rowNumber: row.rowNumber,
      status: errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok",
      errors,
      warnings,
      payload,
      preview: {
        name: row.name || "",
        phone: row.phone || "",
        email: row.email || "",
        city: row.city || "",
        leadDate: row.leadDate ? row.leadDate.toISOString().slice(0, 10) : "",
        extraDetails: row.extraDetails,
        alreadyExists,
        otherCampaignName,
        dupOfRow,
      },
      rowHash: payload ? canonicalHash(payload) : null,
      // Not created even when status isn't "error" — either it's already in this campaign,
      // or it's a within-file repeat of an earlier row.
      skipCreate: alreadyExists || dupOfRow !== null,
    };
    results.push(result);
  }

  const willCreateDocs = results.filter((r) => r.status !== "error" && !r.skipCreate).length;

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    warning: results.filter((r) => r.status === "warning").length,
    error: results.filter((r) => r.status === "error").length,
    willCreateDocs,
    alreadyInCampaign: results.filter((r) => r.preview.alreadyExists).length,
    duplicateInFile: results.filter((r) => r.preview.dupOfRow !== null).length,
    overlapWithOtherCampaigns: results.filter((r) => r.preview.otherCampaignName).length,
  };

  return { summary, results };
}
