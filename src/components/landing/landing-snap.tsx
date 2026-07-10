"use client";

import { useEffect } from "react";

// 이동 애니메이션 + 트랙패드 관성 입력을 삼키는 잠금 시간(ms).
const LOCK_MS = 1000;
// 이 크기 미만의 휠 델타는 트랙패드 노이즈로 보고 무시한다.
const WHEEL_THRESHOLD = 12;
// 모바일 터치에서 이 거리보다 짧으면 탭/가벼운 흔들림으로 본다.
const TOUCH_THRESHOLD = 44;
// 섹션 상단에서 이 거리 안이면 "그 섹션에 정렬돼 있다"고 본다.
const ALIGN_TOL = 100;
const SNAP_IGNORE_SELECTOR =
  "[data-landing-demo], [role='dialog'], input, textarea, select, [contenteditable='true']";

/**
 * 랜딩(/) 전용 풀페이지 스크롤 — 휠 한 번에 정확히 한 섹션씩 이동.
 * - lg 이상은 휠/키보드 기반, 모바일/태블릿은 터치 제스처 기반으로 한 번에 한 섹션씩 이동.
 * - 첫 섹션 위·마지막 섹션 아래로는 네이티브 스크롤을 돌려줘 페이지 끝까지 갈 수 있다.
 * - 이동 중(잠금)에는 휠 입력을 삼켜 트랙패드 관성으로 두 섹션씩 넘어가는 것을 막는다.
 * - 마운트 시에만 켜고 언마운트 시 원복해 다른 페이지에 새지 않게 한다.
 */
