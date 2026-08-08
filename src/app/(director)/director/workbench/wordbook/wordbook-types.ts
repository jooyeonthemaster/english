// ============================================================================
// 단어장 생성 스튜디오 — 클라이언트 공용 계약 (타입 재수출 + 렌즈 정의)
//
// 서버 질의 타입은 lib 이 정본이고 여기서는 **type 재수출**만 한다(런타임 무접촉
// — server-only 모듈이지만 type 은 컴파일 시 소거된다). 렌즈는 "필터+정렬의
// 저장된 시작점"이다 — 클릭 시 필터 상태를 통째로 교체하고, 이후 레일 수정은
// 자유(렌즈는 마지막 선택 표시로만 남는다).
// ============================================================================

import type {
  WordbookFilter,
  WordbookSort,
} from "@/lib/vocab-drill/wordbook-explore";

export type {
  WordbookBoard,
  WordbookFilter,
  WordbookOverview,
  WordbookPage,
  WordbookSenseRow,
  WordbookSort,
  WordbookSortDir,
} from "@/lib/vocab-drill/wordbook-explore";
export type {
  DossierConfusable,
  DossierExample,
  DossierSense,
  ShiftAxis,
  WordbookLemmaDossier,
  WordbookShiftRow,
} from "@/lib/vocab-drill/wordbook-dossier";
export type {
  PassageBoard,
  PassageFacetOption,
  PassageFacets,
  PassagePaper,
  PassageScopeSummary,
  PassageWordRow,
  WordbookPassageScope,
} from "@/lib/vocab-drill/wordbook-passages";

/** 바스켓 1행 — 담는 단위는 sense(뜻)다. 표시는 "lemma — senseKo". */
export interface WordbookBasketItem {
  senseId: string;
  lemmaId: string;
  lemma: string;
  pos: string;
  senseKo: string;
  tier: string;
  difficulty: number;
}

/** 덱 spec senseIds 상한(decks.ts LIMIT_MAX)과 동일 — 초과 담기 차단. */
export const BASKET_MAX = 500;

// ── 페이지네이션 ─────────────────────────────────────────────────────────────
//
// ⚠️ 페이지 크기는 **서버 OFFSET_MAX(20,000)를 나누어떨어져야 한다.**
//    (wordbook-explore.ts: offset 은 20,000 에서 침묵 클램프되고 total 도
//     min(n, OFFSET_MAX + limit) 로 잘린다.)
//    나누어떨어지지 않으면 마지막 페이지의 offset 이 상한을 넘어 클램프되고,
//    직전 페이지와 **같은 행이 다시 나온다**. 실측: 150개씩이면 총계는 135쪽인데
//    134쪽까지만 유효해 135쪽이 134쪽의 복사본이 된다.
//    20,000 / 50=400 · 80=250 · 100=200 · 200=100 — 넷 다 정수다.
export const WORDBOOK_PAGE_SIZES = [50, 80, 100, 200] as const;
export const WORDBOOK_PAGE_SIZE_DEFAULT = 80;
/** 서버 PAGE_SIZE_MAX 와 같아야 한다(초과 요청은 서버가 잘라 화면과 어긋난다). */
export const WORDBOOK_PAGE_SIZE_MAX = 200;

// ── 렌즈 ─────────────────────────────────────────────────────────────────────

export type WordbookLens =
  | "hot"
  | "all"
  | "sn"
  | "passage"
  | "rising"
  | "trap"
  | "shift-era"
  | "shift-grade";

export interface WordbookLensDef {
  key: WordbookLens;
  label: string;
  /** 레일 렌즈 항목 아래 한 줄 설명 */
  desc: string;
  /** shift 렌즈는 발굴 테이블로 전환 — filter/sort 미사용 */
  shiftAxis?: "era" | "grade";
  filter: WordbookFilter;
  sort: WordbookSort;
}

