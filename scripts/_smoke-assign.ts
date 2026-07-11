/* eslint-disable no-console */
// 스모크용 응시 할당 생성(TABLET/OMR 각 1건) — E2E·시각검수 전용 임시 스크립트.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { prisma } from "../src/lib/prisma";
import { generateShareToken } from "../src/lib/exam-report/share-token";

async function main() {
  const fixtures = [
    { examId: "cmpyxison0001jm04ppc2p4ts", mode: "TABLET" },
    { examId: "cmpybbt0b000hmmrg0gcbwpn8", mode: "OMR" },
  ];
  const studentId = "cmpavfoiq0001mm9sga30eupz";
  for (const f of fixtures) {
    const eqs = await prisma.examQuestion.findMany({
      where: { examId: f.examId, question: { deletedAt: null } },
      orderBy: { orderNum: "asc" },
      select: { questionId: true, orderNum: true, points: true },
    });
    await prisma.examSubmission.deleteMany({ where: { examId: f.examId, studentId } });
    const token = generateShareToken();
    await prisma.examSubmission.create({
      data: {
        examId: f.examId,
        studentId,
        answers: "{}",
        status: "ASSIGNED",
        accessToken: token,
        accessEnabled: true,
        mode: f.mode,
        orderSnapshot: eqs,
        assignedAt: new Date(),
        assignedBy: "smoke-harness",
      },
    });
    console.log(`${f.mode} (${eqs.length}문항) -> http://localhost:3000/t/${token}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
