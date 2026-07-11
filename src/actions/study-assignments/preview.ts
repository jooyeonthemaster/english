"use server";

// ============================================================================
// 통합 학습 과제 — 배포 전 실물 미리보기 조회 (디렉터면 전용)
//
// "이름만 보고 배포" 금지 계약의 데이터 축. 컴포저/과제 상세가 배포 대상
// 콘텐츠의 실물(시험지 문항 전부·학습지 지면·문제 세트)을 그 자리에서
// 확인할 수 있게 한다. 강사면이므로 정답·해설 포함(학생 페이로드 아님 —
// 학생 노출은 student-safe 경로가 별도 정본).
// 학습지 문서 판별(PRIME vs PAGES)은 /g/w 서버 조립과 동일 규칙을 재사용한다.
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRIME_REPORT_MARKERS } from "@/actions/workbench/passage-constants";
import { parseAnalysisReportForPreview } from "@/lib/passage-report/analysis-report/preview-parse";
import { reportDocumentSchema } from "@/lib/passage-report/schema";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import type { ReportDocument } from "@/lib/passage-report/schema";
import { toErrorMessage, type StudyActionResult } from "./_shared";

// ── 문항 실물(시험지·문제 세트 공용) ────────────────────────────────────────

/** 워크벤치 StructuredQuestionRenderer 가 소비하는 형태의 문항 투영 */
export interface AssignPreviewQuestion {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  questionImage: string | null;
  /** 파싱 완료본 — 워크벤치 렌더러는 배열을 기대한다(DB 원문 문자열 금지) */
  options: unknown;
  correctAnswer: string;
  structuredData: unknown;
  points: number;
  /** 원문 참조 유형용 지문 본문 */
  passageContent: string | null;
}

/** DB Text(JSON 문자열) 컬럼 방어적 파싱 — 실패 시 null(렌더러 폴백) */
function parseJsonColumn(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export interface ExamAssignPreview {
  examId: string;
  title: string;
  questionCount: number;
  totalPoints: number;
  /** 분 단위 제한시간 — 없으면 null */
  duration: number | null;
  questions: AssignPreviewQuestion[];
}

const QUESTION_SELECT = {
  id: true,
  type: true,
  subType: true,
  questionText: true,
  questionImage: true,
  options: true,
  correctAnswer: true,
  structuredData: true,
  points: true,
  passage: { select: { content: true } },
} as const;

type QuestionRow = {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  questionImage: string | null;
  options: string | null;
  correctAnswer: string;
  structuredData: unknown;
  points: number;
  passage: { content: string } | null;
};

function toPreviewQuestion(q: QuestionRow, pointsOverride?: number): AssignPreviewQuestion {
  return {
    id: q.id,
    type: q.type,
    subType: q.subType,
    questionText: q.questionText,
    questionImage: q.questionImage,
    options: parseJsonColumn(q.options),
    correctAnswer: q.correctAnswer,
    structuredData:
      typeof q.structuredData === "string"
        ? parseJsonColumn(q.structuredData)
        : q.structuredData,
    points: pointsOverride ?? q.points,
    passageContent: q.passage?.content ?? null,
  };
}

/** 시험지 실물 — 살아있는 문항을 지면 순서(orderNum)대로 전부 */
export async function getExamAssignPreview(
  examId: string,
): Promise<StudyActionResult<ExamAssignPreview>> {
  try {
    const staff = await requireStaffAuth();
    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      select: { id: true, title: true, totalPoints: true, duration: true },
    });
    if (!exam) return { success: false, error: "시험지를 찾을 수 없습니다." };

    const links = await prisma.examQuestion.findMany({
      where: { examId, question: { deletedAt: null } },
      orderBy: { orderNum: "asc" },
      select: { points: true, question: { select: QUESTION_SELECT } },
    });

    return {
      success: true,
      data: {
        examId: exam.id,
        title: exam.title,
        questionCount: links.length,
        totalPoints: exam.totalPoints,
        duration: exam.duration,
        questions: links.map((l) => toPreviewQuestion(l.question, l.points)),
      },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "시험지 미리보기 조회에 실패했습니다.") };
  }
}

/** 문제 세트 실물 — 스냅샷 순서 유지, 삭제된 문항은 제외 */
export async function getQuestionsAssignPreview(
  questionIds: string[],
): Promise<StudyActionResult<AssignPreviewQuestion[]>> {
  try {
    const staff = await requireStaffAuth();
    const ids = [...new Set(questionIds)].filter(Boolean).slice(0, 50);
    if (ids.length === 0) return { success: true, data: [] };
    const rows = await prisma.question.findMany({
      where: { id: { in: ids }, academyId: staff.academyId, deletedAt: null },
      select: QUESTION_SELECT,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      success: true,
      data: ids.flatMap((id) => {
        const r = byId.get(id);
        return r ? [toPreviewQuestion(r)] : [];
      }),
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "문제 미리보기 조회에 실패했습니다.") };
  }
}

// ── 학습지 지면(문서) ────────────────────────────────────────────────────────

export type WorksheetAssignDoc =
  | { type: "PRIME"; report: AnalysisReport }
  | { type: "PAGES"; document: ReportDocument };

export interface WorksheetAssignPreview {
  passageReportId: string;
  title: string;
  passageTitle: string;
  doc: WorksheetAssignDoc;
}

/** 학습지 지면 실물 — /g/w 서버 조립과 동일한 PRIME/PAGES 판별 */
export async function getWorksheetAssignPreview(
  passageReportId: string,
): Promise<StudyActionResult<WorksheetAssignPreview>> {
  try {
    const staff = await requireStaffAuth();
    const report = await prisma.passageReport.findFirst({
      where: { id: passageReportId, academyId: staff.academyId, deletedAt: null },
      select: {
        id: true,
        title: true,
        theme: true,
        pages: true,
        generationPlan: true,
        passage: { select: { title: true } },
      },
    });
    if (!report) return { success: false, error: "학습지를 찾을 수 없습니다." };

    let doc: WorksheetAssignDoc | null = null;
    if (PRIME_REPORT_MARKERS.includes(report.generationPlan)) {
      const prime = parseAnalysisReportForPreview(report.pages);
      if (prime) doc = { type: "PRIME", report: prime };
    } else {
      const parsed = reportDocumentSchema.safeParse({
        id: report.id,
        title: report.title,
        theme: report.theme,
        pages: report.pages,
      });
      if (parsed.success) {
        doc = { type: "PAGES", document: parsed.data };
      } else {
        const prime = parseAnalysisReportForPreview(report.pages);
        if (prime) doc = { type: "PRIME", report: prime };
      }
    }
    if (!doc) {
      return { success: false, error: "학습지 문서를 해석할 수 없습니다." };
    }
    return {
      success: true,
      data: {
        passageReportId: report.id,
        title: report.title,
        passageTitle: report.passage.title,
        doc,
      },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "학습지 미리보기 조회에 실패했습니다.") };
  }
}
