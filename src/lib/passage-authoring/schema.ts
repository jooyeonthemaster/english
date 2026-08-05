import { z } from "zod";

// ============================================================================
// AI 지문 생성 (passage authoring) — 공유 계약 (서버·클라이언트 공용)
//
// "AI 지문 변형(passage-transform)"과의 차이:
//   - 변형: 이미 있는 지문 1편을 입력으로 받아 그 변주를 만든다.
//   - 생성(이 모듈): 지문이 아직 없다. 선생님이 가진 임의의 "자료"(어법 교재,
//     단어장, 외부 지문, 수업 계획, 사진 한 장…)와 자연어 지시를 받아 새 지문을
//     N편 만든다.
//
// 설계 축은 세 가지다.
//   1) 자료(Material) — 무엇을 근거로 쓸 것인가. 자료마다 "역할"이 있고, 역할이
//      곧 AI 가 그 자료를 어떻게 소비할지를 결정한다(§1).
//   2) 지시(instruction) — 선생님이 대화하듯 적는 자유 요구사항.
//   3) 설계(spec) — 학년·어휘·구문·분량·갈래·**골격·용도·겨냥 문항**·소재 등
//      결정론적 손잡이(§2).
//
// 모든 자료는 UI 에 도달하기 전에 "텍스트"로 정규화된다(파일→텍스트 판독은 무료).
// 선생님이 AI 가 무엇을 읽었는지 눈으로 보고 고칠 수 있어야 하기 때문이다.
// 다만 텍스트만으로는 밑줄·굵게·네모 박스·표 병합이 완전히 소멸하므로, 사용자가
// 켠 자료에 한해 원본 페이지 이미지를 **함께** 보낸다(sendPages — 텍스트 판독을
// 대체하는 것이 아니라 보강한다).
//
// ── 이 파일이 소유하는 것 / 소유하지 않는 것 ────────────────────────────────
// 소유한다: 축(enum)과 그 한국어 라벨, 요청·출력 zod 스키마, 서버가 붙이는 지표
//           인터페이스, 서버·클라이언트가 함께 쓰는 상수. 이것들은 계약 그 자체다.
// 소유하지 않는다: **영어 프롬프트 문안**. 학년별 수치표·골격 12종 설명·TEXTURE·
//           BANNED MOVES·GROUNDING·역할 지시문은 전부 prompts.ts 가 소유한다.
//           (prompts.ts:30 계약의 의도가 바로 이 분리다. 한 줄도 되돌리지 말 것.)
// ============================================================================

// ── §1. 자료 역할 ───────────────────────────────────────────────────────────

/**
 * 자료의 역할. 첨부 직후 AI 가 자동 분류하고(무료), 선생님이 언제든 바꾼다.
 * 역할별로 프롬프트에 들어가는 지시 블록이 완전히 달라진다(prompts.ts).
 */
export const MATERIAL_ROLES = [
  "GRAMMAR_POINTS",
  "VOCABULARY",
  "SOURCE_PASSAGE",
  "SOURCE_TO_VARY",
  "TOPIC_BRIEF",
  "STYLE_SAMPLE",
  "EXAM_SAMPLE",
  "OTHER",
] as const;
export type MaterialRole = (typeof MATERIAL_ROLES)[number];

export const MATERIAL_ROLE_LABELS: Record<MaterialRole, string> = {
  GRAMMAR_POINTS: "어법 포인트",
  VOCABULARY: "단어장",
  SOURCE_PASSAGE: "참고 지문",
  SOURCE_TO_VARY: "변형할 지문",
  TOPIC_BRIEF: "주제·요구사항",
  STYLE_SAMPLE: "문체 견본",
  EXAM_SAMPLE: "기출·시험지",
  OTHER: "기타 참고자료",
};

// ── 회귀 방지 계약 (역할 힌트 길이) ────────────────────────────────────────
// 힌트는 **20자 이내 한 줄**로 유지한다. 이 값은 미감이 아니라 기하학이다.
//   역할 드롭다운은 w-[340px] 세로 1열이고, 항목 1개의 실측 높이는
//   py-2(8+8) + 라벨 18 + gap-1(4) + 힌트 18 = 56px 다. 8개 × 56 + p-1(8) = 456px.
//   힌트가 두 줄로 넘어가는 순간 항목이 74px 이 되어 8개면 600px, 팝오버가
//   스크롤을 만들고 "고르는 화면"이 "스크롤하는 화면"이 된다.
// 기존 계약 "역할 설명문은 line-clamp/truncate 없이 흘린다"(material-chip.tsx:20-21)
// 는 그대로 살아 있다 — 그 계약의 취지는 "고르는 근거를 없애지 마라"이고,
// 자르지 않고 짧게 다시 쓰는 것은 그 취지를 그대로 만족한다.
// ───────────────────────────────────────────────────────────────────────────

/** 역할 선택 UI 에 그대로 쓰는 한 줄 설명 — "이걸 고르면 AI가 뭘 하는지". */
export const MATERIAL_ROLE_HINTS: Record<MaterialRole, string> = {
  GRAMMAR_POINTS: "이 어법이 여러 번 나오게 써요",
  VOCABULARY: "이 단어들을 문맥에 녹여 써요",
  SOURCE_PASSAGE: "내용·논지를 소재로 새로 써요",
  SOURCE_TO_VARY: "이 지문을 알아볼 수 있게 변형해요",
  TOPIC_BRIEF: "무엇을 쓸지에 대한 안내로 읽어요",
  STYLE_SAMPLE: "이 문체·호흡·난이도에 맞춰요",
  EXAM_SAMPLE: "이 지문의 질감을 목표로 삼아요",
  OTHER: "적어 주신 요청에 따라 참고해요",
};

