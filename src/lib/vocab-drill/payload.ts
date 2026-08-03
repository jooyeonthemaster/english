// ============================================================================
// 단어 훈련 — 클라이언트 페이로드 계약 (서버·클라 공용 타입, server-only 금지)
//
// 원칙(어법 payload.ts 와 동일): 정답(senseKo·lemma)·함정 note 는 제출 전
// 클라이언트에 절대 내려가지 않는다. 채점은 서버(/api/vocab-drill/submit)가
// 하고, 판정과 함께 뜻·함정·예문 번역을 반환한다.
//
// 유일한 의도적 예외 — FLASH(학습 카드): LEARN 단계는 뜻을 보여주는 것이
// 목적이므로 카드 뒷면(senseKo·senseEn·예문)을 페이로드에 포함하고,
// 학생의 자기평가(O/X)를 제출받는다.
// ============================================================================

export type VocabDrillMode =
  | "learn" // 덱 LEARN 단계 — 플래시 카드(자기평가)
  | "drill" // 덱/전역 드릴 — 뜻·단어 고르기·철자 (box 난이도 창)
  | "context" // 문맥 채움 — 기출 예문 빈칸
  | "test" // 덱 시험 (12문항 고정 믹스, 통과 70점)
  | "review" // 복습 큐 — dueAt 만기 우선
  | "weak" // 취약 단어 — 숙달도 낮은 순
  | "assignment"; // 선생님 배정

export type VocabItemType =
  | "MEANING_CHOICE" // 표제어 → 뜻 고르기
  | "WORD_CHOICE" // 뜻 → 표제어 고르기
  | "CONTEXT_FILL" // 기출 예문 빈칸 → 표제어 고르기
  | "SPELL" // 뜻 → 철자 입력 (구·숙어 제외)
  | "EXAMPLE_MATCH" // 예문 ↔ 뜻 짝짓기 (다의어 전용)
  | "TRAP_JUDGE" // 예문 속 뜻 주장 O/X (다의어 함정)
  | "FLASH"; // 학습 카드 (자기평가)

export interface VocabClientItemBase {
  /** 큐 내 유일 키(React key 용) — senseId:type:순번 */
  id: string;
  senseId: string;
  lemmaId: string;
  pos: string;
  tier: string; // basic | core | academic | advanced
  difficulty: number; // 1~5
  type: VocabItemType;
  /**
   * 2단계 힌트 — 정답 미포함 계약. 큐 조립 시 서버가 생성한다.
   * (품사·첫 글자·마스킹된 예문 등 — **정답이 되는 표기는 절대 넣지 않는다**:
   *  뜻을 묻는 유형에 senseKo, 표제어를 묻는 유형에 lemma 를 넣으면 힌트가 곧 정답이다)
   */
  hints: [string, string];
}

/**
 * ★ lemma·senseKo 는 base 에 없다 — 유형마다 **무엇이 정답인지가 다르기 때문**이다.
 *   · 뜻을 묻는 유형(MEANING_CHOICE)  → lemma 는 문제, senseKo 는 정답 → lemma 만 싣는다
 *   · 표제어를 묻는 유형(WORD_CHOICE·CONTEXT_FILL·SPELL) → senseKo 는 문제, lemma 는 정답
 *     → **lemma 를 절대 싣지 않는다**(적대검수 2026-08-04: base 에 두어 정답이 평문으로 샜다)
 *   · 표제어가 문맥 자체인 유형(EXAMPLE_MATCH·TRAP_JUDGE·FLASH) → lemma 를 싣는다
 */
