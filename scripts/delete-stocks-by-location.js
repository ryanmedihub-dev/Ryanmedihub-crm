// Usage: node scripts/delete-stocks-by-location.js Delhi           (dry run: counts only)
//        node scripts/delete-stocks-by-location.js Delhi --confirm (actually deletes)
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://sachindashzer:user8520@ac-pu86ixj-shard-00-00.hwjor1r.mongodb.net:27017,ac-pu86ixj-shard-00-01.hwjor1r.mongodb.net:27017,ac-pu86ixj-shard-00-02.hwjor1r.mongodb.net:27017/?ssl=true&replicaSet=atlas-ool7b4-shard-0&authSource=admin&appName=crm";

const location = process.argv[2] || "Delhi";
const confirm = process.argv.includes("--confirm");

const Stock =
  mongoose.models.Stock ||
  mongoose.model("Stock", new mongoose.Schema({ location: String }, { strict: false }));

const filter = { location };
// strength 2 = case-insensitive, so "delhi" is not silently left behind
const opts = { collation: { locale: "en", strength: 2 } };

async function run() {
  await mongoose.connect(MONGODB_URI);
  const count = await Stock.countDocuments(filter, opts);

  if (!confirm) {
    console.log(`${count} stocks match location "${location}". Re-run with --confirm to delete them.`);
  } else {
    const { deletedCount } = await Stock.deleteMany(filter, opts);
    console.log(`Deleted ${deletedCount} of ${count} stocks with location "${location}"`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
