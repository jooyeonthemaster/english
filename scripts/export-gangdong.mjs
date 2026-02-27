import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
const prisma = new PrismaClient();
const passages = await prisma.passage.findMany({
  where: { school: { slug: "gangdong-hs" } },
  select: { id: true, title: true, content: true, grade: true, semester: true, unit: true },
  orderBy: { createdAt: "asc" }
});
writeFileSync("scripts/gangdong-passages.json", JSON.stringify(passages, null, 2));
console.log("Exported", passages.length, "passages");
await prisma.$disconnect();
