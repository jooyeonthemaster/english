"use server";

// ============================================================================
// 활동 타임라인 자료 뷰어 — 행이 가리키는 실제 자료를 가져온다.
//   - 자료 추출: 업로드된 페이지 이미지(서명 URL) + 페이지별 추출 텍스트/에러
//   - 지문: 원문 전체
//   - 학습지/문제 생성 잡: 설정·결과·에러
//   - 보고서: 요약(페이지 수·템플릿·발행 상태)
//   - 시험지: 문항 수 + DOCX/HWPX 다운로드 안내용 정보
// 파일·원문은 PII 덩어리이므로 SUPER_ADMIN 전용 (SUPPORT는 forbidden).
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import {
  createSignedDownloadUrl,
  storageObjectExists,
} from "@/lib/supabase-storage";

const TEXT_PREVIEW_LIMIT = 3000;
const MAX_PAGES = 30;
const SIGNED_URL_TTL_SECONDS = 30 * 60;

export interface ExtractionPageDetail {
  pageIndex: number;
  status: string;
  attemptCount: number;
  modelUsed: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  imageBytes: number | null;
  /** 30분 서명 URL — 만료 후엔 다이얼로그를 다시 열면 된다 */
  imageUrl: string | null;
  text: string | null;
  textLength: number;
}

/** 자료 뷰어에서 바로 보여줄 생성 문제 요약 (시험지 만들기 선택용) */
export interface QuestionBrief {
  id: string;
  number: number | null;
  type: string;
  /** 표시 변환용(예: BLANK_INFERENCE 다중 빈칸 선지의 (A)/(B) 라벨) */
  subType: string | null;
  questionText: string;
  options: Array<{ label: string; text: string }> | null;
  correctAnswer: string;
  explanation: string | null;
}

function parseOptions(
  raw: string | null,
): Array<{ label: string; text: string }> | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.map((o, i) => ({
      label: String(o?.label ?? `${i + 1}`),
      text: String(o?.text ?? o ?? ""),
    }));
  } catch {
    return null;
  }
}

/** 지문에 달린 문제들을 시험지 만들기용 요약으로 가져온다. */
async function fetchPassageQuestions(
  passageId: string,
): Promise<QuestionBrief[]> {
  const rows = await prisma.question.findMany({
    where: { passageId, deletedAt: null },
    orderBy: [{ questionNumber: "asc" }, { createdAt: "asc" }],
    take: 100,
    select: {
      id: true,
      type: true,
      subType: true,
      questionNumber: true,
      questionText: true,
      options: true,
      correctAnswer: true,
      explanation: { select: { content: true } },
    },
  });
  return rows.map((q) => ({
    id: q.id,
    number: q.questionNumber,
    type: q.type,
    subType: q.subType,
    questionText: q.questionText,
    options: parseOptions(q.options),
    correctAnswer: q.correctAnswer,
    explanation: q.explanation?.content ?? null,
  }));
}

export type ResourceDetail =
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | {
      kind: "extraction";
      fileName: string;
      mode: string;
      status: string;
      totalPages: number;
      creditsConsumed: number;
      creditsRefunded: number;
      originalUrl: string | null;
      origin: OriginInfo | null;
      pages: ExtractionPageDetail[];
      pagesTruncated: boolean;
    }
  | {
      kind: "passage";
      passageId: string;
      title: string;
      grade: number | null;
      createdAt: Date;
      content: string;
      questions: QuestionBrief[];
    }
  | {
      kind: "workbench";
      title: string;
      domain: string;
      status: string;
      errorMessage: string | null;
      passageId: string | null;
      passageTitle: string | null;
      passageContent: string | null;
      questions: QuestionBrief[];
      origin: OriginInfo | null;
    }
  | {
      kind: "report";
      title: string;
      status: string;
      pageCount: number;
      templateId: string | null;
      version: number;
      publishedAt: Date | null;
      passageTitle: string | null;
    }
  | {
      kind: "exam";
      examId: string;
      title: string;
      type: string;
      status: string;
      questionCount: number;
      printCount: number;
      createdAt: Date;
    };

async function sign(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    return await createSignedDownloadUrl(path, SIGNED_URL_TTL_SECONDS);
  } catch {
    return null;
  }
}

/** 존재가 확인된 객체만 서명 — 미업로드 경로의 죽은 다운로드 버튼 방지 */
async function signIfExists(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    if (!(await storageObjectExists(path))) return null;
    return await createSignedDownloadUrl(path, SIGNED_URL_TTL_SECONDS);
  } catch {
    return null;
  }
}

export interface OriginInfo {
  /** 정규화된 경로 (/director/...) */
  path: string;
  /** recorded = 잡 생성 시 Referer로 기록 / inferred = 직전 페이지뷰로 추정 */
  source: "recorded" | "inferred";
}

/**
 * 잡을 "어느 페이지에서" 실행했는지 해석.
 * 1순위: 잡 metadata.originPath (생성 시 Referer 기록 — 26-06-12 이후 잡)
 * 2순위: 같은 행위자의 잡 생성 직전 30분 내 마지막 PAGE_VIEW (추정)
 */
