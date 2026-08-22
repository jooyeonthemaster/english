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
      /**
       * 선지 = 한국어 뜻 4개(정답 위치 셔플).
       * · 런타임 조립(팩 없음): 같은 표제어의 다른 뜻 제외 규약.
       * · 팩 조립: 같은 표제어의 다른 뜻이 **의도적 함정**으로 들어올 수 있다 —
       *   그 경우 sentence(문맥 스템)가 반드시 함께 온다. 문맥 없이 내면
       *   이중정답이다(문항 자산 캠페인 서빙 계약 불변식).
       */
      options: string[];
      /** 팩 문맥 스템 — 대상 어절이 ____ 로 비워진 기출 문장(팩 조립 시에만) */
      sentence?: string | null;
      sourceLabel?: string | null;
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
  /**
   * 오답 해설 — 학생이 고른 그 오답이 왜 틀렸는지(팩 whyWrong).
   * 오답 제출 + 해당 선지의 팩 해설이 있을 때만 온다.
   */
  explanation?: string;
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
/**
 * 기출 범위 — "이 시험/이 지문에 실제로 나온 단어"로 모집단을 갈아끼우는 축.
 * 정본 질의는 lib/vocab-drill/wordbook-passages.ts(server-only)지만, 타입은
 * 덱 스펙에도 실리므로 순수 계약 파일인 여기에 둔다.
 *
 * ⚠️ `grades` 는 **그 시험이 치러진 학년**(고1 학평)이다. VocabDeckSpec.grades
 *    (= sense.gradeTop, "이 단어가 주로 나오는 학년")와 다른 축이니 섞지 마라.
 */
export interface VocabPassageScope {
  yearFrom?: number;
  yearTo?: number;
  /** 수능 | 모평 | 학평 (화면 라벨 — 질의 계층이 정본 표기로 바꾼다) */
  boards?: string[];
  /** 3월|4월|5월|6월|7월|8월|9월|10월|11월|12월|수능|예비 */
  exams?: string[];
  grades?: string[];
  /** 문항번호 구간 — 장문(41-42)은 겹침 판정 */
  qFrom?: number;
  qTo?: number;
  typeGroups?: string[];
  /** 시험지 통째 */
  examIds?: string[];
  /** 개별 지문 — 주면 다른 축보다 우선 */
  passageIds?: string[];
}

/**
 * 교재(시리즈) 표식 — 단어장 만들기 위저드 산출 덱에만 존재한다.
 * 같은 key 를 공유하는 덱들이 한 교재의 단계(1..total)다.
 *
 * ⚠️ 학생 트랙 허브 목록(lib/vocab-drill/decks.ts listActiveDecks)은 이 표식이
 * 있는 덱을 숨긴다 — 40단계 교재 하나가 학생 홈을 도배하지 않도록. 학생은
 * 시차 배포된 과제로만 단계 덱을 만난다.
 */
export interface VocabDeckSeriesMeta {
  /** 교재 식별자 — 위저드가 생성, 전 단계 덱 공유 */
  key: string;
  /** 교재 이름 — 덱 title(`교재 · N단계`)과 별개로 원제 보존 */
  title: string;
  /** 1-base 단계 번호 */
  index: number;
  total: number;
  /** 추천 커리큘럼 key (직접 설계면 없음) */
  curriculum?: string;
  /**
   * 학습 주기 — 전 단계 덱에 같은 사본. 표시·발송 리듬의 정본.
   * studyDays(0=일~6=토 요일 집합)가 신형 정본이고, daysPerWeek 는 그 길이
   * (구형 덱 호환·표시용). 구형(주5/7만 저장) 덱은 새니타이저가 요일 집합으로
   * 승격시킨다 — 산식 정본은 wordbook-plan-types.normalizeStudyDays 와 동형.
   */
  schedule?: {
    wordsPerDay: number;
    daysPerWeek: number;
    studyDays: number[];
    totalDays: number;
  };
}

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
  /**
   * 뜻 범위 3상태(적대검수 2026-08-04 — 스튜디오 조건형 덱의 풀이 화면과
   * 달랐던 critical의 봉합):
   *   undefined = 전 뜻 — 구형 덱·기본 덱의 기존 의미를 그대로 보존한다
   *   false     = 대표 뜻(senseOrder=0)만 — 스튜디오 탐색 기본값과 일치
   *   true      = 전 뜻 명시(스튜디오 「모든 뜻 보기」 상태의 저장)
   */
  allSenses?: boolean;
  /**
   * 기능어(the·of 류, constants.VOCAB_STOPWORDS) 배제 — 기본 덱 미리보기 실측
   * (2026-08-04): 「고1 핵심 200」 상위가 to·a·have 뜻들로 도배됐다.
   */
  excludeStopwords?: boolean;
  /**
   * 기출 범위 — 걸리면 덱 풀이 "그 범위에 나온 뜻"으로 좁혀지고, 대표 뜻 한정이
   * 자동 해제된다(지문에 실린 뜻이 그 지문이 가르치는 뜻이다 — content.ts 참조).
   */
  passage?: VocabPassageScope;
  limit?: number; // 기본 100 · 상한 500
  /** 교재(시리즈) 소속 표식 — 위저드 산출 덱에만. 풀 해석에는 관여하지 않는다 */
  series?: VocabDeckSeriesMeta;
}

