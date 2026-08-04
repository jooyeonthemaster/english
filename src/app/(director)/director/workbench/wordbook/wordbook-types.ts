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
} from "@/lib/vocab-drill/wordbook-explore";
export type {
  DossierConfusable,
  DossierExample,
  DossierSense,
  ShiftAxis,
  WordbookLemmaDossier,
  WordbookShiftRow,
} from "@/lib/vocab-drill/wordbook-dossier";

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

// ── 렌즈 ─────────────────────────────────────────────────────────────────────

export type WordbookLens =
  | "hot"
  | "all"
  | "sn"
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
  sn: "수능 출현 순",
  mp: "모평 출현 순",
  hp: "학평 출현 순",
};
