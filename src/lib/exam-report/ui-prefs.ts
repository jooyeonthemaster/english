// ============================================================================
// 학생 시험 리포트 — 화면 선호값(서버·클라이언트 공용 상수)
//
// 26-09-01 구 「내신 리포트 관리」 탭을 허브로 통합하며 추가. 허브의 인테이크
// 패널 접힘 여부가 "목록 전용 뷰"를 대신하므로 새로고침 후에도 유지돼야 한다.
//
// localStorage 가 아니라 쿠키인 이유: HubClient 는 서버에서 SSR 되므로
// localStorage 로 초기값을 잡으면 서버 HTML 은 늘 "펼침"으로 그려진다 →
// 접어둔 사용자에게 700px 인테이크 패널이 한 번 번쩍인 뒤 접히고(플래시),
// 렌더 구조가 갈려 하이드레이션 불일치까지 난다. 쿠키는 서버 페이지가 읽어
// 초기값으로 주입할 수 있어 두 문제가 함께 사라진다. 허브 페이지는 이미
// getStaffSession() 으로 쿠키를 읽는 dynamic 라우트라 추가 비용이 없다.
//
// 이 값은 순수 화면 취향이라 민감정보가 아니다(httpOnly 불필요 — 오히려
// 클라이언트가 직접 써야 하므로 httpOnly 여선 안 된다).
// ============================================================================

/** 허브 인테이크 패널 접힘 여부 쿠키 이름. "1" = 접힘, 그 외 = 펼침(기본). */
export const INTAKE_COLLAPSED_COOKIE = "smoat_er_intake_collapsed";

/** 1년. 화면 취향이라 세션보다 오래 남기고, 만료돼도 기본값(펼침)으로 안전 복귀. */
const INTAKE_COLLAPSED_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * 쿠키 스코프 — 반드시 /director 로 좁힌다. path=/ 로 깔면 이 디렉터 전용 취향값이
 * 공개 SEO 페이지(/schools/**, /guides/** 등) 요청에까지 전부 따라붙어, 캐시되는
 * 공개 표면에 불필요한 요청 쿠키가 섞인다. 이 값을 읽는 곳은 director 허브 페이지
 * 하나뿐이라 /director 면 충분하다.
 * (훗날 /teacher 쪽 exam-report 라우트가 생기면 여기와 읽는 페이지를 함께 넓힐 것.)
 */
const INTAKE_COLLAPSED_PATH = "/director";

/** 쿠키 값 → 접힘 여부. 미설정·이상값은 모두 "펼침"(첫 방문자에게 업로드가 보여야 한다). */
export function parseIntakeCollapsed(raw: string | undefined | null): boolean {
  return raw === "1";
}

/**
 * 브라우저에서 접힘 선호값을 기록한다(클라이언트 전용 — document 접근).
 * SameSite=Lax: 같은 사이트 내비게이션에서만 필요하고 CSRF 표면이 없다.
 */
export function writeIntakeCollapsedCookie(collapsed: boolean): void {
  if (typeof document === "undefined") return;
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${INTAKE_COLLAPSED_COOKIE}=${collapsed ? "1" : "0"}; ` +
      `path=${INTAKE_COLLAPSED_PATH}; ` +
      `max-age=${INTAKE_COLLAPSED_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    /* 쿠키가 막혀 있으면 이번 세션 동안만 접힘이 유지된다(기능 손실 없음) */
  }
}
