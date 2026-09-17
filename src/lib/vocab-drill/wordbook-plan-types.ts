// ============================================================================
// 단어장 만들기 위저드 — 순수 계약(타입·산식·클램프)
//
// 이 파일은 **클라이언트에서 임포트해도 안전**해야 한다(서버 의존 0).
// 리졸버(질의)는 wordbook-plan.ts(server-only), 액션은
// actions/vocab-drill-admin/wordbook-wizard.ts 에 있다.
// 확정 스펙: docs/wordbook-wizard-spec.md
// ============================================================================

import type { VocabPassageScope } from "./payload";

/**
 * 단계(유닛) 정렬·분류 체계 — 탐색 질의(listWordbookSensesData)의 정렬축으로
 * 매핑된다. 2차 정렬은 질의 계층이 항상 per10k DESC 를 붙이므로(explore 정본)
 * easy-first/tier-ladder 도 "같은 급 안에서는 자주 나오는 순"이 보장된다.
 */
export type WordbookOrderScheme =
  | "easy-first" //   난이도 점수(1~5) 낮은 것부터 — 기초 다지기
  | "frequency" //    자주 나오는 것부터 — 효율 우선
  | "tier-ladder" //  어휘 급(기본어→핵심어→학술어→고난도어) 블록 계단
  | "mixed-pos" //    단계마다 품사 골고루 섞기
  | "pos-grouped" //  품사끼리 묶어서 차례로 (mixed-pos 의 반대)
  | "random"; //      선정은 빈출순, 순서만 무작위(시드 고정 셔플)

export const WORDBOOK_ORDER_SCHEMES: {
  key: WordbookOrderScheme;
  title: string;
  desc: string;
}[] = [
  {
    key: "easy-first",
    title: "쉬운 단어부터 차근차근",
    desc: "단어마다 매긴 난이도 점수(1~5)가 낮은 것부터 점점 어렵게. 기초를 다지는 학생에게 좋아요.",
  },
  {
    key: "frequency",
    title: "자주 나오는 단어부터",
    desc: "시험에 많이 나온 순서 그대로. 짧은 기간에 효율을 내야 할 때 좋아요.",
  },
  {
    key: "tier-ladder",
    title: "수준별 계단식",
    desc: "기본어 → 핵심어 → 학술어 → 고난도어, 어휘의 급을 한 계단씩 올라갑니다. 장기 완성형이에요.",
  },
  {
    key: "mixed-pos",
    title: "품사 골고루 섞기",
    desc: "매 단계에 명사·동사·형용사가 고르게 섞입니다. 단조로움을 막아줘요.",
  },
  {
    key: "pos-grouped",
    title: "품사별로 묶어서",
    desc: "명사 단계, 동사 단계처럼 같은 품사끼리 이어서 배웁니다. 품사 하나씩 집중 공략해요.",
  },
  {
    key: "random",
    title: "무작위로 섞기",
    desc: "자주 나오는 단어를 고르되 순서만 무작위로. 순서 암기에 기대는 습관을 막아줘요.",
  },
];

/** 스텝2가 만드는 풀 조건 — 탐색 필터(WordbookFilter)의 부분집합 */
export interface WordbookPlanBase {
  grades?: string[];
  tiers?: string[];
  difficulties?: number[];
  posList?: string[];
  trendLabels?: string[];
  excludePhrase?: boolean;
  excludeStopwords?: boolean;
  /**
   * 함정률 하한 — 덱 spec 에는 없는 탐색 전용 축이지만, 위저드는 plan 단계에서
   * senseIds 를 확정하므로 쓸 수 있다(최종 덱은 명시 목록).
   */
  minTrapRate?: number;
  /** 3상태 함정(payload.ts) — 위저드는 **항상 boolean 명시**. 기본 false(대표 뜻만) */
  allSenses?: boolean;
  passage?: VocabPassageScope;
}

export interface WordbookPlanInput {
  base: WordbookPlanBase;
  /** 담은 단어 모드 — 있으면 base 를 무시하고 이 목록만 재료로 쓴다 */
  sourceSenseIds?: string[];
  /** 총 단어 수 */
  size: number;
  /** 단계(유닛) 크기 = 하루 학습량 */
  wordsPerDay: number;
  /** 학습 요일 집합(0=일~6=토, 정렬·중복 없음) — 예: 월수금 = [1,3,5] */
  studyDays: number[];
  order: WordbookOrderScheme;
}