export function LandingSnap() {
  useEffect(() => {
    const root = document.documentElement;
    const desktopMq = window.matchMedia("(min-width: 1024px)");
    const mobileMq = window.matchMedia("(max-width: 1023.98px)");
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    // 헤더 앵커(#section-*) 클릭도 부드럽게.
    const applyCss = () => {
      root.style.scrollBehavior =
        !prefersReduced.matches ? "smooth" : "";
    };

    const syncViewportHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      root.style.setProperty("--landing-vvh", `${Math.round(height)}px`);
    };

    let locked = false;
    let lockTimer: ReturnType<typeof setTimeout> | null = null;
    let touchStartY = 0;
    let touchStartX = 0;
    let touchStartScrollY = 0;
    let touchTracking = false;
    let touchPreventing = false;
    let mobileScrollTimer: ReturnType<typeof setTimeout> | null = null;

    const shouldIgnoreTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement && Boolean(target.closest(SNAP_IGNORE_SELECTOR));

    const snapOffset = () =>
      mobileMq.matches
        ? parseFloat(window.getComputedStyle(root).scrollPaddingTop) || 0
        : 0;

    const targetTops = (offset = 0) =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-snap]"))
        .map((el) => Math.round(el.getBoundingClientRect().top + window.scrollY - offset))
        .sort((a, b) => a - b);

    const go = (top: number) => {
      locked = true;
      window.scrollTo({
        top,
        behavior: prefersReduced.matches ? "auto" : "smooth",
      });
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = setTimeout(() => {
        locked = false;
      }, LOCK_MS);
    };

    // ── 푸터 자유 스크롤 존 ──────────────────────────────────────────────
    // 마지막 스냅 섹션(CTA) 아래 푸터(사업자 정보)가 화면에 보이는 동안에는
    // CSS mandatory 스냅과 JS 최근접 정렬을 모두 끈다. 켜둔 채로는 푸터에
    // 도달할 수 없거나(정지점 없음) 도달 후 빠져나올 수 없다(정지점 추가 시).
    const inFooterZone = () => {
      const footer = document.querySelector<HTMLElement>("[data-business-info]");
      if (!footer) return false;
      const viewportH = window.visualViewport?.height ?? window.innerHeight;
      return footer.getBoundingClientRect().top < viewportH - 1;
    };

    const syncSnapType = () => {
      if (!mobileMq.matches) {
        root.style.scrollSnapType = "";
        return;
      }
      root.style.scrollSnapType = inFooterZone() ? "none" : "";
    };

    const snapToNearestMobileTop = () => {
      if (!mobileMq.matches || prefersReduced.matches || locked) return;
      if (inFooterZone()) return; // 푸터 존에서는 되감지 않는다
      const tops = targetTops(snapOffset());
      if (tops.length === 0) return;
      const y = Math.round(window.scrollY);
      const nearest = tops.reduce((best, top) =>
        Math.abs(top - y) < Math.abs(best - y) ? top : best,
      );
      if (Math.abs(nearest - y) <= 4) return;
      go(nearest);
    };

    /**
     * 방향(1=아래, -1=위)에 따라 다음 목적지를 계산.
     * null이면 페이지 끝이라 네이티브 스크롤에 맡긴다.
     */
    const nextTop = (
      dir: 1 | -1,
      options?: { offset?: number; fromY?: number },
    ): number | null => {
      const offset = options?.offset ?? 0;
      const tops = targetTops(offset);
      if (tops.length === 0) return null;
      const y = Math.round(options?.fromY ?? window.scrollY);

      // 현재 섹션: 상단이 y+ALIGN_TOL 이하인 마지막 타깃.
      let idx = -1;
      for (let i = 0; i < tops.length; i++) {
        if (tops[i] <= y + ALIGN_TOL) idx = i;
      }

      if (dir === 1) {
        const next = idx + 1;
        return next <= tops.length - 1 ? tops[next] : null; // 마지막 아래는 네이티브
      }
      if (idx < 0) return null; // 첫 섹션 위는 네이티브
      // 섹션 중간까지 내려가 있으면 우선 그 섹션 상단으로 복귀.
      if (y > tops[idx] + ALIGN_TOL) return tops[idx];
      return idx > 0 ? tops[idx - 1] : null;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || prefersReduced.matches) return; // 핀치줌 / 모션 축소 제외
      // 인터랙티브 데모(자체 스크롤 영역) 안에서는 스냅을 끄고 네이티브 스크롤에 맡긴다.
      if (shouldIgnoreTarget(e.target)) return;
      if (!desktopMq.matches && !mobileMq.matches) return;

      if (locked) {
        e.preventDefault(); // 이동 중 관성 입력 삼키기
        return;
      }
      if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return;

      const offset = mobileMq.matches ? snapOffset() : 0;
      const dest = nextTop(e.deltaY > 0 ? 1 : -1, { offset });
      if (dest === null) return; // 페이지 양 끝은 자유 스크롤
      e.preventDefault();
      go(dest);
    };

    const onKey = (e: KeyboardEvent) => {
      if (!desktopMq.matches || locked) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const down = ["PageDown", "ArrowDown", " "].includes(e.key) && !e.shiftKey;
      const up = ["PageUp", "ArrowUp"].includes(e.key) || (e.key === " " && e.shiftKey);
      if (!down && !up) return;
      const dest = nextTop(down ? 1 : -1);
      if (dest === null) return;
      e.preventDefault();
      go(dest);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!mobileMq.matches || prefersReduced.matches || locked) return;
      if (shouldIgnoreTarget(e.target)) return;
      if (!(e.target instanceof HTMLElement)) return;
      if (!e.target.closest("[data-snap]")) return;
      const touch = e.touches[0];
      if (!touch) return;
      touchStartY = touch.clientY;
      touchStartX = touch.clientX;
      touchStartScrollY = window.scrollY;
      touchTracking = true;
      touchPreventing = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchTracking || !mobileMq.matches || prefersReduced.matches) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      const vertical = Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.15;
      if (!vertical) return;
      touchPreventing = true;
      e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchTracking || !mobileMq.matches || prefersReduced.matches) return;
      touchTracking = false;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      const vertical = Math.abs(dy) > Math.abs(dx) * 1.15;

      if (!touchPreventing || !vertical || Math.abs(dy) < TOUCH_THRESHOLD) return;
      const dir: 1 | -1 = dy < 0 ? 1 : -1;
      const dest = nextTop(dir, {
        offset: snapOffset(),
        fromY: touchStartScrollY,
      });
      if (dest === null) {
        // 마지막 섹션에서 아래로 스와이프 → 푸터(페이지 끝)로 글라이드.
        // touchmove 를 preventDefault 해 네이티브 관성이 죽으므로 직접 보낸다.
        if (dir === 1) {
          const max = root.scrollHeight - window.innerHeight;
          if (max > window.scrollY + 8) go(max);
        }
        return;
      }
      go(dest);
    };

    const onTouchCancel = () => {
      touchTracking = false;
      touchPreventing = false;
    };

    const onScroll = () => {
      if (!mobileMq.matches || prefersReduced.matches) return;
      syncSnapType(); // 푸터 존 진입/이탈에 따라 CSS 스냅 토글
      if (locked || touchTracking) return;
      if (mobileScrollTimer) clearTimeout(mobileScrollTimer);
      mobileScrollTimer = setTimeout(snapToNearestMobileTop, 140);
    };

    applyCss();
    syncViewportHeight();
    syncSnapType();
    desktopMq.addEventListener("change", applyCss);
    prefersReduced.addEventListener("change", applyCss);
    window.addEventListener("resize", syncViewportHeight, { passive: true });
    window.visualViewport?.addEventListener("resize", syncViewportHeight);
    window.visualViewport?.addEventListener("scroll", syncViewportHeight);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      desktopMq.removeEventListener("change", applyCss);
      prefersReduced.removeEventListener("change", applyCss);
      window.removeEventListener("resize", syncViewportHeight);
      window.visualViewport?.removeEventListener("resize", syncViewportHeight);
      window.visualViewport?.removeEventListener("scroll", syncViewportHeight);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
      window.removeEventListener("scroll", onScroll);
      if (lockTimer) clearTimeout(lockTimer);
      if (mobileScrollTimer) clearTimeout(mobileScrollTimer);
      root.style.scrollBehavior = "";
      root.style.scrollSnapType = "";
      root.style.removeProperty("--landing-vvh");
    };
  }, []);

  return null;
}