export type VocabClientItem =
  | (VocabClientItemBase & {
      type: "MEANING_CHOICE";
      lemma: string;
      /** 선지 = 한국어 뜻 4개(정답 위치 셔플). 같은 표제어의 다른 뜻은 제외 규약 */
      options: string[];
    })
  | (VocabClientItemBase & {
      type: "WORD_CHOICE";
      senseKo: string;
      senseEn: string;
      /** 선지 = 표제어 4개 */
      options: string[];
    })
  | (VocabClientItemBase & {
      type: "CONTEXT_FILL";
      exampleId: string;
      /** 기출 문장 — 대상 어절이 ____ 로 비워져 있다 */
      sentence: string;
      /** 출처 표시(예: "2024 고2 · 빈칸추론") */
      sourceLabel: string | null;
      options: string[];
    })
  | (VocabClientItemBase & {
      type: "SPELL";
      senseKo: string;
      senseEn: string;
      /** 글자 수(입력 칸 렌더링용) */
      length: number;
    })
  | (VocabClientItemBase & {
      type: "EXAMPLE_MATCH";
      lemma: string;
      /**
       * 같은 표제어의 서로 다른 뜻 3개 ↔ 예문 3개.
       * key·exampleId 는 **큐 한정 불투명 라벨**이다(전역 senseId 아님 — 라벨→실키
       * 매핑은 probe 토큰에만 있다. senseId 를 실으면 sense 상세로 짝을 역산할 수 있다).
       */
      senses: { key: string; senseKo: string }[];
      examples: { exampleId: string; sentence: string }[];
      /** 라벨↔실키 매핑 + 서빙한 짝 집합을 봉인한 채점 토큰 */
      probe: string;
    })
  | (VocabClientItemBase & {
      type: "TRAP_JUDGE";
      lemma: string;
      exampleId: string;
      sentence: string;
      sourceLabel: string | null;
      /** 이 문장에서 밑줄 단어의 뜻이라고 주장하는 한국어 — 맞을 수도, 다른 뜻일 수도 */
      claimKo: string;
      /** 채점 토큰 — 주장의 정오가 담기므로 **암호화**한다(서명만으론 디코딩된다) */
      probe: string;
    })
  | (VocabClientItemBase & {
      type: "FLASH";
      lemma: string;
      senseKo: string;
      senseEn: string;
      example: { en: string; ko: string } | null;
      collocations: string[];
    });

/** 학생 응답 — 유형별 직렬화 규약 */
export interface VocabSubmitBody {
  senseId: string;
  itemType: VocabItemType;
  /**
   * MEANING_CHOICE: 고른 뜻 텍스트
   * WORD_CHOICE / CONTEXT_FILL: 고른 표제어 텍스트
   * SPELL: 입력한 철자
   * EXAMPLE_MATCH: "exampleId:senseKey,exampleId:senseKey,…"
   * TRAP_JUDGE: "O" | "X"
   * FLASH: "O"(알았다) | "X"(몰랐다)
   */
  answer: string;
  timeMs: number;
  hintUsed: 0 | 1 | 2;
  source: string; // DRILL | FLASH | CONTEXT | REVIEW | DECK_TEST | MIXED | ASSIGNMENT
  deckId?: string;
  exampleId?: string;
  assignmentId?: string;
  /** TRAP_JUDGE 채점 토큰 회신 */
  probe?: string;
  /** 멱등 제출 키 — 클라 생성 UUID. 재시도·중복 전송 시 이중 계상 차단 */
  clientKey?: string;
}

export interface VocabSubmitVerdict {
  correct: boolean;
  lemma: string;
  pos: string;
  senseKo: string;
  senseEn: string;
  /** TRAP_JUDGE — 주장했던 뜻과 실제 뜻 */
  claimKo?: string;
  /** EXAMPLE_MATCH — 짝별 정오 */
  pairResults?: { exampleId: string; correct: boolean }[];
  /** 이 뜻에 달린 함정 노트(제출 후에만 공개) */
  traps: { kind: string; note: string }[];
  /** 대표 예문(en + 한국어 번역) */
  example: { en: string; ko: string } | null;
  mastery: {
    senseId: string;
    score: number;
    streak: number;
    box: number;
    dueAt: string | null;
  };
  xpGained: number;
  /** 이번 제출로 덱 단계가 전환됐으면 통지 */
  stageAdvanced?: { deckId: string; stage: string };
  /** clientKey 중복 제출이었다 — 숙달도·XP 재적용 없음 */
  duplicate?: boolean;
}

export interface VocabQueueResponse {
  mode: VocabDrillMode;
  items: VocabClientItem[];
  /** 헤더(예: "고2 핵심 500 — 드릴") */
  title: string;
  deckId?: string;
  /** assignment 모드: 남은 문항 수 */
  assignmentRemaining?: number;
}

/** 덱 = 저장된 질의. spec 이 소속 sense 를 매번 파생한다(멤버십 테이블 없음). */
export interface VocabDeckSpec {
  grades?: string[]; // 고1 | 고2 | 고3 (gradeTop 매칭)
  tiers?: string[]; // basic | core | academic | advanced
  difficulties?: number[]; // 1~5
  posList?: string[];
  trendLabels?: string[];
  minPer10k?: number;
  excludePhrase?: boolean;
  /** 명시 고정 목록 — 지정 시 다른 필터보다 우선 */
  senseIds?: string[];
  limit?: number; // 기본 100 · 상한 500
}

/** 덱 단계 — 어법 CONCEPT→…→MASTERED 의 단어판 */
export const VOCAB_DECK_STAGES = [
  "LEARN",
  "DRILL",
  "CONTEXT",
  "TEST",
  "MASTERED",
] as const;
export type VocabDeckStage = (typeof VOCAB_DECK_STAGES)[number];
