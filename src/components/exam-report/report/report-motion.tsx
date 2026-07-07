"use client";

// ============================================================================
// 학생 시험 리포트 — 스크롤 모션 (리빌·카운트업·차트 드로우온)
//
// 원칙: 기본 상태 = 전부 보임. 모션은 향상(enhancement)일 뿐이다.
//  - JS 오프/SSR/인쇄/reduced-motion 에서는 아무것도 숨겨지지 않는다.
//  - ReportMotionRoot 가 마운트 후에만 .rpt-motion 클래스를 부여하고, 그때부터
//    IntersectionObserver 로 .rpt-section 에 .is-inview 를 1회성 부여한다.
//  - 숨김 CSS 는 전부 `.rpt-motion` 하위 셀렉터 — 클래스가 없으면 존재하지 않는 규칙.
//
// 차트 드로우온 참여 규약(섹션 로컬 차트도 동일):
//  - 가로바: <div class="rpt-bar-fill" style={{ "--rpt-bar-w": "62%" }} /> —
//    width 는 CSS 가 var 로 그린다(인라인 width 금지).
//  - SVG 원호: <path class="rpt-draw-arc" pathLength={100}
//    style={{ "--rpt-arc": "62 100" }} /> — stroke-dasharray 는 CSS 가 var 로.
//  - SVG 폴리곤/영역: class="rpt-draw-poly" — 스케일+페이드 등장.
// ============================================================================

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** ReportDocument 가 <style> 로 주입한다. 다른 파일은 클래스로만 참여. */
export const REPORT_MOTION_CSS = `
/* ── 드로우온 기본값(모션 여부와 무관하게 항상 이 규칙이 실값을 그린다) ── */
.rpt-bar-fill { width: var(--rpt-bar-w, 0%); }
.rpt-draw-arc { stroke-dasharray: var(--rpt-arc, none); }

/* ── 리빌: .rpt-motion 이 붙었을 때만 숨김이 존재한다 ── */
.rpt-motion .rpt-section:not(.is-inview) [data-reveal] {
  opacity: 0;
  transform: translateY(14px);
}
.rpt-motion .rpt-section.is-inview [data-reveal] {
  opacity: 1;
  transform: none;
  transition: opacity 600ms ${EASE}, transform 600ms ${EASE};
  transition-delay: var(--reveal-delay, 0ms);
}

/* ── 차트 드로우온 ── */
.rpt-motion .rpt-section:not(.is-inview) .rpt-bar-fill { width: 0%; }
.rpt-motion .rpt-section.is-inview .rpt-bar-fill {
  transition: width 900ms ${EASE};
  transition-delay: 150ms;
}
.rpt-motion .rpt-section:not(.is-inview) .rpt-draw-arc { stroke-dasharray: 0 100; }
.rpt-motion .rpt-section.is-inview .rpt-draw-arc {
  transition: stroke-dasharray 900ms ${EASE};
  transition-delay: 150ms;
}
.rpt-motion .rpt-section .rpt-draw-poly {
  transform-box: fill-box;
  transform-origin: center;
}
.rpt-motion .rpt-section:not(.is-inview) .rpt-draw-poly {
  opacity: 0;
  transform: scale(0.72);
}
.rpt-motion .rpt-section.is-inview .rpt-draw-poly {
  opacity: 1;
  transform: scale(1);
  transition: opacity 700ms ease, transform 700ms ${EASE};
  transition-delay: 150ms;
}

/* ── 인쇄/모션 축소: 전부 강제 표시, 전이 없음 ── */
@media print {
  .rpt-motion [data-reveal] { opacity: 1 !important; transform: none !important; transition: none !important; }
  .rpt-motion .rpt-bar-fill { width: var(--rpt-bar-w, 0%) !important; transition: none !important; }
  .rpt-motion .rpt-draw-arc { stroke-dasharray: var(--rpt-arc, none) !important; transition: none !important; }
  .rpt-motion .rpt-draw-poly { opacity: 1 !important; transform: none !important; transition: none !important; }
}
@media (prefers-reduced-motion: reduce) {
  .rpt-motion [data-reveal] { opacity: 1 !important; transform: none !important; transition: none !important; }
  .rpt-motion .rpt-bar-fill { width: var(--rpt-bar-w, 0%) !important; transition: none !important; }
  .rpt-motion .rpt-draw-arc { stroke-dasharray: var(--rpt-arc, none) !important; transition: none !important; }
  .rpt-motion .rpt-draw-poly { opacity: 1 !important; transform: none !important; transition: none !important; }
}
`;

/**
 * 모션 스코프 루트 — 마운트 후 .rpt-motion 부여 + IO(threshold 0.15)로
 * .rpt-section 에 .is-inview 1회성 부여. 섹션 집합은 마운트 시점 기준으로 관측
 * (view/edit 모두 섹션 목록이 정적이라 MutationObserver 불요).
 */
export function ReportMotionRoot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // reduced-motion: .rpt-motion 자체를 붙이지 않는다 → 숨김 규칙 미존재.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.add("rpt-motion");

    const sections = Array.from(root.querySelectorAll<HTMLElement>(".rpt-section"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-inview");
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.15 },
    );
    for (const section of sections) io.observe(section);

    // 인쇄 직전 이중 안전망(미디어쿼리 외) — 미도달 섹션 강제 표시.
    const onBeforePrint = () => {
      for (const section of sections) section.classList.add("is-inview");
    };
    window.addEventListener("beforeprint", onBeforePrint);

    return () => {
      io.disconnect();
      window.removeEventListener("beforeprint", onBeforePrint);
      root.classList.remove("rpt-motion");
    };
  }, []);

  return (
    <div ref={ref} className="rpt-motion-root">
      {children}
    </div>
  );
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 카운트업 숫자 — SSR/초기 렌더 = 최종값(SEO·인쇄 안전). 마운트 후 뷰포트 진입
 * 시 0→값 rAF 재생(1회). reduced-motion/인쇄에서는 즉시 최종값.
 */
export function CountUp({
  value,
  format,
  durationMs = 900,
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // anim === null 이면 최종값(value)을 직표시 — SSR/재생 완료/모션 오프 전부 커버.
  const [anim, setAnim] = useState<number | null>(null);
  const playedRef = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    if (playedRef.current) return; // 1회성 — 재생 후에는 value 직표시
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      playedRef.current = true;
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        playedRef.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / durationMs);
          if (p < 1) {
            setAnim(value * easeOutCubic(p));
            rafRef.current = requestAnimationFrame(tick);
          } else {
            setAnim(null); // 종료 — 최종값 직표시로 복귀
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  // 인쇄 직전 최종값 스냅(진행 중 rAF 무력화).
  useEffect(() => {
    const onBeforePrint = () => {
      playedRef.current = true;
      cancelAnimationFrame(rafRef.current);
      setAnim(null);
    };
    window.addEventListener("beforeprint", onBeforePrint);
    return () => window.removeEventListener("beforeprint", onBeforePrint);
  }, []);

  const fmt = format ?? ((n: number) => String(Math.round(n)));
  return (
    <span ref={ref} className="tabular-nums">
      {fmt(anim ?? value)}
    </span>
  );
}
