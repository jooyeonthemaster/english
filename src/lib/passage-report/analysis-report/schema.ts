import { z } from "zod";

/**
 * PRIME PASSAGE ANALYSIS — 섹션 기반 A4 분석 보고서 스키마.
 *
 * 설계 철학 (사용자 레퍼런스 "VERITAS PRIME ANALYSIS" 기준):
 *   - AI = 편집장: 무엇을/어떤 순서로/무엇을 강조할지(=섹션 트리)를 결정. 좌표는 X.
 *   - 엔진 = 조판공: 섹션을 디자인 시스템 그리드에 flow 배치 + 자동 페이지 분할.
 *   - 따라서 이 스키마는 "의미"만 담는다 (좌표/픽셀 없음). 깔끔함은 렌더러가 보장.
 *
 * 절대좌표 캔버스(schema.ts의 block 모델)는 이 모델로 대체된다.
 */

// ─── 공통 ────────────────────────────────────────────────────────────────────
/** 본문 문장 번호 (① = 1). 보고서 전체에서 상호 참조되는 1-base 인덱스. */
const sentenceNo = z.number().int().min(1).max(60);

// ─── 문서 메타 (타이틀 블록 + 메타 테이블) ───────────────────────────────────
export const reportMetaSchema = z
  .object({
    /** 상단 작은 라벨 — "PRIME PASSAGE ANALYSIS · 심층 지문 분석" */
    eyebrow: z.string().default("PRIME PASSAGE ANALYSIS · 심층 지문 분석"),
    titleKo: z.string(), // "기억의 두 얼굴 : 회상 vs. 재인"
    titleEn: z.string(), // "Recall vs. Recognition — Two Doors to Memory"
    /** 메타 테이블 5칸 */
    category: z.string(), // 분류: "비문학 · 설명문"
    theme: z.string(), // 소재: "인지심리 · 기억 인출"
    difficulty: z.number().int().min(1).max(5), // 난이도 ★ 개수
    difficultyNote: z.string().optional(), // "(수능 3점)"
    solveTime: z.string(), // 권장 풀이시간: "3분 30초"
    examTypes: z.string(), // 핵심 출제유형: "빈칸추론·어법·요약"
  })
  .passthrough();
export type ReportMeta = z.infer<typeof reportMetaSchema>;

// ─── 섹션별 스키마 ───────────────────────────────────────────────────────────

// 01 원문 + 한글 해석
export const passageSectionSchema = z
  .object({
    kind: z.literal("passage"),
    note: z.string().optional(), // "※ 문장 번호 ①–⑪는 ... 상호 참조됩니다."
    sentences: z
      .array(
        z.object({
          n: sentenceNo,
          en: z.string(),
          ko: z.string(), // 문장별 한글 해석
        }),
      )
      .min(1)
      .max(40),
    /** 글의 맥을 잡는 주제어/키워드 (원문에 실제 등장한 표현) — 렌더러가 본문에서 밑줄 강조 */
    keywords: z.array(z.string()).max(15).optional().default([]),
  })
  .passthrough();

