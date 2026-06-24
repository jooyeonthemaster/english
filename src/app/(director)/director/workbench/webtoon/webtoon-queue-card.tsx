"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Pencil,
  Printer,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PreviewZoomControls,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
} from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import { type WebtoonRow, styleLabel, languageLabel } from "./webtoon-page-types";

interface WebtoonQueueCardProps {
  item: WebtoonRow;
  selected: boolean;
  onToggleSelected: () => void;
  onRetry: (webtoonId: string) => void;
  onRemove: (webtoonId: string) => void;
  onEditText?: (webtoonId: string) => void;
  onToggleApprove: (webtoonId: string) => void;
  /**
   * 상세보기를 페이지 레벨에서 제어할 때 사용. 전달되면 카드 내부의 PreviewModal
   * 대신 이 콜백을 호출한다(편집창 ↔ 상세보기 왕복을 위해). 미전달 시 기존처럼
   * 카드가 직접 PreviewModal을 띄운다.
   */
  onOpenDetail?: (webtoonId: string) => void;
}

function displayUrl(item: WebtoonRow): string | null {
  return item.editedImageUrl || item.imageUrl;
}

export function WebtoonQueueCard({
  item,
  selected,
  onToggleSelected,
  onRetry,
  onRemove,
  onEditText,
  onToggleApprove,
  onOpenDetail,
}: WebtoonQueueCardProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [passageOpen, setPassageOpen] = useState(false);

  const isDone = item.status === "COMPLETED" && item.imageUrl;
  const isError = item.status === "FAILED";
  const isInflight = item.status === "PENDING" || item.status === "GENERATING";
  const passageContent = item.passage.content?.trim() || "";

  const openDetail = () => {
    if (!isDone) return;
    if (onOpenDetail) onOpenDetail(item.id);
    else setShowPreview(true);
  };

  return (
    <>
      <Card
        className={`group relative flex h-full flex-col gap-0 py-0 transition-all ${
          selected
            ? "bg-blue-50/30 ring-2 ring-blue-400"
            : "hover:shadow-md"
        } ${!item.approved && isDone ? "border-red-200/80 shadow-[0_0_0_1px_rgba(252,165,165,0.35),0_0_18px_rgba(248,113,113,0.12)]" : ""}`}
      >
        {/* 배경 오버레이 — 카드 여백 클릭=선택 토글, 더블클릭=상세보기 열기.
            내용층은 pointer-events-none 으로 두고 컨트롤만 다시 활성화한다. */}
        <button
          type="button"
          onClick={() => onToggleSelected()}
          onDoubleClick={openDetail}
          aria-label={selected ? "선택 해제" : "선택"}
          title={
            isDone ? "클릭하여 선택 · 더블클릭하여 열기" : "클릭하여 선택"
          }
          className="absolute inset-0 z-0 cursor-pointer rounded-xl focus:outline-none"
        />

        <CardContent className="pointer-events-none relative z-10 flex flex-1 flex-col gap-1.5 p-3">
          {/* ── Header row: 체크박스 · 삭제 · 지문 토글 ── */}
          <div className="flex shrink-0 items-center gap-1.5">
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggleSelected()}
              className="pointer-events-auto shrink-0"
            />
            <button
              type="button"
              aria-label="삭제"
              title={isInflight ? "생성 중에는 삭제할 수 없습니다." : "삭제"}
              disabled={isInflight}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              className="pointer-events-auto flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {/* 지문 토글 — 클릭하면 아래에 원문 지문이 펼쳐진다. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPassageOpen((v) => !v);
              }}
              disabled={!passageContent}
              title={item.passage.title}
              className="pointer-events-auto inline-flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:opacity-100"
            >
              <FileText className="h-3 w-3 shrink-0 text-blue-400" />
              <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold">
                {item.passage.title}
              </span>
              {passageContent ? (
                passageOpen ? (
                  <ChevronUp className="h-3 w-3 shrink-0 text-slate-400" />
                ) : (
                  <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
                )
              ) : null}
            </button>
          </div>

          {/* 지문 원문 (토글) */}
          {passageOpen && passageContent ? (
            <div className="pointer-events-auto rounded-md bg-slate-50 px-3 py-2">
              <p className="max-h-40 overflow-y-auto whitespace-pre-line text-[11px] font-mono leading-relaxed text-slate-500">
                {passageContent}
              </p>
            </div>
          ) : null}

          {/* 메타: 화풍 · 언어 */}
          <p className="text-[10.5px] text-slate-400">
            {styleLabel(item.style)} · {languageLabel(item.language)}
          </p>

          {/* ── 이미지 ── 클릭은 카드 오버레이로 통과(단일=선택·더블=열기). ── */}
          <div
            className={`relative aspect-[9/16] overflow-hidden rounded-lg border ${
              isDone
                ? "border-slate-200 transition-all group-hover:border-blue-400 group-hover:shadow-md"
                : isError
                  ? "border-rose-200 bg-rose-50"
                  : "border-slate-200 bg-slate-100"
            }`}
          >
            {isDone ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayUrl(item)!}
                  alt={item.passage.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {item.editedImageUrl ? (
                  <div className="absolute left-2 top-2 rounded-full bg-emerald-600/90 px-2 py-1 backdrop-blur-sm">
                    <span className="text-[9.5px] font-semibold text-white">
                      자막 편집됨
                    </span>
                  </div>
                ) : null}
                <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 backdrop-blur-sm">
                  <Maximize2 className="h-3 w-3 text-white" />
                  <span className="text-[9.5px] font-semibold text-white">
                    크게 보기
                  </span>
                </div>
              </>
            ) : isError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
                <AlertCircle className="h-6 w-6 text-rose-500" />
                <p className="line-clamp-3 text-center text-[11px] leading-snug text-rose-700">
                  {item.errorMessage || "생성에 실패했습니다."}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(item.id);
                  }}
                  className="pointer-events-auto mt-1 flex items-center gap-1.5 rounded-md bg-rose-100 px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-200"
                >
                  <RefreshCw className="h-3 w-3" />
                  다시 시도
                </button>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                <span className="text-[11px] font-medium text-slate-500">
                  {item.status === "PENDING" ? "대기 중" : "이미지 생성 중"}
                </span>
                <span className="text-[10px] text-slate-400">
                  완료되면 자동으로 표시됩니다.
                </span>
              </div>
            )}
          </div>

          {/* ── Footer: 검수완료 · 수정하기 · 다운로드 · 상세보기(정사각 아이콘).
              카드가 좁아지면 버튼이 넘치지 않게 다음 줄로 자동 줄바꿈한다. ── */}
          {isDone ? (
            <div className="mt-auto flex flex-wrap items-center gap-1 pt-1.5">
              {/* 검수완료 토글 — 미검수=분홍 테두리(hover 시 초록 미리보기), 검수완료=초록. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={item.approved}
                title={
                  item.approved
                    ? "검수완료 — 누르면 검수를 취소합니다"
                    : "검수필요 — 누르면 검수완료로 표시합니다"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleApprove(item.id);
                }}
                className={
                  "pointer-events-auto h-7 min-w-[5rem] grow basis-[5rem] justify-center gap-1 whitespace-nowrap bg-white px-1.5 text-[11px] font-semibold " +
                  (item.approved
                    ? "border border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                    : "border border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
                }
              >
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                {item.approved ? "검수완료" : "미검수"}
              </Button>
              {onEditText ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="pointer-events-auto h-7 min-w-[5rem] grow basis-[5rem] justify-center gap-1 whitespace-nowrap border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditText(item.id);
                  }}
                >
                  <Pencil className="h-3 w-3 shrink-0" />
                  수정하기
                </Button>
              ) : null}
              {/* 다운로드 + 상세보기 아이콘은 한 묶음 — 줄바꿈 시 상세보기 버튼이
                  혼자 떨어지지 않고 다운로드와 함께 다음 줄로 내려간다. */}
              <div className="flex min-w-[7rem] grow basis-[7rem] items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="pointer-events-auto h-7 min-w-0 grow justify-center gap-1 whitespace-nowrap border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadImage(item);
                  }}
                >
                  <Download className="h-3 w-3 shrink-0" />
                  다운로드
                </Button>
                {/* 상세보기 — 정사각 박스 + 대각선 확장 화살표(Maximize2) */}
                <CardDetailIconButton
                  className="pointer-events-auto size-7 shrink-0"
                  iconClassName="size-3.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDetail();
                  }}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!onOpenDetail && showPreview && isDone && (
        <PreviewModal
          item={item}
          onClose={() => setShowPreview(false)}
          onEdit={
            onEditText
              ? () => {
                  setShowPreview(false);
                  onEditText(item.id);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

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
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      const move = (e: MouseEvent) => {
        setCtrlPos({
          top: Math.max(0, startTop + (e.clientY - startY)),
          right: Math.max(0, startRight - (e.clientX - startX)),
        });
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
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

      <div className="relative z-10 flex h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] min-w-[min(92vw,360px)] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFB] shadow-2xl sm:h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-1rem)]">
        {/* Header — title, source, actions */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-bold text-slate-900">
              {item.passage.title}
            </h3>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {styleLabel(item.style)} · {languageLabel(item.language)}
            </p>
          </div>
          {onEdit ? (
            <button
              onClick={onEdit}
              className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              수정하기
            </button>
          ) : null}
          <button
            onClick={() => printImage(item)}
            className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" />
            인쇄하기
          </button>
          <button
            onClick={() => downloadImage(item)}
            className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            다운로드
          </button>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — 줌/이동 가능한 미리보기. 100%면 모달에 꽉 차고, 확대하면 스크롤로 이동.
            relative 부모로 두어 줌 컨트롤은 고정, 스크롤러만 이미지를 패닝한다. */}
        <div className="relative min-h-0 flex-1">
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
      </div>
    </div>
  );
}

function downloadImage(item: WebtoonRow) {
  window.location.href = downloadHref(item);
}

function downloadHref(item: WebtoonRow) {
  return `/api/webtoons/${item.id}/download`;
}

// 웹툰 한 장(세로 스트립)을 인쇄 — 새 창에 폭 100%로 깔고 로드 후 print().
function printImage(item: WebtoonRow) {
  const url = displayUrl(item);
  if (!url) return;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  const title = item.passage.title.replace(/[<>&"]/g, "");
  w.document.write(
    `<!doctype html><html><head><title>${title}</title>` +
      `<style>@page{margin:0}html,body{margin:0;padding:0}` +
      `img{display:block;width:100%;height:auto}</style></head>` +
      `<body><img src="${url}" alt="${title}" ` +
      `onload="window.focus();window.print()" ` +
      `onafterprint="window.close()"/></body></html>`,
  );
  w.document.close();
}
