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

/**
 * 필기 레이아웃 의도 — 01 원문 "필기 캔버스" 전용. 의미만 담는다(좌표/픽셀 없음).
 * 모두 선택. 렌더러가 안전상 band 를 덮어쓸 수 있고, 값이 없으면 kind 기본값으로 파생한다.
 * 기존 보고서(이 필드 없음)도 그대로 렌더된다.
 */
export const annoLayoutSchema = z
  .object({
    /** 이 필기가 가리키는, 해당 문장 en 안에 글자 그대로 존재하는 부분 문자열(≤4단어 권장) */
    anchorText: z.string().optional(),
    /** 선호 band — inline=단어 위, underchunk=구 아래, interline=줄 사이, rail=여백 카드, footnote=문장 하단 */
    band: z.enum(["inline", "underchunk", "interline", "rail", "footnote"]).optional(),
    /** 1=핵심(숨김 금지) … 3=보조(공간 부족 시 각주 강등) */
    priority: z.number().int().min(1).max(3).optional(),
    /** 미리 끊은 짧은 설명 줄들(각 줄 ≤ 약 28자) */
    lines: z.array(z.string()).max(4).optional(),
  })
  .partial()
  .optional();
export type AnnoLayout = z.infer<typeof annoLayoutSchema>;

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
          /**
           * (선택) 직독직해 의미 단위 청크 — 필기 캔버스가 청크 아래에 구문 라벨/필기를 붙인다.
           * text 를 순서대로 이으면 en 과 일치해야 한다(불일치 시 렌더러가 자동 분할로 폴백).
           */
          chunks: z
            .array(
              z.object({
                text: z.string(), // 원문 연속 구절(그대로)
                gloss: z.string().optional(), // 직독직해 한글 뜻 (영어 위에 작게) — 짧게
                role: z.string().optional(), // 짧은 구문 역할 ("주어","동사","목적어","전치사구" 등)
                emphasis: z.enum(["core", "normal"]).optional(),
              }),
            )
            .max(24)
            .optional(),
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
          /** 어법 출제 포인트 코드 a~m — 객관식 어법 생성기(GRAMMAR_POINT_CODES)와 동일 분류 */
          pointCode: z.enum(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"]).optional().catch(undefined),
          point: z.string(), // 핵심 문법 (예: "(i) 병렬 — search 와 reconstruct")
          explanation: z.string(), // 학생 눈높이 해설 (정의→이유→비교→적용 4단계)
          trap: z.string().optional(), // ⚠ 함정/오답 형태
          example: z.string().optional(), // ⚠ 함정 예문(영어 한 문장) — 시험이 파는 '틀린 형태'를 그대로 담음
          exampleWrong: z.string().optional(), // 예문 속 '틀린 토큰'(빨강 취소선)
          exampleCorrect: z.string().optional(), // 그 자리의 '정답 토큰'(초록)
          layout: annoLayoutSchema, // (선택) 원문 필기 배치 의도
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
          sentenceNo: sentenceNo.optional(),
          type: z.string(), // 유형: 빈칸추론·주제·제목·순서·문장삽입·함축의미·지칭·요약
          asks: z.string().optional().default(""), // 무엇을 묻는가 (모델 누락 잦음 → 관대)
          strategy: z.string().optional().default(""), // 대비 전략 & 예시 (모델 누락 잦음 → 관대)
          /** 이 유형이 이 지문에서 걸리는 위치 + 왜 (예: "역접 ⑥ 뒤 — 대조축이 단서 유무라서") */
          logicLocation: z.string().optional(),
          layout: annoLayoutSchema, // (선택) 원문 필기 배치 의도
        }),
      )
      .min(1)
      .max(10),
    /** (편집기) 숨긴 열 키 목록 */
    hiddenCols: z.array(z.string()).optional(),
  })
  .passthrough();

// 06 핵심 어휘 (표) — "단어 테스트" 원천
export const vocabTestModeSchema = z.enum(["study", "hide-meaning", "hide-headword", "synonym", "antonym"]);
export type VocabTestMode = z.infer<typeof vocabTestModeSchema>;
export const vocabTestLayoutSchema = z.enum(["table", "two-column"]);
export type VocabTestLayout = z.infer<typeof vocabTestLayoutSchema>;
export const vocabularyTierSchema = z.enum(["core", "test", "challenge"]);
export type VocabularyTier = z.infer<typeof vocabularyTierSchema>;

function normalizeVocabularyTierInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["core", "basic", "easy", "beginner", "elementary", "key", "초급", "핵심", "기본", "쉬움"].includes(normalized)) return "core";
  if (["test", "exam", "medium", "intermediate", "middle", "중급", "시험", "중간", "중상"].includes(normalized)) return "test";
  if (["challenge", "hard", "advanced", "difficult", "high", "고급", "도전", "고난도", "상"].includes(normalized)) return "challenge";
  return value;
}

const vocabularyTierInputSchema = z.preprocess(normalizeVocabularyTierInput, vocabularyTierSchema.optional());
const vocabularyDifficultySchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim()) return Number(value);
  return value;
}, z.number().int().min(1).max(5).optional());

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
          tier: vocabularyTierInputSchema, // core=쉬운 핵심어, test=시험용, challenge=도전 어휘
          difficulty: vocabularyDifficultySchema, // 1 쉬움 ~ 5 어려움
          synonyms: z.string().optional(), // 동의어
          antonyms: z.string().optional(), // 반의어
        }),
      )
      .min(1)
      .max(40),
    /** (편집기) 숨긴 열 키 목록 — 예: ["pronunciation","synonyms"] */
    hiddenCols: z.array(z.string()).optional(),
    /** Vocabulary worksheet mode. */
    vocabTestMode: vocabTestModeSchema.optional(),
    /** Vocabulary worksheet layout. */
    vocabTestLayout: vocabTestLayoutSchema.optional(),
    /** Word-test rows excluded from the generated worksheet. Source vocabulary rows stay intact. */
    vocabTestExcludedKeys: z.array(z.string()).optional(),
    /** 표시할 난이도 단계(tier) 필터. 비거나 없으면: 단어장=전체, 시험지=기본(test+challenge). */
    vocabTierFilter: z.array(vocabularyTierSchema).optional(),
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
          layout: annoLayoutSchema, // (선택) 원문 필기 배치 의도
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

const worksheetChoiceSchema = z.object({
  label: z.string(),
  text: z.string(),
});

const worksheetDistractorSchema = z.object({
  label: z.string(),
  type: z.string().default("오답"),
  reason: z.string(),
});

const worksheetQuestionSchema = z.object({
  no: z.number().int().min(1).max(12),
  type: z.string(),
  prompt: z.string(),
  passage: z.string().optional(),
  choices: z.array(worksheetChoiceSchema).min(2).max(6),
  answerLabel: z.string(),
  answerText: z.string().optional(),
  explanation: z.string(),
  distractors: z.array(worksheetDistractorSchema).max(6).optional(),
});

const worksheetInferenceSetSchema = z.object({
  title: z.string().default("수능추론 문제"),
  questions: z
    .array(
      worksheetQuestionSchema.extend({
        no: z.number().int().min(1).max(5),
        typeLabel: z.string(),
        choices: z.array(worksheetChoiceSchema).min(5).max(5),
      }),
    )
    .min(5)
    .max(5),
});

const worksheetInferenceGenerationSetSchema = z.object({
  title: z.string().default("수능추론 문제"),
  questions: z
    .array(
      worksheetQuestionSchema.extend({
        no: z.number().int().min(1).max(5),
        typeLabel: z.string(),
        choices: z.array(worksheetChoiceSchema).min(5).max(5),
        answerText: z.string().min(1),
        distractors: z.array(worksheetDistractorSchema).min(4).max(4),
      }),
    )
    .min(5)
    .max(5),
});

const worksheetGrammarSelectionSchema = z.object({
  title: z.string().default("어법 선택"),
  passage: z.string(),
  choices: z
    .array(
      z.object({
        no: z.number().int().min(1).max(30),
        options: z.array(z.string()).min(2).max(4),
        answer: z.string(),
        explanation: z.string(),
      }),
    )
    .min(2)
    .max(12),
});

const worksheetVocabularyClozeSchema = z.object({
  title: z.string().default("어휘 빈칸 완성"),
  passage: z.string(),
  blanks: z
    .array(
      z.object({
        no: z.number().int().min(1).max(40),
        answer: z.string(),
        meaning: z.string().optional(),
        clue: z.string().optional(),
      }),
    )
    .min(6)
    .max(24),
});