// 02 지문 구조도 (제약된 다이어그램) + 논리 흐름 한 줄
export const structureMapSectionSchema = z
  .object({
    kind: z.literal("structure-map"),
    note: z.string().optional(), // "※ 도입(비유) → ... 4단 구조."
    /** 도식 형태: compare=2축 비교카드(대조/비교/인과/문제해결/주장), sequence=단계 흐름도(순차 과정/시간순) */
    variant: z.enum(["compare", "sequence"]).optional().default("compare"),
    /** 최상단 도입 노드 */
    intro: z.object({ eyebrow: z.string().optional(), label: z.string() }),
    /** 분기 타이틀 (compare 전용, 예: "기억 인출(Retrieval)의 두 갈래") */
    branchLabel: z.string().optional(),
    /** 2단 비교 카드 (compare 변형). sequence 면 생략하고 steps 사용. */
    columns: z
      .array(
        z.object({
          titleEn: z.string(), // "RECALL"
          titleKo: z.string(), // "회상 · 回想"
          bullets: z.array(z.string()).min(1).max(6),
          footer: z.string().optional(), // "주관식 · 단답형 시험"
        }),
      )
      .min(2)
      .max(2)
      .optional(),
    /** 단계 흐름 (sequence 변형). 2~6단계, 한·영 병기. */
    steps: z
      .array(
        z.object({
          titleKo: z.string(), // "1단계: 단서 인지 (cue)"
          titleEn: z.string().optional().default(""),
          detail: z.string().optional().default(""), // 단계 설명 (한글 + 핵심 영어 표현)
        }),
      )
      .min(2)
      .max(6)
      .optional(),
    /** 핵심 대조 박스 */
    coreDistinction: z.object({
      eyebrow: z.string().optional(), // "THE CORE DISTINCTION · 핵심 대조축"
      label: z.string().optional().default(""), // "단서(CUE)의 유무" (누락 대비 관대)
      detail: z.string().optional(), // "단서 없음 ◀ RECALL ┃ RECOGNITION ▶ 단서 풍부"
    }),
    /** 결론 박스 */
    conclusion: z.object({
      eyebrow: z.string().optional(), // "CONCLUSION · 글의 주제"
      text: z.string().optional().default(""), // "★ ..." (모델 누락 잦음 → 관대)
    }),
    /** 논리 흐름 한 줄 */
    logicFlow: z.string(),
  })
  .passthrough();

// 03 핵심 요약 + 영문 주제문
export const summarySectionSchema = z
  .object({
    kind: z.literal("summary"),
    sentences: z.array(z.string()).min(1).max(5), // 3문장 요약
    thesisEn: z.string(), // ONE-LINE THESIS (영문 주제문)
  })
  .passthrough();

// 04 문법 · 구문 포인트 (표)
export const grammarSectionSchema = z
  .object({
    kind: z.literal("grammar"),
    note: z.string().optional(), // "※ ⚠ 표시는 ... 함정 포인트입니다."
    rows: z
      .array(
        z.object({
          sentenceNo, // 문장 번호
          excerpt: z.string().optional(), // 해당 어법 자리가 있는 실제 원문 구절 (밑줄 표현 포함)
          point: z.string(), // 핵심 문법 (예: "분사 능/수동 — weakened")
          explanation: z.string(), // 학생 눈높이 해설
          trap: z.string().optional(), // ⚠ 함정/오답 형태
        }),
      )
      .min(1)
      .max(20),
    /** (편집기) 숨긴 열 키 목록 — 예: ["excerpt"] */
    hiddenCols: z.array(z.string()).optional(),
  })
  .passthrough();

// 05 유형별 출제 포인트 (표)
export const examFocusSectionSchema = z
  .object({
    kind: z.literal("exam-focus"),
    rows: z
      .array(
        z.object({
          type: z.string(), // "빈칸추론"
          asks: z.string().optional().default(""), // 무엇을 묻는가 (모델 누락 잦음 → 관대)
          strategy: z.string().optional().default(""), // 대비 전략 & 예시 (모델 누락 잦음 → 관대)
        }),
      )
      .min(1)
      .max(10),
    /** (편집기) 숨긴 열 키 목록 */
    hiddenCols: z.array(z.string()).optional(),
  })
  .passthrough();

// 06 핵심 어휘 (표) — "단어 테스트" 원천
export const vocabularySectionSchema = z
  .object({
    kind: z.literal("vocabulary"),
    rows: z
      .array(
        z.object({
          headword: z.string(), // 표제어
          pronunciation: z.string().optional(), // 한글 발음 (예: reduced → 리듀스드)
          pos: z.string().optional(), // (구버전 호환) 품사 — 더 이상 표시하지 않음
          meaning: z.string(), // 뜻 (본문 의미)
          synonyms: z.string().optional(), // 동의어
        }),
      )
      .min(1)
      .max(40),
    /** (편집기) 숨긴 열 키 목록 — 예: ["pronunciation","synonyms"] */
    hiddenCols: z.array(z.string()).optional(),
  })
  .passthrough();

