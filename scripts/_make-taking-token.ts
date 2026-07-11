import { prisma } from "../src/lib/prisma";
import { generateShareToken } from "../src/lib/exam-report/share-token";

// 22유형 시험지(cmpyxison) 응시 세션 생성 — 전유형 감사용. MODE=OMR|TABLET(기본).
const EXAM_ID = "cmpyxison0001jm04ppc2p4ts";
const MODE = process.env.MODE === "OMR" ? "OMR" : "TABLET";

async function main() {
  const exam = await prisma.exam.findUnique({
    where: { id: EXAM_ID },
    select: {
      id: true,
      academyId: true,
      questions: {
        select: { questionId: true, orderNum: true, points: true },
        orderBy: { orderNum: "asc" },
      },
    },
  });
  if (!exam) throw new Error("exam not found");

  const snapshot = exam.questions.map((q) => ({
    questionId: q.questionId,
    orderNum: q.orderNum,
    points: q.points,
  }));

  // 학원 소속 학생 아무나(김연주 우선).
  const student =
    (await prisma.student.findFirst({
      where: { academyId: exam.academyId, name: "김연주" },
      select: { id: true, name: true, studentCode: true },
    })) ??
    (await prisma.student.findFirst({
      where: { academyId: exam.academyId },
      select: { id: true, name: true, studentCode: true },
    }));
  if (!student) throw new Error("no student in academy");

  // 기존 TABLET 세션 있으면 재사용(ASSIGNED 로 리셋).
  const existing = await prisma.examSubmission.findFirst({
    where: { examId: EXAM_ID, studentId: student.id },
    select: { id: true, accessToken: true },
  });

  const token = existing?.accessToken ?? generateShareToken();
  if (existing) {
    await prisma.examSubmission.update({
      where: { id: existing.id },
      data: {
        accessToken: token,
        accessEnabled: true,
        mode: MODE,
        status: "ASSIGNED",
        responses: [],
        orderSnapshot: snapshot,
        assignedAt: new Date(),
      },
    });
  } else {
    await prisma.examSubmission.create({
      data: {
        examId: EXAM_ID,
        studentId: student.id,
        answers: "[]", // 레거시 필수 String 컬럼(신규 경로는 responses jsonb 사용)
        accessToken: token,
        accessEnabled: true,
        mode: MODE,
        status: "ASSIGNED",
        responses: [],
        orderSnapshot: snapshot,
        assignedAt: new Date(),
      },
    });
  }

  console.log(`STUDENT: ${student.name} (${student.studentCode})`);
  console.log(`QUESTIONS: ${snapshot.length}`);
  console.log(`URL: http://localhost:3000/t/${token}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
