// E2E 검수용 — 시험지 폴더(ExamCollection) 견본 데이터 시드.
// 실행: npx tsx scripts/_e2e-seed-exam-folders.ts
// 대상: E2E 검수 학원(cmommhl7a0000mmekxmbqfefe). 멱등 — 같은 이름 폴더가 있으면 재사용.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ACADEMY_ID = "cmommhl7a0000mmekxmbqfefe";

async function ensureFolder(name: string, parentId: string | null) {
  const existing = await prisma.examCollection.findFirst({
    where: { academyId: ACADEMY_ID, name, parentId },
  });
  if (existing) return existing;
  return prisma.examCollection.create({
    data: { academyId: ACADEMY_ID, name, parentId },
  });
}

async function main() {
  const root = await ensureFolder("고1 내신 대비", null);
  const child = await ensureFolder("1학기 중간", root.id);
  const sibling = await ensureFolder("모의고사 변형", null);

  const exams = await prisma.exam.findMany({
    where: { academyId: ACADEMY_ID, OR: [{ subject: null }, { subject: { not: "KOREAN" } }] },
    orderBy: { updatedAt: "desc" },
    take: 4,
    select: { id: true, title: true },
  });
  if (exams.length === 0) {
    console.log("시험지가 없어 폴더만 생성했습니다.");
    return;
  }
  const targets: Array<[string, string]> = [];
  if (exams[0]) targets.push([child.id, exams[0].id]);
  if (exams[1]) targets.push([child.id, exams[1].id]);
  if (exams[2]) targets.push([root.id, exams[2].id]);
  if (exams[3]) targets.push([sibling.id, exams[3].id]);
  for (const [collectionId, examId] of targets) {
    await prisma.examCollectionItem.upsert({
      where: { collectionId_examId: { collectionId, examId } },
      update: {},
      create: { collectionId, examId },
    });
  }
  console.log(
    `폴더 3개(${root.name} › ${child.name}, ${sibling.name}) · 시험지 ${targets.length}건 배치 완료`,
  );
  for (const e of exams) console.log(` - ${e.title}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