// MATERIAL_ROLE_TONES(역할별 색 태그)는 삭제됐다 — 자료를 큰 카드로 늘어놓던
// MaterialList 가 사라지면서 유일한 사용처가 없어졌다. 지금 역할 뱃지는 칩 안의
// 회색 한 칸이라 색으로 구분하지 않는다(칩 여러 개가 무지개가 되면 정작 파일
// 이름이 안 읽힌다).

/** 자료가 어디서 왔는지 — 판독 실패 안내·아이콘 분기에 쓴다. */
export const MATERIAL_SOURCE_KINDS = [
  "TEXT",
  "FILE_TEXT",
  "FILE_DOC",
  "FILE_SHEET",
  "FILE_PDF",
  "FILE_IMAGE",
] as const;
export type MaterialSourceKind = (typeof MATERIAL_SOURCE_KINDS)[number];

/** 서버가 받는 자료 1건. content 는 이미 텍스트로 정규화된 상태다. */
export const authoringMaterialSchema = z.object({
  /** 클라이언트 생성 id — 결과의 근거 매핑(usedMaterialIds)이 이 값을 참조한다. */
  id: z.string().min(1).max(64),
  role: z.enum(MATERIAL_ROLES),
  /** 파일명 또는 사용자가 붙인 이름. */
  name: z.string().max(200).default(""),
  sourceKind: z.enum(MATERIAL_SOURCE_KINDS).default("TEXT"),
  /**
   * 판독·정규화된 본문.
   *
   * ⚠️ **더 이상 필수가 아니다**(26-08-04). 예전 `min(1)` 은 "모든 자료는 텍스트로
   * 정규화된다"는 옛 전제의 마지막 자물쇠였고, 그 한 글자 때문에 **사진을 원본
   * 그대로만 보내는 자료가 서버에서 400 으로 튕겼다** — 모델은 이미지를 직접 읽을
   * 수 있는데(generate.ts:685) 계약이 그걸 금지하고 있었던 셈이다.
   * 대신 아래 refine 이 "본문도 원본도 없는 빈 자료"만 막는다.
   */
  content: z.string().max(60_000).default(""),
  /** "이 자료를 어떻게 쓸까요?" — 자료별 자유 메모. */
  note: z.string().max(500).default(""),
  // ── 하이브리드 판독(텍스트 + 원본 페이지 이미지) ────────────────────────
  // 밑줄·굵게·네모 박스·표 병합은 텍스트 판독만으로는 완전히 소멸한다. 그 자료에
  // 한해 원본 페이지 JPEG 를 생성 호출에 함께 실어 보낸다(사용자가 켠 것만 —
  // 숨은 자동 결정 금지). 요청 본문에는 **경로 문자열만** 싣는다: 이미지 바이트를
  // 그대로 실으면 4.5MB 요청 본문 벽에 걸린다. 실제 다운로드는 run-job 의 after()
  // 안에서 storagePath 로 한다.
  /** 원본 페이지 이미지도 함께 보낼지. */
  sendPages: z.boolean().default(false),
  /** 보낼 수 있는 원본 페이지 수(화면 표시용). 실제 첨부는 편당 상한이 따로 있다. */
  pageCount: z.number().int().min(0).max(200).optional(),
  /** 페이지 JPEG 묶음의 스토리지 경로(서명 업로드 결과). */
  storagePath: z.string().max(500).optional(),
});

/**
 * 자료 1건의 **최소 실질** — 본문이든 원본 페이지든 모델이 볼 것이 하나는 있어야
 * 한다. 둘 다 없는 자료는 프롬프트에서 이름만 차지하고 아무것도 기여하지 못하는데,
 * usedMaterialIds 에는 잡혀서 "이 자료를 반영했습니다"라는 거짓 근거 표시를 만든다.
 *
 * ⚠️ refine 을 **여기(요소)** 에 걸고 배열에 걸지 않는 이유: 배열에 걸면 어느
 * 자료가 문제인지 zod 이슈 경로에 안 남아, 자료 12개짜리 요청에서 사용자가 무엇을
 * 고쳐야 할지 알 수 없다.
 */
export const authoringMaterialEntrySchema = authoringMaterialSchema.refine(
  (material) =>
    material.content.trim().length > 0 || Boolean(material.storagePath),
  { message: "자료에 본문이나 원본 페이지 중 하나는 있어야 합니다." },
);
export type AuthoringMaterial = z.infer<typeof authoringMaterialSchema>;

// ── §2. 지문 설계(난이도) ───────────────────────────────────────────────────

export const GRADE_BANDS = [
  "MIDDLE_1",
  "MIDDLE_2",
  "MIDDLE_3",
  "HIGH_1",
  "HIGH_2",
  "HIGH_3",
  "CSAT",
] as const;
export type GradeBand = (typeof GRADE_BANDS)[number];

export const GRADE_BAND_LABELS: Record<GradeBand, string> = {
  MIDDLE_1: "중1",
  MIDDLE_2: "중2",
  MIDDLE_3: "중3",
  HIGH_1: "고1",
  HIGH_2: "고2",
  HIGH_3: "고3",
  CSAT: "수능",
};

// GRADE_BAND_PROMPT_HINTS(학년대별 영어 산문 서술)는 이 파일에서 **삭제**됐다.
// prompts.ts:30 계약("schema.ts 는 수정하지 않는다")의 의도는 문맥상 "스펙 힌트
// *영어 문안*을 계약 파일에 흘리지 말 것"이다 — 그래서 LEXICAL/SYNTAX 영어 힌트는
// 원래부터 prompts.ts 에 산다. 학년 힌트만 이 파일에 남아 있던 것이 예외였고,
// 이제 prompts.ts 의 GRADE_BAND_PARAMS(7축 숫자표)로 이관됐다. 축(enum)·출력
// 필드·지표 인터페이스만 여기 남는다. **영어 프롬프트 문안을 다시 들이지 말 것.**

