import { z } from "zod";

import {
  blockMetaSchema,
  coverSchema,
  customBlockSchema,
  reportThemeIdSchema,
  sectionLayoutSchema,
} from "./schema";

/**
 * PRIME_KO — 국어 지문분석 학습지 스키마 (영어 PRIME 과 완전 분리된 병렬 유니온).
 *
 * 무회귀 원칙 (KO-PORT-MAP §2-A / 위험 4위 "PRIME 섹션 유니온 오염"):
 *   - 영어 analysisSectionSchema(discriminatedUnion) 에 KO kind 를 절대 혼입하지 않는다.
 *   - 저장 마커도 분리: PassageReport.generationPlan = "PRIME_KO" (영어 "PRIME" 과 혼재 로드 차단).
 *   - 루트에 subject:"KOREAN" 리터럴을 박아, 파서 단에서 과목 오염이 즉시 거부되게 한다
 *     (영어 보고서에는 subject 필드가 없고, KO 파서는 KOREAN 이 아니면 실패).
 *   - 편집기 인프라(blockMeta/customBlocks/cover 등)는 과목 중립이라 영어 schema.ts 의
 *     스키마를 import 만 해서 재사용한다(영어 파일 무수정).
 */

/** PassageReport.generationPlan 마커 — 영어 'PRIME' 과 절대 공유 금지. */
export const KO_PRIME_REPORT_MARKER = "PRIME_KO";

/** 문단/연/문항 번호 (1-base). */
const koNo = z.number().int().min(1).max(99);

// ─── 문서 메타 ───────────────────────────────────────────────────────────────
export const koReportMetaSchema = z
  .object({
    /** 상단 작은 라벨 */
    eyebrow: z.string().default("PRIME KO ANALYSIS · 국어 지문 분석"),
    titleKo: z.string(),
    /** 부제(작가·출전 등, 선택) — 렌더러의 par-title-en 슬롯에 표시 */
    titleEn: z.string().default(""),
    /** 갈래 (예: "문학 · 현대시", "독서 · 사회") */
    category: z.string().default(""),
    /** 제재 */
    theme: z.string().default(""),
    difficulty: z.number().int().min(1).max(5).default(3),
    difficultyNote: z.string().optional(),
    solveTime: z.string().default(""),
    /** 핵심 예상 출제유형 요약 (예: "내용 일치 · <보기> 적용 · 어휘") */
    examTypes: z.string().default(""),
  })
  .passthrough();
export type KoReportMeta = z.infer<typeof koReportMetaSchema>;

// ─── 섹션별 스키마 ───────────────────────────────────────────────────────────

/** 00 원문 — AI 생성이 아니라 서버가 Passage.content 로 결정론 주입(운문 행 구분 보존). */
export const koPassageSectionSchema = z
  .object({
    kind: z.literal("ko-passage"),
    /** 원문 전문 (개행 보존 — 시/희곡 행 구분 유지) */
    text: z.string().min(1),
    note: z.string().optional(),
  })
  .passthrough();

/** 01 개관 — 갈래·제재·주제·해제. */
export const koOverviewSectionSchema = z
  .object({
    kind: z.literal("ko-overview"),
    /** 갈래 (예: "현대시", "독서 — 사회(경제)") */
    genre: z.string().default(""),
    /** 갈래 세부·성격 (예: "자유시, 서정시 / 회고적·성찰적") */
    genreDetail: z.string().optional(),
    /** 제재 */
    subjectMatter: z.string().default(""),
    /** 주제 */
    theme: z.string().default(""),
    /** 해제 — 지문 전체를 풀어 주는 해설 문단 */
    commentary: z.string().default(""),
  })
  .passthrough();

