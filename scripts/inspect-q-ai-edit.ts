import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), ".env") });
import { prisma } from "../src/lib/prisma";

async function main() {
  const withStruct = await prisma.question.count({ where: { structuredData: { not: null }, passageId: { not: null } } });
  const rows = await prisma.question.findMany({
    where: { structuredData: { not: null }, passageId: { not: null }, subType: { not: null } },
    select: { id: true, subType: true },
    take: 600,
    orderBy: { createdAt: "desc" },
  });
  const bySub: Record<string, string> = {};
  for (const r of rows) { if (r.subType && !bySub[r.subType]) bySub[r.subType] = r.id; }
  console.log("with structuredData+passage:", withStruct);
  console.log("distinct subTypes (subType -> sampleId):");
  for (const [k, v] of Object.entries(bySub)) console.log("  ", k, v);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