// ── lexical / syntax 는 "절대 난이도"가 아니라 학년 기준 대비 오프셋이다 ──────
// enum 값(EASY/STANDARD/HARD, SIMPLE/STANDARD/COMPLEX)은 **그대로 둔다** —
// 저장된 잡 스냅샷·복구 run 이 이 문자열을 그대로 들고 있어 마이그레이션이 0 이어야
// 한다. 바뀐 것은 의미와 라벨뿐이다: −1단계 / 학년 기준 / +1단계.
// 이 재정의가 "중1 + 복잡한 문장"이 8~14단어와 수능 밀도를 동시에 요구하던 모순을
// 없앤다(prompts.ts 의 applyOffset 이 학년 행 하나만 이동시켜 내보낸다).
export const LEXICAL_LEVELS = ["EASY", "STANDARD", "HARD"] as const;
export type LexicalLevel = (typeof LEXICAL_LEVELS)[number];
export const LEXICAL_LEVEL_LABELS: Record<LexicalLevel, string> = {
  EASY: "한 단계 쉽게",
  STANDARD: "학년 기준",
  HARD: "한 단계 어렵게",
};

export const SYNTAX_LEVELS = ["SIMPLE", "STANDARD", "COMPLEX"] as const;
export type SyntaxLevel = (typeof SYNTAX_LEVELS)[number];
export const SYNTAX_LEVEL_LABELS: Record<SyntaxLevel, string> = {
  SIMPLE: "한 단계 쉽게",
  STANDARD: "학년 기준",
  COMPLEX: "한 단계 어렵게",
};

export const PASSAGE_GENRES = [
  "AUTO",
  "EXPOSITORY",
  "ARGUMENTATIVE",
  "RESEARCH",
  "NARRATIVE",
  "PRACTICAL",
] as const;
export type PassageGenre = (typeof PASSAGE_GENRES)[number];
export const PASSAGE_GENRE_LABELS: Record<PassageGenre, string> = {
  AUTO: "자동",
  EXPOSITORY: "설명문",
  ARGUMENTATIVE: "논설문",
  RESEARCH: "실험·연구",
  NARRATIVE: "이야기·일화",
  PRACTICAL: "실용문",
};
export const PASSAGE_GENRE_PROMPT_HINTS: Record<PassageGenre, string> = {
  AUTO: "",
  EXPOSITORY:
    "Expository: explain a concept or phenomenon neutrally, definition → mechanism → implication.",
  ARGUMENTATIVE:
    "Argumentative: stake a clear claim, support it, and acknowledge or rebut a counterpoint.",
  RESEARCH:
    "Research report: describe a study — setup, procedure, finding, interpretation. Use plausible but unnamed researchers; never invent citable authors, journals, or statistics presented as real.",
  NARRATIVE:
    "Narrative: a short anecdote or episode with a person, a turn of events, and a reflective closing.",
  PRACTICAL:
    "Practical text: announcement, letter, guide, or notice with a concrete purpose and audience.",
};

// ── 지문 골격(skeleton) ─────────────────────────────────────────────────────
// 갈래(genre)가 "무슨 종류의 글인가"라면, 골격은 "논지가 어떤 순서로 꺾이는가"다.
// 기출 지문이 기계 산문과 갈리는 지점이 바로 이 축이라, 갈래만으로는 배치 3편이
// 전부 같은 모양(설명→예시→교훈)으로 나온다. AUTO 면 서버가 편별로 결정론적으로
// 배분한다(prompts.assignSkeletons — 반박형 S2/S7 이 배치의 절반을 넘지 못한다).
// 각 코드의 **영어 한 줄 설명은 prompts.ts 가 소유한다**(여기엔 한국어 라벨만).
export const PASSAGE_SKELETONS = [
  "AUTO",
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "S9",
  "S10",
  "S11",
  "S12",
] as const;
export type PassageSkeleton = (typeof PASSAGE_SKELETONS)[number];
export const PASSAGE_SKELETON_LABELS: Record<PassageSkeleton, string> = {
  AUTO: "자동",
  S1: "정의 → 작동 → 함의",
  S2: "통념 → 반박 → 재정의",
  S3: "현상 → 연구 → 해석",
  S4: "두 설명 → 종합",
  S5: "성립 조건 → 한계",
  S6: "의미의 변천",
  S7: "역설 → 해소",
  S8: "개체와 전체의 층위 차",
  S9: "하나로 묶인 둘을 가르기",
  S10: "이점 → 숨은 비용",
  S11: "관행 → 규범",
  S12: "상황 → 계기 → 변화",
};

// ── 용도(exam track) ────────────────────────────────────────────────────────
// 같은 학년·같은 분량이어도 "수능형 한 편"과 "이번 단원 내신 한 편"은 요구가
// 정반대다. 수능형은 낯선 소재로 밀도를 올리고, 내신은 배운 어휘를 다시 써서
// 복습한 학생이 첫 두 문장에서 알아보게 해야 한다. 이 축이 없으면 내신 발주에도
// 수능 프롬프트가 그대로 나가 "배운 게 하나도 없는 지문"이 된다.
export const EXAM_TRACKS = [
  "CSAT_STYLE",
  "SCHOOL_EXAM",
  "TEXTBOOK_VARIANT",
] as const;
export type ExamTrack = (typeof EXAM_TRACKS)[number];
export const EXAM_TRACK_LABELS: Record<ExamTrack, string> = {
  CSAT_STYLE: "수능형",
  SCHOOL_EXAM: "내신 시험",
  TEXTBOOK_VARIANT: "교과서 변형",
};
export const EXAM_TRACK_HINTS: Record<ExamTrack, string> = {
  CSAT_STYLE: "수능·모평 감각으로 새 소재를 써요",
  SCHOOL_EXAM: "배운 단원의 어휘·어법을 다시 써요",
  TEXTBOOK_VARIANT: "본문과 나란히 비교되게 변형해요",
};

