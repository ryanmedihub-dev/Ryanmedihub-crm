/**
 * src/lib/entryAuditPipeline.js
 *
 * The entry audit as a Mongo aggregation, generated from the rule data in
 * entryAudit.js. Running it server-side is what keeps the Entries Report fast:
 * auditing in Node means shipping every matching patient to the app (~1.4s per
 * 8k patients), while this returns one page plus the summary (~250ms).
 *
 * auditPatient() in entryAudit.js stays the readable reference implementation;
 * entryAuditParity.test.mjs asserts the two agree on real documents.
 *
 * ponytail: ~800ms for 8k patients, most of it evaluating the field rules on
 * every matched document. If that becomes a problem, stamp priority/score onto
 * the patient on save and the report turns into an indexed find + sort - at the
 * cost of a backfill script and re-stamping whenever the rules change.
 */

import {
  ALL_STATUSES,
  DOC_SECTIONS,
  READ_PATHS,
  IMAGE_RE_SRC,
  PDF_RE_SRC,
  PHONE_RE_SRC,
  SEVERITY_WEIGHT,
  rulesFor,
} from "./entryAudit.js";

/** Per-section file tallies, so document URL arrays never leave the server. */
export function docCountsExpr() {
  const out = {};
  const re = (src) => ({
    $regexMatch: { input: { $ifNull: ["$$u", ""] }, regex: src, options: "i" },
  });
  for (const [key, cfg] of Object.entries(DOC_SECTIONS)) {
    const input = { $ifNull: [`$documents.${key}`, []] };
    const opposite = cfg.expects === "pdf" ? IMAGE_RE_SRC : PDF_RE_SRC;
    out[key] = {
      n: { $size: input },
      wrong: { $size: { $filter: { input, as: "u", cond: re(opposite) } } },
      unknown: {
        $size: {
          $filter: {
            input,
            as: "u",
            cond: { $and: [{ $not: [re(IMAGE_RE_SRC)] }, { $not: [re(PDF_RE_SRC)] }] },
          },
        },
      },
    };
  }
  return out;
}

/** Mirrors filled() from entryAudit.js: empty string/0/false/[]/absent. */
function emptyExpr(field) {
  if (field.startsWith("documents.")) {
    return { $eq: [{ $ifNull: [`$docCounts.${field.slice(10)}.n`, 0] }, 0] };
  }
  return {
    $let: {
      vars: { v: `$${field}` },
      in: {
        $or: [
          { $in: [{ $type: "$$v" }, ["missing", "null"]] },
          { $eq: ["$$v", 0] },
          { $eq: ["$$v", false] },
          { $and: [{ $isArray: "$$v" }, { $eq: [{ $size: "$$v" }, 0] }] },
          {
            $and: [
              { $eq: [{ $type: "$$v" }, "string"] },
              {
                $eq: [
                  {
                    $trim: {
                      input: { $cond: [{ $eq: [{ $type: "$$v" }, "string"] }, "$$v", " "] },
                    },
                  },
                  "",
                ],
              },
            ],
          },
        ],
      },
    },
  };
}

/**
 * One entry per distinct (field, label, severity, section), carrying the
 * statuses that rule applies to - the same layering rulesFor() resolves.
 */
function missingSpecs() {
  const map = new Map();
  for (const status of ALL_STATUSES) {
    for (const [field, r] of Object.entries(rulesFor(status))) {
      const k = JSON.stringify([field, r.label, r.severity, r.section]);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(status);
    }
  }
  return [...map.entries()].map(([k, statuses]) => {
    const [field, label, severity, section] = JSON.parse(k);
    return { field, label, severity, section, statuses };
  });
}

const one = (issue) => [issue];

/* -- Money: mirrors num() and template strings in auditPatient ------------ */

/** Anything unparseable counts as 0, like Number.isFinite(Number(v)) ? … : 0. */
const money = (path) => ({
  $convert: { input: `$${path}`, to: "double", onError: 0, onNull: 0 },
});

/** String(n) semantics: whole numbers print without a decimal point. */
const moneyStr = (expr) => ({
  $toString: {
    $let: {
      vars: { v: expr },
      in: { $cond: [{ $eq: [{ $mod: ["$$v", 1] }, 0] }, { $toLong: "$$v" }, "$$v"] },
    },
  },
});

const TOTAL = money("payments.totalAmount");
const RECEIVED = money("payments.amountReceived");
const DISCOUNT = money("payments.discount");
const PENDING = money("payments.pendingAmount");

