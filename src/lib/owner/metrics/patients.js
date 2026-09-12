import Patient from "@/models/Patient";

// One implementation of the Patients landing numbers (/owner/patients) — the
// API route and Sanya's `get_patients_by_status` tool both call this, so the
// assistant can never disagree with the page for the same filters.
//
// "Conversion rate" here is intentionally broader than the single Converted
// PAGE (which is SURGERY_BOOKED only, per the confirmed mapping) — it counts
// SURGERY_BOOKED + CLOSED (closed implies they were fully paid at some point
// too) against the total, so the landing KPI answers "what fraction of
// patients ever committed", not just "who's exactly at the SURGERY_BOOKED
// step right now".
export async function getPatientsByStatus({ dateFrom = "", dateTo = "", branch = "All" } = {}) {
  const match = {};
  if (branch && branch !== "All") match["personal.branch"] = branch;
  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
    if (dateTo) match.createdAt.$lte = new Date(dateTo);
  }

  const [result] = await Patient.aggregate([
    { $match: match },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              receivedSum: { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
              converted: {
                $sum: { $cond: [{ $in: ["$ops.status", ["SURGERY_BOOKED", "CLOSED"]] }, 1, 0] },
              },
            },
          },
        ],
        statusBreakdown: [{ $group: { _id: "$ops.status", count: { $sum: 1 } } }],
        byBranch: [{ $group: { _id: { $ifNull: ["$personal.branch", "Unknown"] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        daywise: [
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const totalsRow = result.totals?.[0] || { count: 0, receivedSum: 0, converted: 0 };

  return {
    total: totalsRow.count,
    receivedSum: totalsRow.receivedSum,
    converted: totalsRow.converted,
    conversionRate: totalsRow.count ? Math.round((totalsRow.converted / totalsRow.count) * 1000) / 10 : 0,
    statusBreakdown: (result.statusBreakdown || []).map((r) => ({ status: r._id, count: r.count })),
    byBranch: (result.byBranch || []).map((r) => ({ branch: r._id, count: r.count })),
    daywise: (result.daywise || []).map((r) => ({ date: r._id, value: r.count })),
  };
}