// ── 겨냥 문항(question kinds) ───────────────────────────────────────────────
// **문항을 만들지 않는다.** 나중에 그 문항을 낼 수 있는 "걸이"를 지문 안에 심을
// 뿐이다(빈칸이면 논지 명제를 뒤 1/3 에 두고 앞의 두 문장이 각각 그것을 함의하게,
// 순서면 지시어 사슬로 배열이 하나만 성립하게). 최대 3개까지만 고를 수 있다 —
// 그 이상은 서로 상충하는 배치 요구가 되어 한 편에 다 담기지 않는다.
export const QUESTION_KINDS = [
  "MAIN_IDEA",
  "BLANK_PHRASE",
  "BLANK_WORD",
  "ORDER",
  "INSERTION",
  "IRRELEVANT",
  "VOCABULARY",
  "GRAMMAR",
  "SUMMARY",
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  MAIN_IDEA: "주제·제목",
  BLANK_PHRASE: "빈칸(구)",
  BLANK_WORD: "빈칸(낱말)",
  ORDER: "글의 순서",
  INSERTION: "문장 삽입",
  IRRELEVANT: "무관한 문장",
  VOCABULARY: "어휘",
  GRAMMAR: "어법",
  SUMMARY: "요약문",
};

/** 한 편이 동시에 감당할 수 있는 겨냥 문항 수 상한. */
export const MAX_TARGET_QUESTION_TYPES = 3;

export const TOPIC_FIELDS = [
  "AUTO",
  "SCIENCE",
  "HUMANITIES",
  "SOCIAL",
  "ARTS",
  "ENVIRONMENT",
  "PSYCHOLOGY",
  "SPORTS_HEALTH",
  "TECH",
] as const;
export type TopicField = (typeof TOPIC_FIELDS)[number];
export const TOPIC_FIELD_LABELS: Record<TopicField, string> = {
  AUTO: "자동",
  SCIENCE: "과학",
  HUMANITIES: "인문·철학",
  SOCIAL: "사회·경제",
  ARTS: "예술·문화",
  ENVIRONMENT: "환경·자연",
  PSYCHOLOGY: "심리·교육",
  SPORTS_HEALTH: "스포츠·건강",
  TECH: "기술·미디어",
};
export const TOPIC_FIELD_PROMPT_HINTS: Record<TopicField, string> = {
  AUTO: "",
  SCIENCE: "natural science (physics, biology, chemistry, astronomy)",
  HUMANITIES: "humanities and philosophy (history, ethics, language, thought)",
  SOCIAL: "social science and economics (society, markets, institutions, policy)",
  ARTS: "art and culture (music, painting, film, architecture, design)",
  ENVIRONMENT: "environment and nature (ecology, climate, conservation)",
  PSYCHOLOGY: "psychology and education (cognition, learning, motivation)",
  SPORTS_HEALTH: "sports, exercise, food and health",
  TECH: "technology and media (computing, AI, communication, engineering)",
};

/**
 * 분량 프리셋 — 슬라이더 옆 원클릭 칩.
 *
 * 값은 감이 아니라 실측이다. 2018년 이후 평가원 문항 지문의 단어 수 분포에서
 * 유형별 중앙값을 그대로 가져왔다: 중등 워밍업 120, 수능·모평 본문 165,
 * 고교 내신 변형 190, 장문 41–42번 240, 장문 서사 43–45번 340.
 * (기존 110/150/190/260 은 어느 유형과도 맞지 않는 중간값이라, "수능형"을 눌러도
 *  실제 수능 지문보다 15단어 짧은 글이 나왔다.)
 */
export const LENGTH_PRESETS = [
  { label: "짧게", words: 120, hint: "중등 내신·워밍업" },
  { label: "수능형", words: 165, hint: "수능·모평 본문" },
  { label: "내신형", words: 190, hint: "고교 내신 변형" },
  { label: "장문", words: 240, hint: "장문 독해 41–42" },
  { label: "긴 장문", words: 340, hint: "장문 서사 43–45" },
] as const;

export const MIN_TARGET_WORDS = 60;
export const MAX_TARGET_WORDS = 400;
/** 최빈 발주가 수능·모평 본문이라 기본값도 그 실측 중앙값(165)에 맞춘다. */
export const DEFAULT_TARGET_WORDS = 165;

export const authoringSpecSchema = z.object({
  gradeBand: z.enum(GRADE_BANDS).default("HIGH_2"),
  lexical: z.enum(LEXICAL_LEVELS).default("STANDARD"),
  syntax: z.enum(SYNTAX_LEVELS).default("STANDARD"),
  targetWords: z
    .number()
    .int()
    .min(MIN_TARGET_WORDS)
    .max(MAX_TARGET_WORDS)
    .default(DEFAULT_TARGET_WORDS),
  genre: z.enum(PASSAGE_GENRES).default("AUTO"),
  /** 논지가 꺾이는 순서. AUTO 면 서버가 편별로 결정론적 배분. */
  skeleton: z.enum(PASSAGE_SKELETONS).default("AUTO"),
  /** 이 지문을 어디에 낼 것인가. 프롬프트 블록 하나가 통째로 갈린다. */
  examTrack: z.enum(EXAM_TRACKS).default("CSAT_STYLE"),
  /** 나중에 낼 문항 유형(최대 3) — 지문 안에 걸이만 심는다. 문항은 만들지 않는다. */
  targetQuestionTypes: z
    .array(z.enum(QUESTION_KINDS))
    .max(MAX_TARGET_QUESTION_TYPES)
    .default([]),
  topicField: z.enum(TOPIC_FIELDS).default("AUTO"),
});
export type AuthoringSpec = z.infer<typeof authoringSpecSchema>;

