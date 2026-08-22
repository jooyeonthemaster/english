// ============================================================================
// 학습지 스터디 모드 — 타입 계약 정본 (플레인 모듈, 클라이언트 공유 가능)
//
// 배포된 학습지(WORKSHEET 과제)를 학생 폰·태블릿의 단계별 인터랙티브 학습
// 코스로 변환하는 레이어의 직렬화 가능한 계약. 규범 문서:
// docs/worksheet-study-spec.md — 여기 없는 필드를 임의 추가하지 않는다.
// 컴파일 규칙은 ./compile.ts, 채점은 ./grade.ts, 서버 조립은 ./server.ts(서버 전용).
// ============================================================================

// ── 설정 (StudyAssignment.payload.study) ────────────────────────────────────

export type StudyMode = "off" | "light" | "standard" | "intense";

export interface WorksheetStudyConfig {
  /** off = 원본 뷰어만(legacy 동작 그대로) */
  mode: StudyMode;
  /** true = 필수 스테이지 완료가 과제 완료 조건 (false 면 기존 "다 확인했습니다" 유지) */
  required: boolean;
  /**
   * 배포에 포함할 스테이지 화이트리스트 — 클래스 스튜디오 "모듈 단위 배포"용
   * (docs/class-studio-spec.md §7). 부재/빈 배열 = 프리셋 전체(현행 동작과 완전 동일).
   * 순서는 의미 없다(프리셋 순서가 학습 순서) — 필터로만 쓰인다.
   */
  stages?: StudyStageId[];
}

/** 스테이지 id 전수 — StudyStageId 유니온과 반드시 일치(런타임 검증·파스용 단일 정본). */
export const STUDY_STAGE_IDS = [
  "reading",
  "vocab-flash",
  "vocab-quiz",
  "vocab-match",
  "chunk",
  "grammar",
  "cloze",
  "order",
  "translation",
  "reproduction",
  "exam",
] as const satisfies readonly StudyStageId[];

const STAGE_ID_SET: ReadonlySet<string> = new Set(STUDY_STAGE_IDS);