/** 02 문단/연별 요지 — verse 갈래는 연 단위. */
export const koParagraphSectionSchema = z
  .object({
    kind: z.literal("ko-paragraph"),
    /** 단위 라벨: 문단(산문·독서) / 연(운문) / 수(연시조) / 장면(극) */
    unitLabel: z.enum(["문단", "연", "수", "장면"]).catch("문단").default("문단"),
    rows: z
      .array(
        z.object({
          no: koNo,
          /** (선택) 소제목·(가)(나) 파트 라벨 */
          heading: z.string().optional(),
          /** 요지 — 한국어 한두 문장 */
          gist: z.string(),
        }),
      )
      .min(1)
      .max(20),
  })
  .passthrough();

/** 03 핵심 개념어·어휘 — 한자어 병기 + 뜻풀이. */
export const koConceptVocabSectionSchema = z
  .object({
    kind: z.literal("ko-concept-vocab"),
    rows: z
      .array(
        z.object({
          /** 개념어·어휘 (지문 실제 등장 표현) */
          term: z.string(),
          /** 한자 병기 (예: "首尾相關") — 고유어면 생략 */
          hanja: z.string().optional(),
          /** 뜻풀이 (본문 문맥 의미) */
          meaning: z.string(),
          /** 비고 — 유의어·시험 포인트 등 */
          note: z.string().optional(),
        }),
      )
      .min(1)
      .max(30),
  })
  .passthrough();

/** 04 구조도 — 영어 logicRows 렌더 패턴 미러 (문단/연 단위 기능표). */
export const koStructureSectionSchema = z
  .object({
    kind: z.literal("ko-structure"),
    note: z.string().optional(),
    rows: z
      .array(
        z.object({
          /** 문단/연 번호 (ko-paragraph 의 no 와 일치) */
          no: koNo.optional(),
          /** 글 속 기능 (짧은 명사구 — "통념 제시", "선경", "반전") */
          functionLabel: z.string(),
          /** 핵심 내용·역할 한 줄 */
          keyPoint: z.string(),
        }),
      )
      .min(1)
      .max(12),
  })
  .passthrough();

/** 05 표현·서술상 특징 (문학 전용) — 근거 구절은 원문 verbatim 인용. */
export const koLiteraryDeviceSectionSchema = z
  .object({
    kind: z.literal("ko-literary-device"),
    rows: z
      .array(
        z.object({
          /** 기법 개념어 (닫힌 은행: 설의·영탄·대구·수미상관·감정이입 등) */
          device: z.string(),
          /** 근거 구절 — 반드시 원문에 글자 그대로 존재 (coerce 가 verbatim 검사) */
          evidence: z.string(),
          /** 효과 — 작품 내적 효과 한 줄 */
          effect: z.string(),
        }),
      )
      .min(1)
      .max(12),
  })
  .passthrough();

/** 06 화자·인물 (문학 전용) — 정서·태도 정리. */
export const koSpeakerSectionSchema = z
  .object({
    kind: z.literal("ko-speaker"),
    rows: z
      .array(
        z.object({
          /** 화자/인물 지칭 (예: "화자", "'나'", "허 생원") */
          target: z.string(),
          /** 상황·역할 (선택) */
          role: z.string().optional(),
          /** 정서 (정서 어휘 풀: 체념·달관·자조·연민·의지·회한 등) */
          emotion: z.string(),
          /** 태도 */
          attitude: z.string(),
          /** 근거 구절/장면 (선택) */
          evidence: z.string().optional(),
        }),
      )
      .min(1)
      .max(10),
  })
  .passthrough();

/** 07 예상 출제 포인트 — KO 유형 슬롯별 + <보기> 소재 제안. */
export const koExamPointsSectionSchema = z
  .object({
    kind: z.literal("ko-exam-points"),
    rows: z
      .array(
        z.object({
          /** 유형 슬롯 라벨 (예: "내용 일치", "<보기> 사례 적용", "구절 의미") */
          slot: z.string(),
          /** (선택) KO_* 유형 코드 — 문제생성 연계 힌트 */
          typeId: z.string().optional(),
          /** 무엇을 묻는가 */
          asks: z.string().default(""),
          /** 이 지문 어디가 근거인지 (문단/연/구절 명시) */
          basis: z.string().default(""),
          /** <보기> 소재 제안 (외적 준거·사례 시나리오) */
          bogiIdea: z.string().optional(),
        }),
      )
      .min(1)
      .max(10),
  })
  .passthrough();