export const DEFAULT_AUTHORING_SPEC: AuthoringSpec = {
  gradeBand: "HIGH_2",
  lexical: "STANDARD",
  syntax: "STANDARD",
  targetWords: DEFAULT_TARGET_WORDS,
  genre: "AUTO",
  skeleton: "AUTO",
  examTrack: "CSAT_STYLE",
  targetQuestionTypes: [],
  topicField: "AUTO",
};

// ── §3. 생성 요청 ───────────────────────────────────────────────────────────

/** 한 번에 만들 수 있는 지문 수 상한. 300s 라우트 예산 안에서 안전한 값. */
export const MAX_PASSAGES_PER_RUN = 6;

/**
 * 한 실행 안에서 동시에 도는 생성 호출 수. run-job 의 워커 수이자, 클라이언트
 * ETA 계산의 분모다 — 그래서 서버 파일이 아니라 공유 계약 파일에 산다.
 * (모듈 로컬 상수로 두면 클라이언트가 "편수 × 편당 시간"으로 계산해 6편에서
 *  실제의 약 3배를 부른다. 실제 벽시계는 ceil(count / 이 값) × 편당 시간이다.)
 */
export const AUTHORING_CONCURRENCY = 3;

export const authoringRequestSchema = z.object({
  /** 자료 0개도 허용 — 지시문만으로도 만들 수 있어야 진입장벽이 없다. */
  materials: z.array(authoringMaterialEntrySchema).max(12).default([]),
  instruction: z.string().max(4_000).default(""),
  spec: authoringSpecSchema.default(DEFAULT_AUTHORING_SPEC),
  count: z.number().int().min(1).max(MAX_PASSAGES_PER_RUN).default(1),
  /**
   * 여러 편을 만들 때 서로 다른 소재가 되도록 유도할지. 끄면 같은 소재를 여러
   * 각도로 쓴다(같은 단원 반복 훈련용).
   */
  diversify: z.boolean().default(true),
  /** "다시 생성" 시 직전 결과 본문 — 반복 회피용. */
  avoidTexts: z.array(z.string().max(8_000)).max(6).default([]),
});
export type AuthoringRequest = z.infer<typeof authoringRequestSchema>;

// ── §4. 모델 출력 계약 ──────────────────────────────────────────────────────

/**
 * 모델이 지문 1편에 대해 돌려주는 것. 필드를 적게 유지한다 — Flash 계열은
 * 한국어 설명 필드가 여러 개면 첫 필드에 몰아넣는 사고가 실측으로 확인됐다
 * (passage-transform/schema.ts 의 동일 교훈).
 *
 * ⚠️ 단어 수·문장 수 같은 "셀 수 있는 값"은 모델에게 묻지 않는다. 서버가
 * 본문에서 결정론적으로 계산한다(환각 차단). rationale 은 "왜 이렇게 썼는지"
 * 라는 서술만 담당한다.
 */
/** plan 의 골격 칸에 들어올 수 있는 값(AUTO 는 계획이 아니므로 제외). */
export const PLAN_SKELETON_CODES = PASSAGE_SKELETONS.filter(
  (code): code is Exclude<PassageSkeleton, "AUTO"> => code !== "AUTO",
);

