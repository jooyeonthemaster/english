// ============================================================================
// 학생 시험 리포트 — 리포트 문서(StudentReportDoc) 타입 + zod
//
// 원칙(설계 계약): 모든 수치·집계 data 는 서버 결정론 조립(report-assemble.ts).
// AI(S4)는 내러티브·정성 필드만 생성한다 — 수치 환각·스키마 비대·잘림 원천 차단.
// 저장/로드 zod 는 관대(catch 강등), AI 생성 zod 는 엄격 — analysis-report 관례 답습.
// ============================================================================

import { z } from "zod";
import type { ResponseStatus } from "./types";

export const REPORT_THEME_IDS = [
  "indigo-consult",
  "slate-pro",
  "teal-fresh",
  "navy-classic",
  "ink-editorial",
  "forest-tutor",
] as const;
export type ReportThemeId = (typeof REPORT_THEME_IDS)[number];

/** 문서 단위 폰트 오버라이드(테마 기본 페어링을 덮음) — v2 additive 필드 */
export interface ReportTypography {
  /** 제목 폰트 패밀리명(리포트 폰트 카탈로그 family 문자열) */
  headingFamily?: string;
  /** 본문 폰트 패밀리명 */
  bodyFamily?: string;
}

export const REPORT_COVER_TEMPLATE_IDS = [
  "gradient-band",
  "minimal-line",
  "photo-frame",
] as const;
export type ReportCoverTemplateId = (typeof REPORT_COVER_TEMPLATE_IDS)[number];

export interface ReportCover {
  templateId: ReportCoverTemplateId;
  title: string;
  subtitle: string;
  studentName: string;
  examLabel: string;
  academyName: string;
  dateLabel: string;
}

export type TrapSusceptibility = "HIGH" | "MID" | "LOW" | "UNKNOWN";

// ── 섹션 (discriminated union) ─────────────────────────────────────────────
// 공통: id/type/heading/narrative(+hidden). data 는 섹션별.
// [결정론] 표기 필드는 report-assemble.ts 가 채운다. AI 는 narrative 및 명시된 정성 필드만.

interface SectionBase {
  id: string;
  heading: string;
  /** 섹션 본문 내러티브 (AI 생성 → 강사 편집) — 1~3문단 */
  narrative: string;
  hidden?: boolean;
}

export interface ScoreOverviewSection extends SectionBase {
  type: "scoreOverview";
  data: {
    score: number | null;
    maxScore: number | null;
    /** 0~100, UNKNOWN 제외 계산. 채점 문항 0개면 null */
    correctRate: number | null;
    classAverage?: number | null;
    unknownCount: number;
    /** [결정론·v2 additive] 정오 분해 카운트 — 구 문서에는 없음(부재 시 표시 생략) */
    correctCount?: number;
    wrongCount?: number;
    partialCount?: number;
  };
}

export interface TypePerformanceSection extends SectionBase {
  type: "typePerformance";
  data: {
    rows: {
      typeLabel: string;
      total: number;
      correct: number;
      wrong: number;
      unknown: number;
      points: number;
      earnedPoints: number | null;
    }[];
  };
}

export interface DifficultyMatrixSection extends SectionBase {
  type: "difficultyMatrix";
  data: {
    cells: {
      number: string;
      difficulty: 1 | 2 | 3 | 4 | 5;
      status: ResponseStatus;
      points: number | null;
    }[];
    /** 쉬운 문항(1~2) 오답 — "실수" 후보 */
    easyMistakes: string[];
    /** 어려운 문항(4~5) 정답 — 강점 근거 */
    hardWins: string[];
  };
}

export interface TrapAnalysisSection extends SectionBase {
  type: "trapAnalysis";
  data: {
    items: {
      number: string;
      chosenChoice?: string;
      /** [AI] 이 학생이 이 함정에 걸린 맥락 해석 */
      trapWhy: string;
      /** [결정론] chosenChoice × trapDesign 매칭 */
      wasDesignedTrap: boolean;
    }[];
    /** [결정론] 설계 함정 적중률 기반. 선지 데이터 없으면 UNKNOWN */
    trapSusceptibility: TrapSusceptibility;
  };
}

export interface WrongDeepDiveSection extends SectionBase {
  type: "wrongDeepDive";
  data: {
    items: {
      number: string;
      typeLabel: string;
      /** [AI] 무엇이 어긋났나 (비난 금지 톤) */
      whatHappened: string;
      /** [AI] 교정 포인트 */
      fixPoint: string;
      conceptTags: string[];
    }[];
  };
}

export interface ConceptMapSection extends SectionBase {
  type: "conceptMap";
  data: {
    weak: { concept: string; weight: 1 | 2 | 3; relatedNumbers: string[] }[];
    strong: { concept: string; weight: 1 | 2 | 3; relatedNumbers: string[] }[];
  };
}

export interface StrengthWeaknessSection extends SectionBase {
  type: "strengthWeakness";
  data: {
    strengths: string[];
    weaknesses: string[];
  };
}

