"use server";

// ============================================================================
// 클래스 스튜디오 — 지문 등록·모듈 상세 서버 액션 (docs/class-studio-spec.md §3.2·§3.4)
//
// 지문은 학원 공용 자산 — "등록"만 클래스 스코프(StudioClassPassage soft-ref).
// 모듈 가용성·문항 수는 plan-server(실서빙과 동일 조립)로 미리 컴파일해 계산한다.
// 전 액션 requireStaffAuth + academyId 스코프. 영어 지문만(과목 스코프 조각 재사용).
// ============================================================================

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { buildPassageSubjectScopeWhere } from "@/actions/workbench/_passage-where";
import { PRIME_REPORT_MARKER } from "@/actions/workbench/passage-constants";
import {
  importExamPassages,
  type ImportExamPassagesResult,
} from "@/actions/workbench/exam-passages";
import { createDirectInputPassageMaterial } from "@/actions/workbench/passages";
import { requireStaffAuth } from "@/lib/auth";
import { PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST } from "@/lib/passage-analysis-credit-costs";
import { parseAnalysisReportForPreview } from "@/lib/passage-report/analysis-report/preview-parse";
import { hasWorksheetContentFields } from "@/lib/passage-report/analysis-report/worksheet-core-gate";
import { hashContent } from "@/lib/passage-utils";
import { prisma } from "@/lib/prisma";
import {
  FULL_ANALYSIS_SECTIONS,
  isSectionKind,
  missingSections,
  moduleSectionStates,
  partialAnalysisCreditCost,
} from "@/lib/studio/module-sections";
import {
  isStudioModuleId,
  MODULE_OF_STAGE,
  STUDIO_MODULES,
  type StudioModuleId,
} from "@/lib/studio/modules";
import { avgFirstTryPctByAssignment } from "@/lib/studio/stats";
import { compileServerStudyPlan } from "@/lib/worksheet-study/plan-server";
import type { StudioActionResult } from "./classes";

function revalidateStudioClass(classId: string) {
  revalidatePath("/director/studio", "layout");
  revalidatePath(`/director/studio/c/${classId}`, "layout");
}

// ── 클래스 지문 목록 ─────────────────────────────────────────────────────────

export interface StudioPassageRow {
  passageId: string;
  title: string;
  source: string | null;
  addedAt: string;
  /** PRIME 보고서 존재 = 분석이 한 번이라도 돌았음(완료와 다르다 — 아래 두 필드로 판정) */
  analyzed: boolean;
  /** 분석 진행 중(활성 잡 존재) */
  analyzing: boolean;
  /**
   * **사용 가능 모듈 수 / 전체 모듈 수** — 목록 칩의 단위(재검증 렌즈 C).
   * 섹션 수로 표기하면 상세 화면이 보여주는 모듈 수와 숫자가 어긋나 목록이 거짓말처럼
   * 보인다(예: 목록 "2/7"·상세는 4개 모듈 사용 가능). 사용자가 세는 단위는 모듈이다.
   * 전 섹션 보유(=전 모듈 사용 가능)일 때만 "분석 완료"가 참이다(감사 L4-03).
   */
  readyModuleCount: number;
  totalModuleCount: number;
  deployCount: number;
  lastDeployAt: string | null;
}

/** 이 클래스·지문의 스튜디오 배포 스탬프 집계(payload.studio). */
async function deployStatsForClass(academyId: string, classId: string) {
  try {
    const rows = await prisma.$queryRaw<
      { pid: string; cnt: bigint; last: Date | null }[]
    >(Prisma.sql`
      SELECT payload->'studio'->>'passageId' AS pid,
             COUNT(*)::bigint AS cnt,
             MAX("createdAt") AS last
      FROM "study_assignments"
      WHERE "academyId" = ${academyId}
        AND kind = 'WORKSHEET'
        AND payload->'studio'->>'classId' = ${classId}
      GROUP BY 1`);
    const map = new Map<string, { count: number; last: Date | null }>();
    for (const r of rows) if (r.pid) map.set(r.pid, { count: Number(r.cnt), last: r.last });
    return map;
  } catch {
    return new Map<string, { count: number; last: Date | null }>();
  }
}