export const authoredPassageSchema = z.object({
  // ── plan 이 첫 필드인 이유 ────────────────────────────────────────────────
  // 필드 순서가 곧 모델의 사고 순서다. 본문을 먼저 쓰게 하면 설계는 사후 정당화가
  // 되고, 그때 골격은 항상 "설명 → 예시 → 교훈"으로 수렴한다. 논지 한 줄과 그것을
  // 떠받치는 두 근거를 **먼저** 적게 하면 본문이 그 계획을 따라간다.
  // 결과 카드의 plan 블록과 후속 요청 칩("다른 골격으로")이 이 값을 그대로 쓴다.
  plan: z
    .object({
      skeleton: z
        .string()
        .describe('The spine code you committed to, e.g. "S10".'),
      grounding: z.string().describe("a, b, or c from the GROUNDING section."),
      thesis: z.string().describe("The controlling idea in one English line."),
      warrantA: z
        .string()
        .describe("First support, one English line. It must not restate the thesis."),
      warrantB: z
        .string()
        .describe(
          "Second support — a DIFFERENT kind of reason from warrantA, not the same reason reworded.",
        ),
      // ⚠️ 옛 문안은 "Where and how the spine turns" 였고, 모델은 그것을 **전환 전용
      //   문장을 하나 쓰라**로 읽었다. 실측 4편 전부에서 이 자리에 정보량 0인
      //   단문이 박혔다("The key lies in focus." / "This complex dynamic creates a
      //   fundamental operational disconnect."). 칸을 없애면 골격이 흐려지므로,
      //   칸은 두되 **"문장을 만들라"가 아니라 "위치를 지목하라"**로 뜻을 바꾼다.
      turn: z
        .string()
        .describe(
          "WHERE the spine turns: name the sentence the turn happens INSIDE. Never add a separate sentence whose only job is to announce the turn.",
        ),
      // ⚠️ 옛 문안은 "How the final sentence re-abstracts" 였다. 시스템 프롬프트는
      //   금지무브 4 에서 "마지막 문장은 재진술이 아니라 한 층 올라간다"로 바뀌었는데
      //   이 칸만 옛 '재추상' 지시로 남아 정면 충돌했다(prompts.ts 머리 계약 참조).
      //   결론이 두 문장으로 갈리던 실측 결함(S7/S8·S8/S9 쌍)의 원인이 여기다.
      closingMove: z
        .string()
        .describe(
          "What the final sentence ADDS — the consequence or scope the body earned, in different nouns from the thesis. Exactly one sentence, and no earlier sentence may state that conclusion first.",
        ),
    })
    .describe("Plan the passage here BEFORE writing it. English only."),
  title: z
    .string()
    .describe("A short English title for the passage (<= 8 words), no quotes."),
  // ── 회귀 방지 계약 (문단) ─────────────────────────────────────────────────
  // 옛 문안은 "Natural paragraphing with blank lines" 였다. 2018년 이후 평가원
  // 지문 558편의 평균 문단 수는 **1.00** 이고 빈 줄로 나뉜 지문은 단 한 편도 없다.
  // 빈 줄이 들어간 순간 그 지문은 시험지에 그대로 못 올라가고, 조판에서 손질이
  // 필요해진다. 실측 반증으로 뒤집었다 — 되돌리지 말 것.
  passage: z
    .string()
    .describe(
      "The full English passage as PLAIN TEXT in ONE unbroken paragraph: no blank lines, no line breaks between sentences, no markdown, no headings, no bullets, no title line, no surrounding quotes, no question or choices. (Only exception: genre=PRACTICAL keeps the natural block layout of a letter or notice, and genre=NARRATIVE at 300+ words may use at most 2 blocks.)",
    ),
  koreanSummary: z
    .string()
    .default("")
    .describe(
      "이 지문이 무엇에 관한 글인지 한국어 한 줄 요약. 반드시 한국어. 예: \"습관 형성에서 신호와 보상의 역할을 설명하는 글\".",
    ),
  // rationale 은 자유 감상문이 아니라 고정 서식이다("자료를 잘 반영했습니다" 같은
  // 문장은 선생님이 다음 행동을 정하는 데 아무 근거가 못 된다).
  //
  // ── 3요소 → 2요소로 줄인 이유 (실측 6편) ─────────────────────────────────
  // 이 파일의 대원칙은 "셀 수 있는 값은 모델에게 묻지 않는다"(metrics/coverage 를
  // 서버가 계산하는 이유)다. rationale 의 옛 ②③ 은 그 원칙의 **마지막 예외**였다 —
  // 검증할 수 없는 모델의 주장을 사실처럼 화면에 실었고, 실제로 반복해서 틀렸다.
  //
  //  · 옛 ③(문항 유형 추천): 6편 중 5편이 **마지막 문장**을 빈칸 자리로 지목했다.
  //    마지막 문장은 정의상 앞 내용의 귀결이라 재진술 위험이 가장 큰 자리다.
  //    실제로 어떤 편은 정답이 바로 앞 문장에 재진술로 남아 있었고, 어떤 편은
  //    지문에 없는 개념이 정답이었다. 게다가 **겨냥 문항은 이미 서버가 안다**
  //    (prompts.resolveQuestionKinds 가 걸이를 정해 프롬프트에 실었다) — 우리가
  //    지시한 것을 모델에게 되묻고, 그 답을 믿는 구조였다.
  //  · 옛 ②의 관계 라벨("두 근거 문장"): 칸이 둘이면 모델은 언제나 둘을 채운다.
  //    앞 문장의 재진술도, 같은 조건 명제의 대칭 쌍(긍정 사례/부정 사례)도 전부
  //    "서로 다른 근거"가 됐다. 관계를 판정하라고 고쳐 봐도 절반만 맞았다.
  //    **문장 번호는 선생님이 2초면 검증하지만 관계 라벨은 검증할 수 없다.**
  //
  // 틀린 해설은 없는 해설보다 나쁘다 — 선생님이 그것을 믿고 문항 자리를 고르기
  // 때문이다. 되살리려면 그 주장을 서버가 검증할 방법부터 만들 것.
  rationale: z
    .string()
    .default("")
    .describe(
      "선생님께 드리는 설명. 반드시 한국어로, 아래 두 가지만 각각 한 문장씩 이 순서로 적는다. ① 어떤 골격(S코드)으로 썼는지와 그 골격이 꺾이는 지점(몇 번째 문장 안에서 꺾이는지). ② 논지 문장이 몇 번째 문장이고 그것을 떠받치는 문장이 몇 번째 문장인지 — 번호만 대고, 그 문장들의 관계에 이름을 붙이지 말 것('근거1·근거2', '독립적으로 뒷받침' 같은 라벨 금지). 이 지문으로 어떤 문항을 내면 좋을지는 적지 않는다.",
    ),
  usedGrammarPoints: z
    .array(z.string())
    .default([])
    .describe(
      "어법 자료를 받았을 때만: 이 지문에 의도적으로 넣은 어법 포인트를 한국어 라벨로. 예: [\"분사구문\", \"관계대명사 what\"]. 자료가 없으면 빈 배열.",
    ),
  usedWords: z
    .array(z.string())
    .default([])
    .describe(
      "단어장 자료를 받았을 때만: 지문에 실제로 사용한 표제어를 원형으로. 자료가 없으면 빈 배열.",
    ),
  topicLabel: z
    .string()
    .default("")
    .describe("지문 소재를 가리키는 짧은 한국어 라벨. 예: \"습관 형성\"."),
  // ── 심어 둔 "걸이"의 좌표 ────────────────────────────────────────────────
  // usedGrammarPoints/usedWords 가 "무엇을 넣었나"라면, 아래 둘은 "어디에 어떤
  // 방식으로 넣었나"다. 이것이 있어야 문제 생성이 지문을 다시 읽지 않고도 밑줄
  // 위치와 문맥 단서 종류를 알 수 있고, 선생님은 대조 없이도 검수할 수 있다.
  grammarSpots: z
    .array(
      z.object({
        span: z
          .string()
          .describe(
            "The exact 1-3 word span in the passage that carries the grammar point, copied verbatim.",
          ),
        label: z
          .string()
          .describe("그 자리에 심은 어법 포인트의 한국어 라벨. 예: \"분사구문\"."),
      }),
    )
    .default([])
    .describe(
      "어법 자료를 받았을 때만: 심어 둔 자리를 본문에 나오는 순서대로. 자료가 없으면 빈 배열.",
    ),
  vocabAnchors: z
    .array(
      z.object({
        word: z
          .string()
          .describe("The headword in its base form, exactly as in the list."),
        clue: z
          .enum(["DEFINITION", "CONTRAST", "CAUSE", "EXAMPLE", "RESTATEMENT"])
          .describe(
            "The kind of context clue that makes this word recoverable in the sentence you placed it in.",
          ),
      }),
    )
    .default([])
    .describe(
      "단어장 자료를 받았을 때만: 쓴 표제어와 그 문맥 단서 종류. 자료가 없으면 빈 배열.",
    ),
});
export type AuthoredPassage = z.infer<typeof authoredPassageSchema>;