export interface StudyPlanSection extends SectionBase {
  type: "studyPlan";
  data: {
    weeks: { label: string; focus: string; tasks: string[] }[];
  };
}

export interface TeacherCommentSection extends SectionBase {
  type: "teacherComment";
  data: {
    /** AI 초안 → 강사 수정 (재생성 시 강사 수정본 보존 머지) */
    comment: string;
  };
}

export type ReportSection =
  | ScoreOverviewSection
  | TypePerformanceSection
  | DifficultyMatrixSection
  | TrapAnalysisSection
  | WrongDeepDiveSection
  | ConceptMapSection
  | StrengthWeaknessSection
  | StudyPlanSection
  | TeacherCommentSection;

export type ReportSectionType = ReportSection["type"];

export interface StudentReportDoc {
  version: 1;
  themeId: ReportThemeId;
  cover: ReportCover;
  sections: ReportSection[];
  /** [v2 additive] 문서 폰트 오버라이드 — 없으면 테마 기본 페어링 사용 */
  typography?: ReportTypography;
}

/** DB report 컬럼 형태 — 재생성 롤백 1슬롯 */
export interface StudentReportEnvelope {
  current: StudentReportDoc;
  previous?: StudentReportDoc;
}

// ── S4 AI 생성 페이로드 (내러티브 전용 — 수치 필드 없음) ────────────────────

export interface ReportNarrativePayload {
  /** scoreOverview 한 줄 총평 */
  verdictLine: string;
  narratives: {
    scoreOverview: string;
    typePerformance: string;
    difficultyMatrix: string;
    trapAnalysis: string;
    wrongDeepDive: string;
    conceptMap: string;
    strengthWeakness: string;
    studyPlan: string;
  };
  /** number 키 → 해석 (결정론 골격의 items 에 머지) */
  trapWhyByNumber: Record<string, string>;
  wrongItems: { number: string; whatHappened: string; fixPoint: string }[];
  strengths: string[];
  weaknesses: string[];
  studyPlanWeeks: { label: string; focus: string; tasks: string[] }[];
  teacherCommentDraft: string;
}

// ── zod ────────────────────────────────────────────────────────────────────

const themeIdSchema = z.enum(REPORT_THEME_IDS).catch("indigo-consult");
const coverTemplateIdSchema = z.enum(REPORT_COVER_TEMPLATE_IDS).catch("gradient-band");

const coverSchema = z.object({
  templateId: coverTemplateIdSchema,
  title: z.string().catch(""),
  subtitle: z.string().catch(""),
  studentName: z.string().catch(""),
  examLabel: z.string().catch(""),
  academyName: z.string().catch(""),
  dateLabel: z.string().catch(""),
});

const responseStatusSchema = z.enum(["CORRECT", "WRONG", "PARTIAL", "UNKNOWN"]);
const weightSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const difficultySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

/**
 * 저장 스키마 배열 상한 — 공개 뷰어(/r) 렌더 DoS 방지. 저장 zod 의 "관대(초과 시
 * 강등)" 원칙을 지키기 위해, 상한 초과 시 파싱을 실패시켜(=저장 거부·로드 실패로
 * 리포트가 통째로 사라지는 catch 강등) 만드는 대신, 상한까지 slice 하는 preprocess 로
 * 흡수한다(초과분만 잘라내고 문서는 그대로 로드·저장). 정상 크기(시험 문항 수 기반)는
 * 상한에 한참 못 미치므로 손실 없음. */
const cappedArray = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z.preprocess(
    (value) => (Array.isArray(value) ? value.slice(0, max) : value),
    z.array(item).max(max),
  );

const sectionBase = {
  id: z.string(),
  heading: z.string(),
  narrative: z.string().catch(""),
  hidden: z.boolean().optional(),
};

const scoreOverviewSectionSchema = z.object({
  ...sectionBase,
  type: z.literal("scoreOverview"),
  data: z.object({
    score: z.number().nullable(),
    maxScore: z.number().nullable(),
    correctRate: z.number().nullable(),
    classAverage: z.number().nullable().optional(),
    unknownCount: z.number(),
    // v2 additive — 구 문서 파스 무손상(optional + catch 강등)
    correctCount: z.number().optional().catch(undefined),
    wrongCount: z.number().optional().catch(undefined),
    partialCount: z.number().optional().catch(undefined),
  }),
});

const typePerformanceSectionSchema = z.object({
  ...sectionBase,
  type: z.literal("typePerformance"),
  data: z.object({
    rows: cappedArray(
      z.object({
        typeLabel: z.string(),
        total: z.number(),
        correct: z.number(),
        wrong: z.number(),
        unknown: z.number(),
        points: z.number(),
        earnedPoints: z.number().nullable(),
      }),
      80,
    ),
  }),
});

const difficultyMatrixSectionSchema = z.object({
  ...sectionBase,
  type: z.literal("difficultyMatrix"),
  data: z.object({
    cells: cappedArray(
      z.object({
        number: z.string(),
        difficulty: difficultySchema,
        status: responseStatusSchema,
        points: z.number().nullable(),
      }),
      200,
    ),
    easyMistakes: z.array(z.string()),
    hardWins: z.array(z.string()),
  }),
});

