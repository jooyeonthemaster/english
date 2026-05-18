import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const passages = await prisma.passage.findMany({
    take: 8,
    where: { content: { contains: " it " } },
    select: { id: true, title: true, content: true, grade: true, schoolId: true },
    orderBy: { createdAt: "desc" },
  });
  for (const p of passages) {
    const hasItSubstring = / it /.test(p.content) && /\b(digital|it[a-z]+|[a-z]+it)\b/i.test(p.content);
    console.log("=====");
    console.log("ID:", p.id);
    console.log("Title:", p.title);
    console.log("Grade:", p.grade, "School:", p.schoolId);
    console.log("Content length:", p.content.length);
    console.log("Has 'it' + substring-trap word:", hasItSubstring);
    console.log("Content preview:", p.content.slice(0, 300));
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
