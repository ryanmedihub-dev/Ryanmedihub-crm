// One-time migration: match existing AdSpend.campaignName (free text) to the
// new AdCampaign records by name, within the same platform, and write
// AdSpend.campaignId on unambiguous matches only.
//
// This is only useful once campaigns exist (src/models/AdCampaign.js is new
// as of Owner Panel v2, Part 4) — on a fresh run before any campaign has been
// created via /owner/marketing/campaigns, it will correctly report zero
// matches. Re-run it any time after adding campaigns; it's idempotent (skips
// AdSpend rows that already have a campaignId).
//
// Dry run:  node --env-file=.env scripts/link-adspend-campaigns.mjs
// Apply:    node --env-file=.env scripts/link-adspend-campaigns.mjs --apply

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI (run with: node --env-file=.env scripts/link-adspend-campaigns.mjs)");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

const norm = (s) => String(s || "").trim().toLowerCase();

async function main() {
  await mongoose.connect(MONGODB_URI);
  const adSpend = mongoose.connection.collection("adspends");
  const adCampaigns = mongoose.connection.collection("adcampaigns");

  const campaigns = await adCampaigns.find({}, { projection: { name: 1, nameKey: 1, platform: 1 } }).toArray();
  const campaignByKey = new Map(campaigns.map((c) => [`${c.platform}::${norm(c.nameKey || c.name)}`, c]));

  const rows = await adSpend
    .find(
      { campaignId: null, campaignName: { $ne: "" } },
      { projection: { campaignName: 1, platform: 1, date: 1 } },
    )
    .toArray();

  const matched = [];
  const unmatched = [];
  for (const row of rows) {
    const campaign = campaignByKey.get(`${row.platform}::${norm(row.campaignName)}`);
    if (campaign) matched.push({ row, campaign });
    else unmatched.push(row);
  }

  const line = "-".repeat(72);
  console.log(line);
  console.log(`AdCampaign records available: ${campaigns.length}`);
  console.log(`AdSpend rows with a campaignName and no campaignId yet: ${rows.length}`);
  console.log(line);

  console.log(`\nMATCHED (${matched.length})`);
  for (const { row, campaign } of matched.slice(0, 50)) {
    console.log(`  [${row.platform}] "${row.campaignName}" -> ${campaign.name} (${campaign._id})`);
  }
  if (matched.length > 50) console.log(`  ...and ${matched.length - 50} more`);

  console.log(`\nUNMATCHED (${unmatched.length}) — left alone, not guessed`);
  const unmatchedNames = new Set(unmatched.map((r) => `${r.platform}::${r.campaignName}`));
  for (const key of [...unmatchedNames].slice(0, 50)) {
    const [platform, name] = key.split("::");
    console.log(`  [${platform}] "${name}"`);
  }
  if (unmatchedNames.size > 50) console.log(`  ...and ${unmatchedNames.size - 50} more distinct names`);

  if (campaigns.length === 0) {
    console.log("\nNo AdCampaign records exist yet — create some at /owner/marketing/campaigns, then re-run this.");
  }

  if (APPLY && matched.length) {
    const ops = matched.map(({ row, campaign }) => ({
      updateOne: { filter: { _id: row._id }, update: { $set: { campaignId: campaign._id } } },
    }));
    const res = await adSpend.bulkWrite(ops);
    console.log(`\nApplied. Modified ${res.modifiedCount} AdSpend row(s).`);
  } else if (matched.length) {
    console.log(`\nDry run only. Re-run with --apply to write ${matched.length} link(s).`);
  } else {
    console.log("\nNothing to apply.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