const trapAnalysisSectionSchema = z.object({
  ...sectionBase,
  type: z.literal("trapAnalysis"),
  data: z.object({
    items: cappedArray(
      z.object({
        number: z.string(),
        chosenChoice: z.string().optional(),
        trapWhy: z.string().catch(""),
        wasDesignedTrap: z.boolean(),
      }),
      80,
    ),
    trapSusceptibility: z.enum(["HIGH", "MID", "LOW", "UNKNOWN"]).catch("UNKNOWN"),
  }),
});

const wrongDeepDiveSectionSchema = z.object({
  ...sectionBase,
  type: z.literal("wrongDeepDive"),
  data: z.object({
    items: cappedArray(
      z.object({
        number: z.string(),
        typeLabel: z.string(),
        whatHappened: z.string().catch(""),
        fixPoint: z.string().catch(""),
        conceptTags: z.array(z.string()).catch([]),
      }),
      80,
    ),
  }),
});

const conceptMapSectionSchema = z.object({
  ...sectionBase,
  type: z.literal("conceptMap"),
  data: z.object({
    weak: cappedArray(
      z.object({ concept: z.string(), weight: weightSchema, relatedNumbers: z.array(z.string()) }),
      80,
    ),
    strong: cappedArray(
      z.object({ concept: z.string(), weight: weightSchema, relatedNumbers: z.array(z.string()) }),
      80,
    ),
  }),
});

const strengthWeaknessSectionSchema = z.object({
  ...sectionBase,
  type: z.literal("strengthWeakness"),
  data: z.object({
    strengths: cappedArray(z.string(), 80),
    weaknesses: cappedArray(z.string(), 80),
  }),
});

const studyPlanSectionSchema = z.object({
  ...sectionBase,
  type: z.literal("studyPlan"),
  data: z.object({
    weeks: cappedArray(
      z.object({
        label: z.string(),
        focus: z.string(),
        tasks: cappedArray(z.string(), 80),
      }),
      80,
    ),
  }),
});

const teacherCommentSectionSchema = z.object({
  ...sectionBase,
  type: z.literal("teacherComment"),
  data: z.object({ comment: z.string().catch("") }),
});

export const reportSectionSchema = z.discriminatedUnion("type", [
  scoreOverviewSectionSchema,
  typePerformanceSectionSchema,
  difficultyMatrixSectionSchema,
  trapAnalysisSectionSchema,
  wrongDeepDiveSectionSchema,
  conceptMapSectionSchema,
  strengthWeaknessSectionSchema,
  studyPlanSectionSchema,
  teacherCommentSectionSchema,
]);

// v2 additive — 폰트 오버라이드. 어떤 형태로 저장돼 있든 파스 실패 시 undefined 강등.
const typographySchema = z
  .object({
    headingFamily: z.string().optional().catch(undefined),
    bodyFamily: z.string().optional().catch(undefined),
  })
  .optional()
  .catch(undefined);

export const studentReportDocSchema = z.object({
  version: z.literal(1).catch(1),
  themeId: themeIdSchema,
  cover: coverSchema,
  sections: z.array(reportSectionSchema).max(12),
  typography: typographySchema,
});

export const studentReportEnvelopeSchema = z.object({
  current: studentReportDocSchema,
  previous: studentReportDocSchema.optional(),
});

/** S4 AI 응답(내러티브 전용) — 엄격 스키마.
 *  narratives 는 min(40): 성의 없는 한 줄 출력을 차단한다(프롬프트 [섹션별 작성
 *  규격]과 동기 — 위반 시 llm.ts 의 1회 교정 재시도가 규격을 되짚어 준다). */
export const reportNarrativePayloadSchema = z.object({
  verdictLine: z.string().min(1),
  narratives: z.object({
    scoreOverview: z.string().min(40),
    typePerformance: z.string().min(40),
    difficultyMatrix: z.string().min(40),
    trapAnalysis: z.string().min(40),
    wrongDeepDive: z.string().min(40),
    conceptMap: z.string().min(40),
    strengthWeakness: z.string().min(40),
    studyPlan: z.string().min(40),
  }),
  trapWhyByNumber: z.record(z.string(), z.string()).catch({}),
  wrongItems: z
    .array(z.object({ number: z.string(), whatHappened: z.string(), fixPoint: z.string() }))
    .catch([]),
  strengths: z.array(z.string()).min(1),
  weaknesses: z.array(z.string()).min(1),
  studyPlanWeeks: z
    .array(z.object({ label: z.string(), focus: z.string(), tasks: z.array(z.string()) }))
    .min(1),
  teacherCommentDraft: z.string().min(1),
});

export function parseStudentReportEnvelope(value: unknown): StudentReportEnvelope | null {
  const parsed = studentReportEnvelopeSchema.safeParse(value);
  return parsed.success ? (parsed.data as StudentReportEnvelope) : null;
}
