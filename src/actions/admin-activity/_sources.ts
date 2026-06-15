// ============================================================================
// 관리자 활동 타임라인 — 소스 유니온 레이어 (내부 모듈, "use server" 아님).
//
// 유저 행동의 결과가 이미 남는 도메인 테이블들을 직접 유니온해 타임라인을
// 만든다. 따라서 별도 백필 없이 과거 이력까지 전부 보이고, app_events에는
// 도메인 테이블에 없는 것(페이지 이동·로그인·내보내기)만 들어온다.
//
// 페이지네이션: createdAt < before 커서(ms 정밀도). 소스별 limit씩 떠서
// 병합 정렬 후 limit으로 자른다. 관리자 1~2명이 쓰는 화면이라 소스당
// 쿼리 1회(최대 9회 + 이름 조회 2회)는 허용 비용.
// ============================================================================

import { prisma } from "@/lib/prisma";
import {
  ACTIVITY_CATEGORY_LABELS,
  type ActivityCategory,
  type ActivityItem,
  type ActivityStatus,
} from "@/lib/admin-activity-types";
import {
  examTypeLabel,
  loginProviderLabel,
  pagePathLabel,
  statusLabel,
  workbenchModeLabel,
} from "@/lib/admin-activity-labels";

export type { ActivityCategory, ActivityItem };

export interface FetchActivityParams {
  academyId?: string;
  /** 여러 학원으로 제한 (전역 피드의 학원 검색) */
  academyIds?: string[];
  before?: Date;
  limit: number;
  category?: ActivityCategory | "all";
}

interface RawItem
  extends Omit<
    ActivityItem,
    "academyName" | "actorName" | "categoryLabel" | "createdAt"
  > {
  createdAt: Date;
}

function jobStatus(status: string): ActivityStatus {
  if (status === "COMPLETED") return "SUCCESS";
  if (status === "FAILED") return "FAILED";
  return "PENDING";
}

function scopeWhere(p: FetchActivityParams) {
  if (p.academyId) return { academyId: p.academyId };
  if (p.academyIds) return { academyId: { in: p.academyIds } };
  return {};
}

function timeWhere(p: FetchActivityParams) {
  return p.before ? { createdAt: { lt: p.before } } : {};
}

// ─── 소스별 fetcher ──────────────────────────────────────────────────────────

async function fromAppEvents(p: FetchActivityParams): Promise<RawItem[]> {
  const eventTypeFilter =
    p.category === "PAGE_VIEW"
      ? { eventType: "PAGE_VIEW" }
      : p.category === "AUTH"
        ? { eventType: "LOGIN" }
        : p.category === "EXPORT"
          ? { eventType: "EXAM_EXPORT" }
          : {};
  const rows = await prisma.appEvent.findMany({
    where: { ...scopeWhere(p), ...timeWhere(p), ...eventTypeFilter },
    orderBy: { createdAt: "desc" },
    take: p.limit,
  });
  return rows.map((e) => {
    const meta = (e.metadata ?? null) as Record<string, unknown> | null;
    const category: ActivityCategory =
      e.eventType === "PAGE_VIEW"
        ? "PAGE_VIEW"
        : e.eventType === "LOGIN"
          ? "AUTH"
          : "EXPORT";
    const path = typeof meta?.path === "string" ? meta.path : null;
    const title =
      e.eventType === "PAGE_VIEW"
        ? pagePathLabel(path)
        : e.eventType === "LOGIN"
          ? "로그인"
          : `시험지 내보내기 (${String(meta?.format ?? "?").toUpperCase()})`;
    const detail =
      e.eventType === "PAGE_VIEW"
        ? path
        : e.eventType === "LOGIN"
          ? `방식: ${loginProviderLabel(String(meta?.provider ?? ""))}`
          : e.eventType === "EXAM_EXPORT"
            ? String(meta?.title ?? "")
            : null;
    return {
      id: `event:${e.id}`,
      source: "app_events",
      category,
      title,
      detail,
      status: "INFO" as const,
      academyId: e.academyId,
      actorId: e.actorId,
      metadata: meta,
      createdAt: e.createdAt,
    };
  });
}

