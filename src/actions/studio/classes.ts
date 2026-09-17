"use server";

// ============================================================================
// 클래스 스튜디오 — 클래스 서버 액션 (docs/class-studio-spec.md §3.1·§6)
//
// 클래스 실체는 기존 Class/ClassEnrollment 재사용("반=폴더" 선례 —
// src/actions/students/class-folders.ts). 스튜디오 생성분은 capacity 200 으로
// 만들어 정원 검사(addStudentsToClass)에 걸리지 않게 한다.
// 전 액션 requireStaffAuth + academyId 스코프(테넌시 불변식).
// ============================================================================

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STUDIO_PATHS = ["/director/studio"];

function revalidateStudio(classId?: string) {
  for (const p of STUDIO_PATHS) revalidatePath(p, "layout");
  if (classId) revalidatePath(`/director/studio/c/${classId}`, "layout");
}

export interface StudioClassRow {
  id: string;
  name: string;
  studentCount: number;
  passageCount: number;
  /** 스튜디오 배포 과제 수(payload.studio 스탬프 기준) */
  assignmentCount: number;
  /** 마지막 활동(지문 등록·배포 중 최신) ISO — 없으면 null */
  lastActivityAt: string | null;
  createdAt: string;
}

export interface StudioActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

async function classInAcademy(classId: string, academyId: string) {
  return prisma.class.findFirst({
    where: { id: classId, academyId },
    select: { id: true, name: true, isActive: true, capacity: true },
  });
}

/** 스튜디오 배포 과제(payload.studio 스탬프) — classId별 집계·최신시각. */
async function studioAssignmentStats(academyId: string) {
  try {
    const rows = await prisma.$queryRaw<
      { cid: string; cnt: bigint; last: Date | null }[]
    >(Prisma.sql`
      SELECT payload->'studio'->>'classId' AS cid,
             COUNT(*)::bigint AS cnt,
             MAX("createdAt") AS last
      FROM "study_assignments"
      WHERE "academyId" = ${academyId}
        AND kind = 'WORKSHEET'
        AND payload ? 'studio'
      GROUP BY 1`);
    const map = new Map<string, { count: number; last: Date | null }>();
    for (const r of rows) {
      if (r.cid) map.set(r.cid, { count: Number(r.cnt), last: r.last });
    }
    return map;
  } catch {
    return new Map<string, { count: number; last: Date | null }>();
  }
}

export async function listStudioClasses(): Promise<StudioActionResult<StudioClassRow[]>> {
  try {
    const staff = await requireStaffAuth();
    const classes = await prisma.class.findMany({
      where: { academyId: staff.academyId, isActive: true },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    if (classes.length === 0) return { success: true, data: [] };

    const classIds = classes.map((c) => c.id);
    const [enrollments, passages, assignStats] = await Promise.all([
      prisma.classEnrollment.groupBy({
        by: ["classId"],
        where: {
          classId: { in: classIds },
          status: "ENROLLED",
          student: { status: "ACTIVE" },
        },
        _count: { _all: true },
      }),
      prisma.studioClassPassage.groupBy({
        by: ["classId"],
        where: { academyId: staff.academyId, classId: { in: classIds } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      studioAssignmentStats(staff.academyId),
    ]);

    const enrollMap = new Map(enrollments.map((e) => [e.classId, e._count._all]));
    const passageMap = new Map(
      passages.map((p) => [p.classId, { count: p._count._all, last: p._max.createdAt }]),
    );

    const rows: StudioClassRow[] = classes.map((c) => {
      const pas = passageMap.get(c.id);
      const asg = assignStats.get(c.id);
      const lastCandidates = [pas?.last, asg?.last].filter((d): d is Date => Boolean(d));
      const last = lastCandidates.length
        ? new Date(Math.max(...lastCandidates.map((d) => d.getTime())))
        : null;
      return {
        id: c.id,
        name: c.name,
        studentCount: enrollMap.get(c.id) ?? 0,
        passageCount: pas?.count ?? 0,
        assignmentCount: asg?.count ?? 0,
        lastActivityAt: last ? last.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
      };
    });
    return { success: true, data: rows };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "클래스 목록을 불러오지 못했습니다.",
    };
  }
}

export async function createStudioClass(input: {
  name: string;
}): Promise<StudioActionResult<{ id: string }>> {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const name = input.name?.trim();
    if (!name) return { success: false, error: "클래스 이름을 입력해 주세요." };
    if (name.length > 60) {
      return { success: false, error: "클래스 이름은 60자 이내로 입력해 주세요." };
    }
    // 스튜디오 클래스는 정원 검사에 걸리지 않게 넉넉히(스펙 §12) — ERP 필드는 기본값.
    const cls = await prisma.class.create({
      data: { academyId: staff.academyId, name, capacity: 200 },
      select: { id: true },
    });
    revalidateStudio();
    return { success: true, data: { id: cls.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "클래스 생성에 실패했습니다.",
    };
  }
}

export async function renameStudioClass(input: {
  classId: string;
  name: string;
}): Promise<StudioActionResult> {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const name = input.name?.trim();
    if (!name) return { success: false, error: "클래스 이름을 입력해 주세요." };
    if (name.length > 60) {
      return { success: false, error: "클래스 이름은 60자 이내로 입력해 주세요." };
    }
    const cls = await classInAcademy(input.classId, staff.academyId);
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };
    await prisma.class.update({
      where: { id: cls.id },
      data: { name },
      select: { id: true },
    });
    revalidateStudio(cls.id);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "이름 변경에 실패했습니다.",
    };
  }
}

/** 보관 = isActive false — 삭제가 아니다(학생 기록·배포 이력 보존, 스펙 §3.2 설정 탭). */
export async function archiveStudioClass(input: {
  classId: string;
}): Promise<StudioActionResult> {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const cls = await classInAcademy(input.classId, staff.academyId);
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };
    await prisma.class.update({
      where: { id: cls.id },
      data: { isActive: false },
      select: { id: true },
    });
    revalidateStudio(cls.id);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "클래스 보관에 실패했습니다.",
    };
  }
}

export interface StudioClassHeader {
  id: string;
  name: string;
  studentCount: number;
  passageCount: number;
}

/** 클래스 홈 헤더 공용 로드 — 소유 검증 겸용(null 이면 접근 불가). */
export async function getStudioClassHeader(
  classId: string,
): Promise<StudioActionResult<StudioClassHeader | null>> {
  try {
    const staff = await requireStaffAuth();
    const cls = await prisma.class.findFirst({
      where: { id: classId, academyId: staff.academyId, isActive: true },
      select: { id: true, name: true },
    });
    if (!cls) return { success: true, data: null };
    const [studentCount, passageCount] = await Promise.all([
      prisma.classEnrollment.count({
        where: { classId, status: "ENROLLED", student: { status: "ACTIVE" } },
      }),
      prisma.studioClassPassage.count({
        where: { academyId: staff.academyId, classId },
      }),
    ]);
    return {
      success: true,
      data: { id: cls.id, name: cls.name, studentCount, passageCount },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "클래스 정보를 불러오지 못했습니다.",
    };
  }
}