const worksheetWordOrderSchema = z.object({
  no: z.number().int().min(1).max(8),
  korean: z.string(),
  chunks: z.array(z.string()).min(4).max(36),
  answer: z.string(),
});

const worksheetWorkbookSetSchema = z.object({
  title: z.string().default("EBS 워크북 유형 훈련"),
  topicGist: z.object({
    title: z.string().default("주제 / 요지"),
    topicTitle: z.string(),
    gist: z.string(),
  }),
  grammarSelection: worksheetGrammarSelectionSchema,
  vocabularyCloze: worksheetVocabularyClozeSchema,
  wordOrders: z.array(worksheetWordOrderSchema).min(1).max(4),
});

const worksheetWorkbookGenerationSetSchema = worksheetWorkbookSetSchema.extend({
  grammarSelection: worksheetGrammarSelectionSchema.extend({
    choices: worksheetGrammarSelectionSchema.shape.choices.min(4).max(10),
  }),
  vocabularyCloze: worksheetVocabularyClozeSchema.extend({
    blanks: worksheetVocabularyClozeSchema.shape.blanks.min(8).max(18),
  }),
});

// ─── 섹션 union ──────────────────────────────────────────────────────────────
// 08+ 실전 학습지 — 첨부 워크북/DOCX 스타일을 A4 보고서에 통합
export const learningWorksheetSectionSchema = z
  .object({
    kind: z.literal("learning-worksheet"),
    title: z.string().default("실전 학습지"),
    note: z.string().optional(),
    logicRows: z
      .array(
        z.object({
          sentenceNo: sentenceNo.optional(),
          functionLabel: z.string(),
          keyPoint: z.string(),
          layout: annoLayoutSchema, // (선택) 원문 필기 배치 의도
        }),
      )
      .min(3)
      .max(12),
    cloze: z
      .object({
        title: z.string().default("핵심어구 빈칸 + 한국어 해석"),
        items: z
          .array(
            z.object({
              no: z.number().int().min(1).max(30),
              sentenceNo: sentenceNo.optional(),
              text: z.string(),
              translation: z.string().optional(),
              answers: z.array(z.string()).min(1).max(3),
            }),
          )
          .min(4)
          .max(18),
        wordBank: z.array(z.string()).min(4).max(24),
      })
      .optional(),
    practice: z
      .object({
        title: z.string().default("빈칸 연습"),
        items: z
          .array(
            z.object({
              no: z.number().int().min(1).max(30),
              sentenceNo: sentenceNo.optional(),
              text: z.string(),
              answers: z.array(z.string()).min(1).max(3),
            }),
          )
          .min(4)
          .max(18),
        wordBank: z.array(z.string()).min(4).max(24).optional(),
      })
      .optional(),
    drills: z
      .object({
        grammarChoices: z
          .array(
            z.object({
              no: z.number().int().min(1).max(20),
              sentenceNo: sentenceNo.optional(),
              text: z.string(),
              choices: z.array(z.string()).min(2).max(4),
              answer: z.string(),
              explanation: z.string(),
            }),
          )
          .max(8)
          .optional(),
        wordOrders: z
          .array(
            z.object({
              no: z.number().int().min(1).max(12),
              sentenceNo: sentenceNo.optional(),
              korean: z.string(),
              chunks: z.array(z.string()).min(4).max(28),
              answer: z.string(),
            }),
          )
          .max(6)
          .optional(),
      })
      .optional(),
    workbookSet: worksheetWorkbookSetSchema.optional(),
    inferenceSet: worksheetInferenceSetSchema.optional(),
    questions: z.array(worksheetQuestionSchema).max(8).default([]),
    hiddenAnswers: z.boolean().default(false),
  })
  .passthrough();

export const learningWorksheetGenerationSectionSchema = learningWorksheetSectionSchema.extend({
  workbookSet: worksheetWorkbookGenerationSetSchema,
  inferenceSet: worksheetInferenceGenerationSetSchema,
});

export const learningWorksheetCoreGenerationSectionSchema = learningWorksheetSectionSchema.extend({
  workbookSet: worksheetWorkbookGenerationSetSchema,
});

export const learningWorksheetInferenceGenerationSchema = worksheetInferenceGenerationSetSchema;

