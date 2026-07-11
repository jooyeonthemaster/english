// E2E 검수용 — 반(Class)·지문 폴더·문제 폴더 견본 데이터 시드. 멱등.
// 실행: npx tsx scripts/_e2e-seed-classes-folders.ts
// 대상: E2E 검수 학원(cmommhl7a0000mmekxmbqfefe), 학생 김연주(cmpavfoiq0001mm9sga30eupz)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ACADEMY_ID = "cmommhl7a0000mmekxmbqfefe";
const STUDENT_ID = "cmpavfoiq0001mm9sga30eupz";

async function main() {
  // 1) 반 + 재적
  let klass = await prisma.class.findFirst({
    where: { academyId: ACADEMY_ID, name: "고1 정예반" },
  });
  if (!klass) {
    klass = await prisma.class.create({
      data: { academyId: ACADEMY_ID, name: "고1 정예반", capacity: 12, isActive: true },
    });
  }
  await prisma.classEnrollment.upsert({
    where: { classId_studentId: { classId: klass.id, studentId: STUDENT_ID } },
    update: { status: "ENROLLED", droppedAt: null },
    create: { classId: klass.id, studentId: STUDENT_ID, status: "ENROLLED" },
  });
  console.log(`반 준비: ${klass.name} (김연주 재적)`);

  // 2) 지문 폴더 — 최신 학습지(PassageReport)의 원본 지문을 폴더에 배치
  const report = await prisma.passageReport.findFirst({
    where: { academyId: ACADEMY_ID, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, passageId: true },
  });
  if (report) {
    let pFolder = await prisma.passageCollection.findFirst({
      where: { academyId: ACADEMY_ID, name: "부교재 지문", parentId: null },
    });
    if (!pFolder) {
      pFolder = await prisma.passageCollection.create({
        data: { academyId: ACADEMY_ID, name: "부교재 지문" },
      });
    }
    await prisma.passageCollectionItem.upsert({
      where: {
        collectionId_passageId: { collectionId: pFolder.id, passageId: report.passageId },
      },
      update: {},
      create: { collectionId: pFolder.id, passageId: report.passageId },
    });
    console.log(`지문 폴더 준비: ${pFolder.name} ← ${report.title}`);
  } else {
    console.log("학습지가 없어 지문 폴더 배치는 건너뜁니다.");
  }

  // 3) 문제 폴더 — 최근 문제 5개 배치
  const questions = await prisma.question.findMany({
    where: {
      academyId: ACADEMY_ID,
      deletedAt: null,
      OR: [
        { passageId: null },
        { passage: { OR: [{ subject: null }, { subject: { not: "KOREAN" } }] } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true },
  });
  if (questions.length > 0) {
    let qFolder = await prisma.questionCollection.findFirst({
      where: { academyId: ACADEMY_ID, name: "어법 필수", parentId: null },
    });
    if (!qFolder) {
      qFolder = await prisma.questionCollection.create({
        data: { academyId: ACADEMY_ID, name: "어법 필수" },
      });
    }
    for (const q of questions) {
      await prisma.questionCollectionItem.upsert({
        where: {
          collectionId_questionId: { collectionId: qFolder.id, questionId: q.id },
        },
        update: {},
        create: { collectionId: qFolder.id, questionId: q.id },
      });
    }
    console.log(`문제 폴더 준비: ${qFolder.name} ← ${questions.length}문항`);
  } else {
    console.log("문제가 없어 문제 폴더 배치는 건너뜁니다.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
