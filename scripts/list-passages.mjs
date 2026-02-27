import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const passages = await prisma.passage.findMany({
  select: { id: true, title: true },
  orderBy: { createdAt: "asc" },
});

console.log(JSON.stringify(passages, null, 2));
console.log(`\nTotal: ${passages.length} passages`);

await prisma.$disconnect();
