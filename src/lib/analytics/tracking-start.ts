// ============================================================================
// 유입 추적(1st-party analytics) 수집 시작 시각 — 빈 상태 문구의 단일 근거.
//
// 「유입 기록이 없다」의 이유는 두 가지뿐이고, 갈림길은 **가입일이 수집 시작보다
// 앞서는가**이다. 시작일을 화면에 하드코딩하면(구 acquisition-card.tsx:95·99 의
// "26-09-17") 배포가 밀리는 만큼 그 사이 가입한 학원에 틀린 이유가 붙는다.
//
// 값은 배포 시점에 env 로 박는다:
//   NEXT_PUBLIC_ANALYTICS_START_AT="2026-09-18T00:00:00+09:00"   (ISO 8601)
// 미설정이면 판정을 포기하고(=unknown) 두 가지 가능성을 모두 적는 중립 문구를 쓴다 —
// 틀린 단정보다 낫다.
// ============================================================================

export type SignupVsTracking = "before" | "after" | "unknown";

const RAW = process.env.NEXT_PUBLIC_ANALYTICS_START_AT;

/** 수집 시작 시각. env 미설정·형식 불량이면 null. */
export function analyticsStartAt(): Date | null {
  if (!RAW) return null;
  const d = new Date(RAW);
  return Number.isNaN(d.getTime()) ? null : d;
}

const KST_DAY = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
});

/** 화면 표기용 "26. 09. 18." (KST). 미설정이면 null. */
export function analyticsStartLabel(): string | null {
  const d = analyticsStartAt();
  return d ? KST_DAY.format(d) : null;
}

/** 이 가입이 수집 시작 이전인가 — 빈 상태 문구를 고르는 판정. */
export function signupVsTrackingStart(
  signedUpAt: string | Date | null | undefined,
): SignupVsTracking {
  const start = analyticsStartAt();
  if (!start || !signedUpAt) return "unknown";
  const at = signedUpAt instanceof Date ? signedUpAt : new Date(signedUpAt);
  if (Number.isNaN(at.getTime())) return "unknown";
  return at.getTime() < start.getTime() ? "before" : "after";
}
