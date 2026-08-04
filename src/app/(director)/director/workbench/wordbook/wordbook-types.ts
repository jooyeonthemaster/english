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
    label: "핵심 빈출",
    desc: "기능어를 뺀 빈도 상위 — 단어장의 기본 재료",
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
    label: "전체",
    desc: "코퍼스 전 표제어 — 필터 없음",
    filter: {},
    sort: "per10k",
  },
  {
    key: "sn",
    label: "수능 빈출",
    desc: "수능 본시험 출현 순 — 모평·학평과 분리",
    filter: { board: "수능", excludeStopwords: true },
    sort: "sn",
  },
  {
    key: "rising",
    label: "급증 추세",
    desc: "최근 연도로 갈수록 잦아지는 단어",
    filter: { trendLabels: ["급증"], excludeStopwords: true },
    sort: "per10k",
  },
  {
    key: "trap",
    label: "함정 다발",
    desc: "출현 대비 함정률 50% 이상 — 오답 지뢰밭",
    filter: { minTrapRate: 0.5, excludeStopwords: true },
    sort: "trapRate",
  },
  {
    key: "shift-era",
    label: "의미 이동 · 연대",
    desc: "2016년 전후로 지배 뜻이 바뀐 단어",
    shiftAxis: "era",
    filter: {},
    sort: "per10k",
  },
  {
    key: "shift-grade",
    label: "의미 이동 · 학년",
    desc: "고1과 고3에서 다른 뜻으로 나오는 단어",
    shiftAxis: "grade",
    filter: {},
    sort: "per10k",
  },
];

export const DEFAULT_LENS = WORDBOOK_LENSES[0];

// ── 정렬 라벨 (테이블 헤더·모바일 셀렉트 공용) ───────────────────────────────

export const WORDBOOK_SORT_LABELS: Record<WordbookSort, string> = {
  per10k: "빈도",
  occurrences: "출현",
  trapRate: "함정률",
  difficulty: "난이도",
  lemma: "철자",
  sn: "수능",
  mp: "모평",
  hp: "학평",
};
