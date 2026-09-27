import Patient from "@/models/Patient";
import Transactions from "@/models/Transactions";
import { CONVERTED_STATUSES } from "@/lib/owner/patientStatus";
import { istDayBucket, periodBounds } from "@/lib/owner/dates";
import { revenueMatch } from "@/lib/transactionFilters";

export async function getPatientsByStatus({ dateFrom = "", dateTo = "", branch = "All" } = {}) {
  const match = {};
  if (branch && branch !== "All") match["personal.branch"] = branch;
  const createdBounds = periodBounds(dateFrom, dateTo);
  if (createdBounds) match.createdAt = createdBounds;

  const txMatch = { ...revenueMatch(), patient: { $ne: null } };
  if (branch && branch !== "All") txMatch.branch = branch;
  if (createdBounds) txMatch.date = createdBounds;

  const [[result], [cash]] = await Promise.all([
    Patient.aggregate([
      { $match: match },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                packageSum: { $sum: { $ifNull: ["$payments.totalAmount", 0] } },
                converted: { $sum: { $cond: [{ $in: ["$ops.status", CONVERTED_STATUSES] }, 1, 0] } },
              },
            },
          ],
          statusBreakdown: [{ $group: { _id: "$ops.status", count: { $sum: 1 } } }],
          byBranch: [{ $group: { _id: { $ifNull: ["$personal.branch", "Unknown"] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          daywise: [
            { $group: { _id: istDayBucket("$createdAt"), count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]),
    Transactions.aggregate([
      { $match: txMatch },
      { $group: { _id: null, total: { $sum: { $toDouble: "$amount" } }, count: { $sum: 1 } } },
    ]),
  ]);

  const totalsRow = result.totals?.[0] || { count: 0, packageSum: 0, converted: 0 };

  return {
    total: totalsRow.count,
    receivedSum: Math.round((cash?.total || 0) * 100) / 100,
    receiptCount: cash?.count || 0,
    packageSum: Math.round((totalsRow.packageSum || 0) * 100) / 100,
    converted: totalsRow.converted,
    conversionRate: totalsRow.count ? Math.round((totalsRow.converted / totalsRow.count) * 1000) / 10 : 0,
    statusBreakdown: (result.statusBreakdown || []).map((r) => ({ status: r._id, count: r.count })),
    byBranch: (result.byBranch || []).map((r) => ({ branch: r._id, count: r.count })),
    daywise: (result.daywise || []).map((r) => ({ date: r._id, value: r.count })),
  };
}