// 07 구문 분석 (파스 트리)
export const parsingSectionSchema = z
  .object({
    kind: z.literal("parsing"),
    items: z
      .array(
        z.object({
          sentenceNo,
          en: z.string(), // 분석 대상 문장 원문
          /** ▸ 파스 단계들 */
          parts: z
            .array(
              z.object({
                label: z.string(), // "[주절]", "[, which]" 등
                text: z.string(),
              }),
            )
            .min(1)
            .max(10),
          translation: z.string(), // → 해석
        }),
      )
      .min(1)
      .max(8),
  })
  .passthrough();

// 08 학습 점검 (퀴즈) + 정답 키 — "단어·문법 테스트"
export const selfCheckSectionSchema = z
  .object({
    kind: z.literal("self-check"),
    note: z.string().optional(),
    questions: z
      .array(
        z.object({
          no: z.number().int().min(1).max(20),
          type: z.string(), // "빈칸" | "어법" | "주제" | "영영" | "요약"
          prompt: z.string(),
          choices: z.array(z.string()).max(6).optional(), // 객관식 선택지
        }),
      )
      .min(1)
      .max(12),
    /** 정답 & 해설 (별도 박스로 렌더) */
    answers: z
      .array(
        z.object({
          no: z.number().int().min(1).max(20),
          answer: z.string(),
          explanation: z.string().optional(),
        }),
      )
      .min(1)
      .max(12),
  })
  .passthrough();

// ─── 섹션 union ──────────────────────────────────────────────────────────────
export const analysisSectionSchema = z.discriminatedUnion("kind", [
  passageSectionSchema,
  structureMapSectionSchema,
  summarySectionSchema,
  grammarSectionSchema,
  examFocusSectionSchema,
  vocabularySectionSchema,
  parsingSectionSchema,
  selfCheckSectionSchema,
]);
export type AnalysisSection = z.infer<typeof analysisSectionSchema>;
export type AnalysisSectionKind = AnalysisSection["kind"];

export type PassageSection = z.infer<typeof passageSectionSchema>;
export type StructureMapSection = z.infer<typeof structureMapSectionSchema>;
export type SummarySection = z.infer<typeof summarySectionSchema>;
export type GrammarSection = z.infer<typeof grammarSectionSchema>;
export type ExamFocusSection = z.infer<typeof examFocusSectionSchema>;
export type VocabularySection = z.infer<typeof vocabularySectionSchema>;
export type ParsingSection = z.infer<typeof parsingSectionSchema>;
export type SelfCheckSection = z.infer<typeof selfCheckSectionSchema>;

// ─── 디자인 템플릿 (키컬러 / 톤앤매너) ────────────────────────────────────────
export const reportThemeIdSchema = z.enum([
  "black-white", // 잉크 절약형 흑백 (기본)
  "veritas-navy", // 레퍼런스: 딥 네이비 + 앤틱 골드
  "scholar-ink", // 차분한 잉크 그레이 + 버건디
  "fresh-teal", // 모던 틸 + 슬레이트
]);
export type ReportThemeId = z.infer<typeof reportThemeIdSchema>;

// ─── 레이아웃 제어 (편집기에서 사용) ─────────────────────────────────────────
/**
 * 섹션별 페이지 조판 제어. sections 와 같은 길이·순서의 배열로 저장된다.
 * 콘텐츠(의미)와 분리된 "조판 의도" 레이어 — 편집기가 페이지 분할을 수동 조정할 때 기록.
 */