export const WORDBOOK_LENSES: readonly WordbookLensDef[] = [
  {
    key: "hot",
    label: "자주 나오는 단어",
    desc: "the·of 같은 기본 단어는 빼고, 시험에 자주 나온 순서입니다",
    filter: {
      // 내용어 품사만 — 전치사·접속사는 뜻 문항 가치가 없다(레일 칩에 그대로
      // 드러나므로 디렉터가 한 클릭으로 되돌릴 수 있는 정직한 기본값).
      posList: [
        "noun",
        "verb",
        "adjective",
        "adverb",
        "idiom",
        "phrasal_verb",
        "collocation",
      ],
      tiers: ["core", "academic"],
      difficulties: [2, 3, 4, 5],
      excludeStopwords: true,
    },
    sort: "per10k",
  },
  {
    key: "all",
    label: "전체 단어",
    desc: "기출에 나온 모든 단어를 조건 없이 봅니다",
    filter: {},
    sort: "per10k",
  },
  {
    key: "sn",
    label: "수능에 자주 나온 단어",
    desc: "수능 본시험 기준입니다. 모의고사는 따로 셉니다",
    filter: { board: "수능", excludeStopwords: true },
    sort: "sn",
  },
  {
    key: "passage",
    label: "기출 회차로 찾기",
    desc: "연도·시험을 골라 그 지문에 실제로 나온 단어만 봅니다",
    // 기본은 최근 3년 — 전 범위(4,537지문)로 열면 첫 화면이 "코퍼스 전체"와
    // 다를 게 없어 이 렌즈의 취지가 안 보인다. 넓히는 건 클릭 한 번이다.
    filter: {
      passage: { yearFrom: 2025, yearTo: 2027 },
      excludeStopwords: true,
    },
    // 이 렌즈의 기본 정렬은 **범위 안 출현 지문 수**다. per10k(코퍼스 전체 빈도)로
    // 두면 "그 범위에서 중요한 단어"가 아니라 "원래 흔한 단어"가 올라온다.
    sort: "scopeHits",
  },
  {
    key: "rising",
    label: "요즘 뜨는 단어",
    desc: "최근 시험일수록 더 자주 나오는 단어입니다",
    filter: { trendLabels: ["급증"], excludeStopwords: true },
    sort: "per10k",
  },
  {
    key: "trap",
    label: "헷갈리기 쉬운 단어",
    desc: "학생들이 뜻을 잘못 알기 쉬운 단어입니다",
    filter: { minTrapRate: 0.5, excludeStopwords: true },
    sort: "trapRate",
  },
  {
    key: "shift-era",
    label: "뜻이 달라진 단어 · 시기",
    desc: "예전 시험과 요즘 시험에서 다른 뜻으로 나옵니다",
    shiftAxis: "era",
    filter: {},
    sort: "per10k",
  },
  {
    key: "shift-grade",
    label: "뜻이 달라진 단어 · 학년",
    desc: "고1과 고3 시험에서 다른 뜻으로 나옵니다",
    shiftAxis: "grade",
    filter: {},
    sort: "per10k",
  },
];

export const DEFAULT_LENS = WORDBOOK_LENSES[0];

// ── 정렬 라벨 (테이블 헤더·모바일 셀렉트 공용) ───────────────────────────────

export const WORDBOOK_SORT_LABELS: Record<WordbookSort, string> = {
  per10k: "자주 나온 순",
  occurrences: "출현 횟수 순",
  trapRate: "헷갈림 순",
  difficulty: "어려운 순",
  lemma: "ABC순",
  senseKo: "뜻 가나다순",
  pos: "품사별",
  gradeTop: "학년별",
  tier: "수준별",
  trend: "요즘 뜨는 순",
  sn: "수능 출현 순",
  mp: "모평 출현 순",
  hp: "학평 출현 순",
  scopeHits: "고른 범위에 많이 나온 순",
};

/** 축별 첫 클릭 방향 — 서버(SORT_COLS.defaultDir)와 문자 일치해야 한다. */
export const WORDBOOK_SORT_DEFAULT_DIR: Record<WordbookSort, "asc" | "desc"> = {
  per10k: "desc",
  occurrences: "desc",
  trapRate: "desc",
  difficulty: "desc",
  lemma: "asc",
  senseKo: "asc",
  pos: "asc",
  gradeTop: "asc",
  tier: "desc",
  trend: "desc",
  sn: "desc",
  mp: "desc",
  hp: "desc",
  scopeHits: "desc",
};
