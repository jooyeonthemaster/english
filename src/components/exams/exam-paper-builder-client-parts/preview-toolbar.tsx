"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  Download,
  Eye,
  Loader2,
  MonitorSmartphone,
  Printer,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import { TEMPLATE_META } from "../paper-builder/templates";
import type { PaperSize, PaperTemplate } from "../paper-builder/types";
import { SaveButton } from "@/components/ui/save-button";
import { confirmNative } from "@/lib/browser-confirm";

// 다운로드 메뉴용 파일 포맷 아이콘 — 파일 모양 안에 포맷 텍스트(PDF/DOCX/HWPX)를 키컬러
// 밴드로 박는다. 해설 포함 버전은 파일 두 개가 겹친 모양(stacked).
function FormatFileIcon({
  label,
  color,
  stacked = false,
}: {
  label: string;
  color: string;
  stacked?: boolean;
}) {
  const Page = ({
    dx = 0,
    dy = 0,
    faded = false,
    withLabel = true,
  }: {
    dx?: number;
    dy?: number;
    faded?: boolean;
    withLabel?: boolean;
  }) => (
    <g transform={`translate(${dx} ${dy})`} opacity={faded ? 0.5 : 1}>
      {/* 페이지(흰 바탕 + 키컬러 외곽선), 우상단 접힘 */}
      <path
        d="M6 2.5 H13.5 L18 7 V19.5 A2 2 0 0 1 16 21.5 H6 A2 2 0 0 1 4 19.5 V4.5 A2 2 0 0 1 6 2.5 Z"
        fill="white"
        stroke={color}
        strokeWidth={1.4}
      />
      <path
        d="M13.5 2.5 V7 H18"
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {withLabel && (
        <>
          <rect x={4} y={12.6} width={14} height={6.6} rx={1.2} fill={color} />
          <text
            x={11}
            y={17.4}
            textAnchor="middle"
            fontSize={4.5}
            fontWeight={800}
            fill="white"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            letterSpacing={0.2}
          >
            {label}
          </text>
        </>
      )}
    </g>
  );
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* 해설 포함: 뒤에 옅은 페이지 한 장 더(두 장 겹침) */}
      {stacked && <Page dx={3.5} dy={-2.2} faded withLabel={false} />}
      <Page dx={stacked ? -1.5 : 0} dy={stacked ? 1.6 : 0} />
    </svg>
  );
}

const FORMAT_COLORS = {
  pdf: "#DC2626", // red-600
  docx: "#2563EB", // blue-600
  hwpx: "#0EA5E9", // sky-500 (하늘)
} as const;

// ---------------------------------------------------------------------------
// 용지 미리보기 상단 헤더 툴바
// ---------------------------------------------------------------------------

interface PreviewToolbarProps {
  template: PaperTemplate;
  paperSize: PaperSize;
  dirty: boolean;
  isPending: boolean;
  paperItemsCount: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onPrint: () => void;
  onDownloadPdf: () => void;
  onDownloadPdfWithAnswers: () => void;
  onDownloadDocx: () => void;
  onDownloadDocxWithAnswers: () => void;
  onDownloadHwpx: () => void;
  onDownloadHwpxWithAnswers: () => void;
  /** 시험지 전체 비우기(처음부터 다시) — 미지정 시 버튼 숨김. */
  onResetPaper?: () => void;
  /** 미지정 시 저장 버튼을 숨긴다 — 읽기 전용 미리보기에서 사용. */
  onSave?: () => void;
  onSaveAs?: () => void;
  /**
   * 태블릿 시험 배포(26-07-09 대개편 V1) — 지정 시 템플릿 라벨 배지 자리에 배포
   * 버튼을 렌더한다(유저 확정: 템플릿 인지는 설정 패널 그리드로 충분). 미지정
   * (플래그 off·읽기 전용)이면 종전 배지 그대로 — 무회귀.
   */
  onDeploy?: () => void;
  /** 배포 불가 사유(국어 시험지 등) — 지정 시 버튼 disabled + 툴팁으로 고지. */
  deployDisabledReason?: string | null;
}