/** 모델이 본문보다 먼저 적는 설계. 결과 카드 최상단 plan 블록의 원본. */
export type PassagePlan = AuthoredPassage["plan"];
export type GrammarSpot = AuthoredPassage["grammarSpots"][number];
export type VocabAnchor = AuthoredPassage["vocabAnchors"][number];

// ── §5. 서버가 덧붙이는 결정론적 지표 ───────────────────────────────────────

/**
 * 본문에서 직접 계산하는 지표. 모델 주장이 아니라 사실이다.
 *
 * 아래 5개(cv/span/shortest/connective/nominal)는 "기계가 썼다"를 드러내는 신호를
 * 수치화한 것이다 — 평균 문장 길이가 맞아도 여섯 문장이 전부 같은 무게면 사람이
 * 쓴 글로 읽히지 않는다. 옛 계약("셀 수 있는 값은 서버가 센다")의 **파기가 아니라
 * 확장**이다: 여전히 모델에게 묻지 않고 본문에서 센다.
 * UI 는 이 값들로 "기출 범위 안 / 벗어남"만 표시한다. 자동 재생성은 하지 않는다 —
 * 크레딧·부분 환불 계약과 얽혀 별도 정책 결정이 필요하다.
 */
export interface PassageMetrics {
  words: number;
  sentences: number;
  avgSentenceWords: number;
  longestSentenceWords: number;
  paragraphs: number;
  /** 목표 분량 대비 편차(%). 음수면 짧다. */
  targetDeltaPercent: number;
  /** 문장 길이 변동계수(표준편차/평균). 기출 중앙 0.36 (p10 0.24 / p90 0.54). */
  sentenceLengthCv: number;
  /** 최장 − 최단 문장 단어 수. 기출 중앙 25 (p10 16 / p90 38). */
  sentenceSpanWords: number;
  /** 최단 문장 단어 수. 기출 중앙 10, 8 이하인 지문이 30%. */
  shortestSentenceWords: number;
  /** 담화표지 17종 매칭 수 / 문장 수. 기출 중앙 0.12, p90 0.33, 0개인 지문이 40%. */
  connectiveDensity: number;
  /** -tion/-ment/-ity 등으로 끝나는 단어 비율(%). 기출 중앙 5.2%. */
  nominalRatioPercent: number;
}

/** 약속한 단어/어법이 본문에 실제로 들어갔는지 대조한 결과. */
export interface CoverageCheck {
  label: string;
  /** 본문에서 실제로 발견됐는지. */
  hit: boolean;
  /** 발견 횟수. */
  count: number;
}

export interface AuthoringCoverage {
  /** 단어장 자료의 표제어 대조 — 있을 때만 채워진다. */
  words: CoverageCheck[];
  /** 모델이 "넣었다"고 보고한 어법 포인트(대조 불가 — 라벨 그대로). */
  grammarPoints: string[];
  /** 단어장 표제어 총 개수 대비 사용률(0~100). 단어장이 없으면 null. */
  wordCoveragePercent: number | null;
  // ── 분모 정직성 ──────────────────────────────────────────────────────────
  // words 배열은 클리핑·상한을 거친 뒤의 표제어만 담는다. 그 배열만 보고 "200개 중
  // 3개(2%)"라고 적으면, 512개짜리 단어장을 올린 선생님에게는 거짓말이 된다.
  // 아래 둘이 있어야 "올리신 단어장 앞 200개만 대조했어요(전체 512개)"를 쓸 수 있다.
  /** 클리핑 전 원본 자료에서 감지한 총 표제어 수. */
  termsTotalDetected?: number;
  /** 200개 상한이나 예산 절단이 실제로 걸렸는지. */
  termsTruncated?: boolean;
}

