"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Clapperboard, Download, FileText, Pencil, Printer, X } from "lucide-react";
import {
  PreviewZoomControls,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
} from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import { type WebtoonRow, styleLabel, languageLabel } from "../webtoon-page-types";
import { WebtoonPlanBadge } from "./plan-badge";
import { StoryboardNotes } from "./storyboard-notes";
import { useWebtoonStoryboard } from "./use-webtoon-storyboard";
import { displayUrl, downloadImage, printImage } from "./webtoon-actions";

// 연출 노트를 이미지 옆 패널로 펼칠 수 있는 폭(lg). 그보다 좁으면 이미지 아래에
// 쌓이므로 기본은 닫아 두고 이미지를 크게 보여준다.
const SIDE_PANEL_QUERY = "(min-width: 1024px)";

function prefersSidePanel(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(SIDE_PANEL_QUERY).matches;
}

const HEADER_ICON_BUTTON =
  "flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50";

export function PreviewModal({
  item,
  onClose,
  onEdit,
}: {
  item: WebtoonRow;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const url = displayUrl(item);
  const titleId = useId();
  const notesId = useId();

  // ── 연출 노트(스토리보드) — 모달이 열릴 때 단건 GET 으로 지연 로드 ──
  // 목록이 레거시 행(hasStoryboard === false)이라고 알려주면 요청하지 않는다.
  // hasStoryboard 가 아직 없는(undefined) 목록 응답이면 받아 보고 판단한다.
  const { state: storyboardState, retry: retryStoryboard } = useWebtoonStoryboard(
    item.id,
    item.hasStoryboard !== false,
  );
  const notesAvailable =
    item.hasStoryboard === true ||
    (storyboardState.status === "ready" && storyboardState.storyboard !== null);
  const [notesOpen, setNotesOpen] = useState(prefersSidePanel);
  const showNotes = notesAvailable && notesOpen;

  // ── 대화상자 접근성: 열릴 때 포커스를 옮기고 Esc 로 닫는다. 닫히면 원래 자리로. ──
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── 줌/이동 컨트롤 (시험지 미리보기와 동일한 동작) ──
  // zoom=1 이 "화면에 맞춤" 기준. fitWidth(px)는 이미지가 모달 안에 꽉 차도록
  // 측정한 100% 표시 폭이고, 실제 표시 폭 = fitWidth * zoom.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [fitWidth, setFitWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [ctrlPos, setCtrlPos] = useState({ top: 12, right: 12 });

  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc || !nat) return;
    const update = () => {
      const styles = window.getComputedStyle(sc);
      const padX =
        parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const padY =
        parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const availW = Math.max(1, sc.clientWidth - padX);
      const availH = Math.max(1, sc.clientHeight - padY);
      const scale = Math.min(availW / nat.w, availH / nat.h);
      setFitWidth(Math.round(nat.w * scale));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(sc);
    return () => observer.disconnect();
  }, [nat]);

  const zoomIn = useCallback(
    () =>
      setZoom((z) =>
        Math.min(PREVIEW_ZOOM_MAX, Math.round((z + PREVIEW_ZOOM_STEP) * 100) / 100),
      ),
    [],
  );
  const zoomOut = useCallback(
    () =>
      setZoom((z) =>
        Math.max(PREVIEW_ZOOM_MIN, Math.round((z - PREVIEW_ZOOM_STEP) * 100) / 100),
      ),
    [],
  );
  const resetZoom = useCallback(() => setZoom(1), []);

  const handleCtrlDragStart = useCallback(
    (event: ReactMouseEvent<HTMLSpanElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;
      const startTop = ctrlPos.top;
      const startRight = ctrlPos.right;
      // 드래그 중에는 컨트롤 DOM(그립 span 의 부모 = top/right 를 소유한 루트)에
      // rAF 코얼레싱으로 직접 쓰고, 놓을 때 한 번만 상태로 확정한다. mousemove
      // 마다 setCtrlPos 하면 모달 전체(헤더 버튼·이미지·줌 컨트롤)가 프레임마다
      // 리렌더되고, img 의 인라인 ref 콜백이 렌더마다 detach/attach 를 반복한다.
      const ctrlEl = event.currentTarget.parentElement as HTMLElement | null;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      const prevPointerEvents = document.body.style.pointerEvents;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      // 드래그 중 hover 스타일 재평가 차단(모달 아래 카드들) — 리스너가
      // document 소속이라 move 수신에는 영향 없다.
      document.body.style.pointerEvents = "none";
      let latest = { top: startTop, right: startRight };
      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        if (ctrlEl) {
          ctrlEl.style.top = `${latest.top}px`;
          ctrlEl.style.right = `${latest.right}px`;
        }
      };
      const move = (e: MouseEvent) => {
        latest = {
          top: Math.max(0, startTop + (e.clientY - startY)),
          right: Math.max(0, startRight - (e.clientX - startX)),
        };
        if (ctrlEl) {
          if (rafId === null) rafId = requestAnimationFrame(flush);
        } else {
          // 컨트롤 DOM 을 못 찾으면(구조 변경 등) 종전 setState 경로로 폴백.
          setCtrlPos(latest);
        }
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        if (rafId !== null) cancelAnimationFrame(rafId);
        flush();
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        document.body.style.pointerEvents = prevPointerEvents;
        // 최종 위치를 상태로 확정 — 이후 리렌더가 같은 값을 다시 쓴다.
        setCtrlPos((prev) =>
          prev.top === latest.top && prev.right === latest.right ? prev : latest,
        );
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    },
    [ctrlPos],
  );

  if (!url) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-2">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] min-w-[min(92vw,360px)] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFB] shadow-2xl focus:outline-none sm:h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-1rem)]"
      >
        {/* Header — title, source, actions */}
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-3 sm:gap-3 sm:px-5">
          <span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100 sm:flex">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="truncate text-[15px] font-bold text-slate-900">
              {item.passage.title}
            </h3>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-slate-500">
              <WebtoonPlanBadge
                plan={item.plan}
                className="px-1.5 py-0.5 text-[10.5px]"
              />
              <span className="truncate">
                {styleLabel(item.style)} · {languageLabel(item.language)}
              </span>
            </p>
          </div>
          {notesAvailable ? (
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              aria-pressed={showNotes}
              aria-controls={showNotes ? notesId : undefined}
              aria-label="연출 노트"
              title={showNotes ? "연출 노트 닫기" : "컷별 연출 노트 보기"}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[12px] font-semibold transition-colors ${
                showNotes
                  ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">연출 노트</span>
            </button>
          ) : null}
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              title="수정하기"
              aria-label="수정하기"
              className={HEADER_ICON_BUTTON}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => printImage(item)}
            title="인쇄하기"
            aria-label="인쇄하기"
            className={HEADER_ICON_BUTTON}
          >
            <Printer className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => downloadImage(item)}
            title="다운로드"
            aria-label="다운로드"
            className={HEADER_ICON_BUTTON}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="닫기"
            aria-label="닫기"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — 이미지(줌/이동) + 연출 노트. lg 이상은 노트가 오른쪽 옆 패널,
            그보다 좁으면 이미지 아래에 쌓인다(이미지 영역이 남는 높이를 채움). */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* 100%면 영역에 꽉 차고, 확대하면 스크롤로 이동. relative 부모로 두어
              줌 컨트롤은 고정, 스크롤러만 이미지를 패닝한다. */}
          <div className="relative min-h-0 min-w-0 flex-1">
            <div
              ref={scrollerRef}
              className="h-full overflow-auto p-1.5 sm:p-2"
            >
              <div className="flex min-h-full min-w-full items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={(el) => {
                    // 캐시된 이미지는 마운트 후 onLoad가 안 뜰 수 있어, 이미 로드돼
                    // 있으면 여기서 자연 크기를 즉시 잡는다.
                    if (el && el.complete && el.naturalWidth && !nat) {
                      setNat({ w: el.naturalWidth, h: el.naturalHeight });
                    }
                  }}
                  src={url}
                  alt={item.passage.title}
                  onLoad={(e) =>
                    setNat({
                      w: e.currentTarget.naturalWidth,
                      h: e.currentTarget.naturalHeight,
                    })
                  }
                  style={{
                    ...(fitWidth
                      ? { width: fitWidth * zoom, maxWidth: "none" }
                      : { maxWidth: "100%", maxHeight: "100%" }),
                    // fitWidth 측정 전엔 부모 높이가 확정되지 않아 max-height가
                    // 안 먹어 자연 크기로 잠깐 번쩍인다 → 측정될 때까지 숨긴다.
                    visibility: fitWidth ? "visible" : "hidden",
                  }}
                  className="mx-auto h-auto shrink-0 rounded-xl object-contain"
                />
              </div>
            </div>

            <PreviewZoomControls
              zoom={zoom}
              position={ctrlPos}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onReset={resetZoom}
              onFit={resetZoom}
              onDragStart={handleCtrlDragStart}
            />
          </div>

          {showNotes ? (
            <StoryboardNotes
              id={notesId}
              state={storyboardState}
              onRetry={retryStoryboard}
              className="max-h-[48%] shrink-0 border-t border-slate-200 lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
