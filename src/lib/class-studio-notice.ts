// ============================================================================
// 「클래스 스튜디오」 신규 오픈 공지 — 1회 노출 판정 (26-08-22)
//
// 로그인 후 진입점이 문제 생성 → /director/studio 로 바뀐 것을 알리는 공지의
// 저장·억제 축. 원장 레이아웃 어디서 첫 로드가 일어나든 브라우저당 딱 한 번만
// 뜬다.
//
// ⚠️ 두 소비자가 이 판정을 **동기적으로** 읽는다 — 마운트 순서에 의존하지
// 않기 위해서다.
//   1) class-studio-launch-notice.tsx : 자기 개방 여부
//   2) studio/tour/engine.tsx         : 첫 방문 자동 환영 **유예** 여부
// 스튜디오 첫 방문은 공지와 투어 환영 카드가 같은 순간을 노린다. 공지가 미열람인
// 동안 투어는 자동 개방을 미루고, 공지의 [둘러보기] 가 TOUR_OPEN_EVENT 로 직접
// 넘겨준다(수동 개방은 언제나 허용). 공지를 닫았다면 다음 스튜디오 방문에서
// 투어 환영이 평소대로 뜬다.
// ============================================================================

export const CLASS_STUDIO_NOTICE_KEY = "smoat:notice:class-studio-v1";

/**
 * 아직 공지를 띄워야 하는가.
 *
 * webdriver 억제는 선택이 아니라 필수다 — 원장 레이아웃 전역에 뜨는 모달이라
 * 억제가 없으면 빈 localStorage 로 진입하는 기존 QA 프로브 전량이 이 공지에
 * 가려 오조준한다(스튜디오 투어가 같은 이유로 webdriver 를 막는 것과 동형).
 */
export function classStudioNoticePending(): boolean {
  if (typeof window === "undefined") return false;
  if (navigator.webdriver) return false;
  try {
    return window.localStorage.getItem(CLASS_STUDIO_NOTICE_KEY) === null;
  } catch {
    // localStorage 불가 환경 — 매 로드 반복 노출보다 미노출이 낫다.
    return false;
  }
}

export function markClassStudioNoticeSeen(): void {
  try {
    window.localStorage.setItem(CLASS_STUDIO_NOTICE_KEY, "1");
  } catch {
    // 저장 실패해도 세션 내 닫힘은 컴포넌트 state 가 지킨다.
  }
}