export function PreviewToolbar({
  template,
  paperSize,
  dirty,
  isPending,
  paperItemsCount,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPrint,
  onDownloadPdf,
  onDownloadPdfWithAnswers,
  onDownloadDocx,
  onDownloadDocxWithAnswers,
  onDownloadHwpx,
  onDownloadHwpxWithAnswers,
  onResetPaper,
  onSave,
  onSaveAs,
  onDeploy,
  deployDisabledReason,
}: PreviewToolbarProps) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [compactLabels, setCompactLabels] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const actionDisabled = isPending || paperItemsCount === 0;
  const templateLabel = TEMPLATE_META[template].label;
  const compactTemplateLabel = templateLabel.trim().slice(0, 1) || templateLabel;

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const updateCompactLabels = () => {
      setCompactLabels(toolbar.getBoundingClientRect().width < 620);
    };

    updateCompactLabels();

    if (typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(updateCompactLabels);
    resizeObserver.observe(toolbar);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!downloadOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (downloadMenuRef.current?.contains(event.target as Node)) return;
      setDownloadOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDownloadOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [downloadOpen]);

  function runDownload(handler: () => void) {
    setDownloadOpen(false);
    handler();
  }

  return (
    <div
      ref={toolbarRef}
      className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 lg:gap-3 lg:px-4"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Eye className="h-3.5 w-3.5 text-slate-400" />
        <span className="whitespace-nowrap text-[12px] font-bold text-slate-600">
          {compactLabels ? paperSize : `${paperSize} 미리보기`}
        </span>
        {onDeploy ? (
          // 태블릿 시험 배포 — 템플릿 배지 자리(유저 확정 교체). 저장 버튼(파란
          // 채움)보다 낮은 위계의 테두리형이되 Toss 블루로 눈에 띄게.
          <button
            type="button"
            onClick={onDeploy}
            disabled={Boolean(deployDisabledReason)}
            title={deployDisabledReason ?? "태블릿 시험 배포"}
            aria-label={deployDisabledReason ?? "태블릿 시험 배포"}
            className={`flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#3182F6]/45 bg-white text-[11px] font-bold text-[#3182F6] transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white ${
              compactLabels ? "w-8 px-0" : "px-2.5"
            }`}
          >
            <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden="true" />
            {!compactLabels && <span>태블릿 시험 배포</span>}
          </button>
        ) : (
          <span
            className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500"
            title={templateLabel}
            aria-label={templateLabel}
          >
            {compactLabels ? compactTemplateLabel : templateLabel}
          </span>
        )}
      </div>
      <div className="no-print flex shrink-0 items-center gap-1">
        {dirty && (
          <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 sm:inline-flex">
            저장 필요
          </span>
        )}
        {onUndo && (
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="되돌리기"
            aria-label="되돌리기"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
        )}
        {onRedo && (
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="앞으로 돌리기"
            aria-label="앞으로 돌리기"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        )}
        {/* 저장·인쇄·다운로드 — 모바일(<lg)에서는 하단 고정 바로 옮겨 숨긴다. */}
        {onSave && (
          <div className="hidden lg:flex">
            <SaveButton
              onClick={onSave}
              saving={isPending}
              disabled={actionDisabled}
              secondaryActions={
                onSaveAs
                  ? [
                      {
                        label: "다른 이름으로 저장",
                        icon: <Copy className="h-3.5 w-3.5" />,
                        onClick: onSaveAs,
                        disabled: actionDisabled,
                      },
                    ]
                  : undefined
              }
            />
          </div>
        )}
        <button
          onClick={onPrint}
          disabled={actionDisabled}
          className="hidden h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 lg:flex lg:min-w-[64px]"
        >
          <Printer className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">인쇄</span>
        </button>
        <div ref={downloadMenuRef} className="relative hidden lg:block">
          <button
            type="button"
            onClick={() => setDownloadOpen((open) => !open)}
            disabled={actionDisabled}
            aria-expanded={downloadOpen}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 lg:min-w-[98px] lg:px-3"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="hidden lg:inline">다운로드</span>
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>
          {downloadOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/70">
              <button
                type="button"
                onClick={() => runDownload(onDownloadPdf)}
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <FormatFileIcon label="PDF" color={FORMAT_COLORS.pdf} />
                PDF
                <span className="ml-auto rounded-sm bg-rose-50 px-1 py-px text-[9px] font-bold leading-none text-rose-600">
                  미리보기 그대로
                </span>
              </button>
              <button
                type="button"
                onClick={() => runDownload(onDownloadPdfWithAnswers)}
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <FormatFileIcon label="PDF" color={FORMAT_COLORS.pdf} stacked />
                PDF 해설
              </button>
              <div className="my-1 h-px bg-slate-100" />
              <button
                type="button"
                onClick={() => runDownload(onDownloadDocx)}
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <FormatFileIcon label="DOCX" color={FORMAT_COLORS.docx} />
                DOCX
              </button>
              <button
                type="button"
                onClick={() => runDownload(onDownloadDocxWithAnswers)}
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <FormatFileIcon label="DOCX" color={FORMAT_COLORS.docx} stacked />
                DOCX 해설
              </button>
              <button
                type="button"
                onClick={() => runDownload(onDownloadHwpx)}
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <FormatFileIcon label="HWPX" color={FORMAT_COLORS.hwpx} />
                HWPX
                <span className="ml-auto rounded-sm bg-indigo-50 px-1 py-px text-[9px] font-bold uppercase leading-none text-indigo-600">
                  beta
                </span>
              </button>
              <button
                type="button"
                onClick={() => runDownload(onDownloadHwpxWithAnswers)}
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <FormatFileIcon label="HWPX" color={FORMAT_COLORS.hwpx} stacked />
                HWPX 해설
                <span className="ml-auto rounded-sm bg-violet-50 px-1 py-px text-[9px] font-bold uppercase leading-none text-violet-600">
                  beta
                </span>
              </button>
            </div>
          )}
        </div>
        {onResetPaper ? (
          <button
            type="button"
            disabled={isPending || paperItemsCount === 0}
            onClick={() => {
              if (
                !confirmNative(
                  "정말로 삭제하시겠습니까?",
                  "이 시험지의 모든 문항·블록이 삭제되고 처음부터 다시 시작합니다. 이 작업은 되돌릴 수 없습니다.",
                )
              ) {
                return;
              }
              onResetPaper();
            }}
            title="시험지 전체 비우기 (처음부터 다시)"
            aria-label="시험지 전체 비우기"
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-red-300 text-red-500 transition-all hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