export const analysisSectionSchema = z.discriminatedUnion("kind", [
  passageSectionSchema,
  structureMapSectionSchema,
  summarySectionSchema,
  grammarSectionSchema,
  examFocusSectionSchema,
  vocabularySectionSchema,
  parsingSectionSchema,
  selfCheckSectionSchema,
  learningWorksheetSectionSchema,
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
export type LearningWorksheetSection = z.infer<typeof learningWorksheetSectionSchema>;

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
    /** 이탤릭 */
    italic: z.boolean().optional(),
    /** 정렬 */
    align: z.enum(["left", "center", "right"]).optional(),
    /** 숨김 (렌더/인쇄에서 제외) */
    hidden: z.boolean().optional(),
    /** 세로 리사이즈 — 블록 최소 높이(mm). 자연 높이보다 크면 아래 여백이 생김. */
    minHeight: z.number().min(0).max(400).optional(),
    /**
     * 부분 글자 크기 — 블록 안 특정 텍스트 구간에만 적용되는 폰트 크기(pt).
     * 평문 값은 그대로 두고 "몇 번째 편집 필드(f)의 [s,e) 글자를 N pt 로" 라는
     * 범위 메타로만 저장한다(저장·내보내기·AI 가 쓰는 평문은 오염되지 않음).
     * f = 블록 안 편집 필드의 순서(0부터), s/e = 그 필드 평문 기준 글자 offset.
     */
    fontRuns: z
      .array(
        z.object({
          f: z.number().int().min(0),
          s: z.number().int().min(0),
          e: z.number().int().min(0),
          pt: z.number().min(4).max(96),
        }),
      )
      .optional(),
  })
  .passthrough();
export type BlockMeta = z.infer<typeof blockMetaSchema>;
export type FontRun = NonNullable<BlockMeta["fontRuns"]>[number];

// ─── 학습 활동 블록 (결정론·AI 아님) — 추출 데이터의 순수 변환으로 무제한 생성·재섞기 ───
// 단어 시험(vocabTestMode)과 같은 결정론 모델. seed 로 무한 re-roll, payload 동결 저장으로
// 인쇄·재로드 시 동일 출력 보장(런타임 PRNG 드리프트 없음).
export const activityKindSchema = z.enum([
  "chunk-scramble",       // 어순 배열(청크)
  "word-scramble",        // 어순 배열(단어) — 레거시 호환
  "keyword-cloze",        // 키워드 빈칸
  "full-cloze",           // 전지문 빈칸 + 단어은행
  "nested-cloze",         // 중첩 라운드 빈칸
  "chunk-gloss-cloze",    // 직독직해 빈칸
  "slash-compose",        // 끊어읽기 + 영작
  "sentence-order",       // 문장 순서 배열
  "sentence-translation", // EN→KO 해석 쓰기
  "reproduction",         // KO→EN 백지복원
  "vocab-quiz",           // 단어시험
  "vocab-match",          // 동의어·반의어 매칭
]);
export type ActivityKind = z.infer<typeof activityKindSchema>;

const activityItemSchema = z
  .object({
    no: z.number().int().min(1),
    sentenceNo: z.number().int().min(1).max(40).optional(),
    prompt: z.string(),                          // 학생용 본문(빈칸/슬래시/KO 등)
    chips: z.array(z.string()).optional(),       // 스크램블/순서 칩
    ko: z.string().optional(),                   // 한글 해석(표시 옵션이 켜지면 렌더)
    answer: z.string().default(""),              // 정답(문장/단어/순서)
    answerKey: z.array(z.string()).optional(),   // 다중 빈칸 정답
    writeLines: z.number().int().min(0).max(6).optional(),
  })
  .passthrough();