async function fromExtractionJobs(p: FetchActivityParams): Promise<RawItem[]> {
  const rows = await prisma.extractionJob.findMany({
    where: { ...scopeWhere(p), ...timeWhere(p) },
    orderBy: { createdAt: "desc" },
    take: p.limit,
    select: {
      id: true, academyId: true, createdById: true, status: true,
      totalPages: true, successPages: true, failedPages: true,
      originalFileName: true, displayName: true, mode: true,
      errorSummary: true, creditsConsumed: true, creditsRefunded: true,
      createdAt: true, deletedAt: true,
    },
  });
  return rows.map((j) => ({
    id: `extraction:${j.id}`,
    source: "extraction_jobs",
    category: "EXTRACTION" as const,
    title: `자료 추출 — ${j.displayName ?? j.originalFileName ?? "(이름 없음)"}${j.deletedAt ? " (삭제됨)" : ""}`,
    detail: `${j.totalPages}p · 성공 ${j.successPages} · 실패 ${j.failedPages}${j.errorSummary ? ` · ${j.errorSummary}` : ""}`,
    status: jobStatus(j.status),
    academyId: j.academyId,
    actorId: j.createdById,
    metadata: {
      mode: j.mode,
      creditsConsumed: j.creditsConsumed,
      creditsRefunded: j.creditsRefunded,
      jobId: j.id,
    },
    createdAt: j.createdAt,
  }));
}

async function fromWorkbenchJobs(p: FetchActivityParams): Promise<RawItem[]> {
  const rows = await prisma.workbenchAiJob.findMany({
    where: { ...scopeWhere(p), ...timeWhere(p) },
    orderBy: { createdAt: "desc" },
    take: p.limit,
    select: {
      id: true, academyId: true, createdById: true, domain: true,
      status: true, title: true, mode: true, questionType: true,
      successCount: true, failedCount: true, errorMessage: true,
      passageId: true, createdAt: true, deletedAt: true,
    },
  });
  return rows.map((j) => {
    const kind = j.domain === "PASSAGE_ANALYSIS" ? "학습지 생성" : "문제 생성";
    return {
      id: `workbench:${j.id}`,
      source: "workbench_ai_jobs",
      category: "AI_GENERATION" as const,
      title: `${kind} — ${j.title}${j.deletedAt ? " (삭제됨)" : ""}`,
      detail:
        j.status === "FAILED" && j.errorMessage
          ? j.errorMessage
          : [
              j.mode ? workbenchModeLabel(j.mode) : null,
              j.questionType,
              `성공 ${j.successCount}`,
            ]
              .filter(Boolean)
              .join(" · "),
      status: jobStatus(j.status),
      academyId: j.academyId,
      actorId: j.createdById,
      metadata: { domain: j.domain, passageId: j.passageId, jobId: j.id },
      createdAt: j.createdAt,
    };
  });
}

async function fromSimilarExamJobs(p: FetchActivityParams): Promise<RawItem[]> {
  const rows = await prisma.similarExamGenerationJob.findMany({
    where: { ...scopeWhere(p), ...timeWhere(p) },
    orderBy: { createdAt: "desc" },
    take: p.limit,
    select: {
      id: true, academyId: true, createdById: true, status: true,
      title: true, totalPages: true, errorMessage: true,
      generatedExamId: true, createdAt: true, deletedAt: true,
    },
  });
  return rows.map((j) => ({
    id: `similar-exam:${j.id}`,
    source: "similar_exam_generation_jobs",
    category: "AI_GENERATION" as const,
    title: `동형 시험지 생성 — ${j.title}${j.deletedAt ? " (삭제됨)" : ""}`,
    detail:
      j.status === "FAILED" && j.errorMessage
        ? j.errorMessage
        : `${j.totalPages}p`,
    status: jobStatus(j.status),
    academyId: j.academyId,
    actorId: j.createdById,
    metadata: { generatedExamId: j.generatedExamId, jobId: j.id },
    createdAt: j.createdAt,
  }));
}

