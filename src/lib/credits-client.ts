/**
 * 클라이언트 크레딧 알림 버스.
 *
 * 크레딧이 소모/환급되는 작업(AI 생성 등)을 호출한 직후 `notifyCreditsChanged()`를
 * 부르면, 사이드바 크레딧 뱃지가 60초 폴링을 기다리지 않고 **즉시** 잔액을 다시 받아
 * 변화 애니메이션(차감=빨강, 환급=파랑)을 보여준다.
 */
export const CREDITS_CHANGED_EVENT = "credits:changed";

/** 크레딧 잔액이 바뀌었을 수 있음을 사이드바 뱃지에 알린다(즉시 재조회 트리거). */
export function notifyCreditsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
}