export async function listStudioClassPassages(
  classId: string,
): Promise<StudioActionResult<StudioPassageRow[]>> {
  try {
    const staff = await requireStaffAuth();
    const cls = await prisma.class.findFirst({
      where: { id: classId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };

    const links = await prisma.studioClassPassage.findMany({
      where: { academyId: staff.academyId, classId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 300,
    });
    if (links.length === 0) return { success: true, data: [] };
    const passageIds = links.map((l) => l.passageId);

    const [passages, activeJobs, deployStats] = await Promise.all([
      prisma.passage.findMany({
        where: { id: { in: passageIds }, academyId: staff.academyId },
        select: {
          id: true,
          title: true,
          source: true,
          // pages 를 실어 보유 섹션 수를 센다 — 종량제 세계에서 "리포트 존재"는
          // 완료를 뜻하지 않는다(2/7 부분 분석도 리포트는 있다).
          reports: {
            where: { generationPlan: PRIME_REPORT_MARKER, deletedAt: null },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { id: true, pages: true },
          },
        },
      }),
      prisma.workbenchAiJob.findMany({
        where: {
          academyId: staff.academyId,
          domain: "PASSAGE_ANALYSIS",
          status: { in: ["PENDING", "PROCESSING"] },
          passageId: { in: passageIds },
          deletedAt: null,
        },
        select: { passageId: true },
      }),
      deployStatsForClass(staff.academyId, classId),
    ]);

    const passageMap = new Map(passages.map((p) => [p.id, p]));
    const analyzingSet = new Set(activeJobs.map((j) => j.passageId));

    const rows: StudioPassageRow[] = [];
    for (const link of links) {
      const p = passageMap.get(link.passageId);
      if (!p) continue; // 지문이 삭제된 링크는 표시하지 않는다
      const dep = deployStats.get(p.id);
      // 사용 가능 모듈 수 — pages 를 스키마 파싱까지 하지 않고 kind 배열만 훑어(목록은 N행이라
      // 파싱 비용을 피한다) 보유 섹션 집합을 만든 뒤, 상세 화면과 **같은 정본**
      // (moduleSectionStates)으로 모듈 단위로 환산한다. 형식이 다르면 0(보수적).
      // 실전 문제(exam)는 섹션 종량제 대상이 아니라 별도 생성물이라 여기서는 세지 않는다 —
      // 분모도 섹션 기반 6모듈로 맞춰야 "6/6 인데 분석 완료가 아니다" 같은 모순이 없다.
      const seen = new Set<string>();
      const pages = p.reports[0]?.pages as { sections?: unknown } | null | undefined;
      if (pages && typeof pages === "object" && Array.isArray(pages.sections)) {
        for (const s of pages.sections) {
          const kind = (s as { kind?: unknown } | null)?.kind;
          if (isSectionKind(kind)) seen.add(kind);
        }
      }
      const modStates = moduleSectionStates(seen);
      const readyModuleCount = modStates.filter((m) => m.ready).length;
      rows.push({
        passageId: p.id,
        title: p.title,
        source: p.source ?? null,
        addedAt: link.createdAt.toISOString(),
        analyzed: p.reports.length > 0,
        analyzing: analyzingSet.has(p.id),
        readyModuleCount,
        totalModuleCount: modStates.length,
        deployCount: dep?.count ?? 0,
        lastDeployAt: dep?.last ? dep.last.toISOString() : null,
      });
    }
    return { success: true, data: rows };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "지문 목록을 불러오지 못했습니다.",
    };
  }
}

// ── 내 자료 피커 (슬림 — 본문 미포함) ────────────────────────────────────────

export interface StudioPickerPassage {
  id: string;
  title: string;
  source: string | null;
  createdAt: string;
  analyzed: boolean;
  /** 이미 이 클래스에 등록됨 — 피커에서 체크 표시+비활성 */
  alreadyAdded: boolean;
}

export async function searchMyPassages(input: {
  classId: string;
  search?: string;
  page?: number;
}): Promise<StudioActionResult<{ rows: StudioPickerPassage[]; total: number; page: number }>> {
  try {
    const staff = await requireStaffAuth();
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const limit = 30;
    const search = input.search?.trim();

    const where: Prisma.PassageWhereInput = {
      academyId: staff.academyId,
      AND: [buildPassageSubjectScopeWhere() as Prisma.PassageWhereInput],
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { content: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [passages, total, existing] = await Promise.all([
      prisma.passage.findMany({
        where,
        select: {
          id: true,
          title: true,
          source: true,
          createdAt: true,
          reports: {
            where: { generationPlan: PRIME_REPORT_MARKER, deletedAt: null },
            take: 1,
            select: { id: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.passage.count({ where }),
      prisma.studioClassPassage.findMany({
        where: { academyId: staff.academyId, classId: input.classId },
        select: { passageId: true },
      }),
    ]);
    const addedSet = new Set(existing.map((e) => e.passageId));
    return {
      success: true,
      data: {
        rows: passages.map((p) => ({
          id: p.id,
          title: p.title,
          source: p.source ?? null,
          createdAt: p.createdAt.toISOString(),
          analyzed: p.reports.length > 0,
          alreadyAdded: addedSet.has(p.id),
        })),
        total,
        page,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "내 자료를 불러오지 못했습니다.",
    };
  }
}

/**
 * 피커 행 「내용」 토글용 본문 지연 로드 — 목록 응답은 슬림 유지가 계약이라
 * (스펙 §12 "/api/passages/list 무상한+본문 전문 함정"), 펼칠 때 지문 단위로만 가져온다.
 */
export async function getStudioPassageText(input: {
  passageId: string;
}): Promise<StudioActionResult<{ title: string; content: string; wordCount: number }>> {
  try {
    const staff = await requireStaffAuth();
    const passage = await prisma.passage.findFirst({
      where: { id: input.passageId, academyId: staff.academyId },
      select: { title: true, content: true },
    });
    if (!passage) return { success: false, error: "지문을 찾을 수 없습니다." };
    return {
      success: true,
      data: {
        title: passage.title,
        content: passage.content,
        wordCount: passage.content.trim().split(/\s+/).filter(Boolean).length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "본문을 불러오지 못했습니다.",
    };
  }
}

// ── 등록·해제 ────────────────────────────────────────────────────────────────

export async function addPassagesToStudioClass(input: {
  classId: string;
  passageIds: string[];
}): Promise<StudioActionResult<{ addedCount: number }>> {
  try {
    const staff = await requireStaffAuth();
    const ids = [...new Set(input.passageIds)].filter(Boolean).slice(0, 50);
    if (ids.length === 0) return { success: false, error: "선택된 지문이 없습니다." };

    // 세 조회는 서로 의존하지 않는다 — 순차로 두면 원격 DB 왕복 3회가 그대로
    // 담기 지연이 된다(26-08-15 지연 수술). 소유·존재 판정은 아래에서 그대로.
    const [cls, owned, maxRow] = await Promise.all([
      prisma.class.findFirst({
        where: { id: input.classId, academyId: staff.academyId },
        select: { id: true },
      }),
      // 학원 소유 + 영어 지문만 통과(과목 스코프 규약)
      prisma.passage.findMany({
        where: {
          id: { in: ids },
          academyId: staff.academyId,
          AND: [buildPassageSubjectScopeWhere() as Prisma.PassageWhereInput],
        },
        select: { id: true },
      }),
      // academyId 를 함께 건다 — 클래스 소유 검증(cls)과 병렬로 도는 만큼
      // 이 조회 자체가 테넌트 스코프를 갖고 있어야 한다.
      prisma.studioClassPassage.aggregate({
        where: { classId: input.classId, academyId: staff.academyId },
        _max: { sortOrder: true },
      }),
    ]);
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };
    if (owned.length === 0) return { success: false, error: "등록할 수 있는 지문이 없습니다." };

    let sortOrder = (maxRow._max.sortOrder ?? 0) + 1;

    const result = await prisma.studioClassPassage.createMany({
      data: owned.map((p) => ({
        academyId: staff.academyId,
        classId: input.classId,
        passageId: p.id,
        addedById: staff.id,
        sortOrder: sortOrder++,
      })),
      skipDuplicates: true,
    });
    revalidateStudioClass(input.classId);
    return { success: true, data: { addedCount: result.count } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "지문 등록에 실패했습니다.",
    };
  }
}

/**
 * 기출 담기 **1왕복 합본**(§3.8.3-v2 지연 수술 26-08-15) — 지문함 등록 +
 * 클래스 담기를 한 서버 액션으로 처리한다.
 *
 * 왜: **Next.js 는 클라이언트가 보낸 서버 액션을 직렬 처리한다.** 두 액션을
 * 잇달아 부르면 왕복 2회 + RSC 재렌더 2회 + revalidatePath 2벌이 그대로 체감
 * 지연이 된다(실측: importExamPassages 데이터 도착 ~1.6s → addPassagesToStudio
 * Class ~1.9s 직렬 = 토스트까지 3.5s). 같은 프로세스 안 함수 호출로 합치면
 * 왕복 1회로 접힌다.
 *
 * 클래스 미선택 호스트(문제생성 기출 탭·학습지/웹툰 모달)는 종전대로
 * importExamPassages 를 직접 쓴다 — 이 액션은 스튜디오 전용 합본이다.
 */
export async function importExamPassagesToStudioClass(input: {
  examPassageIds: string[];
  classId: string;
}): Promise<ImportExamPassagesResult & { addedToClassCount: number }> {
  const result = await importExamPassages(input.examPassageIds);
  if (!result.success) return { ...result, addedToClassCount: 0 };
  // 담기 의도는 신규·기존이 같다(§3.8.3) — 이미 지문함에 있던 기출도 함께 링크.
  const pickedIds = Array.from(
    new Set([...result.createdIds, ...(result.existingIds ?? [])]),
  );
  let addedToClassCount = 0;
  // addPassagesToStudioClass 는 호출당 50개 캡(§3.10.9). 여기서는 같은 프로세스
  // 안 함수 호출이라 청크를 돌아도 **왕복은 늘지 않는다**(클라 청크 루프와의
  // 결정적 차이).
  for (let i = 0; i < pickedIds.length; i += 50) {
    const res = await addPassagesToStudioClass({
      classId: input.classId,
      passageIds: pickedIds.slice(i, i + 50),
    });
    if (res.success && res.data) addedToClassCount += res.data.addedCount;
  }
  return { ...result, addedToClassCount };
}

/** 일괄 등록 해제(§3.10.9) — addPassagesToStudioClass 의 대칭. 링크만 지운다
 *  (지문·생성물·배포 이력 보존). 멱등 — 없던 링크는 removedCount 에서 빠질 뿐. */
export async function removePassagesFromStudioClass(input: {
  classId: string;
  passageIds: string[];
}): Promise<StudioActionResult<{ removedCount: number }>> {
  try {
    const staff = await requireStaffAuth();
    const ids = [...new Set(input.passageIds)].filter(Boolean).slice(0, 50);
    if (ids.length === 0) return { success: false, error: "선택된 지문이 없습니다." };
    const cls = await prisma.class.findFirst({
      where: { id: input.classId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };
    const result = await prisma.studioClassPassage.deleteMany({
      where: {
        academyId: staff.academyId,
        classId: input.classId,
        passageId: { in: ids },
      },
    });
    revalidateStudioClass(input.classId);
    return { success: true, data: { removedCount: result.count } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "지문 등록 해제에 실패했습니다.",
    };
  }
}

export async function removePassageFromStudioClass(input: {
  classId: string;
  passageId: string;
}): Promise<StudioActionResult> {
  try {
    const staff = await requireStaffAuth();
    await prisma.studioClassPassage.deleteMany({
      where: {
        academyId: staff.academyId,
        classId: input.classId,
        passageId: input.passageId,
      },
    });
    revalidateStudioClass(input.classId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "지문 등록 해제에 실패했습니다.",
    };
  }
}

/** 붙여넣기 등록 — 기존 직접입력 정본 액션 재사용 후 클래스에 자동 등록(스펙 §3.2 탭 2). */
export async function createStudioPastedPassage(input: {
  classId: string;
  title?: string;
  content: string;
}): Promise<StudioActionResult<{ passageId: string }>> {
  try {
    const staff = await requireStaffAuth();
    const cls = await prisma.class.findFirst({
      where: { id: input.classId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };

    const content = input.content?.trim() ?? "";
    if (content.length < 20) {
      return { success: false, error: "지문 본문을 20자 이상 입력해 주세요." };
    }
    if (content.length > 20000) {
      return { success: false, error: "지문 본문은 20,000자 이내로 입력해 주세요." };
    }
    const rawTitle = input.title?.trim() ?? "";
    if (rawTitle.length > 120) {
      return { success: false, error: "제목은 120자 이내로 입력해 주세요." };
    }
    const fallbackTitle = content.slice(0, 40).replace(/\s+/g, " ");
    const created = await createDirectInputPassageMaterial({
      title: rawTitle || fallbackTitle || "붙여넣은 지문",
      content,
    });
    if (!created.success || !created.id) {
      return { success: false, error: created.error ?? "지문 저장에 실패했습니다." };
    }
    const added = await addPassagesToStudioClass({
      classId: input.classId,
      passageIds: [created.id],
    });
    if (!added.success) return { success: false, error: added.error };
    return { success: true, data: { passageId: created.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "지문 등록에 실패했습니다.",
    };
  }
}

// ── 지문 스튜디오 상세 (모듈 가용성·이력) ────────────────────────────────────

export interface StudioModuleCard {
  id: StudioModuleId;
  label: string;
  subtitle: string;
  /** 이 지문에서 성립하는 문항 수(0 = 자료 없음 → 카드 비활성) */
  itemCount: number;
  estMin: number;
  /** ready=사용 가능(필요 섹션 전부 보유) · needs=분석 필요 · generating=이 모듈 대상 잡 진행 중 */
  state: "ready" | "needs" | "generating";
  /** needs 일 때 부족 섹션(fast 라우트 targetSections 재료) — ready 면 [] */
  missingSections: string[];
  /** needs 일 때 이 모듈만 분석하는 가격(크레딧) — ready 면 0. exam 특례: 실전 학습지 +5 */
  creditCost: number;
}

export interface StudioDeploymentRow {
  assignmentId: string;
  title: string;
  createdAt: string;
  dueAt: string | null;
  modules: StudioModuleId[];
  taskCount: number;
  doneCount: number;
  /** 첫 시도 정답률 평균(캐시 기반, 기록 없으면 null) */
  avgFirstTryPct: number | null;
}

export interface StudioPassageDetail {
  passageId: string;
  title: string;
  source: string | null;
  content: string;
  analyzed: boolean;
  analyzing: boolean;
  reportId: string | null;
  reportUpdatedAt: string | null;
  /**
   * 실전 학습지(worksheet-grade lw: drills·workbookSet·inferenceSet 실존) 보유 —
   * 코어 lw(logicRows만)로 true 가 되면 +5크레딧 구매 버튼이 사라진다(검수 L1-F2).
   */
  hasWorksheetSection: boolean;
  /** 보유 분석 섹션 kind 목록(본문 해시 스테일이면 빈 배열) */
  presentSections: string[];
  /** 본문 수정으로 기존 분석이 무효화됨 — 클라이언트가 사전 고지(스펙 스테일 규칙) */
  stale: boolean;
  /** 남은 전체 분석 가격(지문 누적 상한 반영) — 전부 보유면 0 */
  fullAnalysisCost: number;
  /** 진행 중 잡의 대상 섹션(부분 잡 config.targetSections). 전체 잡(구형/전체 버튼 아닌 정액 경로)이면 null */
  analyzingSections: string[] | null;
  /** 진행 중 부분 잡을 발사한 모듈 카드(§3.4.1-11) — 그 카드만 "분석 중" 표시 */
  analyzingSourceModule: StudioModuleId | null;
  /**
   * 최근 부분 분석 실패 잡의 대상 섹션(그 뒤 완료 잡 없음) — 실패 상태를 서버에서
   * 파생해 새로고침·재진입에도 실패 카드가 유지된다(스펙 §3.4.1-11, 검수 UI-4).
   */
  lastFailedSections: string[] | null;
  modules: StudioModuleCard[];
  deployments: StudioDeploymentRow[];
}

export async function getStudioPassageDetail(input: {
  classId: string;
  passageId: string;
}): Promise<StudioActionResult<StudioPassageDetail | null>> {
  try {
    const staff = await requireStaffAuth();
    const link = await prisma.studioClassPassage.findFirst({
      where: {
        academyId: staff.academyId,
        classId: input.classId,
        passageId: input.passageId,
      },
      select: { id: true },
    });
    if (!link) return { success: true, data: null };

    const passage = await prisma.passage.findFirst({
      where: { id: input.passageId, academyId: staff.academyId },
      select: {
        id: true,
        title: true,
        source: true,
        content: true,
        // 섹션 신선도 판정용 — fast 라우트와 동일 기준(contentHash === hashContent(content))
        analysis: { select: { contentHash: true } },
      },
    });
    if (!passage) return { success: true, data: null };

    const [report, activeJob, lastTerminalJobs] = await Promise.all([
      prisma.passageReport.findFirst({
        where: {
          passageId: passage.id,
          academyId: staff.academyId,
          generationPlan: PRIME_REPORT_MARKER,
          deletedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, pages: true, updatedAt: true },
      }),
      prisma.workbenchAiJob.findFirst({
        where: {
          academyId: staff.academyId,
          domain: "PASSAGE_ANALYSIS",
          status: { in: ["PENDING", "PROCESSING"] },
          passageId: passage.id,
          deletedAt: null,
        },
        // config.targetSections(부분 잡)·includeWorksheet(실전 생성 잡) 판독용
        select: { id: true, config: true },
      }),
      // 실패 상태 서버 파생(스펙 §3.4.1-11) — 최근 종결 잡 1건이 FAILED 부분 잡이면
      // 그 대상 섹션을 노출해 새로고침 후에도 실패 카드가 복원되게 한다.
      prisma.workbenchAiJob.findFirst({
        where: {
          academyId: staff.academyId,
          domain: "PASSAGE_ANALYSIS",
          status: { in: ["COMPLETED", "FAILED"] },
          passageId: passage.id,
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
        select: { status: true, config: true },
      }),
    ]);

    // ── 진행 중 잡 판독(스펙 §3.4.1-9·11) — 부분 잡이면 대상 섹션·발사 카드 ──
    let analyzingSections: string[] | null = null;
    let analyzingSourceModule: StudioModuleId | null = null;
    let worksheetJobActive = false;
    if (activeJob?.config && typeof activeJob.config === "object" && !Array.isArray(activeJob.config)) {
      const cfg = activeJob.config as Record<string, unknown>;
      if (Array.isArray(cfg.targetSections)) {
        analyzingSections = cfg.targetSections.filter(isSectionKind);
      }
      if (isStudioModuleId(cfg.sourceModule)) {
        analyzingSourceModule = cfg.sourceModule;
      }
      worksheetJobActive = cfg.includeWorksheet === true;
    }

    // 모듈 가용성 — 실서빙과 동일 조립(plan-server)로 미리 컴파일해 스테이지를
    // 모듈로 접는다. 가상 taskId 는 고정("studio:{passageId}") — 결정론 미리보기.
    // 리포트가 없어도 7카드 전부(needs 상태·가격 포함) 반환 — 카드가 1급 표면(스펙 §3.4).
    const moduleCards: StudioModuleCard[] = STUDIO_MODULES.map((m) => ({
      id: m.id,
      label: m.label,
      subtitle: m.subtitle,
      itemCount: 0,
      estMin: 0,
      state: "needs",
      missingSections: [],
      creditCost: 0,
    }));
    let hasWorksheetSection = false;
    let stale = false;
    // 보유 섹션 — 본문이 수정됐으면(analysis.contentHash 불일치·부재) 전부 스테일
    // 취급해 빈 배열(스펙 §3.4.1-1). fast 라우트 과금 판정과 같은 기준이어야
    // 카드에 표시한 가격과 실제 청구가 어긋나지 않는다.
    let presentSections: string[] = [];
    if (report) {
      const parsed = parseAnalysisReportForPreview(report.pages);
      if (parsed) {
        // 실전 보유 = worksheet-grade lw 만 — 코어 lw(logicRows 전용)는 모든 전체
        // 분석이 만들므로 kind 존재만 보면 구매 버튼이 사라진다(검수 L1-F2).
        hasWorksheetSection = parsed.sections.some((s) => hasWorksheetContentFields(s));
        if (passage.analysis?.contentHash === hashContent(passage.content)) {
          presentSections = parsed.sections.map((s) => s.kind).filter(isSectionKind);
        } else {
          stale = true;
        }
        const plan = await compileServerStudyPlan({
          report: parsed,
          mode: "standard",
          taskId: `studio:${passage.id}`,
          reportTitle: report.title,
        });
        const byModule = new Map(moduleCards.map((c) => [c.id, c]));
        for (const stage of plan.stages) {
          const moduleId = MODULE_OF_STAGE.get(stage.id);
          if (!moduleId) continue;
          const card = byModule.get(moduleId);
          if (!card) continue;
          card.itemCount += stage.items.length;
          card.estMin += stage.estMin;
        }
      }
    }

    // ── 카드 상태·가격 파생(정본 계산은 전부 module-sections.ts) ────────────────
    const presentSet: ReadonlySet<string> = new Set(presentSections);
    const sectionStateById = new Map(
      moduleSectionStates(presentSet).map((s) => [s.moduleId as StudioModuleId, s]),
    );
    const analyzing = Boolean(activeJob);
    for (const card of moduleCards) {
      if (card.id === "exam") {
        // 실전 문제 특례(스펙 §3.4) — 섹션 종량제 대상이 아니라 실전 학습지 생성물이 원천.
        // generating 은 실전 생성 잡(includeWorksheet)일 때만 — 기존 폴링 경로 유지.
        if (card.itemCount > 0) {
          card.state = "ready";
        } else {
          card.state = analyzing && worksheetJobActive ? "generating" : "needs";
          card.creditCost = PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST;
        }
        continue;
      }
      const st = sectionStateById.get(card.id);
      if (!st) continue; // 도달 불가 — 섹션 기반 6모듈은 전부 정본 매핑에 존재
      if (st.ready) {
        // ready 인데 itemCount===0 이어도 ready 유지 — 클라이언트가
        // "이 지문에는 해당 자료가 없습니다"로 비활성 렌더한다(재과금 유도 금지).
        card.state = "ready";
      } else {
        card.missingSections = st.missing;
        card.creditCost = st.creditCost;
        // 표시 규칙(스펙 §3.4.1-11 재개정): 발사 카드(sourceModule) 하나만 "분석 중".
        // 공유 기반으로 함께 준비되는 카드는 조용히 needs 를 유지하다가 완료 토스트가
        // 덤 해금을 알린다 — "어휘만 눌렀는데 왜 다른 것도 돌아?" 혼란 제거.
        // sourceModule 없는 잡(전체 분석·구형)은 부분집합 규칙 폴백(전체 잡=전 모듈).
        const analyzingSet: ReadonlySet<string> | null =
          analyzingSections === null ? null : new Set(analyzingSections);
        const inFlight =
          analyzing &&
          !worksheetJobActive &&
          (analyzingSourceModule !== null
            ? analyzingSourceModule === card.id
            : analyzingSet === null || st.missing.every((k) => analyzingSet.has(k)));
        card.state = inFlight ? "generating" : "needs";
      }
    }

    // 남은 전체 분석 가격 — 지문 누적 상한(순차 총액 = 일괄 총액 불변식)의 표면값.
    const fullAnalysisCost = partialAnalysisCreditCost(
      missingSections(FULL_ANALYSIS_SECTIONS, presentSet).length,
      presentSections.length,
    );

    // 실패 상태 파생 — 최근 종결 잡이 FAILED 부분 잡이고 그 대상이 아직 미보유일 때만.
    let lastFailedSections: string[] | null = null;
    if (lastTerminalJobs?.status === "FAILED") {
      const cfg =
        lastTerminalJobs.config && typeof lastTerminalJobs.config === "object" && !Array.isArray(lastTerminalJobs.config)
          ? (lastTerminalJobs.config as Record<string, unknown>)
          : null;
      if (cfg && Array.isArray(cfg.targetSections)) {
        const failed = cfg.targetSections.filter(isSectionKind).filter((k) => !presentSet.has(k));
        if (failed.length > 0) lastFailedSections = failed;
      }
    }

    // 이 클래스·지문의 배포 이력(스탬프 기준)
    let deployments: StudioDeploymentRow[] = [];
    try {
      const stamped = await prisma.$queryRaw<
        {
          id: string;
          title: string;
          createdAt: Date;
          dueAt: Date | null;
          modules: unknown;
        }[]
      >(Prisma.sql`
        SELECT id, title, "createdAt", "dueAt", payload->'studio'->'modules' AS modules
        FROM "study_assignments"
        WHERE "academyId" = ${staff.academyId}
          AND kind = 'WORKSHEET'
          AND payload->'studio'->>'classId' = ${input.classId}
          AND payload->'studio'->>'passageId' = ${input.passageId}
        ORDER BY "createdAt" DESC
        LIMIT 30`);
      if (stamped.length > 0) {
        const ids = stamped.map((s) => s.id);
        const [tasks, avgMap] = await Promise.all([
          prisma.studyAssignmentTask.groupBy({
            by: ["assignmentId", "status"],
            where: { assignmentId: { in: ids } },
            _count: { _all: true },
          }),
          // 평균 첫 시도 정답률 = stageStates 재계산(정본, spec §5.1).
          avgFirstTryPctByAssignment(staff.academyId, ids),
        ]);
        const taskMap = new Map<string, { total: number; done: number }>();
        for (const t of tasks) {
          const cur = taskMap.get(t.assignmentId) ?? { total: 0, done: 0 };
          cur.total += t._count._all;
          if (t.status === "DONE") cur.done += t._count._all;
          taskMap.set(t.assignmentId, cur);
        }
        deployments = stamped.map((s) => ({
          assignmentId: s.id,
          title: s.title,
          createdAt: s.createdAt.toISOString(),
          dueAt: s.dueAt ? s.dueAt.toISOString() : null,
          modules: Array.isArray(s.modules)
            ? (s.modules.filter(isStudioModuleId) as StudioModuleId[])
            : [],
          taskCount: taskMap.get(s.id)?.total ?? 0,
          doneCount: taskMap.get(s.id)?.done ?? 0,
          avgFirstTryPct: avgMap.get(s.id) ?? null,
        }));
      }
    } catch {
      deployments = [];
    }

    return {
      success: true,
      data: {
        passageId: passage.id,
        title: passage.title,
        source: passage.source ?? null,
        content: passage.content,
        analyzed: Boolean(report),
        analyzing: Boolean(activeJob),
        reportId: report?.id ?? null,
        reportUpdatedAt: report ? report.updatedAt.toISOString() : null,
        hasWorksheetSection,
        presentSections,
        stale,
        fullAnalysisCost,
        analyzingSections,
        analyzingSourceModule,
        lastFailedSections,
        modules: moduleCards,
        deployments,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "지문 정보를 불러오지 못했습니다.",
    };
  }
}

// ── 워크벤치 모듈 선택 시트 — 지문별 섹션 보유 배치 조회 (스펙 §3.7.4) ────────

export interface StudioPassageSectionState {
  passageId: string;
  analyzed: boolean;
  /** 본문 수정으로 기존 분석이 무효(보유 0 취급 — §3.4 스테일 규칙) */
  stale: boolean;
  presentSections: string[];
  /** 실전 보유 = worksheet-grade lw(§3.4 특례 — 코어 lw 로 참이 되면 안 된다) */
  hasWorksheet: boolean;
  /** 활성 잡 존재 — 발사 전 클라이언트 필터용(지문당 동시 1잡) */
  analyzing: boolean;
}

/**
 * 모듈 선택 시트의 가격 계산·실전 특례 판정 전용 슬림 배치 조회.
 * 신선도 술어는 detail 경로와 동일(analysis.contentHash === hashContent(content),
 * 행 부재 = 스테일) — 시트에 표기한 가격과 실제 청구가 어긋나면 안 된다.
 * 본문·리포트 내용은 반환하지 않는다(목록 응답 슬림 유지 — §12).
 */
export async function getStudioPassageSectionStates(input: {
  passageIds: string[];
}): Promise<StudioActionResult<StudioPassageSectionState[]>> {
  try {
    const staff = await requireStaffAuth();
    const ids = [...new Set(input.passageIds)].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (ids.length === 0) return { success: true, data: [] };
    if (ids.length > 50) {
      return { success: false, error: "한 번에 50개까지 선택할 수 있습니다." };
    }

    const [passages, reports, activeJobs] = await Promise.all([
      prisma.passage.findMany({
        where: { id: { in: ids }, academyId: staff.academyId },
        select: {
          id: true,
          content: true,
          analysis: { select: { contentHash: true } },
        },
      }),
      prisma.passageReport.findMany({
        where: {
          passageId: { in: ids },
          academyId: staff.academyId,
          generationPlan: PRIME_REPORT_MARKER,
          deletedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        select: { passageId: true, pages: true },
      }),
      prisma.workbenchAiJob.findMany({
        where: {
          academyId: staff.academyId,
          domain: "PASSAGE_ANALYSIS",
          status: { in: ["PENDING", "PROCESSING"] },
          passageId: { in: ids },
          deletedAt: null,
        },
        select: { passageId: true },
      }),
    ]);

    // 지문당 최신 리포트 1건(updatedAt desc 순회라 첫 등장이 최신)
    const reportByPassage = new Map<string, unknown>();
    for (const r of reports) {
      if (r.passageId && !reportByPassage.has(r.passageId)) {
        reportByPassage.set(r.passageId, r.pages);
      }
    }
    const analyzingSet = new Set(
      activeJobs.map((j) => j.passageId).filter((v): v is string => Boolean(v)),
    );

    const rows: StudioPassageSectionState[] = [];
    for (const p of passages) {
      const pages = reportByPassage.get(p.id);
      let analyzed = false;
      let staleFlag = false;
      let presentSections: string[] = [];
      let hasWorksheet = false;
      if (pages !== undefined) {
        const parsed = parseAnalysisReportForPreview(pages);
        if (parsed) {
          analyzed = true;
          hasWorksheet = parsed.sections.some((s) => hasWorksheetContentFields(s));
          if (p.analysis?.contentHash === hashContent(p.content)) {
            presentSections = parsed.sections.map((s) => s.kind).filter(isSectionKind);
          } else {
            staleFlag = true;
          }
        }
      }
      rows.push({
        passageId: p.id,
        analyzed,
        stale: staleFlag,
        presentSections,
        hasWorksheet,
        analyzing: analyzingSet.has(p.id),
      });
    }
    return { success: true, data: rows };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "지문 상태를 불러오지 못했습니다.",
    };
  }
}