export interface WordbookUnitPlan {
  /** 1-base */
  index: number;
  title: string;
  senseIds: string[];
  count: number;
  /** 앞 6개 표본 */
  sample: { lemma: string; senseKo: string; pos: string }[];
  tierCounts: Record<string, number>;
  /** difficulty(1~5 정수) 평균, 소수 1자리. 빈 유닛이면 null */
  avgDifficulty: number | null;
}

export interface WordbookPlanSchedule {
  wordsPerDay: number;
  studyDays: number[];
  /** 학습일 수 = 단계 수 */
  totalDays: number;
  /** 쉬는 요일 감안 달력일 수(표시용 근사) */
  calendarDays: number;
}

export interface WordbookPlan {
  /** 조건에 걸린 전체(클램프 전) */
  totalMatched: number;
  /** min(size, totalMatched) — 실제 교재에 실리는 수 */
  totalPlanned: number;
  units: WordbookUnitPlan[];
  schedule: WordbookPlanSchedule;
  /** 한국어 문장 경고("조건에 맞는 단어가 요청보다 적습니다" 등) */
  warnings: string[];
}

// ── 클램프 정본 (서버·클라 같은 수를 본다) ──────────────────────────────────

export const PLAN_SIZE_MIN = 5;
export const PLAN_SIZE_MAX = 2500;
export const PLAN_WPD_MIN = 5;
export const PLAN_WPD_MAX = 100;
/**
 * 단계(=학습일=덱=과제) 상한 — 2026-08-10 실사용에서 60이 낮았다:
 * 2,000단어·월수금(주3일)이면 118단계가 **정상** 사용이다. 120이면
 * 2,500단어 기준 하루 최소 21개, 주1일 극단에서도 날짜 산식 가드(1200일) 안.
 * 발송 행 상한(SERIES_SEND_MAX_ROWS)과 함께 봐야 한다 — 120단계는 한 번에
 * 약 32명까지(초과는 반을 나눠 보내라는 안내가 뜬다).
 */
export const PLAN_UNITS_MAX = 120;

export function clampPlanSize(v: number): number {
  if (!Number.isFinite(v)) return 600;
  return Math.max(PLAN_SIZE_MIN, Math.min(PLAN_SIZE_MAX, Math.round(v)));
}

export function clampWordsPerDay(v: number): number {
  if (!Number.isFinite(v)) return 20;
  return Math.max(PLAN_WPD_MIN, Math.min(PLAN_WPD_MAX, Math.round(v)));
}

// ── 학습 요일 정본 (2026-08-10 개정 — 주5/7 이분법 → 요일 집합) ──────────────
//
// 표현: 0=일 ~ 6=토 의 정렬된 유일 배열. 학원 관례(월수금·화목토)를 그대로
// 담기 위해 도입했다. 저장(JSONB spec.series.schedule)에는 studyDays 가 정본이고
// daysPerWeek(=길이)를 구형 호환·표시용으로 병기한다 — 구형 덱(주5/7만 저장)은
// normalizeStudyDays 가 요일 집합으로 승격시킨다.

export const STUDY_DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
/** 평일(월~금) — 구형 daysPerWeek 5 의 등가 */
export const STUDY_DAYS_WEEKDAYS = [1, 2, 3, 4, 5] as const;
/** 매일 — 구형 daysPerWeek 7 의 등가 */
export const STUDY_DAYS_EVERYDAY = [0, 1, 2, 3, 4, 5, 6] as const;

/** 미지 입력 → 학습 요일 배열. 형상이 어긋나면 null(호출부가 폴백 결정). */
export function sanitizeStudyDays(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out = [
    ...new Set(
      v.filter(
        (d): d is number =>
          typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
      ),
    ),
  ].sort((a, b) => a - b);
  return out.length >= 1 && out.length <= 7 ? out : null;
}

/** 구형(daysPerWeek)·신형(studyDays) 혼재 스케줄 → 요일 집합 정본 */
export function normalizeStudyDays(input: {
  studyDays?: unknown;
  daysPerWeek?: unknown;
}): number[] {
  const direct = sanitizeStudyDays(input.studyDays);
  if (direct) return direct;
  return input.daysPerWeek === 7 ? [...STUDY_DAYS_EVERYDAY] : [...STUDY_DAYS_WEEKDAYS];
}

