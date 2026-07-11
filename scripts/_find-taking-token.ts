import { prisma } from "../src/lib/prisma";

// 22유형 시험지(cmpyxison) 응시 토큰 조회 — 전유형 감사용 TABLET 세션 확보.
const EXAM_ID = "cmpyxison0001jm04ppc2p4ts";

async function main() {
  const exam = await prisma.exam.findUnique({
    where: { id: EXAM_ID },
    select: { id: true, title: true, subject: true, _count: { select: { questions: true } } },
  });
  console.log("EXAM:", JSON.stringify(exam));

  const subs = await prisma.examSubmission.findMany({
    where: { examId: EXAM_ID },
    select: {
      id: true,
      accessToken: true,
      accessEnabled: true,
      mode: true,
      status: true,
      student: { select: { name: true, studentCode: true } },
      orderSnapshot: true,
    },
  });
  for (const s of subs) {
    const snap = Array.isArray(s.orderSnapshot) ? s.orderSnapshot.length : "?";
    console.log(
      `SUB ${s.id} | ${s.student.name}(${s.student.studentCode}) | mode=${s.mode} status=${s.status} enabled=${s.accessEnabled} snap=${snap} | token=${s.accessToken ?? "-"}`,
    );
  }
  console.log(`TOTAL SUBS: ${subs.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
