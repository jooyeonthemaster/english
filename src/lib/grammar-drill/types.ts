// ============================================================================
// 어법 드릴 — 콘텐츠 타입 정본 (SMOAT 모바일 어법 학습 툴)
//
// 콘텐츠는 코드 번들(src/data/grammar-drill/*.json)로 서버에만 상주하고,
// 클라이언트에는 큐 API가 화이트리스트 페이로드만 내려보낸다(정답 포함 여부는
// 채점 방식에 따라 다름 — 서술형은 서버 채점, 선택형은 즉시 피드백을 위해
// 제출 후 해설 반환).
//
// ID 규약:
//   unit    "u01" ~ "u12"
//   concept "u01-c1" ~ (유닛당 3~4개)
//   item    "u01-c1-ch-001" (ch=CHOICE, ox=OX, mu=MULTI_UNDERLINE,
//            ps=PASSAGE, wf=WRITE_FORM, wc=WRITE_CORRECT)
//
// 텍스트 마크업 규약(렌더러가 파싱):
//   {{blank}}                — 택일/서술형 빈칸 슬롯
//   [[1:token]] ~ [[5:token]] — 밑줄 ①~⑤ (MULTI_UNDERLINE / PASSAGE)
//   [[u:token]]              — 단일 밑줄 (OX / WRITE_CORRECT)
//   **word**                 — 강조(개념 예문에서 판단 포인트 하이라이트)
// ============================================================================

export type GrammarItemType =
  | "CHOICE" // 괄호 택일 (단문)
  | "OX" // 밑줄 정오 판단
  | "MULTI_UNDERLINE" // 문장·단락 밑줄 3~5개 중 틀린 것
  | "PASSAGE" // 수능 29번 실전 (지문 + 밑줄 ①~⑤)
  | "WRITE_FORM" // 서술형: 주어진 어형을 어법에 맞게 변형
  | "WRITE_CORRECT"; // 서술형: 틀린 부분 바르게 고쳐 쓰기

/** 1 기초 · 2 표준 · 3 심화 · 4 킬러(기출급) */
export type GrammarDifficulty = 1 | 2 | 3 | 4;

export interface GrammarItemBase {
  id: string;
  unitId: string;
  conceptId: string;
  type: GrammarItemType;
  difficulty: GrammarDifficulty;
  /** 함정 태그 — 취약점 분석 축 (예: "the-number-of", "inserted-clause") */
  trapTags: string[];
  /** [1단계 구조 힌트, 2단계 판단 규칙 힌트] — 합니다체 */
  hints: [string, string];
  /** 정답 해설 — 합니다체, 구조 근거에 이름을 붙여 제시 */
  explanation: string;
}

export interface ChoiceItem extends GrammarItemBase {
  type: "CHOICE";
  /** {{blank}} 슬롯 1개를 포함한 영어 문장 */
  stem: string;
  /** 보기 2~3개 — 슬롯에 들어갈 후보 */
  options: string[];
  /** 정답 options 인덱스 */
  answer: number;
  /** 한국어 번역(학습 보조) */
  translation: string;
}

export interface OxItem extends GrammarItemBase {
  type: "OX";
  /** [[u:...]] 밑줄 1개를 포함한 영어 문장 */
  sentence: string;
  /** 밑줄이 어법상 옳으면 true */
  isCorrect: boolean;
  /** isCorrect=false 일 때 바른 형태 */
  correction?: string;
  translation: string;
}

export interface MultiUnderlineItem extends GrammarItemBase {
  type: "MULTI_UNDERLINE";
  /** [[1:...]]~[[N:...]] 밑줄 3~5개를 포함한 짧은 단락(1~3문장) */
  text: string;
  /** 밑줄 개수 (3~5) */
  underlineCount: number;
  /** 틀린 밑줄 번호 (1-based) */
  answer: number;
  /** 정답 밑줄의 바른 형태 */
  correction: string;
  /** 밑줄별 판단 근거 — index 0 = ①, 합니다체 1줄씩 */
  rationales: string[];
}

export interface PassageItem extends GrammarItemBase {
  type: "PASSAGE";
  /** 지시문 (기본: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?") */
  directive: string;
  /** [[1:...]]~[[5:...]] 밑줄 5개를 포함한 6~8줄 지문 */
  text: string;
  answer: number;
  correction: string;
  /** 밑줄 ①~⑤ 각각의 판단 근거 — 합니다체 */
  rationales: string[];
  /** 각 밑줄이 검사하는 유닛 ID (복합 출제 추적) — 길이 5 */
  underlineUnits: string[];
  /** 지문 한국어 요지 1문장 */
  gist: string;
}

