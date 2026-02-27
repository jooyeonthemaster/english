import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { writeFileSync } from "fs";

const prisma = new PrismaClient();

const passages = await prisma.passage.findMany({
  select: {
    id: true,
    title: true,
    content: true,
    grade: true,
    school: { select: { type: true } },
    analysis: { select: { contentHash: true } },
  },
  orderBy: { createdAt: "asc" },
});

const need = passages.filter((p) => {
  if (!p.analysis) return true;
  const h = createHash("md5").update(p.content).digest("hex");
  return p.analysis.contentHash !== h;
});

writeFileSync("scripts/passages-to-analyze.json", JSON.stringify(need, null, 2));
console.log(`Exported ${need.length} passages needing analysis`);

await prisma.$disconnect();
