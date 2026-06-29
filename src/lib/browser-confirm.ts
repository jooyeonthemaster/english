/**
 * 커스텀 확인/경고 모달을 **브라우저 네이티브 경고창**(window.confirm)으로 대체하기 위한 헬퍼.
 *
 * 기존 커스텀 모달(ConfirmDialog·AlertDialog)의 제목/본문 텍스트를 그대로 전달한다.
 * 브라우저 제약상 버튼 라벨은 확인/취소로 고정되고 디자인은 입힐 수 없다.
 *
 * @param title       경고 제목 (모달의 title)
 * @param description 경고 본문 (모달의 description). 있으면 제목 아래 줄바꿈 후 표시.
 * @returns 사용자가 "확인"을 누르면 true, "취소"/닫기면 false. SSR 환경에서는 false.
 */
export function confirmNative(title: string, description?: string): boolean {
  if (typeof window === "undefined") return false;
  const message = description ? `${title}\n\n${description}` : title;
  return window.confirm(message);
}
