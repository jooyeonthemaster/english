// ============================================================================
// 경로 전환 후 <title> 이 채워질 때까지 기다리는 헬퍼 — 브라우저 전용.
// Next App Router 는 경로 전환과 같은 틱에는 새 metadata 를 커밋하지 않아 document.title 이 "" 다
// (실측: /faq→/about 이동 직후 GA4 page_view 의 page_title 이 빈 문자열).
// [감독 공용 헬퍼가 src/lib/analytics 에 들어오면 이 파일을 그것으로 교체한다 — U8-2]
// ============================================================================


const TITLE_WAIT_MS = 1000;

/**
 * 제목이 채워질 때까지 rAF 2회 → <title> 변경 감시(최대 1초) 후 콜백한다.
 * 끝까지 비면 그대로 콜백하고, 발사 쪽에서 page_title 을 생략한다(빈 문자열로 덮어쓰지 않는다).
 * 반환값은 취소 함수(경로가 또 바뀌면 호출할 것).
 */
export function whenTitleReady(cb: () => void): () => void {
  let done = false;
  let frames = 0;
  let rafId = 0;
  let timerId = 0;
  let observer: MutationObserver | null = null;

  const cleanup = () => {
    if (rafId) cancelAnimationFrame(rafId);
    if (timerId) clearTimeout(timerId);
    rafId = 0;
    timerId = 0;
    try {
      observer?.disconnect();
    } catch {
      // 무시
    }
    observer = null;
  };
  const finish = () => {
    if (done) return;
    done = true;
    cleanup();
    try {
      cb();
    } catch {
      // 추적 실패는 페이지에 영향 없음(I4)
    }
  };
  const tick = () => {
    rafId = 0;
    if (done) return;
    if (document.title) return finish();
    if (++frames < 2 && typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(tick);
      return;
    }
    try {
      observer = new MutationObserver(() => {
        if (document.title) finish();
      });
      observer.observe(document.head || document.documentElement, { childList: true, subtree: true, characterData: true });
    } catch {
      // MutationObserver 미지원 — 타임아웃만으로 처리
    }
    timerId = window.setTimeout(finish, TITLE_WAIT_MS);
  };

  try {
    if (typeof requestAnimationFrame === "function") rafId = requestAnimationFrame(tick);
    else timerId = window.setTimeout(tick, 0);
  } catch {
    finish();
  }
  return () => {
    done = true;
    cleanup();
  };
}
