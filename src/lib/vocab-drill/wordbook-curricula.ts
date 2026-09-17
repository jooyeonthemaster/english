// ============================================================================
// 추천 커리큘럼 정본 — 단어장 만들기 위저드 스텝1 갤러리
//
// 전 프리셋의 size 는 2026-08-10 활성 번들 v4537-761b9699 실측 풀 대비로
// 보정된 값이다(docs/wordbook-wizard-spec.md §4 — 고3 core+academic 3,309 ·
// 고1 basic+core 2,458 · 고2 core 2,484 · advanced 6,560 · 숙어+구동사 6,968 ·
// trapRate>0 뜻 11,276). 카드에는 정적 풀 숫자를 박지 않는다 — 위저드 스텝2의
// 라이브 카운트가 정본이다.
//
// 클라이언트 안전 파일 — 서버 의존 금지.
// ============================================================================

import type {
  WordbookOrderScheme,
  WordbookPlanBase,
} from "./wordbook-plan-types";

export type CurriculumAccent =
  | "blue"
  | "emerald"
  | "amber"
  | "purple"
  | "rose"
  | "slate";

export interface WordbookCurriculum {
  key: string;
  title: string;
  /** 카드 한 줄 소개 — 과장 금지, 실측 기반 표현만 */
  tagline: string;
  /** 누구에게 — "고3 · 수능 직전" 류 짧은 라벨 */
  audience: string;
  base: WordbookPlanBase;
  size: number;
  wordsPerDay: number;
  /** 학습 요일 집합(0=일~6=토) — 프리셋 기본 리듬 */
  studyDays: number[];
  order: WordbookOrderScheme;
  accent: CurriculumAccent;
}

/**
 * 공통 기본값 — 대표 뜻만(allSenses:false, 3상태 함정 — 반드시 명시) +
 * 기능어 배제. 숙어 프리셋만 excludePhrase 를 끈다(숙어가 곧 재료다).
 */
const COMMON: Pick<WordbookPlanBase, "allSenses" | "excludeStopwords"> = {
  allSenses: false,
  excludeStopwords: true,
};

export const WORDBOOK_CURRICULA: WordbookCurriculum[] = [
  {
    key: "suneung-final-1000",
    title: "수능 파이널 1000",
    tagline: "고3 기출에서 가장 자주 나온 핵심·학술 어휘 1,000개를 빈출순으로.",
    audience: "고3 · 수능 직전",
    base: { ...COMMON, grades: ["고3"], tiers: ["core", "academic"], excludePhrase: true },
    size: 1000,
    wordsPerDay: 40,
    studyDays: [0, 1, 2, 3, 4, 5, 6],
    order: "frequency",
    accent: "blue",
  },
  {
    key: "go1-first-600",
    title: "고1 첫 내신 기초 600",
    tagline: "고1 기출 기본·핵심 어휘를 쉬운 것부터 차근차근. 첫 단어장으로 알맞아요.",
    audience: "고1 · 기초",
    base: { ...COMMON, grades: ["고1"], tiers: ["basic", "core"], excludePhrase: true },
    size: 600,
    wordsPerDay: 20,
    studyDays: [1, 2, 3, 4, 5],
    order: "easy-first",
    accent: "emerald",
  },
  {
    key: "go2-core-800",
    title: "고2 실력 다지기 800",
    tagline: "고2 기출 핵심 어휘 800개. 내신과 모의고사 사이 실력을 메워줍니다.",
    audience: "고2 · 중위~상위",
    base: { ...COMMON, grades: ["고2"], tiers: ["core"], excludePhrase: true },
    size: 800,
    wordsPerDay: 25,
    studyDays: [1, 2, 3, 4, 5],
    order: "easy-first",
    accent: "emerald",
  },
  {
    key: "master-2000",
    title: "수능 핵심 마스터 2000",
    tagline: "25개년 기출 전체에서 뽑은 핵심+학술 2,000개. 수준별 계단으로 완성하는 장기 코스.",
    audience: "전 학년 · 장기 완성",
    base: { ...COMMON, tiers: ["core", "academic"], excludePhrase: true },
    size: 2000,
    wordsPerDay: 40,
    studyDays: [1, 2, 3, 4, 5],
    order: "tier-ladder",
    accent: "purple",
  },
  {
    key: "advanced-500",
    title: "고난도 어휘 정복 500",
    tagline: "변별력을 가르는 고난도 어휘만 500개. 1등급을 노리는 학생용.",
    audience: "상위권 · 심화",
    base: { ...COMMON, tiers: ["advanced"], difficulties: [4, 5], excludePhrase: true },
    size: 500,
    wordsPerDay: 20,
    studyDays: [1, 2, 3, 4, 5],
    order: "frequency",
    accent: "rose",
  },
  {
    key: "idiom-600",
    title: "숙어·구동사 완성 600",
    tagline: "기출에 실제로 나온 숙어와 구동사만 600개. 어휘·빈칸 문항의 단골 재료.",
    audience: "전 학년 · 숙어 보강",
    base: { allSenses: false, excludeStopwords: true, posList: ["idiom", "phrasal_verb"] },
    size: 600,
    wordsPerDay: 20,
    studyDays: [1, 2, 3, 4, 5],
    order: "frequency",
    accent: "amber",
  },
  {
    key: "trend-300",
    title: "요즘 뜨는 단어 300",
    tagline: "최근 시험일수록 자주 나오는 상승세 어휘 300개. 최신 경향 대비 속성 코스.",
    audience: "전 학년 · 최신 경향",
    base: { ...COMMON, trendLabels: ["급증", "신규 등장", "증가"], excludePhrase: true },
    size: 300,
    wordsPerDay: 15,
    studyDays: [1, 2, 3, 4, 5],
    order: "frequency",
    accent: "blue",
  },
  {
    key: "trap-400",
    title: "함정 집중 케어 400",
    tagline: "학생들이 뜻을 잘못 아는 함정 단어만 400개. 오답이 잦은 학생에게 처방하세요.",
    audience: "오답 잦은 학생",
    base: { ...COMMON, minTrapRate: 0.3, excludePhrase: true },
    size: 400,
    wordsPerDay: 20,
    studyDays: [1, 2, 3, 4, 5],
    order: "frequency",
    accent: "rose",
  },
];

export function findCurriculum(key: string | null): WordbookCurriculum | null {
  if (!key) return null;
  return WORDBOOK_CURRICULA.find((c) => c.key === key) ?? null;
}
