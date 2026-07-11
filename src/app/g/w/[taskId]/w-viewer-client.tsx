"use client";

// ============================================================================
// /g/w/[taskId] — 학습지 뷰어 클라이언트 (레이아웃 파괴 0 원칙)
//
// 문서는 디렉터와 동일한 A4 고정폭 렌더러를 읽기 전용으로 그대로 재사용한다
// (리플로우 금지 — PRIME 구문 SVG 연결선·Phase2 절대좌표 블록이 깨진다).
// 뷰포트 맞춤/줌은 CSS zoom 변수(--gw-zoom) 하나로만 구동한다:
//   - PRIME: .par-sheet 가 이미 읽는 --par-zoom 으로 위임(재페이지네이션 없음 —
//     측정용 .par-measure 는 zoom 영향권 밖). globals.css 의 모바일 --par-zoom
//     미디어쿼리는 !important 로 눌러 이중 축소를 차단한다(passage-report-thumb 전례).
//   - Phase2(pages/blocks): .gw-doc-pages 래퍼 zoom (PageCanvasFrame 은 zoom=1 고정
//     — 핀치 중 React 재렌더 없이 스타일 재계산만 발생).
// 핀치줌/더블탭(1x~3x)·팬은 스크롤 컨테이너에서 처리(뷰포트 user-scalable 이
// 꺼진 /g 특성상 커스텀 제스처). 인쇄는 각 렌더러의 인쇄 CSS + 최소 보정으로
// 문서 영역만 100% 크기로 나간다. 편집 크롬(사이드패널·툴바·contentEditable)은
// 어떤 경로로도 노출하지 않는다. 학생 노출 문구는 전부 합니다체.
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent as ReactTouchEvent,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Printer,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useWorksheetResume } from "@/app/g/q/[taskId]/use-q-draft";
import { AnalysisReportDocument } from "@/components/workbench/analysis-report/AnalysisReportDocument";
import { PageCanvasFrame } from "@/components/workbench/report-workspace/PageCanvas";
import { REPORT_WORKSPACE_STYLES } from "@/components/workbench/report-workspace/styles";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import type { ReportDocument } from "@/lib/passage-report/schema";

export type WorksheetViewerDoc =
  | { type: "PRIME"; report: AnalysisReport }
  | { type: "PAGES"; document: ReportDocument };

/** A4 한 장의 CSS px 폭(210mm @96dpi) — fit-width 계산용 */
const A4_WIDTH_PX = 210 * (96 / 25.4);
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

const GW_VIEWER_CSS = `
  /* 스크롤 컨테이너 — 팬은 브라우저에, 핀치는 커스텀 핸들러에 */
  .gw-scroll {
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-x pan-y;
  }
  .gw-iconbtn {
    display: flex; align-items: center; justify-content: center;
    width: 2.25rem; height: 2.25rem; border-radius: 9999px;
    color: var(--gd-ink-2);
  }
  /* disabled 에서도 버튼 형태가 소실되지 않도록 테두리 유지 + opacity 0.4 */
  .gw-iconbtn:disabled {
    opacity: 0.4;
    border: 1px solid var(--gd-line-strong);
  }

  /* PRIME — 시트 zoom 을 뷰어 변수로 구동. 모바일 미디어쿼리(--par-zoom)보다
     우선해야 이중 축소가 없다(globals.css passage-report-thumb 전례와 동일 수법). */
  .gw-doc-prime .par-root { --par-zoom: var(--gw-zoom, 1) !important; }
  /* Phase2 — 래퍼 zoom 하나로 전체 페이지 스택을 스케일(레이아웃 폭도 함께 변함). */
  .gw-doc-pages { zoom: var(--gw-zoom, 1); }

  @media print {
    @page { size: A4; margin: 0; }
    /* 상/하단 바·안내 밴드는 인쇄 제외 */
    .gw-chrome { display: none !important; }
    /* 뷰어 셸의 클리핑·고정 높이 해제 — 문서가 전체 페이지로 흐르게 */
    .gw-root, .gw-viewport, .gw-scroll, .gw-canvas, .gw-doc {
      position: static !important;
      display: block !important;
      overflow: visible !important;
      height: auto !important;
      max-height: none !important;
      width: auto !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }
    /* Phase2 문서 — 항상 100% 크기로 인쇄 (PRIME 은 자체 인쇄 CSS 가 zoom:1 강제) */
    .gw-doc-pages { zoom: 1 !important; }
    /* REPORT_WORKSPACE_STYLES 의 body * visibility:hidden 을 문서 영역만 되살림 */
    .gw-doc-pages, .gw-doc-pages * { visibility: visible !important; }
    .gw-doc-pages { position: absolute !important; left: 0; top: 0; width: 210mm !important; }
    .gw-doc-pages .report-page-canvas-frame {
      width: 210mm !important; height: 297mm !important; margin: 0 !important;
    }
  }
`;

