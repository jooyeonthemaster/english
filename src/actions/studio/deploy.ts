"use server";

// ============================================================================
// 클래스 스튜디오 — 배포 서버 액션 (docs/class-studio-spec.md §3.4 C·§8)
//
// 배포 = 기존 createStudyAssignment(kind WORKSHEET) 재사용. 이 파일은
// ① 배포 전 미리보기(선택 모듈 조합의 실제 문항 수·예상 시간 — 실서빙과 동일
//    조립 plan-server 로 컴파일) ② 화이트리스트·스탬프 payload 조립만 담당한다.
// ============================================================================

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { createStudyAssignment } from "@/actions/study-assignments/mutations";
import {
  PRIME_REPORT_MARKER,
} from "@/actions/workbench/passage-constants";
import { requireStaffAuth } from "@/lib/auth";
import { parseAnalysisReportForPreview } from "@/lib/passage-report/analysis-report/preview-parse";
import { prisma } from "@/lib/prisma";
import {
  isStudioModuleId,
  stagesForModules,
  STUDIO_MODULE_BY_ID,
  type StudioModuleId,
} from "@/lib/studio/modules";
import { avgFirstTryPctByAssignment } from "@/lib/studio/stats";
import { compileServerStudyPlan } from "@/lib/worksheet-study/plan-server";
import type { StudyMode } from "@/lib/worksheet-study/types";
import type { StudioActionResult } from "./classes";

function sanitizeModules(raw: unknown): StudioModuleId[] {
  if (!Array.isArray(raw)) return [];
  const out: StudioModuleId[] = [];
  for (const v of raw) if (isStudioModuleId(v) && !out.includes(v)) out.push(v);
  return out;
}

function sanitizeMode(raw: unknown): Exclude<StudyMode, "off"> {
  return raw === "light" || raw === "intense" ? raw : "standard";
}

async function loadPrimeReport(academyId: string, passageId: string) {
  return prisma.passageReport.findFirst({
    where: {
      passageId,
      academyId,
      generationPlan: PRIME_REPORT_MARKER,
      deletedAt: null,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, pages: true },
  });
}

export interface StudioDeployPreviewStage {
  stageId: string;
  title: string;
  itemCount: number;
  estMin: number;
}

export interface StudioDeployPreview {
  totalItems: number;
  totalEstMin: number;
  stages: StudioDeployPreviewStage[];
  /** 선택 조합으로 성립하는 채점 스테이지 ≥1 (false 면 배포 버튼 비활성) */
  viable: boolean;
  /** 선택했지만 이 지문·강도에서 문항이 0인 모듈(안내용) */
  emptyModules: StudioModuleId[];
}