export const sectionLayoutSchema = z
  .object({
    /** 이 섹션 앞에서 페이지를 강제로 분할 (새 페이지에서 시작) */
    breakBefore: z.boolean().optional(),
    /** 앞 섹션과 같은 페이지에 묶기 (고립 방지) */
    keepWithPrev: z.boolean().optional(),
  })
  .passthrough();
export type SectionLayout = z.infer<typeof sectionLayoutSchema>;

/**
 * 블록 단위 편집 메타 — 페이지 조판 + 서식. blockMeta 맵에 블록 id 로 저장.
 * 블록 = 렌더되는 최소 단위(문단 그룹·표 청크·구조도·구문 항목 등).
 */
export const blockMetaSchema = z
  .object({
    /** 이 블록 앞에서 페이지 강제 분할 */
    breakBefore: z.boolean().optional(),
    /** 앞 블록과 같은 페이지에 묶기 (페이지 분리 금지 → 위로 끌어올림) */
    keepWithPrev: z.boolean().optional(),
    /** 본문 글자 크기 배율 (0.7 ~ 1.4, 기본 1) */
    fontScale: z.number().min(0.5).max(2).optional(),
    /** 굵게 */
    bold: z.boolean().optional(),
    /** 정렬 */
    align: z.enum(["left", "center", "right"]).optional(),
    /** 숨김 (렌더/인쇄에서 제외) */
    hidden: z.boolean().optional(),
    /** 세로 리사이즈 — 블록 최소 높이(mm). 자연 높이보다 크면 아래 여백이 생김. */
    minHeight: z.number().min(0).max(400).optional(),
  })
  .passthrough();
export type BlockMeta = z.infer<typeof blockMetaSchema>;

/**
 * 사용자 삽입 커스텀 블록 — 여백(spacer) / 자유 텍스트(text). AI 생성 아님(편집기 전용).
 * 위치는 blockOrder 의 id 로 결정. id 는 항상 "c-" 접두 → s…/title/meta 와 충돌 없음.
 */
export const customBlockSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("spacer"),
      id: z.string().min(1),
      heightMm: z.number().min(2).max(237).default(12),
    })
    .passthrough(),
  z
    .object({
      kind: z.literal("text"),
      id: z.string().min(1),
      text: z.string().default(""),
      heading: z.string().optional(),
    })
    .passthrough(),
]);
export type CustomBlock = z.infer<typeof customBlockSchema>;

// ─── 표지(Cover) — 편집 가능한 템플릿 (AI 생성 아님) ──────────────────────────
export const coverTemplateIdSchema = z.enum([
  "classic-center", // 중앙 고전형
  "spine-left", // 좌측 스파인 바
  "band-fill", // 상단 풀블리드 밴드
  "numeral-hero", // 대형 문서번호 히어로
  "index-grid", // 정보 그리드(레저)
  "framed-card", // 액자형 카드(인증서)
]);
export type CoverTemplateId = z.infer<typeof coverTemplateIdSchema>;
export const COVER_TEMPLATE_LABELS: Record<CoverTemplateId, string> = {
  "classic-center": "클래식 센터",
  "spine-left": "스파인 좌측",
  "band-fill": "밴드 풀블리드",
  "numeral-hero": "넘버럴 히어로",
  "index-grid": "인포 그리드",
  "framed-card": "액자 카드",
};

