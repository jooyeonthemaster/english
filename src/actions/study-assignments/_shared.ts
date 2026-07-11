// ---------------------------------------------------------------------------
// 통합 학습 과제 액션 — 타입·동기 헬퍼·대상 확장 (플레인 모듈)
//
// "use server" 모듈은 async 함수만 export 할 수 있어, 타입·동기 유틸·내부
// 조회 헬퍼는 이 플레인 모듈에 둔다(exams/_assignments-shared.ts 관례).
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/prisma";
import type {
  StudyTargetInput,
  StudyTargetSnapshot,
} from "@/lib/study-assignments/types";

/** 공통 반환 봉투 — exams AssignmentActionResult 동형 */
export interface StudyActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function isoOf(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/** 대상 확장 결과 — 반→재원생 전개 + dedupe + 스냅샷/요약 */
export interface ExpandedTargets {
  studentIds: string[];
  snapshots: StudyTargetSnapshot[];
  summary: string;
}

/**
 * targets(반/학생 혼합) → 학생 id 목록으로 확장.
 * - 반: ENROLLED 등록 + ACTIVE 학생만.
 * - 학생: ACTIVE + 학원 소유 교차검증(하나라도 어긋나면 전체 거부).
 */
export async function expandTargets(
  academyId: string,
  targets: StudyTargetInput[],
): Promise<ExpandedTargets | { error: string }> {
  const classIds = [
    ...new Set(targets.filter((t) => t.type === "CLASS").map((t) => t.id)),
  ];
  const studentIds = [
    ...new Set(targets.filter((t) => t.type === "STUDENT").map((t) => t.id)),
  ];
  if (classIds.length === 0 && studentIds.length === 0) {
    return { error: "배포 대상을 선택해 주세요." };
  }

  const snapshots: StudyTargetSnapshot[] = [];
  const finalIds = new Set<string>();

  if (classIds.length > 0) {
    const classes = await prisma.class.findMany({
      where: { id: { in: classIds }, academyId },
      select: {
        id: true,
        name: true,
        enrollments: {
          where: { status: "ENROLLED", student: { status: "ACTIVE" } },
          select: { studentId: true },
        },
      },
    });
    if (classes.length !== classIds.length) {
      return { error: "일부 반이 이 학원에 속하지 않습니다." };
    }
    for (const cls of classes) {
      snapshots.push({ type: "CLASS", id: cls.id, name: cls.name });
      for (const e of cls.enrollments) finalIds.add(e.studentId);
    }
  }

  if (studentIds.length > 0) {
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds }, academyId, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (students.length !== studentIds.length) {
      return { error: "일부 학생이 이 학원에 속하지 않거나 재원 상태가 아닙니다." };
    }
    for (const s of students) {
      snapshots.push({ type: "STUDENT", id: s.id, name: s.name });
      finalIds.add(s.id);
    }
  }

  if (finalIds.size === 0) {
    return { error: "선택한 대상에 재원 중인 학생이 없습니다." };
  }

  const classNames = snapshots.filter((s) => s.type === "CLASS").map((s) => s.name);
  const studentNames = snapshots
    .filter((s) => s.type === "STUDENT")
    .map((s) => s.name);
  let summary: string;
  if (classNames.length > 0) {
    summary =
      classNames.join(" · ") +
      (studentNames.length > 0 ? ` 외 ${studentNames.length}명` : "") +
      ` (${finalIds.size}명)`;
  } else if (studentNames.length <= 2) {
    summary = studentNames.join(" · ");
  } else {
    summary = `${studentNames[0]} 외 ${studentNames.length - 1}명`;
  }

  return { studentIds: [...finalIds], snapshots, summary };
}

/** 과제 목록/캘린더 revalidate 경로 — 학생 상세는 layout 단위로 묶어 무효화 */
export const STUDY_ASSIGNMENT_PATHS = [
  "/director/students/assignments",
  "/director/students",
] as const;