/** stages 원시값 파스 — 유효 id 만, 중복 제거, 빈 결과는 undefined(=프리셋 전체). */
export function sanitizeStudyStages(raw: unknown): StudyStageId[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: StudyStageId[] = [];
  for (const v of raw) {
    if (typeof v === "string" && STAGE_ID_SET.has(v) && !out.includes(v as StudyStageId)) {
      out.push(v as StudyStageId);
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * payload.study 해석 — 기배포 과제(필드 부재)는 스터디를 제공하되 완료 규칙은
 * 기존 자기보고를 유지한다(무회귀). 손상값은 전부 기본값으로 강등.
 */
export function resolveStudyConfig(payload: unknown): WorksheetStudyConfig {
  const fallback: WorksheetStudyConfig = { mode: "standard", required: false };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fallback;
  const raw = (payload as { study?: unknown }).study;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const { mode, required, stages } = raw as {
    mode?: unknown;
    required?: unknown;
    stages?: unknown;
  };
  const validMode: StudyMode =
    mode === "off" || mode === "light" || mode === "standard" || mode === "intense"
      ? mode
      : "standard";
  const validStages = sanitizeStudyStages(stages);
  return {
    mode: validMode,
    required: required === true,
    ...(validStages ? { stages: validStages } : {}),
  };
}

// ── 어휘 시험 코퍼스 오답 자산 (docs/class-studio-spec.md §9) ────────────────
// 서버(vocab-assets.ts)가 기출 단어 코퍼스에서 사전 질의해 컴파일러에 주입한다.
// 컴파일러는 순수 유지 — 배열 순서는 서버가 결정론적으로 정렬해 보낸다.

export interface VocabDistractorAsset {
  /** 단어→뜻 방향 한국어 오답 후보 — 품사 정합·동의어 배제·결정론 정렬 완료 */
  koDistractors: string[];
  /** 뜻→단어 방향 영어 표제어 오답 후보 — 문항팩 검증분(동의어·어간공유 사전 배제)+혼동어 */
  enDistractors: string[];
  /** 정답과 동치인 한국어 표기 전부(같은 철자 전 sense) — 오답 풀에서 반드시 배제 */
  bannedKo: string[];
}

/** key = 표제어 normLite(소문자·공백 축약) */
export type VocabAssetMap = Record<string, VocabDistractorAsset>;

// ── 스테이지 ────────────────────────────────────────────────────────────────

export type StudyStageId =
  | "reading"
  | "vocab-flash"
  | "vocab-quiz"
  | "vocab-match"
  | "chunk"
  | "grammar"
  | "cloze"
  | "order"
  | "translation"
  | "reproduction"
  | "exam";

export type StudySkill =
  | "vocab"
  | "chunk"
  | "grammar"
  | "cloze"
  | "order"
  | "production"
  | "comprehension";

export interface StudyStage {
  id: StudyStageId;
  /** 명사형 제목 — "어휘 시험" */
  title: string;
  /** 한 줄 설명 (합니다체) */
  subtitle: string;
  /** 대표 스킬축 */
  skill: StudySkill;
  /** 1아이템 = 1화면 */
  items: StudyItem[];
  /** 예상 소요(분) */
  estMin: number;
  /** false = reading/flash — 점수 없이 완료만 기록 */
  graded: boolean;
}

export interface StudyPlan {
  planVersion: 1;
  taskId: string;
  reportTitle: string;
  /** 드리프트 감지용 — 콘텐츠·모드·seed 가 같으면 항상 같은 값 */
  planHash: string;
  /** hash(taskId) — 학생별 결정론 셔플 시드 */
  seedKey: number;
  mode: Exclude<StudyMode, "off">;
  /** 콘텐츠가 없는 스테이지는 컴파일 단계에서 제외됨 (빈 items 스테이지 금지) */
  stages: StudyStage[];
  totalItems: number;
  /** 표제어 → 뜻 — 결과 리포트 취약 단어장용 (vocabulary 섹션에서 파생) */
  vocabMeanings: Record<string, string>;
  /**
   * 배포 시 명시된 스테이지 화이트리스트(정렬본) — 부재 = 프리셋 전체 배포.
   * planIsViable 완화 판정(명시 배포는 채점 스테이지 ≥1)에 쓰인다 (class-studio-spec §7).
   */
  stageFilter?: StudyStageId[];
}

// ── 아이템 (discriminated union — 렌더러 계약) ──────────────────────────────

interface ItemBase {
  /** `${stageId}:${builder}:${n}` — plan 내 유일, 로그 조인 키 */
  key: string;
  skill: StudySkill;
  /** 취약 문장 히트맵용 (본문 문장 번호, 1-base) */
  sentenceNo?: number;
  /** 어휘 표제어 (취약 단어장용) */
  wordKey?: string;
  /** 어법 출제 포인트 코드 a–m */
  grammarCode?: string;
}

export type StudyChunk = { text: string; gloss?: string; role?: string };

export type StudyItem =
  | (ItemBase & {
      type: "read";
      /** 본문 문장 번호. 0 = 구조·요약 인트로 카드 */
      n: number;
      en: string;
      ko: string;
      chunks?: StudyChunk[];
    })
  | (ItemBase & {
      type: "flash";
      front: string;
      back: string;
      /** 발음·tier 등 보조 표기 */
      sub?: string;
      extra?: { synonyms?: string; antonyms?: string };
    })
  | (ItemBase & {
      type: "mc";
      prompt: string;
      /** true = prompt 를 영어 세리프(.gd-en)로 렌더 */
      promptEn?: boolean;
      /** 지문 참조 문항 — 접이식 지문 카드로 렌더 */
      passage?: string;
      choices: { label: string; text: string }[];
      answerLabel: string;
      explanation?: string;
    })
  | (ItemBase & {
      type: "match";
      leftHead: string;
      rightHead: string;
      left: string[];
      right: string[];
      /** answer[i] = left i 의 정답 right 인덱스 */
      answer: number[];
    })
  | (ItemBase & {
      type: "order";
      /** 한글 해석 힌트 (상시 노출) */
      ko?: string;
      /** 섞인 타일 (정답과 다른 순서 보장) */
      tiles: string[];
      /** 정답 문장 평문 */
      answer: string;
    })
  | (ItemBase & {
      type: "sentence-order";
      given?: { en: string; ko?: string };
      cards: { label: string; en: string; ko?: string }[];
      /** "B - A - C" 형식 라벨 시퀀스 */
      answer: string;
    })
  | (ItemBase & {
      type: "cloze";
      /** 문장 세그먼트 — 텍스트 조각 또는 빈칸(answerKey 인덱스) */
      segments: ({ t: string } | { blank: number })[];
      /** 탭 채움용 단어은행 칩 (정답 + 디코이, 셔플) */
      bank: string[];
      answerKey: string[];
      /** 우리말 뜻 단서 (있으면 상단 노출) */
      cue?: string;
    })
  | (ItemBase & {
      type: "ox";
      statement: string;
      /** true = 문장에 어법 오류가 있음 (정답 = X) */
      wrong: boolean;
      fixFrom?: string;
      fixTo?: string;
      explanation: string;
    })
  | (ItemBase & {
      type: "inline-choice";
      before: string;
      after: string;
      options: string[];
      answer: string;
      explanation?: string;
    })
  | (ItemBase & {
      type: "self-grade";
      en: string;
      modelKo: string;
    })
  | (ItemBase & {
      type: "typing";
      promptKo: string;
      answer: string;
      scaffold: "none" | "firstLetter" | "wordSlots";
      /** scaffold 렌더용 사전 계산 줄 (첫글자/슬롯) */
      hint?: string;
    });

export type StudyItemType = StudyItem["type"];

// ── 이벤트 (클라 → POST /api/g/study/[taskId]/events) ───────────────────────

export interface StudyItemEvent {
  itemKey: string;
  skill: StudySkill;
  sentenceNo?: number;
  wordKey?: string;
  grammarCode?: string;
  /** 1=첫 시도, 2=재도전 큐, 3+=복습 */
  attempt: number;
  /** 채점형 판정 */
  correct?: boolean;
  /** 자기채점형 (D=세모) */
  selfGrade?: "O" | "D" | "X";
  /** 학생 응답 요약 — 서버가 500자로 절단 */
  response?: string;
  timeMs: number;
  hintUsed: boolean;
}

// 성취 지표 계약(StudyMastery)은 채점 순수함수 모듈이 소유한다 — 여기서는 재수출만.
import type { StudyMastery } from "./grade";
export type { StudyMastery };

/** 진행 중 스테이지의 부분 진행 스냅샷 — 디렉터 매트릭스 "진행 n/m" 표기용 */
export interface StudyStageProgress {
  answered: number;
  total: number;
  firstCorrect: number;
  firstTotal: number;
}

/**
 * 스테이지의 첫 시도(attempt=1) 기록 — 중도 이탈 후 재입장 시 "이어 풀기" 복원용.
 * 플레이어는 이것으로 (1) 이미 푼 문항을 건너뛰고 (2) 첫 시도 판정을 되살려
 * 완주 점수가 이번 세션 분량만으로 계산되지 않게 한다.
 */
export interface StudyStageFirstAttempt {
  itemKey: string;
  correct?: boolean;
  selfGrade?: "O" | "D" | "X";
}

export interface StudyEventsRequest {
  stageId: StudyStageId;
  planHash: string;
  events: StudyItemEvent[];
  /** 스테이지 완주 시 — score 는 첫 시도 정답률(0~100) */
  stageDone?: { score: number; timeMs: number; firstCorrect: number; firstTotal: number };
  /** 현재 스테이지 부분 진행 — 매 플러시 동봉(spec §7.1) */
  progress?: StudyStageProgress;
}

export interface StudyEventsResponse {
  ok: boolean;
  /** 이번 플러시로 과제가 DONE 처리됐는지 */
  taskDone: boolean;
  /** 클라 plan 이 서버 최신 컴파일과 다름 — 기록은 저장됐고, 다음 입장 시 새 구성(spec §7.1) */
  planStale: boolean;
  summary: StudyStateSummary;
}

// ── 상태 (서버 → 허브/플레이어) ─────────────────────────────────────────────

export interface StudyStageState {
  status: "todo" | "in-progress" | "done";
  /** 최초 완주 시점의 첫 시도 정답률 (이후 재학습으로 갱신하지 않음) */
  score?: number;
  timeMs?: number;
  completedAt?: string;
  firstCorrect?: number;
  firstTotal?: number;
  /** in-progress 부분 진행 — 푼 문항 수 / 전체 문항 수 (spec §7.1) */
  answered?: number;
  total?: number;
  /** 이 스테이지의 마지막 활동 시각(ISO) — 라이브 표시용 */
  lastAt?: string;
}

export interface StudyWeakness {
  skills: Partial<Record<StudySkill, { correct: number; total: number }>>;
  /** key = String(sentenceNo) */
  sentences: Record<string, { correct: number; total: number }>;
  /** wrong > 0 만, wrong 내림차순 */
  words: { word: string; wrong: number; total: number }[];
  /** key = 어법 포인트 코드 */
  grammar: Record<string, { correct: number; total: number }>;
}

export interface StudyStateSummary {
  stages: Partial<Record<StudyStageId, StudyStageState>>;
  /**
   * 첫 시도 정답률(%) — 전 스테이지(진행 중 포함) 누적. 첫 시도 채점 0건이면 null.
   * 구 정의(완료 스테이지만 집계)는 부분 학습 학생을 100%로 보고해 폐기됐다
   * (docs/student-hub-uiux-2607-spec.md §3).
   */
  masteryPct: number | null;
  /** 정답률과 함께 읽어야 하는 진도·표본 — computeStudyMastery 반환 그대로 */
  mastery: StudyMastery;
  totalTimeMs: number;
  weakness: StudyWeakness | null;
  /** 플랜의 전체 스테이지(무채점 통독·카드 포함)가 전부 done 인지 — 과제 완료 조건 */
  requiredDone: boolean;
}

// ── 스테이지 메타 (허브·컴포저 미리보기 공용) ───────────────────────────────

export const STUDY_STAGE_META: Record<
  StudyStageId,
  { title: string; subtitle: string; skill: StudySkill; graded: boolean }
> = {
  reading: { title: "지문 통독", subtitle: "문장별 해석과 끊어읽기로 지문을 익힙니다", skill: "comprehension", graded: false },
  "vocab-flash": { title: "어휘 카드", subtitle: "핵심 어휘를 카드로 넘기며 외웁니다", skill: "vocab", graded: false },
  "vocab-quiz": { title: "어휘 시험", subtitle: "뜻과 단어를 골라 어휘를 점검합니다", skill: "vocab", graded: true },
  "vocab-match": { title: "동의어·반의어", subtitle: "짝이 되는 어휘를 연결합니다", skill: "vocab", graded: true },
  chunk: { title: "직독직해", subtitle: "의미 단위로 끊어 읽고 복원합니다", skill: "chunk", graded: true },
  grammar: { title: "어법 점검", subtitle: "이 지문의 어법 포인트를 확인합니다", skill: "grammar", graded: true },
  cloze: { title: "빈칸 복원", subtitle: "핵심 단어를 채워 본문을 복원합니다", skill: "cloze", graded: true },
  order: { title: "어순 배열", subtitle: "단어와 문장을 바른 순서로 배열합니다", skill: "order", graded: true },
  translation: { title: "해석 쓰기", subtitle: "영어 문장을 우리말로 해석해 봅니다", skill: "production", graded: true },
  reproduction: { title: "백지 영작", subtitle: "우리말만 보고 영어 문장을 복원합니다", skill: "production", graded: true },
  exam: { title: "실전 문제", subtitle: "수능형 문제로 마무리 점검합니다", skill: "comprehension", graded: true },
};

/** 스킬축 한글 라벨 — 리포트·교사면 공용 */
export const STUDY_SKILL_LABELS: Record<StudySkill, string> = {
  vocab: "어휘",
  chunk: "직독직해",
  grammar: "어법",
  cloze: "빈칸",
  order: "어순",
  production: "영작·해석",
  comprehension: "독해",
};