function moneyParts() {
  return [
    {
      $cond: [
        {
          $and: [
            { $gt: [TOTAL, 0] },
            {
              $gt: [
                { $abs: { $subtract: [TOTAL, { $add: [RECEIVED, DISCOUNT, PENDING] }] } },
                1,
              ],
            },
          ],
        },
        one({
          field: "payments.totalAmount",
          label: "Payment figures do not reconcile",
          severity: "high",
          section: "Payments",
          type: "invalid",
          detail: {
            $concat: [
              "Total ", moneyStr(TOTAL),
              " != Received ", moneyStr(RECEIVED),
              " + Discount ", moneyStr(DISCOUNT),
              " + Pending ", moneyStr(PENDING),
            ],
          },
        }),
        [],
      ],
    },
    {
      $cond: [
        { $and: [{ $gt: [TOTAL, 0] }, { $gt: [RECEIVED, TOTAL] }] },
        one({
          field: "payments.amountReceived",
          label: "Received amount exceeds total",
          severity: "high",
          section: "Payments",
          type: "invalid",
          detail: { $concat: ["Received ", moneyStr(RECEIVED), " > Total ", moneyStr(TOTAL)] },
        }),
        [],
      ],
    },
    {
      $cond: [
        { $lt: [PENDING, 0] },
        one({
          field: "payments.pendingAmount",
          label: "Negative pending amount",
          severity: "medium",
          section: "Payments",
          type: "invalid",
          detail: { $concat: ["Stored value: ", moneyStr(PENDING)] },
        }),
        [],
      ],
    },
    {
      $cond: [
        { $and: [{ $eq: ["$status", "CLOSED"] }, { $gt: [PENDING, 0] }] },
        one({
          field: "payments.pendingAmount",
          label: "Surgery closed with pending balance",
          severity: "medium",
          section: "Payments",
          type: "invalid",
          detail: { $concat: ["Pending ", moneyStr(PENDING)] },
        }),
        [],
      ],
    },
  ];
}

/** The $issues expression: missing tracked fields + format alerts + bad phone. */
function issuesExpr() {
  const parts = [];

  for (const s of missingSpecs()) {
    const cond =
      s.statuses.length === ALL_STATUSES.length
        ? emptyExpr(s.field)
        : { $and: [{ $in: ["$status", s.statuses] }, emptyExpr(s.field)] };
    parts.push({
      $cond: [
        cond,
        one({
          field: s.field,
          label: s.label,
          severity: s.severity,
          section: s.section,
          type: "missing",
        }),
        [],
      ],
    });
  }

  for (const [key, cfg] of Object.entries(DOC_SECTIONS)) {
    const expectLabel = cfg.expects === "pdf" ? "PDF" : "image";
    parts.push({
      $cond: [
        { $gt: [`$docCounts.${key}.wrong`, 0] },
        one({
          field: `documents.${key}`,
          label: `${cfg.label} - wrong file format`,
          severity: "high",
          section: "Documents",
          type: "format",
          detail: {
            $concat: [
              { $toString: `$docCounts.${key}.wrong` },
              " of ",
              { $toString: `$docCounts.${key}.n` },
              ` file(s) are not ${expectLabel}; this section only accepts ${expectLabel} files`,
            ],
          },
        }),
        [],
      ],
    });
    parts.push({
      $cond: [
        { $gt: [`$docCounts.${key}.unknown`, 0] },
        one({
          field: `documents.${key}`,
          label: `${cfg.label} - unreadable file type`,
          severity: "medium",
          section: "Documents",
          type: "format",
          detail: {
            $concat: [
              { $toString: `$docCounts.${key}.unknown` },
              ` file(s) carry no recognisable ${expectLabel} extension`,
            ],
          },
        }),
        [],
      ],
    });
  }

  parts.push({
    $cond: [
      {
        $and: [
          { $eq: [{ $type: "$personal.phone" }, "string"] },
          { $ne: [{ $ifNull: ["$personal.phone", ""] }, ""] },
          {
            $not: [
              {
                $regexMatch: {
                  input: { $ifNull: ["$personal.phone", ""] },
                  regex: PHONE_RE_SRC,
                },
              },
            ],
          },
        ],
      },
      one({
        field: "personal.phone",
        label: "Phone is not a valid 10-digit number",
        severity: "high",
        section: "Personal",
        type: "invalid",
        detail: { $concat: ["Stored value: ", { $ifNull: ["$personal.phone", ""] }] },
      }),
      [],
    ],
  });

  parts.push(...moneyParts());

  return { $concatArrays: parts };
}

