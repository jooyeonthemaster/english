"use server";

// ============================================================================
// 반 편성 폴더 액션 — Class/ClassEnrollment 를 폴더 스택(FolderActions 5종)
// 계약으로 노출한다 (v3 design §D4-3, C-3). **스키마 무변경** — 기존 모델 재사용.
//
//  - 반 = CollectionItem(평면 트리, parentId 항상 null — 중첩 없음)
//  - _count.items = ENROLLED 이면서 학생 status ACTIVE 인 재원생 수
//  - 담기/빼기 = ClassEnrollment upsert(ENROLLED) / DROPPED 전환 — 다대다라
//    한 학생이 여러 반에 함께 편성될 수 있다(드롭 기본 동작 = 담기)
//  - addedIds/removedIds 는 서버가 실제로 반영한 값(collections-question.ts
//    관용 미러) — 클라이언트 낙관 스냅샷이 DB 와 어긋나지 않게 한다
//  - 뮤테이션은 requireStaffAuth("DIRECTOR") — 기존 classes.ts 반 편성 도메인과
//    동일 게이트(로스터 선택바도 isDirector 전용). 조회는 스태프 공통.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireStaffAuth } from "@/lib/auth";
import type { CollectionItem } from "@/components/workbench/shared/types";

/** revalidate 양 경로 — (manage) 학생 뷰 + 반 뷰(D4-3 계약: students 1건 추가). */
function revalidateClassViews() {
  revalidatePath("/director/students");
  revalidatePath("/director/students/classes");
}

/** 반이 호출자 학원 소속인지 — 타 학원 id 는 조용히 거부(classes.ts 관용). */
async function classInAcademy(classId: string, academyId: string) {
  const cls = await prisma.class.findFirst({
    where: { id: classId, academyId },
    select: { id: true, name: true, capacity: true },
  });
  return cls;
}

export interface ClassFolderList {
  /** 반 → CollectionItem 매핑(평면·parentId null) */
  collections: CollectionItem[];
  /** classId → 재원생(ENROLLED·ACTIVE) studentId 배열 — useFolderManager initialMembership 원료 */
  membership: Record<string, string[]>;
}