const SCOPE_YEAR_MIN = 2003;
const SCOPE_YEAR_MAX = 2027;
const SCOPE_Q_MIN = 18;
const SCOPE_Q_MAX = 55;
/** id 배열 상한 — 무상한 배열이 그대로 IN 절이 되는 길을 막는다. */
const SCOPE_IDS_MAX = 500;

/** 코퍼스 실측 그대로 — 축이 늘면 여기부터 넓힌다. */
export const VOCAB_PASSAGE_BOARDS = ["수능", "모평", "학평"];
export const VOCAB_PASSAGE_EXAMS = [
  "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월",
  "수능", "예비",
];
export const VOCAB_PASSAGE_GRADES = ["고1", "고2", "고3"];
export const VOCAB_PASSAGE_TYPE_GROUPS = [
  "주장", "함축의미", "요지", "주제", "제목", "내용일치", "어법", "어휘",
  "빈칸추론", "무관한문장", "글의순서", "문장삽입", "요약문", "장문", "지칭",
];

/**
 * 기출 범위 새니타이즈 — 서버 액션(탐색·덱)이 **같은 함수**를 써야 한다.
 * 둘이 갈리면 스튜디오에서 만든 범위가 덱 저장에서 조용히 다른 뜻이 된다.
 */
export function sanitizeVocabPassageScope(
  input: unknown,
): VocabPassageScope | undefined {
  const r = (input && typeof input === "object" && !Array.isArray(input)
    ? input
    : null) as Record<string, unknown> | null;
  if (!r) return undefined;

  const int = (v: unknown, lo: number, hi: number): number | undefined =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(hi, Math.max(lo, Math.trunc(v)))
      : undefined;
  const strs = (v: unknown, cap: number, allow?: string[]): string[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const out = [
      ...new Set(
        v.filter(
          (x): x is string =>
            typeof x === "string" && !!x && x.length <= 80 &&
            (!allow || allow.includes(x)),
        ),
      ),
    ].slice(0, cap);
    return out.length ? out : undefined;
  };

  const s: VocabPassageScope = {};
  s.yearFrom = int(r.yearFrom, SCOPE_YEAR_MIN, SCOPE_YEAR_MAX);
  s.yearTo = int(r.yearTo, SCOPE_YEAR_MIN, SCOPE_YEAR_MAX);
  // 뒤집힌 구간은 슬라이더를 교차시킨 것 — 버리지 말고 바로잡는다.
  if (typeof s.yearFrom === "number" && typeof s.yearTo === "number" && s.yearFrom > s.yearTo) {
    [s.yearFrom, s.yearTo] = [s.yearTo, s.yearFrom];
  }
  s.qFrom = int(r.qFrom, SCOPE_Q_MIN, SCOPE_Q_MAX);
  s.qTo = int(r.qTo, SCOPE_Q_MIN, SCOPE_Q_MAX);
  if (typeof s.qFrom === "number" && typeof s.qTo === "number" && s.qFrom > s.qTo) {
    [s.qFrom, s.qTo] = [s.qTo, s.qFrom];
  }
  s.boards = strs(r.boards, 3, VOCAB_PASSAGE_BOARDS);
  s.exams = strs(r.exams, 12, VOCAB_PASSAGE_EXAMS);
  s.grades = strs(r.grades, 3, VOCAB_PASSAGE_GRADES);
  s.typeGroups = strs(r.typeGroups, 15, VOCAB_PASSAGE_TYPE_GROUPS);
  s.examIds = strs(r.examIds, SCOPE_IDS_MAX);
  s.passageIds = strs(r.passageIds, SCOPE_IDS_MAX);
  return hasVocabPassageScope(s) ? s : undefined;
}

