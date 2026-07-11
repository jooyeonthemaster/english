/* eslint-disable no-console */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });
import { prisma } from "../src/lib/prisma";
async function main() {
  const rows = await prisma.passageReport.findMany({
    where: { academyId: "cmommhl7a0000mmekxmbqfefe", deletedAt: null },
    select: { id: true, title: true, status: true, templateId: true, generationPlan: true },
    take: 5, orderBy: { updatedAt: "desc" },
  });
  console.log(JSON.stringify(rows, null, 1));
}
main().finally(() => prisma.$disconnect());