/** "매일" | "평일" | "월·수·금" — 요일 집합의 사람 말 */
export function studyDaysLabel(days: number[]): string {
  if (days.length === 7) return "매일";
  if (days.length === 5 && days.every((d, i) => d === STUDY_DAYS_WEEKDAYS[i])) {
    return "평일";
  }
  return days.map((d) => STUDY_DAY_LABELS[d] ?? "?").join("·");
}

/** "매일" | "평일마다" | "월·수·금마다" — 리듬 안내 문구용 */
export function studyDaysCadence(days: number[]): string {
  const label = studyDaysLabel(days);
  return label === "매일" ? "매일" : `${label}마다`;
}

/** "주 3일 (월·수·금)" — 요약·카드 한 줄 표기 */
export function studyDaysShort(days: number[]): string {
  const label = studyDaysLabel(days);
  if (label === "매일") return "주 7일 (매일)";
  return `주 ${days.length}일 (${label})`;
}

// ── 스케줄 산식 정본 (스텝 3·4·5 와 서버가 반드시 이 함수만 쓴다) ────────────

/** 학습일 수 = ceil(총 단어 / 하루 단어) */
export function planTotalDays(totalPlanned: number, wordsPerDay: number): number {
  return Math.max(1, Math.ceil(Math.max(0, totalPlanned) / Math.max(1, wordsPerDay)));
}

/**
 * 달력일 근사 — 주당 학습일 K이면 K학습일마다 쉬는 날 (7-K)일이 끼는 것으로
 * 본다(시작 요일 무관 근사 — 표시용 "약 N일/N주" 전용).
 */
export function planCalendarDays(totalDays: number, studyDays: number[]): number {
  const k = Math.max(1, Math.min(7, studyDays.length));
  if (k === 7) return totalDays;
  return totalDays + Math.floor((totalDays - 1) / k) * (7 - k);
}

/** "약 7주 과정 · 학습일 34일" 류 요약 문구 — 표시 문안 통일 */
export function formatPlanPeriod(totalDays: number, studyDays: number[]): string {
  const k = Math.max(1, Math.min(7, studyDays.length));
  const weeks = totalDays / k;
  if (totalDays <= k) return `${totalDays}일 과정`;
  const rounded = Math.round(weeks * 10) / 10;
  const weekLabel = Number.isInteger(rounded) ? `${rounded}주` : `약 ${Math.ceil(weeks)}주`;
  return `${weekLabel} 과정 · 학습일 ${totalDays}일`;
}

// ── 배포 예약 날짜 산식 (KST, date-fns 금지 규약 — 수제) ─────────────────────

/**
 * n(1-base)번째 학습일의 달력 날짜("YYYY-MM-DD") — startDate 포함 전진.
 * studyDays 에 없는 요일은 건너뛴다(시작일이 쉬는 요일이면 다음 학습 요일부터).
 * 날짜 문자열만 다루므로 시간대 안전(자정 인스턴트 변환은 호출부가 +09:00 로).
 */
export function nthStudyDate(
  startDate: string,
  n: number,
  studyDays: number[],
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  if (!m) throw new Error(`잘못된 시작일: ${startDate}`);
  const set = new Set(
    sanitizeStudyDays(studyDays) ?? [...STUDY_DAYS_WEEKDAYS],
  );
  // UTC 정오 기준으로 굴린다 — DST/시간대에 날짜가 밀리지 않는다.
  const cur = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  let remaining = Math.max(1, Math.trunc(n));
  for (let guard = 0; guard < 1200; guard += 1) {
    if (set.has(cur.getUTCDay())) {
      remaining -= 1;
      if (remaining === 0) {
        const y = cur.getUTCFullYear();
        const mo = String(cur.getUTCMonth() + 1).padStart(2, "0");
        const d = String(cur.getUTCDate()).padStart(2, "0");
        return `${y}-${mo}-${d}`;
      }
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  throw new Error("학습일 계산이 범위를 벗어났습니다.");
}

/** 오늘 날짜 "YYYY-MM-DD" (KST 고정 — 브라우저/서버 시간대에 흔들리지 않게) */
export function todayKstDate(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
