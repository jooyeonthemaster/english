import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// 테넌트 격리 보조 함수들.
// 모든 mutating action 은 caller 가 넘긴 id 가 staff 의 academyId 에
// 속해 있는지 반드시 검사한다.
// ---------------------------------------------------------------------------

export async function assertExamBelongsToAcademy(
  examId: string,
  academyId: string,
): Promise<void> {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId },
    select: { id: true },
  });
  if (!exam) {
    throw new Error("시험을 찾을 수 없습니다.");
  }
}

export async function assertQuestionsBelongToAcademy(
  questionIds: string[],
  academyId: string,
): Promise<void> {
  if (questionIds.length === 0) return;
  const valid = await prisma.question.findMany({
    // 휴지통 가드 — 삭제(휴지통)된 문제는 시험지에 attach 할 수 없다.
    where: { id: { in: questionIds }, academyId, deletedAt: null },
    select: { id: true },
  });
  if (valid.length !== new Set(questionIds).size) {
    throw new Error("일부 문제가 이 학원에 속하지 않습니다.");
  }
}

export async function assertClassBelongsToAcademy(
  classId: string,
  academyId: string,
): Promise<void> {
  const cls = await prisma.class.findFirst({
    where: { id: classId, academyId },
    select: { id: true },
  });
  if (!cls) {
    throw new Error("반을 찾을 수 없습니다.");
  }
}

export async function assertExamCollectionBelongsToAcademy(
  collectionId: string,
  academyId: string,
): Promise<void> {
  const collection = await prisma.examCollection.findFirst({
    where: { id: collectionId, academyId },
    select: { id: true },
  });
  if (!collection) {
    throw new Error("폴더를 찾을 수 없습니다.");
  }
}

export async function assertExamsBelongToAcademy(
  examIds: string[],
  academyId: string,
): Promise<void> {
  if (examIds.length === 0) return;
  const valid = await prisma.exam.findMany({
    where: { id: { in: examIds }, academyId },
    select: { id: true },
  });
  if (valid.length !== new Set(examIds).size) {
    throw new Error("일부 시험이 이 학원에 속하지 않습니다.");
  }
}