const sizeWhere = (severity) => ({
  $size: { $filter: { input: "$issues", as: "i", cond: { $eq: ["$$i.severity", severity] } } },
});

/** Stages that turn raw patients into audited rows (no paging/faceting yet). */
export function auditStages() {
  const project = { status: "$ops.status", createdAt: 1 };
  for (const p of READ_PATHS) project[p] = 1;
  project.docCounts = docCountsExpr();

  return [
    { $project: project },
    { $addFields: { issues: issuesExpr() } },
    {
      $addFields: {
        counts: { high: sizeWhere("high"), medium: sizeWhere("medium"), low: sizeWhere("low") },
        refDate: { $ifNull: ["$personal.visitDate", "$createdAt"] },
      },
    },
    {
      $addFields: {
        issueCount: { $size: "$issues" },
        score: {
          $add: [
            { $multiply: ["$counts.high", SEVERITY_WEIGHT.high] },
            { $multiply: ["$counts.medium", SEVERITY_WEIGHT.medium] },
            { $multiply: ["$counts.low", SEVERITY_WEIGHT.low] },
          ],
        },
        priority: {
          $switch: {
            branches: [
              { case: { $gt: ["$counts.high", 0] }, then: "high" },
              { case: { $gt: ["$counts.medium", 0] }, then: "medium" },
              { case: { $gt: ["$counts.low", 0] }, then: "low" },
            ],
            default: null,
          },
        },
      },
    },
  ];
}

const SORTS = {
  priority: { score: -1, refDate: -1 },
  issues: { issueCount: -1, score: -1 },
  name: { "personal.name": 1 },
  status: { status: 1, score: -1 },
  newest: { refDate: -1 },
  oldest: { refDate: 1 },
};

const ROW_FIELDS = {
  _id: 1,
  name: { $ifNull: ["$personal.name", ""] },
  phone: { $ifNull: ["$personal.phone", ""] },
  branch: { $ifNull: ["$personal.branch", ""] },
  status: 1,
  visitDate: "$personal.visitDate",
  surgeryDate: "$surgery.surgeryDate",
  createdAt: 1,
  counsellorId: "$counselling.counsellor",
  priority: 1,
  score: 1,
  counts: 1,
  issues: 1,
};

/**
 * Full pipeline: audited rows for one page, plus the summary over everything
 * matched. One round trip, one pass over the matched patients.
 */
export function buildAuditPipeline({
  match,
  priorities = [],
  sections = [],
  types = [],
  sort = "priority",
  skip = 0,
  limit = 50,
}) {
  const rowMatch = { priority: { $ne: null } };
  if (priorities.length) rowMatch.priority = { $in: priorities };
  if (sections.length) rowMatch["issues.section"] = { $in: sections };
  if (types.length) rowMatch["issues.type"] = { $in: types };

  return [
    { $match: match },
    ...auditStages(),
    {
      $facet: {
        rows: [
          { $match: rowMatch },
          { $sort: SORTS[sort] || SORTS.priority },
          { $skip: skip },
          { $limit: limit },
          { $project: ROW_FIELDS },
        ],
        filtered: [{ $match: rowMatch }, { $count: "n" }],
        summary: [
          {
            $group: {
              _id: { $ifNull: ["$priority", "clean"] },
              n: { $sum: 1 },
              issues: { $sum: "$issueCount" },
            },
          },
        ],
        topIssues: [
          { $unwind: "$issues" },
          {
            $group: {
              _id: { label: "$issues.label", severity: "$issues.severity" },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 12 },
        ],
      },
    },
  ];
}

/** Shapes one $facet result into the API response body. */
export function shapeFacet(facet) {
  const summary = { high: 0, medium: 0, low: 0, clean: 0, issues: 0, scanned: 0 };
  for (const g of facet.summary || []) {
    summary[g._id] = g.n;
    summary.issues += g.issues || 0;
    summary.scanned += g.n;
  }
  return {
    rows: facet.rows || [],
    total: facet.filtered?.[0]?.n || 0,
    summary,
    topIssues: (facet.topIssues || []).map((t) => ({
      label: t._id.label,
      severity: t._id.severity,
      count: t.count,
    })),
  };
}