export const activityParamsSchema = z
  .object({
    unit: z.enum(["chunk", "word"]).optional(),         // (구) 호환 — splitMode 로 대체
    splitMode: z.enum(["chunk", "word", "ngram"]).optional(), // 덩어리 분할 방식
    ngramSize: z.number().int().min(2).max(6).optional(),     // ngram 일 때 묶음 크기
    density: z.number().min(10).max(90).optional(),
    target: z.enum(["all", "content", "verb", "prep", "conj"]).optional(),
    wordBank: z.boolean().optional(),
    firstLetterHint: z.boolean().optional(),
    firstChunkHint: z.boolean().optional(),             // 첫 단위 제자리 노출(힌트)
    koPosition: z.enum(["none", "above", "below"]).optional(), // 한글 해석 위치
    separator: z.enum(["slash", "pipe", "chip"]).optional(),   // 단위 구분 표시
    writeLines: z.number().int().min(0).max(4).optional(),     // 학생 작성선 수
    side: z.enum(["hide-en", "hide-ko"]).optional(),
    scaffold: z.boolean().optional(),
    rounds: z.number().int().min(2).max(4).optional(),
    roundDensities: z.array(z.number().min(10).max(100)).max(4).optional(), // 중첩: 회차별 빈칸 밀도(단조 증가)
    linesPerSentence: z.number().int().min(1).max(4).optional(),
    vocabMode: z.enum(["hide-meaning", "hide-headword", "eng-eng", "synonym"]).optional(),
    wholePassage: z.boolean().optional(),                 // 백지복원: 문장별 vs 전지문 한 번에
    labelStyle: z.enum(["alpha", "circled"]).optional(),  // 순서/삽입 보기 라벨 (A,B,C / ①②③)
    candidateCount: z.number().int().min(2).max(6).optional(), // 문장삽입 후보 위치 수
    preferSignalSentence: z.boolean().optional(),         // 문장삽입: 연결어/대명사 시작 문장 우선 제거
    showKo: z.boolean().optional(),                       // 순서/삽입 등에서 한글 해석 동반 표시
    tier: z.enum(["all", "core", "test", "challenge"]).optional(), // 어휘 난이도 티어 필터
    count: z.number().int().min(1).max(40).optional(),    // 어휘/어법 항목 수 제한
    relation: z.enum(["synonym", "antonym"]).optional(),  // 동의어/반의어 매칭 관계
    showPointHint: z.boolean().optional(),                // 어법 OX/택1 에서 어법 코드 힌트 표시
    showMeaningCue: z.boolean().optional(),               // 어휘 빈칸에서 한글 뜻 단서 표시
    anchor: z.enum(["none", "first"]).optional(),         // 문장 순서: 첫 문장을 '주어진 글'로 고정
    // ── 공유 스캐폴드 사다리 (영작/복원류) ──
    scaffoldLevel: z.enum(["none", "wordSlots", "firstLetter", "wordBank"]).optional(),
    // ── 어휘 매칭 변주 ──
    decoyCount: z.number().int().min(0).max(3).optional(), // 매칭 우측 디코이(정답 없는 보기) 수
    matchBy: z.enum(["synonym", "meaning", "pronunciation"]).optional(), // 매칭 기준
    // ── 직독직해 청크 변주 ──
    glossDir: z.enum(["en-ko", "ko-en"]).optional(),      // 청크 매칭/빈칸 방향 (영→한 / 한→영)
    // ── 구조 빈칸 변주 ──
    cueLevel: z.enum(["meaning", "end", "off", "inline"]).optional(), // 어휘빈칸 뜻 단서 위치
  })
  .partial();
export type ActivityParams = z.infer<typeof activityParamsSchema>;

/** 매칭 그리드(동의어 매칭·청크 영한 매칭 등) — 좌측 고정 순서, 우측 셔플, answer[i]=좌측 i 의 정답 우측 인덱스. */
const activityMatchSchema = z.object({
  left: z.array(z.string()).min(2).max(12),
  right: z.array(z.string()).min(2).max(12),
  answer: z.array(z.number().int().min(0)),
  leftHead: z.string().optional(),
  rightHead: z.string().optional(),
});
export type ActivityMatch = z.infer<typeof activityMatchSchema>;

/** 문장 순서 배열 — 주어진 글(앵커) + 라벨 카드(셔플 제시) + 정답 라벨 순서. */
const activityOrderSchema = z.object({
  given: z.object({ en: z.string(), ko: z.string().optional() }).optional(),
  cards: z
    .array(z.object({ label: z.string(), en: z.string(), ko: z.string().optional() }))
    .min(2)
    .max(10),
  answer: z.string(),
});
export type ActivityOrder = z.infer<typeof activityOrderSchema>;

const activityPayloadSchema = z.object({
  items: z.array(activityItemSchema).max(80),
  wordBank: z.array(z.string()).optional(),
  instructions: z.string().optional(),
  match: activityMatchSchema.optional(), // vocab-match 등 매칭 그리드 전용
  order: activityOrderSchema.optional(), // sentence-order 전용 카드 레이아웃
});
export type ActivityItem = z.infer<typeof activityItemSchema>;
export type ActivityPayload = z.infer<typeof activityPayloadSchema>;