/** 08 확인 문제 — OX/단답 5문항. 정답은 교사 표면 전용(hiddenAnswers 게이트). */
export const koCheckQuizSectionSchema = z
  .object({
    kind: z.literal("ko-check-quiz"),
    note: z.string().optional(),
    questions: z
      .array(
        z.object({
          no: z.number().int().min(1).max(10),
          format: z.enum(["OX", "단답"]).catch("단답"),
          prompt: z.string(),
          /** 정답 — 학생 표면 미노출 (렌더 게이트 + 프롬프트에 정답 문구 포함 금지) */
          answer: z.string(),
          explanation: z.string().optional(),
        }),
      )
      .min(1)
      .max(10),
    /** true(기본) = 학생 표면: 정답·해설 블록 미렌더. false = 교사용 정답 표시. */
    hiddenAnswers: z.boolean().default(true),
  })
  .passthrough();

// ─── KO 섹션 유니온 (영어 유니온과 절대 혼합 금지) ────────────────────────────
export const koAnalysisSectionSchema = z.discriminatedUnion("kind", [
  koPassageSectionSchema,
  koOverviewSectionSchema,
  koParagraphSectionSchema,
  koConceptVocabSectionSchema,
  koStructureSectionSchema,
  koLiteraryDeviceSectionSchema,
  koSpeakerSectionSchema,
  koExamPointsSectionSchema,
  koCheckQuizSectionSchema,
]);
export type KoAnalysisSection = z.infer<typeof koAnalysisSectionSchema>;
export type KoAnalysisSectionKind = KoAnalysisSection["kind"];

export type KoPassageSection = z.infer<typeof koPassageSectionSchema>;
export type KoOverviewSection = z.infer<typeof koOverviewSectionSchema>;
export type KoParagraphSection = z.infer<typeof koParagraphSectionSchema>;
export type KoConceptVocabSection = z.infer<typeof koConceptVocabSectionSchema>;
export type KoStructureSection = z.infer<typeof koStructureSectionSchema>;
export type KoLiteraryDeviceSection = z.infer<typeof koLiteraryDeviceSectionSchema>;
export type KoSpeakerSection = z.infer<typeof koSpeakerSectionSchema>;
export type KoExamPointsSection = z.infer<typeof koExamPointsSectionSchema>;
export type KoCheckQuizSection = z.infer<typeof koCheckQuizSectionSchema>;

/** 런타임 KO 섹션 판별 — 렌더러 디스패치 게이트(영어 switch 무접촉)가 사용. */
const KO_SECTION_KINDS: ReadonlySet<string> = new Set([
  "ko-passage",
  "ko-overview",
  "ko-paragraph",
  "ko-concept-vocab",
  "ko-structure",
  "ko-literary-device",
  "ko-speaker",
  "ko-exam-points",
  "ko-check-quiz",
]);
export function isKoAnalysisSectionKind(kind: unknown): kind is KoAnalysisSectionKind {
  return typeof kind === "string" && KO_SECTION_KINDS.has(kind);
}
export function isKoAnalysisSection(section: { kind: string } | null | undefined): section is KoAnalysisSection {
  return !!section && isKoAnalysisSectionKind(section.kind);
}

