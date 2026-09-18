// ============================================================================
// 관리자 화면 날짜·시각 「표시」 포매터 — 언제나 KST(Asia/Seoul).
//
// 왜 필요한가: Vercel 런타임은 UTC 라 `toLocaleDateString("ko-KR")` 에 timeZone 을
// 주지 않으면 SSR 이 만든 문자열이 KST 보다 하루/아홉 시간 이르게 찍힌다. 로컬 개발
// 머신은 KST 라 이 축은 눈으로는 절대 드러나지 않는다.
// (26-09-18 실측: staff.createdAt 이 UTC 15시 이후인 행 64건, academies 63건,
//  credit_top_ups.paidAt 6건 — 이 행들이 전부 하루 이르게 렌더된다.)
//
// 집계(SQL)의 KST 변환은 `AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'`(스펙 I1),
// 표시는 이 파일. 새 표시부는 반드시 여기를 쓴다 — 게이트
// `npx tsx scripts/analytics-gate-member-kst.ts`(TZ=UTC 로 실행)가 지킨다.
// ============================================================================

/** 관리자 화면 표시 시간대. 집계 쿼리의 DISPLAY_TIMEZONE 과 같은 값이어야 한다. */
export const DISPLAY_TIMEZONE = "Asia/Seoul";

/** 값이 없거나 파싱 불가일 때 쓰는 자리표시자. */
export const EMPTY_DATE = "—";

type DateLike = Date | string | number | null | undefined;

function toDate(value: DateLike): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Intl.DateTimeFormat 인스턴스 생성은 비싸다(표 수백 행 × 렌더). 모듈 수준에서 한 번만.
const KST_DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: DISPLAY_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const KST_DATETIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: DISPLAY_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const KST_DATETIME_SHORT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: DISPLAY_TIMEZONE,
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "2026. 07. 08." — 네 자리 연도 날짜. */
export function formatKstDate(value: DateLike): string {
  const d = toDate(value);
  return d ? KST_DATE.format(d) : EMPTY_DATE;
}

/** "2026. 07. 08. 08:41" — 네 자리 연도 날짜+시각. */
export function formatKstDateTime(value: DateLike): string {
  const d = toDate(value);
  return d ? KST_DATETIME.format(d) : EMPTY_DATE;
}

/** "26. 07. 08. 08:41" — 두 자리 연도(거래 이력처럼 열이 좁은 표). */
export function formatKstDateTimeShort(value: DateLike): string {
  const d = toDate(value);
  return d ? KST_DATETIME_SHORT.format(d) : EMPTY_DATE;
}