async function fromSimilarQuestionJobs(
  p: FetchActivityParams,
): Promise<RawItem[]> {
  const rows = await prisma.similarQuestionGenerationJob.findMany({
    where: { ...scopeWhere(p), ...timeWhere(p) },
    orderBy: { createdAt: "desc" },
    take: p.limit,
    select: {
      id: true, academyId: true, createdById: true, status: true,
      savedCount: true, skippedCount: true, errorMessage: true,
      createdAt: true, deletedAt: true,
    },
  });
  return rows.map((j) => ({
    id: `similar-question:${j.id}`,
    source: "similar_question_generation_jobs",
    category: "AI_GENERATION" as const,
    title: `동형 문제 생성${j.deletedAt ? " (삭제됨)" : ""}`,
    detail:
      j.status === "FAILED" && j.errorMessage
        ? j.errorMessage
        : `저장 ${j.savedCount} · 건너뜀 ${j.skippedCount}`,
    status: jobStatus(j.status),
    academyId: j.academyId,
    actorId: j.createdById,
    metadata: { jobId: j.id },
    createdAt: j.createdAt,
  }));
}

async function fromCustomQuestionJobs(
  p: FetchActivityParams,
): Promise<RawItem[]> {
  const rows = await prisma.customQuestionGenerationJob.findMany({
    where: { ...scopeWhere(p), ...timeWhere(p) },
    orderBy: { createdAt: "desc" },
    take: p.limit,
    select: {
      id: true, academyId: true, createdById: true, status: true,
      savedCount: true, errorMessage: true, customTypeId: true,
      createdAt: true, deletedAt: true,
    },
  });
  return rows.map((j) => ({
    id: `custom-question:${j.id}`,
    source: "custom_question_generation_jobs",
    category: "AI_GENERATION" as const,
    title: `커스텀 유형 문제 생성${j.deletedAt ? " (삭제됨)" : ""}`,
    detail:
      j.status === "FAILED" && j.errorMessage
        ? j.errorMessage
        : `저장 ${j.savedCount}`,
    status: jobStatus(j.status),
    academyId: j.academyId,
    actorId: j.createdById,
    metadata: { customTypeId: j.customTypeId, jobId: j.id },
    createdAt: j.createdAt,
  }));
}

async function fromPassages(p: FetchActivityParams): Promise<RawItem[]> {
  const rows = await prisma.passage.findMany({
    where: { ...scopeWhere(p), ...timeWhere(p) },
    orderBy: { createdAt: "desc" },
    take: p.limit,
    select: {
      id: true, academyId: true, title: true, grade: true, createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: `passage:${r.id}`,
    source: "passages",
    category: "CONTENT" as const,
    title: `지문 등록 — ${r.title}`,
    detail: r.grade ? `${r.grade}학년` : null,
    status: "INFO" as const,
    academyId: r.academyId,
    actorId: null,
    metadata: { passageId: r.id },
    createdAt: r.createdAt,
  }));
}

async function fromExams(p: FetchActivityParams): Promise<RawItem[]> {
  const rows = await prisma.exam.findMany({
    where: { ...scopeWhere(p), ...timeWhere(p) },
    orderBy: { createdAt: "desc" },
    take: p.limit,
    select: {
      id: true, academyId: true, title: true, type: true, status: true,
      printCount: true, editCount: true, createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: `exam:${r.id}`,
    source: "exams",
    category: "CONTENT" as const,
    title: `시험지 생성 — ${r.title}`,
    detail: `${examTypeLabel(r.type)} · 출력 ${r.printCount}회 · 수정 ${r.editCount}회`,
    status: "INFO" as const,
    academyId: r.academyId,
    actorId: null,
    metadata: { examId: r.id, status: r.status },
    createdAt: r.createdAt,
  }));
}