/** 반 목록 + 멤버십 그래프 — classes/page.tsx 서버 로드용. */
export async function listClassFolders(): Promise<ClassFolderList> {
  const staff = await requireStaffAuth();
  const classes = await prisma.class.findMany({
    where: { academyId: staff.academyId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      enrollments: {
        where: { status: "ENROLLED", student: { status: "ACTIVE" } },
        select: { studentId: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return {
    collections: classes.map<CollectionItem>((c) => ({
      id: c.id,
      parentId: null,
      name: c.name,
      description: null,
      color: null,
      createdAt: c.createdAt,
      _count: { items: c.enrollments.length, children: 0 },
    })),
    membership: Object.fromEntries(
      classes.map((c) => [c.id, c.enrollments.map((e) => e.studentId)]),
    ),
  };
}

export interface ClassRosterStudent {
  id: string;
  name: string;
  grade: number;
}

/** 재원(ACTIVE) 학생 로스터 — 반 편성 뷰 카드 그리드 원료(최소 필드). */
export async function listClassRosterStudents(): Promise<ClassRosterStudent[]> {
  const staff = await requireStaffAuth();
  return prisma.student.findMany({
    where: { academyId: staff.academyId, status: "ACTIVE" },
    select: { id: true, name: true, grade: true },
    orderBy: { name: "asc" },
  });
}

// ── FolderActions 5종 (use-folder-manager 계약 시그니처) ─────────────────────

export async function createClassFolder(data: {
  name: string;
  /** 평면 트리 — 받아도 무시(반 중첩 없음). hook 시그니처 호환용. */
  parentId?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const name = data.name.trim();
    if (!name) return { success: false, error: "반 이름을 입력해 주세요." };
    const cls = await prisma.class.create({
      data: { academyId: staff.academyId, name },
      select: { id: true },
    });
    revalidateClassViews();
    return { success: true, id: cls.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "반 생성에 실패했습니다.",
    };
  }
}

export async function renameClassFolder(
  classId: string,
  data: { name: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const name = data.name.trim();
    if (!name) return { success: false, error: "반 이름을 입력해 주세요." };
    if (!(await classInAcademy(classId, staff.academyId))) {
      return { success: false, error: "반을 찾을 수 없습니다." };
    }
    await prisma.class.update({
      where: { id: classId },
      data: { name },
      select: { id: true },
    });
    revalidateClassViews();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "반 이름 변경에 실패했습니다.",
    };
  }
}

/** 재원생이 남아 있으면 거부 — 실수 삭제로 편성이 통째로 사라지는 것을 막는다. */
export async function deleteClassFolder(
  classId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    if (!(await classInAcademy(classId, staff.academyId))) {
      return { success: false, error: "반을 찾을 수 없습니다." };
    }
    const enrolled = await prisma.classEnrollment.count({
      where: { classId, status: "ENROLLED", student: { status: "ACTIVE" } },
    });
    if (enrolled > 0) {
      return {
        success: false,
        error: `재원생이 ${enrolled}명 있어 삭제할 수 없습니다. 먼저 학생을 다른 반으로 옮기거나 빼 주세요.`,
      };
    }
    await prisma.class.delete({ where: { id: classId } });
    revalidateClassViews();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "반 삭제에 실패했습니다.",
    };
  }
}

/**
 * 담기 — 선택 학생들을 반에 ENROLLED 로 upsert(DROPPED/WAITLISTED 이력 재편성).
 * 정원 검사는 전체 거부(enrollStudentsToClass 관용 — 일부만 편성되는 혼선 방지).
 * 반환 addedIds = 이번 호출로 **새로** ENROLLED 가 된 학생 id(이미 재적은 제외).
 */
export async function addStudentsToClass(
  classId: string,
  studentIds: string[],
): Promise<{ success: boolean; addedIds?: string[]; error?: string }> {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const ids = [...new Set(studentIds.filter((id) => typeof id === "string" && id))];
    if (ids.length === 0) return { success: false, error: "선택된 학생이 없습니다." };

    const [cls, students, existing, enrolledCount] = await Promise.all([
      classInAcademy(classId, staff.academyId),
      prisma.student.findMany({
        where: { id: { in: ids }, academyId: staff.academyId },
        select: { id: true },
      }),
      prisma.classEnrollment.findMany({
        where: { classId, studentId: { in: ids }, status: "ENROLLED" },
        select: { studentId: true },
      }),
      prisma.classEnrollment.count({ where: { classId, status: "ENROLLED" } }),
    ]);
    if (!cls) return { success: false, error: "반을 찾을 수 없습니다." };
    if (students.length === 0) return { success: false, error: "학생을 찾을 수 없습니다." };

    const alreadySet = new Set(existing.map((e) => e.studentId));
    const toAdd = students.map((s) => s.id).filter((id) => !alreadySet.has(id));
    if (toAdd.length === 0) return { success: true, addedIds: [] };

    const remaining = cls.capacity - enrolledCount;
    if (toAdd.length > remaining) {
      return {
        success: false,
        error: `정원 초과: ${toAdd.length - remaining}자리 부족 (정원 ${cls.capacity} · 재적 ${enrolledCount})`,
      };
    }

    await prisma.$transaction(
      toAdd.map((studentId) =>
        prisma.classEnrollment.upsert({
          where: { classId_studentId: { classId, studentId } },
          update: { status: "ENROLLED", droppedAt: null },
          create: { classId, studentId, status: "ENROLLED" },
        }),
      ),
    );

    revalidateClassViews();
    return { success: true, addedIds: toAdd };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "반 편성에 실패했습니다.",
    };
  }
}

/**
 * 빼기 — ENROLLED → DROPPED 전환(행 삭제 아님, 이력 보존).
 * 반환 removedIds = 실제로 DROPPED 된(직전까지 ENROLLED 였던) 학생 id.
 */
export async function removeStudentsFromClass(
  classId: string,
  studentIds: string[],
): Promise<{ success: boolean; removedIds?: string[]; error?: string }> {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const ids = [...new Set(studentIds.filter((id) => typeof id === "string" && id))];
    if (ids.length === 0) return { success: false, error: "선택된 학생이 없습니다." };
    if (!(await classInAcademy(classId, staff.academyId))) {
      return { success: false, error: "반을 찾을 수 없습니다." };
    }

    const existing = await prisma.classEnrollment.findMany({
      where: { classId, studentId: { in: ids }, status: "ENROLLED" },
      select: { studentId: true },
    });
    const removedIds = existing.map((e) => e.studentId);
    if (removedIds.length === 0) return { success: true, removedIds: [] };

    await prisma.classEnrollment.updateMany({
      where: { classId, studentId: { in: removedIds } },
      data: { status: "DROPPED", droppedAt: new Date() },
    });

    revalidateClassViews();
    return { success: true, removedIds };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "반에서 빼지 못했습니다.",
    };
  }
}
