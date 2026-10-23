import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { withDB } from "@/lib/withDB";
import Patient from "@/models/Patient";
import Employee from "@/models/Employee";
import { byName, byKey } from "@/lib/sortOptions";
import { cacheKey, cached } from "@/lib/cache";

const handler = async (req) => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const meta = {};
    const key = cacheKey("patients-filters", {}, null);
    const payload = await cached(key, 300, async () => {
      const [counsellors, agents, doctors, seniorTechs, implanters, t1, t2, t3, surgeryLocations] =
        await Promise.all([
          Employee.find({ role: "Counsellor", isactive: true }, { name: 1 }).lean(),
          Employee.find({ role: "Agent",      isactive: true }, { name: 1 }).lean(),
          Employee.find({ role: "Doctor",     isactive: true }, { name: 1 }).lean(),
          Employee.find({ role: "Technician", isactive: true }, { name: 1 }).lean(),
          Employee.find({ role: "Implanter",  isactive: true }, { name: 1 }).lean(),
          Patient.distinct("counselling.techniqueSuggested"),
          Patient.distinct("surgery.technique"),
          Patient.distinct("personal.techniqueQuoted"),
          Patient.distinct("surgery.location"),
        ]);

      const byN = byKey("name");
      return {
        success: true,
        counsellors: counsellors.filter((e) => e.name).sort(byN),
        agents:      agents.filter((e) => e.name).sort(byN),
        doctors:     doctors.filter((e) => e.name).sort(byN),
        seniorTechs: seniorTechs.filter((e) => e.name).sort(byN),
        implanters:  implanters.filter((e) => e.name).sort(byN),
        techniques:  [...new Set([...t1, ...t2, ...t3].filter(Boolean))].sort(byName),
        surgeryLocations: surgeryLocations.filter(Boolean).sort(byName),
      };
    }, meta);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "X-Cache": meta.status,
      },
    });
  } catch (error) {
    console.error("Error fetching filter options:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch filter options" }, { status: 500 });
  }
};

export const GET = withDB(handler);