/** 배포 다이얼로그 실시간 미리보기 — 강도·모듈 선택이 바뀔 때마다 호출. */
export async function previewStudioDeployment(input: {
  passageId: string;
  modules: StudioModuleId[];
  mode?: StudyMode;
}): Promise<StudioActionResult<StudioDeployPreview>> {
  try {
    const staff = await requireStaffAuth();
    const modules = sanitizeModules(input.modules);
    if (modules.length === 0) return { success: false, error: "모듈을 선택해 주세요." };
    const report = await loadPrimeReport(staff.academyId, input.passageId);
    if (!report) return { success: false, error: "먼저 AI 분석을 완료해 주세요." };
    const parsed = parseAnalysisReportForPreview(report.pages);
    if (!parsed) return { success: false, error: "분석 결과를 읽을 수 없습니다." };

    const stages = stagesForModules(modules);
    const plan = await compileServerStudyPlan({
      report: parsed,
      mode: sanitizeMode(input.mode),
      taskId: `studio:${input.passageId}`,
      reportTitle: report.title,
      stages,
    });

    const filledModules = new Set<StudioModuleId>();
    for (const stage of plan.stages) {
      for (const m of modules) {
        if (STUDIO_MODULE_BY_ID.get(m)?.stages.includes(stage.id)) filledModules.add(m);
      }
    }
    return {
      success: true,
      data: {
        totalItems: plan.totalItems,
        totalEstMin: plan.stages.reduce((acc, s) => acc + s.estMin, 0),
        stages: plan.stages.map((s) => ({
          stageId: s.id,
          title: s.title,
          itemCount: s.items.length,
          estMin: s.estMin,
        })),
        viable: plan.stages.some((s) => s.graded),
        emptyModules: modules.filter((m) => !filledModules.has(m)),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "미리보기에 실패했습니다.",
    };
  }
}

/** 모듈 카드 「미리보기」 — 학생이 보는 것과 동일 조립의 첫 문항들(스펙 §3.4 B). */
export async function getStudioModulePreview(input: {
  passageId: string;
  moduleId: StudioModuleId;
  mode?: StudyMode;
}): Promise<
  StudioActionResult<{
    stageTitle: string;
    items: unknown[]; // StudyItem[] — 클라이언트가 유형별 읽기 전용 렌더
  }>
> {
  try {
    const staff = await requireStaffAuth();
    if (!isStudioModuleId(input.moduleId)) {
      return { success: false, error: "알 수 없는 모듈입니다." };
    }
    const report = await loadPrimeReport(staff.academyId, input.passageId);
    if (!report) return { success: false, error: "먼저 AI 분석을 완료해 주세요." };
    const parsed = parseAnalysisReportForPreview(report.pages);
    if (!parsed) return { success: false, error: "분석 결과를 읽을 수 없습니다." };

    const def = STUDIO_MODULE_BY_ID.get(input.moduleId)!;
    const plan = await compileServerStudyPlan({
      report: parsed,
      mode: sanitizeMode(input.mode),
      taskId: `studio:${input.passageId}`,
      reportTitle: report.title,
      stages: [...def.stages],
    });
    const first = plan.stages[0];
    if (!first) {
      return { success: false, error: "이 지문에는 해당 자료가 없습니다." };
    }
    return {
      success: true,
      data: { stageTitle: first.title, items: first.items.slice(0, 3) },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "미리보기에 실패했습니다.",
    };
  }
}

/**
 * 학생 화면 에뮬레이터 플랜(스펙 §3.6) — 요청 모듈 조합(부재 시 성립 전체)의
 * 스테이지를 실서빙과 동일 조립(plan-server)로 컴파일해 통째로 내려준다.
 * 에뮬레이터는 이 스테이지를 실제 학생 플레이어(harness 모드)에 그대로 물린다 —
 * "실제 배포와 동일한 문제" 보증은 이 단일 조립 경로가 담보한다.
 */
export async function getStudioEmulatorPlan(input: {
  passageId: string;
  modules?: StudioModuleId[];
  mode?: StudyMode;
}): Promise<
  StudioActionResult<{
    title: string;
    planHash: string;
    /** StudyStage[] — 클라이언트가 플레이어에 그대로 전달 */
    stages: unknown[];
  }>
> {
  try {
    const staff = await requireStaffAuth();
    const report = await loadPrimeReport(staff.academyId, input.passageId);
    if (!report) return { success: false, error: "먼저 모듈을 분석해 주세요." };
    const parsed = parseAnalysisReportForPreview(report.pages);
    if (!parsed) return { success: false, error: "분석 결과를 읽을 수 없습니다." };

    const wanted = sanitizeModules(input.modules);
    const plan = await compileServerStudyPlan({
      report: parsed,
      mode: sanitizeMode(input.mode),
      taskId: `studio:${input.passageId}`,
      reportTitle: report.title,
      ...(wanted.length > 0 ? { stages: stagesForModules(wanted) } : {}),
    });
    const stages = plan.stages.filter((s) => s.items.length > 0);
    if (stages.length === 0) {
      return { success: false, error: "미리 볼 수 있는 모듈이 없습니다." };
    }
    return {
      success: true,
      data: { title: report.title, planHash: plan.planHash, stages },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "미리보기에 실패했습니다.",
    };
  }
}

export interface StudioDeployInput {
  classId: string;
  passageId: string;
  modules: StudioModuleId[];
  mode?: StudyMode;
  studentIds: string[];
  /** ISO — null = 마감 없음 */
  dueAt?: string | null;
  title?: string;
  /** 기본 true — 학습 완료가 과제 완료 조건 */
  required?: boolean;
}

export async function deployStudioModules(
  input: StudioDeployInput,
): Promise<StudioActionResult<{ assignmentId: string; taskCount: number }>> {
  try {
    const staff = await requireStaffAuth();
    const modules = sanitizeModules(input.modules);
    if (modules.length === 0) return { success: false, error: "배포할 모듈을 선택해 주세요." };
    const studentIds = [...new Set(input.studentIds)].filter(Boolean).slice(0, 200);
    if (studentIds.length === 0) return { success: false, error: "배포할 학생을 선택해 주세요." };

    const link = await prisma.studioClassPassage.findFirst({
      where: {
        academyId: staff.academyId,
        classId: input.classId,
        passageId: input.passageId,
      },
      select: { id: true },
    });
    if (!link) return { success: false, error: "이 클래스에 등록된 지문이 아닙니다." };

    // 배포 학생이 이 클래스에 실제 편성돼 있는지 — 비편성 학생 혼입 차단(적대검수).
    // student ACTIVE 를 함께 건다(§3.10 검수 L5-2): 퇴원 후 ENROLLED 잔존 행이
    // 여길 통과하면 하부 expandTargets 의 ACTIVE 전체거부에 걸려 배포 전체가
    // 실패한다 — 로스터(listStudioClassStudents)와 술어를 일치시켜 조용한 드롭
    // (함정 10 계약)으로 강등한다.
    const enrolled = await prisma.classEnrollment.findMany({
      where: {
        classId: input.classId,
        studentId: { in: studentIds },
        status: "ENROLLED",
        student: { status: "ACTIVE" },
      },
      select: { studentId: true },
    });
    const enrolledSet = new Set(enrolled.map((e) => e.studentId));
    const targetStudentIds = studentIds.filter((id) => enrolledSet.has(id));
    if (targetStudentIds.length === 0) {
      return { success: false, error: "이 클래스에 편성된 학생만 배포할 수 있습니다." };
    }

    const report = await loadPrimeReport(staff.academyId, input.passageId);
    if (!report) return { success: false, error: "먼저 AI 분석을 완료해 주세요." };

    const mode = sanitizeMode(input.mode);
    const stages = stagesForModules(modules);

    // 서버측 성립성 재검증(방어 심층화) — 클라 viable 게이트 우회 시 뷰어 폴백 과제가
    // 생성되는 것을 막는다. 미리보기와 동일 조립이라 비용은 컴파일 1회.
    const parsed = parseAnalysisReportForPreview(report.pages);
    if (!parsed) return { success: false, error: "분석 결과를 읽을 수 없습니다." };
    const check = await compileServerStudyPlan({
      report: parsed,
      mode,
      taskId: `studio:${input.passageId}`,
      reportTitle: report.title,
      stages,
    });
    if (!check.stages.some((s) => s.graded)) {
      return {
        success: false,
        error: "이 구성으로는 채점할 수 있는 학습이 만들어지지 않습니다. 다른 모듈을 선택해 주세요.",
      };
    }
    const moduleLabels = modules
      .map((m) => STUDIO_MODULE_BY_ID.get(m)?.label)
      .filter(Boolean)
      .join("·");
    // 스펙 §3.4 정본 형식 "[지문제목] 모듈 학습" — 클라 다이얼로그 자동값과 동일.
    const title = input.title?.trim() || `[${report.title}] ${moduleLabels} 학습`;

    const created = await createStudyAssignment({
      kind: "WORKSHEET",
      title,
      targets: targetStudentIds.map((id) => ({ type: "STUDENT" as const, id })),
      dueAt: input.dueAt ?? null,
      worksheet: {
        passageReportId: report.id,
        study: {
          mode,
          required: input.required !== false,
          stages,
        },
        studio: {
          classId: input.classId,
          passageId: input.passageId,
          modules,
        },
      },
    });
    if (!created.success || !created.data) {
      return { success: false, error: created.error ?? "배포에 실패했습니다." };
    }
    revalidatePath("/director/studio", "layout");
    revalidatePath(`/director/studio/c/${input.classId}`, "layout");
    return {
      success: true,
      data: {
        assignmentId: created.data.assignmentId,
        taskCount: created.data.taskCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "배포에 실패했습니다.",
    };
  }
}

// ── 문항 세트 배포 (§3.10.5 도시에 인라인 「문제 보내기」) ────────────────────
// createStudyAssignment(kind QUESTIONS) 의 스튜디오 래퍼 — 워크시트 경로와 같은
// 편성 검증(비편성 학생 혼입 차단)만 얹는다. 문항 소유권·50문항 상한 검증은
// createStudyAssignment 가 이미 수행하므로 중복하지 않는다.

export interface StudioQuestionsDeployInput {
  classId: string;
  /** 서버 미사용·미검증 — 클라이언트 onDeployed 재조회 키 용도로 계약에 남긴
   *  자리다(문항 과제에는 링크 게이트를 두지 않는다 §3.10.8). */
  passageId: string;
  questionIds: string[];
  studentIds: string[];
  /** ISO — null = 마감 없음 */
  dueAt?: string | null;
  title?: string;
}

export async function deployStudioQuestions(
  input: StudioQuestionsDeployInput,
): Promise<StudioActionResult<{ assignmentId: string; taskCount: number }>> {
  try {
    const staff = await requireStaffAuth();
    const questionIds = [...new Set(input.questionIds)].filter(Boolean);
    if (questionIds.length === 0) {
      return { success: false, error: "배포할 문제가 없습니다." };
    }
    const studentIds = [...new Set(input.studentIds)].filter(Boolean).slice(0, 200);
    if (studentIds.length === 0) {
      return { success: false, error: "배포할 학생을 선택해 주세요." };
    }
    const cls = await prisma.class.findFirst({
      where: { id: input.classId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };

    // ENROLLED + student ACTIVE — 워크시트 경로와 동일 술어(§3.10 검수 L5-2).
    const enrolled = await prisma.classEnrollment.findMany({
      where: {
        classId: input.classId,
        studentId: { in: studentIds },
        status: "ENROLLED",
        student: { status: "ACTIVE" },
      },
      select: { studentId: true },
    });
    const enrolledSet = new Set(enrolled.map((e) => e.studentId));
    const targetStudentIds = studentIds.filter((id) => enrolledSet.has(id));
    if (targetStudentIds.length === 0) {
      return { success: false, error: "이 클래스에 편성된 학생만 배포할 수 있습니다." };
    }

    const created = await createStudyAssignment({
      kind: "QUESTIONS",
      title: input.title?.trim() || undefined,
      targets: targetStudentIds.map((id) => ({ type: "STUDENT" as const, id })),
      dueAt: input.dueAt ?? null,
      questions: { questionIds },
    });
    if (!created.success || !created.data) {
      return { success: false, error: created.error ?? "배포에 실패했습니다." };
    }
    revalidatePath("/director/studio", "layout");
    revalidatePath(`/director/studio/c/${input.classId}`, "layout");
    return {
      success: true,
      data: {
        assignmentId: created.data.assignmentId,
        taskCount: created.data.taskCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "배포에 실패했습니다.",
    };
  }
}

// ── 결과 탭 — 클래스의 스튜디오 배포 목록 ────────────────────────────────────

export interface StudioClassAssignmentRow {
  assignmentId: string;
  title: string;
  passageId: string | null;
  modules: StudioModuleId[];
  createdAt: string;
  dueAt: string | null;
  taskCount: number;
  doneCount: number;
  avgFirstTryPct: number | null;
}

export async function listStudioClassAssignments(
  classId: string,
): Promise<StudioActionResult<StudioClassAssignmentRow[]>> {
  try {
    const staff = await requireStaffAuth();
    const stamped = await prisma.$queryRaw<
      {
        id: string;
        title: string;
        createdAt: Date;
        dueAt: Date | null;
        pid: string | null;
        modules: unknown;
      }[]
    >(Prisma.sql`
      SELECT id, title, "createdAt", "dueAt",
             payload->'studio'->>'passageId' AS pid,
             payload->'studio'->'modules' AS modules
      FROM "study_assignments"
      WHERE "academyId" = ${staff.academyId}
        AND kind = 'WORKSHEET'
        AND payload->'studio'->>'classId' = ${classId}
      ORDER BY "createdAt" DESC
      LIMIT 100`);
    if (stamped.length === 0) return { success: true, data: [] };

    const ids = stamped.map((s) => s.id);
    const [tasks, avgMap] = await Promise.all([
      prisma.studyAssignmentTask.groupBy({
        by: ["assignmentId", "status"],
        where: { assignmentId: { in: ids } },
        _count: { _all: true },
      }),
      // 평균 첫 시도 정답률 = stageStates 재계산(정본, spec §5.1) — 스냅샷 평균 아님.
      avgFirstTryPctByAssignment(staff.academyId, ids),
    ]);
    const taskMap = new Map<string, { total: number; done: number }>();
    for (const t of tasks) {
      const cur = taskMap.get(t.assignmentId) ?? { total: 0, done: 0 };
      cur.total += t._count._all;
      if (t.status === "DONE") cur.done += t._count._all;
      taskMap.set(t.assignmentId, cur);
    }

    return {
      success: true,
      data: stamped.map((s) => ({
        assignmentId: s.id,
        title: s.title,
        passageId: s.pid,
        modules: Array.isArray(s.modules)
          ? (s.modules.filter(isStudioModuleId) as StudioModuleId[])
          : [],
        createdAt: s.createdAt.toISOString(),
        dueAt: s.dueAt ? s.dueAt.toISOString() : null,
        taskCount: taskMap.get(s.id)?.total ?? 0,
        doneCount: taskMap.get(s.id)?.done ?? 0,
        avgFirstTryPct: avgMap.get(s.id) ?? null,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "배포 목록을 불러오지 못했습니다.",
    };
  }
}