export interface WriteFormItem extends GrammarItemBase {
  type: "WRITE_FORM";
  /** {{blank}} 슬롯 1개를 포함한 영어 문장 */
  stem: string;
  /** 괄호로 제시할 기본형 (예: "study") */
  given: string;
  /** 허용 정답들(공백·대소문자 정규화 후 비교) — 첫 항목이 대표답 */
  acceptedAnswers: string[];
  translation: string;
}

export interface WriteCorrectItem extends GrammarItemBase {
  type: "WRITE_CORRECT";
  /** [[u:...]] 밑줄 1개(어법상 틀린 부분)를 포함한 영어 문장 */
  sentence: string;
  /** 밑줄의 틀린 표면형 */
  wrong: string;
  /** 허용 정답들 — 첫 항목이 대표답 */
  acceptedAnswers: string[];
  translation: string;
}

export type GrammarItem =
  | ChoiceItem
  | OxItem
  | MultiUnderlineItem
  | PassageItem
  | WriteFormItem
  | WriteCorrectItem;

// ── 개념 카드 ────────────────────────────────────────────────────────────────

export interface ConceptExample {
  /** 판단 포인트를 **강조** 마크업한 영어 예문 */
  en: string;
  ko: string;
  /** 예문 아래 한 줄 구조 주석 (예: "본동사 carries가 이미 있음 → 분사") */
  note?: string;
}

export interface ConceptRuleCard {
  rule: string; // 규칙 1줄 — 합니다체
  examples: ConceptExample[]; // 1~2개
}

export interface ConceptTrapCard {
  title: string; // 함정 이름 (예: "the number of는 단수")
  body: string; // 왜 틀리기 쉬운지 + 어떻게 판단하는지 — 합니다체
  example?: ConceptExample;
}

export interface GrammarConcept {
  id: string; // "u01-c1"
  unitId: string;
  order: number;
  title: string; // 미세개념 이름
  /** 개념 한 줄 요약 — 문제 화면 힌트 시트 상단에 노출 */
  oneLiner: string;
  /** 판단 알고리즘 — 순서 있는 단계들 (①②③ 렌더) */
  algorithm: string[];
  rules: ConceptRuleCard[];
  traps: ConceptTrapCard[];
  /** 이 개념과 자주 헷갈리는 개념 ID들 */
  confusableWith: string[];
}

// ── 유닛 ────────────────────────────────────────────────────────────────────

/**
 * 해금 그룹 — PART 0(기초)와 PART 1~3(판별)은 서로 독립된 순차 해금 트랙이다.
 * 기존 학생의 해금 곡선을 건드리지 않기 위한 무회귀 장치(docs/study-os-spec.md §2.1).
 */
export type UnlockGroup = "BASIC" | "JUDGE";

/**
 * 단계 집합 —
 *  FULL  : CONCEPT → DRILL → READING → WRITTEN → TEST → MASTERED (기존 판별 유닛)
 *  BASIC : CONCEPT → DRILL → MASTERED (기초 유닛 — 실전 독해·서술형 뱅크 없음)
 */
export type StageSet = "FULL" | "BASIC";

export interface GrammarUnit {
  id: string; // "u01" | "b01"
  order: number; // 그룹 내 순서 (1부터)
  part: 0 | 1 | 2 | 3; // 0 기초 골격 / 1 골격기 / 2 연결기 / 3 정밀기
  unlockGroup: UnlockGroup;
  stageSet: StageSet;
  title: string; // "동사 vs 준동사"
  subtitle: string; // 판단 본질 1구 (예: "문장의 본동사가 있는가")
  /**
   * 수능 출제율 1~5 (★ 개수). PART 0(기초)는 수능 판별 대상이 아니므로 null.
   * ⚠️ 출처 없는 빈도 숫자를 지어내지 않는다(docs/study-os-spec.md §2.3).
   */
  frequency: 1 | 2 | 3 | 4 | 5 | null;
  /** 30회분 선지 등장 추정 (표기용, 예: "약 28~30회"). PART 0는 도입 학년 표기. */
  frequencyNote: string;
  conceptIds: string[];
}

export interface GrammarPart {
  part: 0 | 1 | 2 | 3;
  name: string; // "기초 골격" | "골격기" | "연결기" | "정밀기"
  tagline: string; // "문장의 뼈대 판별" 등
  unitIds: string[];
}

// ── 번들 무결성 요약(빌드 검증 산출) ────────────────────────────────────────

export interface GrammarBundleStats {
  units: number;
  concepts: number;
  items: number;
  byType: Record<GrammarItemType, number>;
  byDifficulty: Record<GrammarDifficulty, number>;
}