/** 결과 1편 — API 응답·잡 result·클라이언트 스토어가 공유하는 최종 형태. */
export interface AuthoringResultItem {
  /** 결과 식별자(클라이언트 키·부분 재생성 대상 지정에 쓴다). */
  id: string;
  index: number;
  status: "OK" | "FAILED";
  title: string;
  passage: string;
  koreanSummary: string;
  rationale: string;
  topicLabel: string;
  metrics: PassageMetrics;
  coverage: AuthoringCoverage;
  /**
   * 모델이 본문보다 먼저 적은 설계. 결과 카드 최상단 plan 블록이 이걸 그린다.
   * 메타 필드라 비어 있어도 결과를 실패로 만들지 않는다(결정론 폴백) —
   * 지문 본문이 멀쩡한데 설계 한 줄이 비었다고 크레딧을 태울 이유가 없다.
   */
  plan?: PassagePlan;
  /** 근거로 실제 사용한 자료 id (요청 materials 의 id). */
  usedMaterialIds: string[];
  /**
   * 자료 id → 이번 편에 실제로 실린 글자 수 / 그 자료의 전체 글자 수.
   * "자료 N건 반영"이라는 모호한 문장을 "자료 2건 전달 · 3,000/13,786자"라는
   * 사실로 바꾼다. 자료 검토 모달의 전달 분량 게이지도 실행 후 이 값으로 확정된다
   * (실행 전에는 클라이언트가 같은 예산표로 예측만 한다).
   */
  perMaterialCharsSent?: Record<string, { sent: number; total: number }>;
  /** 배치 후처리에서 붙는 표시용 경고(소재 중복 등). 차단하지 않는다. */
  warnings?: string[];
  /** 실패 시 사용자에게 보여줄 메시지. */
  error?: string;
}

/** 잡 row 의 `result` JSON 형태. */
export interface AuthoringJobResult {
  items: AuthoringResultItem[];
  /**
   * 생성에 쓴 요청 스냅샷 — 스튜디오를 다시 열었을 때 복원한다.
   * 이게 없으면 복구된 실행이 기본값 spec 으로 되살아나고, 그 가짜 값이 결과 모달
   * 헤더·목표 대비 %·후속 요청까지 전부 계산한다(표시 금액과 청구가 어긋난다).
   */
  request?: {
    instruction: string;
    spec: AuthoringSpec;
    count: number;
    /** 편별로 실제 배분된 골격 코드. index 순서 = items 의 index 순서. */
    skeletons?: PassageSkeleton[];
    materials: Array<{
      id: string;
      role: MaterialRole;
      name: string;
      sourceKind: MaterialSourceKind;
      note: string;
      /** 본문은 잡에 통째로 싣지 않는다 — 미리보기 200자만. */
      preview: string;
      /** 원본 페이지 이미지를 함께 보냈는지(하이브리드). */
      sendPages?: boolean;
      /** 이 자료에서 이번 실행에 실린 글자 수 / 전체 글자 수. */
      charsSent?: { sent: number; total: number };
    }>;
  };
}

// ── §6. 잡 도메인·라벨 ─────────────────────────────────────────────────────

/** WorkbenchAiJob.domain 값. 마이그레이션 불필요(domain 은 String). */
export const AI_PASSAGE_AUTHORING_JOB_DOMAIN = "PASSAGE_AUTHORING";

/** 잡 카드 제목 — 자료·지시에서 결정론적으로 뽑는다. */
export function buildAuthoringJobTitle(req: {
  instruction: string;
  materials: Array<{ name: string; role: MaterialRole }>;
  count: number;
}): string {
  const instruction = req.instruction.trim().replace(/\s+/g, " ");
  if (instruction) {
    const head = instruction.length > 28 ? `${instruction.slice(0, 28)}…` : instruction;
    return `${head} · 지문 ${req.count}편`;
  }
  const named = req.materials.find((m) => m.name.trim());
  if (named) {
    const base = named.name.trim();
    const head = base.length > 24 ? `${base.slice(0, 24)}…` : base;
    return `${head} 기반 지문 ${req.count}편`;
  }
  const role = req.materials[0]?.role;
  if (role) return `${MATERIAL_ROLE_LABELS[role]} 기반 지문 ${req.count}편`;
  return `AI 지문 ${req.count}편`;
}

/** 생성본 Passage.tags 에 넣는 식별 태그 — 지문함에서 출처를 구분한다. */
export const AUTHORED_PASSAGE_TAG = "AI생성";

/**
 * 환불 실패 표식 — 서버가 잡 errorMessage 뒤에 덧대고, 화면이 그 존재만 보고
 * "환불 확인이 필요해요" 한 문장을 띄운다.
 *
 * ⚠️ **왜 run-job.ts 가 아니라 여기 사는가:**
 *   원래 계획(STEP 7-3 / 10-4)은 "run-job 이 export 하고 클라이언트가 import"
 *   였는데, run-job.ts 는 모듈 최상단에서 `node:crypto` · `@/lib/prisma` ·
 *   supabase 서비스 클라이언트를 끌어온다. `"use client"` 인 authoring-store-io
 *   가 그걸 import 하면 클라이언트 번들이 서버 전용 모듈을 해석하려다 빌드가
 *   깨진다. 그래서 임시로 store-io 가 문자열을 손코딩했고, 그 결과 판정 로직이
 *   두 벌(store-io / loading-cards)로 갈라졌다 — 계약이 막으려던 바로 그 상태다.
 *   schema.ts 는 zod 만 import 하는 **순수 계약 파일**이라 서버·클라이언트가
 *   함께 읽을 수 있다. 정본을 여기 두고 run-job 은 re-export 한다(호출부 불변).
 * ⚠️ 문면을 바꾸면 **이미 저장된 잡 row 의 errorMessage 와 대조가 깨진다.**
 *   화면 문구는 glossary(CREDIT.refundCheck)가 따로 갖는다 — 이 값은 마커다.
 */
export const REFUND_CHECK_MARK =
  "크레딧 환불 확인이 필요합니다. 고객센터에 문의해 주세요.";
