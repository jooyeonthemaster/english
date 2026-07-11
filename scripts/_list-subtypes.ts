import { prisma } from "../src/lib/prisma";

const EXAM_ID = "cmpyxison0001jm04ppc2p4ts";

async function main() {
  const exam = await prisma.exam.findUnique({
    where: { id: EXAM_ID },
    select: {
      questions: {
        select: {
          orderNum: true,
          question: { select: { subType: true, type: true } },
        },
        orderBy: { orderNum: "asc" },
      },
    },
  });
  for (const q of exam?.questions ?? []) {
    console.log(`Q${q.orderNum}\t${q.question.subType ?? q.question.type}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