/** 기출 범위가 실제로 걸려 있는가 — 빈 객체는 "제한 없음"이라 무시해야 한다. */
export function hasVocabPassageScope(s?: VocabPassageScope | null): boolean {
  if (!s) return false;
  return (
    typeof s.yearFrom === "number" ||
    typeof s.yearTo === "number" ||
    !!s.boards?.length ||
    !!s.exams?.length ||
    !!s.grades?.length ||
    typeof s.qFrom === "number" ||
    typeof s.qTo === "number" ||
    !!s.typeGroups?.length ||
    !!s.examIds?.length ||
    !!s.passageIds?.length
  );
}

/** 시리즈 상한 — 위저드·새니타이저·서버 검증이 같은 수를 본다.
 *  (2026-08-10: 60→120 — 2,000단어·월수금 118단계가 정상 사용이라 60이 낮았다.
 *   plan-types PLAN_UNITS_MAX 와 반드시 같은 값 유지.) */
export const SERIES_UNITS_MAX = 120;
export const SERIES_WORDS_PER_DAY_MIN = 5;
export const SERIES_WORDS_PER_DAY_MAX = 100;
export const SERIES_TOTAL_WORDS_MAX = 2500;

/**
 * 시리즈 표식 화이트리스트 — sanitizeDeckSpec(actions/decks.ts)이 spec.series 에
 * 그대로 태운다. 형상이 조금이라도 어긋나면 표식 전체를 버린다(반쪽 표식이
 * 그룹핑·배포 예약을 오염시키는 것보다 "일반 덱 취급"이 안전하다).
 */
export function sanitizeVocabDeckSeries(
  input: unknown,
): VocabDeckSeriesMeta | undefined {
  const r = (input && typeof input === "object" && !Array.isArray(input)
    ? input
    : null) as Record<string, unknown> | null;
  if (!r) return undefined;
  const int = (v: unknown, lo: number, hi: number): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && Math.trunc(v) === v && v >= lo && v <= hi
      ? v
      : undefined;
  const key = typeof r.key === "string" ? r.key.trim().slice(0, 40) : "";
  const title = typeof r.title === "string" ? r.title.trim().slice(0, 80) : "";
  const index = int(r.index, 1, SERIES_UNITS_MAX);
  const total = int(r.total, 1, SERIES_UNITS_MAX);
  if (!key || !title || index === undefined || total === undefined || index > total) {
    return undefined;
  }
  const meta: VocabDeckSeriesMeta = { key, title, index, total };
  if (typeof r.curriculum === "string" && r.curriculum.trim()) {
    meta.curriculum = r.curriculum.trim().slice(0, 40);
  }
  const s = (r.schedule && typeof r.schedule === "object" && !Array.isArray(r.schedule)
    ? r.schedule
    : null) as Record<string, unknown> | null;
  if (s) {
    const wordsPerDay = int(s.wordsPerDay, SERIES_WORDS_PER_DAY_MIN, SERIES_WORDS_PER_DAY_MAX);
    const totalDays = int(s.totalDays, 1, 120);
    // 신형: studyDays(요일 집합) / 구형: daysPerWeek 5|7 — 어느 쪽이든 요일
    // 집합으로 승격해 저장한다(plan-types.normalizeStudyDays 와 같은 규칙.
    // 여기서 직접 구현하는 이유: plan-types 가 이 파일을 임포트하므로 역방향
    // 값 임포트는 순환이 된다).
    let studyDays: number[] | undefined;
    if (Array.isArray(s.studyDays)) {
      const arr = [
        ...new Set(
          s.studyDays.filter(
            (d): d is number =>
              typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
          ),
        ),
      ].sort((a, b) => a - b);
      if (arr.length >= 1 && arr.length <= 7) studyDays = arr;
    }
    if (!studyDays) {
      const legacy = int(s.daysPerWeek, 1, 7);
      if (legacy !== undefined) {
        studyDays = legacy === 7 ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
      }
    }
    // 온전할 때만 싣는다 — 반쪽 스케줄은 발송 리듬을 틀리게 만든다.
    if (wordsPerDay !== undefined && totalDays !== undefined && studyDays) {
      meta.schedule = {
        wordsPerDay,
        daysPerWeek: studyDays.length,
        studyDays,
        totalDays,
      };
    }
  }
  return meta;
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