async function fromPassageReports(p: FetchActivityParams): Promise<RawItem[]> {
  const rows = await prisma.passageReport.findMany({
    where: { ...scopeWhere(p), ...timeWhere(p) },
    orderBy: { createdAt: "desc" },
    take: p.limit,
    select: {
      id: true, academyId: true, createdById: true, title: true,
      status: true, passageId: true, createdAt: true, deletedAt: true,
    },
  });
  return rows.map((r) => ({
    id: `report:${r.id}`,
    source: "passage_reports",
    category: "CONTENT" as const,
    title: `학습지 보고서 — ${r.title}${r.deletedAt ? " (삭제됨)" : ""}`,
    detail: statusLabel(r.status),
    status: "INFO" as const,
    academyId: r.academyId,
    actorId: r.createdById,
    metadata: { passageId: r.passageId, reportId: r.id },
    createdAt: r.createdAt,
  }));
}

// ─── 유니온 ──────────────────────────────────────────────────────────────────

const SOURCES_BY_CATEGORY: Record<
  ActivityCategory,
  Array<(p: FetchActivityParams) => Promise<RawItem[]>>
> = {
  PAGE_VIEW: [fromAppEvents],
  AUTH: [fromAppEvents],
  EXPORT: [fromAppEvents],
  EXTRACTION: [fromExtractionJobs],
  AI_GENERATION: [
    fromWorkbenchJobs,
    fromSimilarExamJobs,
    fromSimilarQuestionJobs,
    fromCustomQuestionJobs,
  ],
  CONTENT: [fromPassages, fromExams, fromPassageReports],
};

const ALL_SOURCES = [
  fromAppEvents,
  fromExtractionJobs,
  fromWorkbenchJobs,
  fromSimilarExamJobs,
  fromSimilarQuestionJobs,
  fromCustomQuestionJobs,
  fromPassages,
  fromExams,
  fromPassageReports,
];

export interface FetchActivityResult {
  items: ActivityItem[];
  /** 다음 페이지 커서 (이 시각 이전을 요청) — 더 없으면 null */
  nextBefore: string | null;
}

export async function fetchActivityUnion(
  params: FetchActivityParams,
): Promise<FetchActivityResult> {
  const fetchers =
    !params.category || params.category === "all"
      ? ALL_SOURCES
      : SOURCES_BY_CATEGORY[params.category];

  const settled = await Promise.all(
    fetchers.map((fn) =>
      fn(params).catch((err) => {
        console.error("[admin-activity] source failed", err);
        return [] as RawItem[];
      }),
    ),
  );

  const merged = settled
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, params.limit);

  // 이름 해석 — 액터(staff) + 학원명을 한 번씩만 조회
  const actorIds = [...new Set(merged.map((i) => i.actorId).filter(Boolean))] as string[];
  const academyIds = [...new Set(merged.map((i) => i.academyId))];
  const [staffRows, academyRows] = await Promise.all([
    actorIds.length > 0
      ? prisma.staff.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    academyIds.length > 0
      ? prisma.academy.findMany({
          where: { id: { in: academyIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const staffName = new Map(staffRows.map((s) => [s.id, s.name]));
  const academyName = new Map(academyRows.map((a) => [a.id, a.name]));

  const items: ActivityItem[] = merged.map((i) => ({
    ...i,
    categoryLabel: ACTIVITY_CATEGORY_LABELS[i.category],
    actorName: i.actorId ? (staffName.get(i.actorId) ?? null) : null,
    academyName: academyName.get(i.academyId) ?? null,
  }));

  // 소스별로 limit씩 떠 왔으므로, 병합 결과가 limit에 도달했다면 더 있을 수
  // 있다(없어도 다음 호출이 빈 페이지로 종료를 알린다).
  const nextBefore =
    merged.length >= params.limit
      ? merged[merged.length - 1].createdAt.toISOString()
      : null;

  return { items, nextBefore };
}