// ─── 문서 (영어 analysisReportSchema 미러 — 편집기 인프라 스키마 재사용) ────────
export const koAnalysisReportSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    /** 과목 판별자 — 영어 보고서와의 혼재 로드를 파서 단에서 차단. */
    subject: z.literal("KOREAN").default("KOREAN"),
    brand: z.string().default("KOREAN READING LAB"),
    docNo: z.string().optional(),
    themeId: reportThemeIdSchema.default("black-white"),
    meta: koReportMetaSchema,
    sections: z.array(koAnalysisSectionSchema).min(1).max(14),
    /** (편집기) 과목 중립 편집 메타 — 영어 스키마 재사용 */
    layout: z.array(sectionLayoutSchema).optional(),
    blockMeta: z.record(z.string(), blockMetaSchema).optional(),
    blockOrder: z.array(z.string()).optional(),
    tableColWidths: z.record(z.string(), z.record(z.string(), z.number())).optional(),
    sectionHeadings: z.record(z.string(), z.object({ ko: z.string().optional(), en: z.string().optional() })).optional(),
    /** (편집기) 목차에서 꺼 둔 섹션 슬롯키 목록 — 영어 스키마 hiddenSections 미러. */
    hiddenSections: z.array(z.string().max(64)).max(32).optional().catch(undefined),
    customBlocks: z.array(customBlockSchema).max(80).optional().catch(undefined),
    activityAnswerKeyPage: z.boolean().optional(),
    cover: coverSchema.optional().catch(undefined),
  })
  .passthrough();
export type KoAnalysisReport = z.infer<typeof koAnalysisReportSchema>;

/** AI 생성 단계용 — 시스템 필드(subject/brand/docNo)는 서버가 채움. */
export const koAnalysisReportGenerationSchema = z
  .object({
    meta: koReportMetaSchema,
    sections: z.array(koAnalysisSectionSchema).min(1).max(14),
  })
  .passthrough();
export type KoAnalysisReportGeneration = z.infer<typeof koAnalysisReportGenerationSchema>;

export function safeParseKoAnalysisReport(value: unknown):
  | { ok: true; report: KoAnalysisReport }
  | { ok: false; error: z.ZodError } {
  const r = koAnalysisReportSchema.safeParse(value);
  return r.success ? { ok: true, report: r.data } : { ok: false, error: r.error };
}

// ─── 섹션 라벨 (렌더러 SectionHead 폴백용) ───────────────────────────────────
export const KO_NUMBERED_SECTION_LABELS: Record<KoAnalysisSectionKind, string> = {
  "ko-passage": "원문",
  "ko-overview": "개관 — 갈래·제재·주제·해제",
  "ko-paragraph": "문단·연별 요지",
  "ko-concept-vocab": "핵심 개념어·어휘",
  "ko-structure": "지문 구조도",
  "ko-literary-device": "표현·서술상 특징",
  "ko-speaker": "화자·인물 정리",
  "ko-exam-points": "예상 출제 포인트",
  "ko-check-quiz": "확인 문제",
};

export const KO_SECTION_LABELS_EN: Record<KoAnalysisSectionKind, string> = {
  "ko-passage": "Original Text",
  "ko-overview": "Overview",
  "ko-paragraph": "Paragraph Gist",
  "ko-concept-vocab": "Key Concepts",
  "ko-structure": "Structure Map",
  "ko-literary-device": "Expression & Narration",
  "ko-speaker": "Speaker & Characters",
  "ko-exam-points": "Exam Points",
  "ko-check-quiz": "Check-up Quiz",
};

/** 학생 표면 안전 변환 — 확인 문제의 정답·해설을 결정론적으로 제거한 사본을 돌려준다.
 *  (렌더 게이트와 독립적인 2차 방어선: 학생용 직렬화/출력 경로가 이 함수를 쓰면
 *   hiddenAnswers 플래그와 무관하게 정답이 실릴 수 없다.) */
export function koCheckQuizStudentSurface(section: KoCheckQuizSection): KoCheckQuizSection {
  return {
    ...section,
    hiddenAnswers: true,
    questions: section.questions.map((q) => ({ ...q, answer: "", explanation: undefined })),
  };
}