export const coverSchema = z
  .object({
    enabled: z.boolean().default(false),
    templateId: coverTemplateIdSchema.default("classic-center"),
    /** 업로드 로고 (다운스케일된 data URL). 손상/초과 시 무시. */
    logoDataUrl: z.string().max(900_000).optional().catch(undefined),
    showLogo: z.boolean().default(true),
    logoAlign: z.enum(["left", "center", "right"]).default("center"),
    logoHeightMm: z.number().min(6).max(28).default(14),
    /** 자유 위치(드래그) — mm 좌표. 둘 다 있으면 절대 배치, 없으면 정렬 슬롯. */
    logoX: z.number().optional(),
    logoY: z.number().optional(),
    /** 표지 전용 텍스트 (없으면 meta/brand/docNo 사용) */
    eyebrow: z.string().optional(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    tagline: z.string().optional(),
    brand: z.string().optional(),
    docNo: z.string().optional(),
    /** 메타 칩(분류·난이도 등) 표지에 표시 여부 (기본 off — 표지엔 과함) */
    showMeta: z.boolean().default(false),
  })
  .passthrough();
export type ReportCover = z.infer<typeof coverSchema>;

// ─── 문서 ────────────────────────────────────────────────────────────────────
export const analysisReportSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    /** 러닝 헤더/푸터 브랜드 (학원명). 기본은 academy 이름으로 주입. */
    brand: z.string().default("ENGLISH READING LAB"),
    /** 문서 번호 (예: "No.037" / "VE·RR·037") — 자동 생성 가능 */
    docNo: z.string().optional(),
    themeId: reportThemeIdSchema.default("black-white"),
    meta: reportMetaSchema,
    /** AI가 결정한 섹션 순서. 보통 위 순서대로지만 가변. */
    sections: z.array(analysisSectionSchema).min(1).max(12),
    /** (편집기) 섹션별 수동 페이지 조판 제어. sections 와 1:1 평행 배열. (구버전) */
    layout: z.array(sectionLayoutSchema).optional(),
    /** (편집기) 블록 단위 메타 — 블록 id → {페이지·서식}. */
    blockMeta: z.record(z.string(), blockMetaSchema).optional(),
    /** (편집기) 블록 표시 순서 — 블록 id 배열. 없으면 자연 순서. */
    blockOrder: z.array(z.string()).optional(),
    /** (편집기) 사용자 삽입 커스텀 블록 (spacer/text). 위치는 blockOrder 로 결정. 손상 시 전체 무시. */
    customBlocks: z.array(customBlockSchema).max(60).optional().catch(undefined),
    /** (편집기) 표지 템플릿 설정. 없거나 enabled=false 면 표지 없음. */
    cover: coverSchema.optional().catch(undefined),
  })
  .passthrough();
export type AnalysisReport = z.infer<typeof analysisReportSchema>;

/** AI 생성 단계용 스키마 — schemaVersion/brand/docNo 등 시스템 필드는 서버가 채움. */
export const analysisReportGenerationSchema = z
  .object({
    meta: reportMetaSchema,
    sections: z.array(analysisSectionSchema).min(1).max(12),
  })
  .passthrough();
export type AnalysisReportGeneration = z.infer<typeof analysisReportGenerationSchema>;

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────
export function parseAnalysisReport(value: unknown): AnalysisReport {
  return analysisReportSchema.parse(value);
}

export function safeParseAnalysisReport(value: unknown):
  | { ok: true; report: AnalysisReport }
  | { ok: false; error: z.ZodError } {
  const r = analysisReportSchema.safeParse(value);
  return r.success ? { ok: true, report: r.data } : { ok: false, error: r.error };
}

/** 메이저 섹션(번호 01·02… 붙는 것)인지 — 렌더러 섹션 넘버링용. */
export const NUMBERED_SECTION_LABELS: Record<AnalysisSectionKind, string> = {
  passage: "원문",
  "structure-map": "한눈에 보는 지문 구조",
  summary: "핵심 요약",
  grammar: "문법 · 구문 포인트",
  "exam-focus": "유형별 출제 포인트",
  vocabulary: "핵심 어휘",
  parsing: "구문 분석",
  "self-check": "학습 점검",
};

export const SECTION_LABELS_EN: Record<AnalysisSectionKind, string> = {
  passage: "Original Passage",
  "structure-map": "Structure Map",
  summary: "Core Summary",
  grammar: "Grammar Points",
  "exam-focus": "Exam Focus by Type",
  vocabulary: "Key Vocabulary",
  parsing: "Sentence Parsing",
  "self-check": "Self-Check",
};