export function WViewerClient({
  taskId,
  title,
  instructions,
  initialDone,
  doc,
}: {
  taskId: string;
  title: string;
  instructions: string | null;
  initialDone: boolean;
  doc: WorksheetViewerDoc;
}) {
  // ── 줌 상태 — fitScale(뷰포트 맞춤) × userZoom(1~3x 제스처) ────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [fitReady, setFitReady] = useState(false); // 첫 ResizeObserver 틱 — 이어보기 복원 게이트
  const [userZoom, setUserZoom] = useState(1);
  const userZoomRef = useRef(1);
  useEffect(() => {
    userZoomRef.current = userZoom;
  }, [userZoom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      setFitScale(Math.min(1, Math.max(0.2, (w - 24) / A4_WIDTH_PX)));
      setFitReady(true);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── 이어보기 — 스크롤·줌 위치 저장/복원은 공용 훅이 전담(기기 로컬, 30일) ──
  const { resumePillVisible } = useWorksheetResume({
    taskId,
    scrollRef,
    userZoom,
    userZoomRef,
    ready: fitReady,
    clampZoom,
    setUserZoom,
  });

  const zoom = Math.round(fitScale * userZoom * 10000) / 10000;

  // 초기 1회 확대 안내 힌트 — 3초 자동 소멸, 확대를 시작하면 즉시 소멸
  const [zoomHintVisible, setZoomHintVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setZoomHintVisible(false), 3000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (userZoom !== 1) setZoomHintVisible(false);
  }, [userZoom]);

  // ── 핀치 줌 — /g 뷰포트는 user-scalable=no 라 네이티브 핀치가 없다.
  //    touchmove 는 React 루트에서 passive 로 붙어 preventDefault 가 막히므로
  //    비-passive 네이티브 리스너로 직접 처리한다. ──────────────────────────
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const lastPinchEndRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      );
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = { startDist: dist(e.touches), startZoom: userZoomRef.current };
      }
    };
    const onMove = (e: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || e.touches.length !== 2 || pinch.startDist <= 0) return;
      e.preventDefault();
      setUserZoom(clampZoom(pinch.startZoom * (dist(e.touches) / pinch.startDist)));
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && pinchRef.current) {
        pinchRef.current = null;
        lastPinchEndRef.current = Date.now();
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  // ── 더블탭/더블클릭 — 1x ↔ 2x 토글 (연속 발화 350ms 디바운스) ─────────────
  const lastToggleRef = useRef(0);
  const toggleZoom = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleRef.current < 350) return;
    lastToggleRef.current = now;
    setUserZoom((z) => (z > 1.01 ? 1 : 2));
  }, []);

  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const onTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (e.touches.length > 0 || e.changedTouches.length !== 1) {
        lastTapRef.current = null;
        return;
      }
      if (Date.now() - lastPinchEndRef.current < 400) {
        lastTapRef.current = null;
        return;
      }
      const t = e.changedTouches[0];
      const now = Date.now();
      const last = lastTapRef.current;
      if (
        last &&
        now - last.t < 350 &&
        Math.hypot(t.clientX - last.x, t.clientY - last.y) < 40
      ) {
        lastTapRef.current = null;
        toggleZoom();
      } else {
        lastTapRef.current = { t: now, x: t.clientX, y: t.clientY };
      }
    },
    [toggleZoom],
  );

  // ── 인쇄 — 웹폰트 로드 완료 후(미로드 인쇄로 인한 준비 지연 방지) ──────────
  const handlePrint = useCallback(() => {
    if (typeof window === "undefined") return;
    void document.fonts.ready.then(() => window.print());
  }, []);

  // ── 안내문 — 긴 안내(40자 이상 또는 개행 포함)만 1줄 접힘 + 토글 ───────────
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const instructionsCollapsible =
    !!instructions && (instructions.length >= 40 || instructions.includes("\n"));

  // ── 완료 확인 ──────────────────────────────────────────────────────────────
  const [done, setDone] = useState(initialDone);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const complete = useCallback(async () => {
    setCompleting(true);
    setCompleteError(null);
    try {
      const res = await fetch(`/api/g/tasks/${taskId}/complete`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!res.ok || !json?.ok) throw new Error("COMPLETE_FAILED");
      setDone(true);
    } catch {
      setCompleteError("완료 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setCompleting(false);
    }
  }, [taskId]);

  // ── 문서 노드 — 줌은 CSS 변수로만 구동하므로 doc 변화 외 재렌더 없음 ────────
  const docNode = useMemo(() => {
    if (doc.type === "PRIME") {
      return (
        <div className="gw-doc gw-doc-prime">
          <AnalysisReportDocument report={doc.report} />
        </div>
      );
    }
    return (
      <div className="gw-doc gw-doc-pages flex flex-col items-center gap-4">
        <style dangerouslySetInnerHTML={{ __html: REPORT_WORKSPACE_STYLES }} />
        {doc.document.pages.map((page) => (
          <PageCanvasFrame key={page.id} page={page} zoom={1} mode="view" />
        ))}
      </div>
    );
  }, [doc]);

  // 상단 필 — 이어보기 안내(1.5초)가 확대 힌트보다 우선
  const topPill = resumePillVisible
    ? "지난번 보던 위치에서 이어서 봅니다"
    : zoomHintVisible
      ? "핀치나 버튼으로 확대할 수 있습니다"
      : null;

  return (
    <div className="gw-root flex h-dvh flex-col" style={{ background: "#e9e7e0" }}>
      <style dangerouslySetInnerHTML={{ __html: GW_VIEWER_CSS }} />

      {/* ── 상단 바 (고정) ── */}
      <header
        className="gw-chrome flex shrink-0 items-center gap-1.5 px-2.5 py-2"
        style={{ background: "var(--gd-card)", borderBottom: "1px solid var(--gd-line)" }}
      >
        <Link
          href="/g/tasks"
          aria-label="과제 목록으로 돌아가기"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ color: "var(--gd-ink-2)" }}
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="gd-label">학습지</p>
          <h1 className="gd-t-sm truncate font-bold tracking-tight">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setUserZoom((z) => clampZoom(z - ZOOM_STEP))}
            disabled={userZoom <= ZOOM_MIN}
            aria-label="축소"
            className="gw-iconbtn"
          >
            <ZoomOut className="h-4.5 w-4.5" strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setUserZoom(1)}
            aria-label="화면 폭에 맞춤"
            className="gd-mono gd-t-xs hidden h-9 min-w-[3.25rem] items-center justify-center rounded-lg font-semibold sm:flex"
            style={{ color: "var(--gd-ink-2)" }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setUserZoom((z) => clampZoom(z + ZOOM_STEP))}
            disabled={userZoom >= ZOOM_MAX}
            aria-label="확대"
            className="gw-iconbtn"
          >
            <ZoomIn className="h-4.5 w-4.5" strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="gd-btn gd-btn-ghost ml-1 px-3"
            style={{ minHeight: "2.5rem" }}
          >
            <Printer className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">인쇄/PDF</span>
          </button>
        </div>
      </header>

      {/* ── 선생님 안내문 — 짧은 안내는 상시 전문, 긴 안내는 1줄 접힘+토글 ── */}
      {instructions ? (
        <div
          className="gw-chrome shrink-0 px-4 py-2"
          style={{ background: "var(--gd-blue-soft)", borderBottom: "1px solid var(--gd-blue-line)" }}
        >
          {instructionsCollapsible ? (
            <button
              type="button"
              onClick={() => setInstructionsOpen((v) => !v)}
              aria-expanded={instructionsOpen}
              className="flex w-full items-start gap-1.5 text-left"
            >
              <p
                className={
                  instructionsOpen
                    ? "gd-t-xs min-w-0 flex-1 whitespace-pre-line"
                    : "gd-t-xs line-clamp-1 min-w-0 flex-1"
                }
                style={{ color: "var(--gd-ink-2)" }}
              >
                <span className="mr-1 font-semibold" style={{ color: "var(--gd-blue)" }}>
                  선생님 안내
                </span>
                {instructions}
              </p>
              <ChevronDown
                className={
                  instructionsOpen
                    ? "h-4 w-4 shrink-0 rotate-180 transition-transform"
                    : "h-4 w-4 shrink-0 transition-transform"
                }
                strokeWidth={1.75}
                style={{ color: "var(--gd-ink-3)" }}
                aria-hidden
              />
            </button>
          ) : (
            <p className="gd-t-xs whitespace-pre-line" style={{ color: "var(--gd-ink-2)" }}>
              <span className="mr-1 font-semibold" style={{ color: "var(--gd-blue)" }}>
                선생님 안내
              </span>
              {instructions}
            </p>
          )}
        </div>
      ) : null}

      {/* ── 문서 영역 (팬 스크롤 + 핀치/더블탭 줌) ── */}
      <div className="gw-viewport relative min-h-0 flex-1">
        {topPill ? (
          <div className="gw-chrome pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
            <p
              className="gd-t-2xs rounded-full px-3.5 py-1.5 text-center font-semibold shadow-md"
              style={{ background: "rgba(22, 32, 46, 0.88)", color: "#fff" }}
              role="status"
            >
              {topPill}
            </p>
          </div>
        ) : null}
        <div
          ref={scrollRef}
          className="gw-scroll h-full overflow-auto"
          onTouchEnd={onTouchEnd}
          onDoubleClick={toggleZoom}
        >
          <div
            className="gw-canvas mx-auto flex w-max min-w-full flex-col items-center px-3 py-4"
            style={{ "--gw-zoom": String(zoom) } as CSSProperties}
          >
            {docNode}
          </div>
        </div>
      </div>

      {/* ── 하단 고정 바 — 완료 확인 ── */}
      <footer
        className="gw-chrome gd-safe-b shrink-0 px-4 pt-3"
        style={{ background: "var(--gd-card)", borderTop: "1px solid var(--gd-line)" }}
      >
        {completeError ? (
          <p className="gd-t-xs mb-2 text-center" style={{ color: "var(--gd-bad)" }}>
            {completeError}
          </p>
        ) : null}
        {done ? (
          <div
            className="gd-t-sm flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-xl font-semibold"
            style={{
              background: "var(--gd-good-soft)",
              border: "1px solid #a7f3d0",
              color: "var(--gd-good)",
            }}
          >
            <CheckCircle2 className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
            확인 완료
          </div>
        ) : (
          <button
            type="button"
            onClick={complete}
            disabled={completing}
            className="gd-btn gd-btn-primary w-full"
          >
            {completing ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" strokeWidth={2} aria-hidden />
            ) : (
              <Check className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
            )}
            {completing ? "처리 중…" : "다 확인했습니다"}
          </button>
        )}
      </footer>
    </div>
  );
}