async function resolveOrigin(params: {
  recordedPath?: unknown;
  academyId: string;
  actorId: string | null;
  at: Date;
}): Promise<OriginInfo | null> {
  if (typeof params.recordedPath === "string" && params.recordedPath) {
    return { path: params.recordedPath, source: "recorded" };
  }
  if (!params.actorId) return null;
  const view = await prisma.appEvent.findFirst({
    where: {
      academyId: params.academyId,
      actorId: params.actorId,
      eventType: "PAGE_VIEW",
      createdAt: {
        lte: params.at,
        gte: new Date(params.at.getTime() - 30 * 60 * 1000),
      },
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  const path = (view?.metadata as { path?: unknown } | null)?.path;
  return typeof path === "string" && path
    ? { path, source: "inferred" }
    : null;
}

/** 타임라인 항목 id(`${source}:${rowId}`)로 자료 상세를 가져온다. */
export async function getActivityResourceDetail(
  itemId: string,
): Promise<ResourceDetail> {
  const session = await requireAdminAuth();
  if (!isSuperAdmin(session)) return { kind: "forbidden" };

  const sep = itemId.indexOf(":");
  if (sep <= 0) return { kind: "not_found" };
  const source = itemId.slice(0, sep);
  const rowId = itemId.slice(sep + 1);
  if (!/^c[a-z0-9]{20,}$/.test(rowId)) return { kind: "not_found" };

  switch (source) {
    case "extraction": {
      const job = await prisma.extractionJob.findUnique({
        where: { id: rowId },
        select: {
          academyId: true, createdById: true, createdAt: true,
          originalFileName: true, displayName: true, mode: true,
          status: true, totalPages: true, creditsConsumed: true,
          creditsRefunded: true, originalFileUrl: true, metadata: true,
        },
      });
      if (!job) return { kind: "not_found" };

      const origin = await resolveOrigin({
        recordedPath: (job.metadata as { originPath?: unknown } | null)
          ?.originPath,
        academyId: job.academyId,
        actorId: job.createdById,
        at: job.createdAt,
      });

      const pageRows = await prisma.extractionPage.findMany({
        where: { jobId: rowId },
        orderBy: { pageIndex: "asc" },
        take: MAX_PAGES + 1,
        select: {
          pageIndex: true, status: true, attemptCount: true,
          modelUsed: true, errorCode: true, errorMessage: true,
          imageBytes: true, imageUrl: true, extractedText: true,
        },
      });
      const pagesTruncated = pageRows.length > MAX_PAGES;
      const slice = pagesTruncated ? pageRows.slice(0, MAX_PAGES) : pageRows;

      const pages: ExtractionPageDetail[] = await Promise.all(
        slice.map(async (p) => ({
          pageIndex: p.pageIndex,
          status: p.status,
          attemptCount: p.attemptCount,
          modelUsed: p.modelUsed,
          errorCode: p.errorCode,
          errorMessage: p.errorMessage,
          imageBytes: p.imageBytes,
          imageUrl: await sign(p.imageUrl),
          text: p.extractedText?.slice(0, TEXT_PREVIEW_LIMIT) ?? null,
          textLength: p.extractedText?.length ?? 0,
        })),
      );

      return {
        kind: "extraction",
        fileName: job.displayName ?? job.originalFileName ?? "(이름 없음)",
        mode: job.mode,
        status: job.status,
        totalPages: job.totalPages,
        creditsConsumed: job.creditsConsumed,
        creditsRefunded: job.creditsRefunded,
        originalUrl: await signIfExists(job.originalFileUrl),
        origin,
        pages,
        pagesTruncated,
      };
    }

    case "passage": {
      const p = await prisma.passage.findUnique({
        where: { id: rowId },
        select: { title: true, grade: true, createdAt: true, content: true },
      });
      if (!p) return { kind: "not_found" };
      const questions = await fetchPassageQuestions(rowId);
      return { kind: "passage", passageId: rowId, ...p, questions };
    }

    case "workbench": {
      const j = await prisma.workbenchAiJob.findUnique({
        where: { id: rowId },
        select: {
          academyId: true, createdById: true, createdAt: true,
          title: true, domain: true, status: true, errorMessage: true,
          passageId: true,
        },
      });
      if (!j) return { kind: "not_found" };
      const [passage, questions, origin] = await Promise.all([
        j.passageId
          ? prisma.passage.findUnique({
              where: { id: j.passageId },
              select: { title: true, content: true },
            })
          : Promise.resolve(null),
        j.passageId
          ? fetchPassageQuestions(j.passageId)
          : Promise.resolve([] as QuestionBrief[]),
        resolveOrigin({
          academyId: j.academyId,
          actorId: j.createdById,
          at: j.createdAt,
        }),
      ]);
      return {
        kind: "workbench",
        title: j.title,
        domain: j.domain,
        status: j.status,
        errorMessage: j.errorMessage,
        passageId: j.passageId,
        passageTitle: passage?.title ?? null,
        passageContent: passage?.content ?? null,
        questions,
        origin,
      };
    }

    case "report": {
      const r = await prisma.passageReport.findUnique({
        where: { id: rowId },
        select: {
          title: true, status: true, pages: true, templateId: true,
          version: true, publishedAt: true,
          passage: { select: { title: true } },
        },
      });
      if (!r) return { kind: "not_found" };
      return {
        kind: "report",
        title: r.title,
        status: r.status,
        pageCount: Array.isArray(r.pages) ? r.pages.length : 0,
        templateId: r.templateId,
        version: r.version,
        publishedAt: r.publishedAt,
        passageTitle: r.passage?.title ?? null,
      };
    }

    case "exam": {
      const e = await prisma.exam.findUnique({
        where: { id: rowId },
        select: {
          id: true, title: true, type: true, status: true,
          printCount: true, createdAt: true,
          // 휴지통 가드 — 삭제된 문제는 문항 수에서 제외.
          _count: { select: { questions: { where: { question: { deletedAt: null } } } } },
        },
      });
      if (!e) return { kind: "not_found" };
      return {
        kind: "exam",
        examId: e.id,
        title: e.title,
        type: e.type,
        status: e.status,
        questionCount: e._count.questions,
        printCount: e.printCount,
        createdAt: e.createdAt,
      };
    }

    default:
      return { kind: "not_found" };
  }
}
