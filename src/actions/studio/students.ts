"use server";

// ============================================================================
// 클래스 스튜디오 — 학생 로스터·초대 키트 서버 액션 (docs/class-studio-spec.md §3.2·§5)
//
// 학생 실체는 기존 Student(코드 자동 발급 createStudent 재사용) + ClassEnrollment.
// 초대는 신규 토큰 체계를 만들지 않는다 — 학원코드+학생코드가 곧 자격증명이며
// /g?ac=&sc= 자동 로그인 링크가 기존 제품 계약이다(student-app-share-row 선례).
// ============================================================================

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { createStudent } from "@/actions/students/mutations";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { StudioActionResult } from "./classes";

function revalidateStudioClass(classId: string) {
  revalidatePath("/director/studio", "layout");
  revalidatePath(`/director/studio/c/${classId}`, "layout");
}

export interface StudioStudentRow {
  studentId: string;
  name: string;
  studentCode: string;
  grade: number;
  /** 이 클래스의 스튜디오 과제 기준 진행 요약 */
  taskTotal: number;
  taskDone: number;
  lastStudyAt: string | null;
}

export async function listStudioClassStudents(
  classId: string,
): Promise<StudioActionResult<StudioStudentRow[]>> {
  try {
    const staff = await requireStaffAuth();
    const cls = await prisma.class.findFirst({
      where: { id: classId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };

    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId, status: "ENROLLED", student: { status: "ACTIVE" } },
      select: {
        student: {
          select: {
            id: true,
            name: true,
            studentCode: true,
            grade: true,
            lastStudyDate: true,
          },
        },
      },
      orderBy: { enrolledAt: "asc" },
      take: 300,
    });
    if (enrollments.length === 0) return { success: true, data: [] };

    // 이 클래스의 스튜디오 배포 과제 → 학생별 태스크 진행
    let taskMap = new Map<string, { total: number; done: number }>();
    try {
      const stamped = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM "study_assignments"
        WHERE "academyId" = ${staff.academyId}
          AND kind = 'WORKSHEET'
          AND payload->'studio'->>'classId' = ${classId}`);
      if (stamped.length > 0) {
        const tasks = await prisma.studyAssignmentTask.groupBy({
          by: ["studentId", "status"],
          where: { assignmentId: { in: stamped.map((s) => s.id) } },
          _count: { _all: true },
        });
        taskMap = new Map();
        for (const t of tasks) {
          const cur = taskMap.get(t.studentId) ?? { total: 0, done: 0 };
          cur.total += t._count._all;
          if (t.status === "DONE") cur.done += t._count._all;
          taskMap.set(t.studentId, cur);
        }
      }
    } catch {
      taskMap = new Map();
    }

    return {
      success: true,
      data: enrollments.map(({ student: s }) => ({
        studentId: s.id,
        name: s.name,
        studentCode: s.studentCode,
        grade: s.grade,
        taskTotal: taskMap.get(s.id)?.total ?? 0,
        taskDone: taskMap.get(s.id)?.done ?? 0,
        lastStudyAt: s.lastStudyDate ? s.lastStudyDate.toISOString() : null,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "학생 목록을 불러오지 못했습니다.",
    };
  }
}

// ── 레일 슬림 로스터(§3.10.2 성능 개정 2026-08-12) ──────────────────────────
// 워크벤치 레일은 이름·코드·체크만 그린다 — listStudioClassStudents 의 과제
// 진행 집계(payload->studio raw SQL + task groupBy)는 레일에 불필요한 비용이라,
// **전 클래스를 1왕복 경량 질의**로 프리페치하는 전용 액션을 둔다(펼침 토글이
// 순수 클라이언트가 되어 체감 지연 0). 학생 탭·설정 탭은 기존 완전판을 유지.

export interface StudioRosterRow {
  studentId: string;
  name: string;
  studentCode: string;
}

export async function listStudioClassRosters(): Promise<
  StudioActionResult<Record<string, StudioRosterRow[]>>
> {
  try {
    const staff = await requireStaffAuth();
    const classes = await prisma.class.findMany({
      where: { academyId: staff.academyId, isActive: true },
      select: { id: true },
      take: 200,
    });
    // 학생 0명 클래스도 빈 배열로 프리필 — "엔트리 없음 = 미로드" 오인 방지
    // (신규 클래스가 영원히 '불러오는 중'에 갇히는 함정).
    const map: Record<string, StudioRosterRow[]> = {};
    for (const c of classes) map[c.id] = [];
    if (classes.length === 0) return { success: true, data: map };

    const enrollments = await prisma.classEnrollment.findMany({
      where: {
        classId: { in: classes.map((c) => c.id) },
        status: "ENROLLED",
        student: { status: "ACTIVE" },
      },
      select: {
        classId: true,
        student: { select: { id: true, name: true, studentCode: true } },
      },
      orderBy: { enrolledAt: "asc" },
      take: 5000,
    });
    for (const e of enrollments) {
      map[e.classId]?.push({
        studentId: e.student.id,
        name: e.student.name,
        studentCode: e.student.studentCode,
      });
    }
    return { success: true, data: map };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "학생 목록을 불러오지 못했습니다.",
    };
  }
}

/**
 * 편성 upsert — 정원(capacity) 검사를 포함한다. 스튜디오 생성 클래스는 capacity 200
 * 이라 정상 흐름엔 영향이 없지만, 공유 Class 실체(ERP 반, capacity 20 기본)에 대한
 * 초과 편성으로 기존 불변식을 깨지 않게 신규로 ENROLLED 되는 인원만 남는 자리로 클램프한다
 * (적대검수 2026-08-09). 초과 시 전체 거부(일부만 편성되는 혼선 방지 — class-folders 관용).
 */
async function enrollStudents(
  classId: string,
  studentIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [cls, existing, enrolledCount] = await Promise.all([
    prisma.class.findUnique({ where: { id: classId }, select: { capacity: true } }),
    prisma.classEnrollment.findMany({
      where: { classId, studentId: { in: studentIds }, status: "ENROLLED" },
      select: { studentId: true },
    }),
    prisma.classEnrollment.count({ where: { classId, status: "ENROLLED" } }),
  ]);
  if (!cls) return { ok: false, error: "클래스를 찾을 수 없습니다." };
  const already = new Set(existing.map((e) => e.studentId));
  const toAdd = studentIds.filter((id) => !already.has(id));
  if (toAdd.length === 0) return { ok: true };
  if (toAdd.length > cls.capacity - enrolledCount) {
    return {
      ok: false,
      error: `정원을 초과합니다 (정원 ${cls.capacity} · 재적 ${enrolledCount}).`,
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
  return { ok: true };
}

/** 신규 학생 등록 + 클래스 편성 — 코드 자동 발급(HMAC+hash 동시 기록, 기존 정본 재사용). */
export async function addStudioStudent(input: {
  classId: string;
  name: string;
  grade?: number;
}): Promise<StudioActionResult<{ studentId: string; studentCode: string }>> {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const name = input.name?.trim();
    if (!name) return { success: false, error: "학생 이름을 입력해 주세요." };
    const cls = await prisma.class.findFirst({
      where: { id: input.classId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };

    // 학년 정수 의미의 정본은 GRADES 1·2·3(src/lib/constants.ts — 1학년~3학년).
    // 범위 밖·미지정은 1로 강등(전 학생 표면과 정합 — U2 적발 반영).
    const grade =
      typeof input.grade === "number" && input.grade >= 1 && input.grade <= 3
        ? Math.round(input.grade)
        : 1;

    const created = await createStudent("__CURRENT__", { name, grade });
    if (!created.success || !created.studentId || !created.studentCode) {
      return { success: false, error: created.error ?? "학생 등록에 실패했습니다." };
    }
    const enroll = await enrollStudents(input.classId, [created.studentId]);
    if (!enroll.ok) return { success: false, error: enroll.error };
    revalidateStudioClass(input.classId);
    return {
      success: true,
      data: { studentId: created.studentId, studentCode: created.studentCode },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "학생 등록에 실패했습니다.",
    };
  }
}

export interface StudioStudentSearchRow {
  studentId: string;
  name: string;
  grade: number;
  studentCode: string;
  alreadyEnrolled: boolean;
}

/** 기존 학원 학생 검색 — 중복 계정 방지용 연결 경로(스펙 §3.2 학생 등록 모달 상단). */
export async function searchAcademyStudents(input: {
  classId: string;
  search: string;
}): Promise<StudioActionResult<StudioStudentSearchRow[]>> {
  try {
    const staff = await requireStaffAuth();
    const search = input.search?.trim();
    if (!search) return { success: true, data: [] };
    // 파일 헤더 불변식 — 전 액션 academyId + 클래스 소유 검증.
    const cls = await prisma.class.findFirst({
      where: { id: input.classId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };
    const [students, enrolled] = await Promise.all([
      prisma.student.findMany({
        where: {
          academyId: staff.academyId,
          status: "ACTIVE",
          name: { contains: search, mode: "insensitive" },
        },
        select: { id: true, name: true, grade: true, studentCode: true },
        orderBy: { name: "asc" },
        take: 20,
      }),
      prisma.classEnrollment.findMany({
        where: { classId: input.classId, status: "ENROLLED" },
        select: { studentId: true },
      }),
    ]);
    const enrolledSet = new Set(enrolled.map((e) => e.studentId));
    return {
      success: true,
      data: students.map((s) => ({
        studentId: s.id,
        name: s.name,
        grade: s.grade,
        studentCode: s.studentCode,
        alreadyEnrolled: enrolledSet.has(s.id),
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "학생 검색에 실패했습니다.",
    };
  }
}

export async function attachStudentsToStudioClass(input: {
  classId: string;
  studentIds: string[];
}): Promise<StudioActionResult<{ addedCount: number }>> {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const ids = [...new Set(input.studentIds)].filter(Boolean).slice(0, 100);
    if (ids.length === 0) return { success: false, error: "선택된 학생이 없습니다." };
    const cls = await prisma.class.findFirst({
      where: { id: input.classId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };
    const owned = await prisma.student.findMany({
      where: { id: { in: ids }, academyId: staff.academyId, status: "ACTIVE" },
      select: { id: true },
    });
    if (owned.length === 0) return { success: false, error: "학생을 찾을 수 없습니다." };
    const enroll = await enrollStudents(
      input.classId,
      owned.map((s) => s.id),
    );
    if (!enroll.ok) return { success: false, error: enroll.error };
    revalidateStudioClass(input.classId);
    return { success: true, data: { addedCount: owned.length } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "학생 연결에 실패했습니다.",
    };
  }
}

/** 클래스에서 제외 — 학생 계정·기록은 보존(편성만 DROPPED). */
export async function removeStudentFromStudioClass(input: {
  classId: string;
  studentId: string;
}): Promise<StudioActionResult> {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const cls = await prisma.class.findFirst({
      where: { id: input.classId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };
    await prisma.classEnrollment.updateMany({
      where: { classId: input.classId, studentId: input.studentId, status: "ENROLLED" },
      data: { status: "DROPPED", droppedAt: new Date() },
    });
    revalidateStudioClass(input.classId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "학생 제외에 실패했습니다.",
    };
  }
}

// ── 초대 키트 (스펙 §5 — 템플릿 문구는 스펙이 정본) ─────────────────────────

export interface StudioInviteKit {
  academyName: string;
  academyCode: string;
  studentName: string;
  studentCode: string;
  /** 자동 로그인 상대경로 — 클라이언트가 window.location.origin 과 합성 */
  loginPath: string;
}

export async function getStudioInviteKit(input: {
  studentId: string;
}): Promise<StudioActionResult<StudioInviteKit>> {
  try {
    const staff = await requireStaffAuth();
    const [student, academy] = await Promise.all([
      prisma.student.findFirst({
        where: { id: input.studentId, academyId: staff.academyId },
        select: { name: true, studentCode: true },
      }),
      prisma.academy.findUnique({
        where: { id: staff.academyId },
        select: { name: true, code: true },
      }),
    ]);
    if (!student || !academy) {
      return { success: false, error: "학생 정보를 찾을 수 없습니다." };
    }
    return {
      success: true,
      data: {
        academyName: academy.name,
        academyCode: academy.code,
        studentName: student.name,
        studentCode: student.studentCode,
        loginPath: `/g?ac=${encodeURIComponent(academy.code)}&sc=${encodeURIComponent(student.studentCode)}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "초대 정보를 불러오지 못했습니다.",
    };
  }
}