/**
 * 사용자 삽입 커스텀 블록 — 여백(spacer) / 자유 텍스트(text) / 학습 활동(activity). AI 생성 아님(편집기 전용).
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
  z
    .object({
      kind: z.literal("activity"),
      id: z.string().min(1),
      activityKind: activityKindSchema,
      title: z.string().default(""),                  // 빈 문자열이면 기본 라벨
      sentenceNos: z.array(z.number().int().min(1).max(40)).optional(), // 비면 전체
      params: activityParamsSchema.default({}),
      seed: z.number().int().min(0).default(1),       // ★ re-roll 카운터
      payload: activityPayloadSchema,                 // ★ 동결된 생성 결과
      answersHidden: z.boolean().default(true),
    })
    .passthrough(),
  // 지문 웹툰(이미지) 블록 — 생성한 웹툰을 문서/인쇄물에 삽입. AI 생성 아님(편집기 전용).
  z
    .object({
      kind: z.literal("image"),
      id: z.string().min(1),
      imageUrl: z.string().min(1),                    // Supabase 공개 URL
      webtoonId: z.string().optional(),               // 출처 웹툰 id (추적용)
      caption: z.string().optional().catch(undefined),// 캡션(선택)
      // 손상값이 와도 그 한 블록만 기본값으로 강등 — 배열 전체가 .catch(undefined)로
      // 날아가지 않도록 깨지기 쉬운 필드에 개별 .catch 를 둔다.
      widthPct: z.number().min(20).max(100).catch(70), // 본문 폭 대비 이미지 폭(%)
      align: z.enum(["left", "center", "right"]).catch("center"),
      ratio: z.number().positive().optional().catch(undefined), // height/width — 페이지 넘침 방지 폭 계산용
    })
    .passthrough(),
]);
export type CustomBlock = z.infer<typeof customBlockSchema>;
export type ActivityBlock = Extract<CustomBlock, { kind: "activity" }>;
export type ImageBlock = Extract<CustomBlock, { kind: "image" }>;

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
    logoHeightMm: z.number().min(6).max(60).default(14),
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
    /**
     * 01 원문 섹션 렌더 모드. "hlc"=새 필기 캔버스(기본), "legacy"=구 스택 카드(롤백 스위치).
     * 없으면 새 캔버스로 렌더(기존 보고서도 파생 기본값으로 자연 적용).
     */
    passageLayout: z.enum(["hlc", "legacy"]).optional(),
    meta: reportMetaSchema,
    /** AI가 결정한 섹션 순서. 보통 위 순서대로지만 가변. */
    sections: z.array(analysisSectionSchema).min(1).max(12),
    /** (편집기) 섹션별 수동 페이지 조판 제어. sections 와 1:1 평행 배열. (구버전) */
    layout: z.array(sectionLayoutSchema).optional(),
    /** (편집기) 블록 단위 메타 — 블록 id → {페이지·서식}. */
    blockMeta: z.record(z.string(), blockMetaSchema).optional(),
    /** (편집기) 블록 표시 순서 — 블록 id 배열. 없으면 자연 순서. */
    blockOrder: z.array(z.string()).optional(),
    /**
     * (편집기) 표(어휘·어법·출제) 열 너비 사용자 조절값. 표 종류(grammar/exam/vocab)별로
     * 열 키 → 퍼센트(보이는 열들의 합이 ~100). 없으면 기본 비율로 렌더. 세로 구분선 드래그로 저장.
     */
    tableColWidths: z.record(z.string(), z.record(z.string(), z.number())).optional(),
    /** Vocabulary worksheet only mode. Keeps source data but renders only the word-test sheet. */
    vocabTestOnly: z.boolean().optional(),
    /** (편집기) 표지 다음에 '영어 원문만' 단독 페이지를 추가할지. 기본 off. */
    englishOnlyPage: z.boolean().optional(),
    /** (편집기) 사용자 삽입 커스텀 블록 (spacer/text/activity). 위치는 blockOrder 로 결정. 손상 시 전체 무시. */
    customBlocks: z.array(customBlockSchema).max(80).optional().catch(undefined),
    /** (편집기) 학습 활동 정답을 문서 말미 별도 페이지로 모을지. 기본 on. */
    activityAnswerKeyPage: z.boolean().optional(),
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
  "learning-worksheet": "실전 학습지",
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
  "learning-worksheet": "Practice Workbook",
};
