// ============================================================================
// 단어장 만들기 위저드 — 셸↔스텝 계약 정본
//
// 스텝 컴포넌트는 StepProps(스텝5만 ReviewStepProps) **하나만** 받는다.
// 여기 없는 prop 을 추가하려면 감독(셸 소유자)이 이 파일을 먼저 개정해야 한다.
// 확정 스펙: docs/wordbook-wizard-spec.md §5
// ============================================================================

import {
  STUDY_DAYS_WEEKDAYS,
  todayKstDate,
  type WordbookOrderScheme,
  type WordbookPlan,
  type WordbookPlanBase,
} from "@/lib/vocab-drill/wordbook-plan-types";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export interface WizardState {
  step: WizardStep;
  /** 추천 커리큘럼 key | null(직접 설계·담은 단어) */
  curriculum: string | null;
  /** 담은 단어 모드 — null 이 아니면 base 대신 이 목록이 재료다 */
  sourceSenseIds: string[] | null;
  base: WordbookPlanBase;
  size: number;
  order: WordbookOrderScheme;
  /** 하루 학습량 = 단계(유닛) 크기 */
  wordsPerDay: number;
  /** 학습 요일 집합(0=일~6=토) — 월수금 = [1,3,5]. 정본 산식은 plan-types */
  studyDays: number[];
  /**
   * 학습 시작일("YYYY-MM-DD", 기본 오늘) — 스텝4 캘린더의 앵커.
   * 끝나는 날은 항상 파생값(wordsPerDay 에서 계산)이고, 캘린더에서 끝날을
   * 찍으면 반대로 wordsPerDay 가 역산된다. 보내기 화면의 시작일 초기값으로도
   * 흘러간다(WordbookPresetSeries.startDate).
   */
  startDate: string;
  title: string;
  subtitle: string;
}

/** 위저드 초기값 — 직접 설계 기본(스텝1에서 프리셋 선택 시 덮어쓴다) */
export function initialWizardState(): WizardState {
  return {
    step: 1,
    curriculum: null,
    sourceSenseIds: null,
    base: { allSenses: false, excludeStopwords: true, excludePhrase: true },
    size: 600,
    order: "easy-first",
    wordsPerDay: 20,
    studyDays: [...STUDY_DAYS_WEEKDAYS],
    startDate: todayKstDate(),
    title: "",
    subtitle: "",
  };
}

export interface StepProps {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  /** 스텝3 진입 시 셸이 계산 — 구성·수량이 바뀌면 requestPlan 으로 재계산 */
  plan: WordbookPlan | null;
  planLoading: boolean;
  /** 스텝2 라이브 카운트 (셸이 300ms 디바운스 fetch) */
  liveTotal: number | null;
  liveTotalLoading: boolean;
  requestPlan: () => void;
}

export interface WizardCreatedResult {
  seriesKey: string;
  deckIds: string[];
  totalWords: number;
  /** 1단계 덱 — 「1단계만 먼저 보내기」에 쓴다 */
  firstDeck: { id: string; title: string; senseCount: number };
}

/** 스텝1 전용 확장 — 담은 단어 카드 노출 여부·재료 */
export interface CurriculumStepProps extends StepProps {
  basketCount: number;
  basketSenseIds: string[];
}

/** 스텝5 전용 확장 — 생성 실행은 셸 푸터가, 이후 분기는 스텝5 화면이 담당.
 *  성공 화면은 **2택**(스펙 §11): 학생에게 보내기 / 나중에 보내기. */
export interface ReviewStepProps extends StepProps {
  creating: boolean;
  created: WizardCreatedResult | null;
  createError: string | null;
  /** 담은 단어 모드 여부(요약 문구 분기용) */
  basketMode: boolean;
  /** 「학생에게 보내기」 — 우측 슬라이드(교재 모드)로 인계 */
  onSendToStudents: () => void;
  onGotoManage: () => void;
}

// ── 스텝1 갤러리에서 쓰는 특수 선택지 key ────────────────────────────────────

/** 직접 설계 카드 */
export const CURRICULUM_CUSTOM = "__custom__";
/** 담은 단어로 만들기 카드 (바스켓 비어 있으면 숨김) */
export const CURRICULUM_BASKET = "__basket__";

// ── 공용 크기 프리셋 (스텝2·4 타일) ──────────────────────────────────────────

export const SIZE_PRESETS = [300, 600, 1000, 1500, 2000] as const;
export const WPD_PRESETS = [15, 20, 25, 30, 40, 50] as const;

// ── 공용 스타일 원자 (wordbook 관용구 — wordbook-ui.tsx 색 규약 준수) ────────

export const WIZARD_BTN_PRIMARY =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-6 text-[14px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400";
export const WIZARD_BTN_GHOST =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 text-[13.5px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
/** 선택형 타일 — 큼직하게(스펙 §7). selected 여부로 골라 쓴다 */
export const TILE_BASE =
  "rounded-xl border text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";
export const TILE_ON = "border-blue-600 ring-2 ring-blue-100 bg-blue-50/50";
export const TILE_OFF = "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50";
export const WIZARD_INPUT =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
