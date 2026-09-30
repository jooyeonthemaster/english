"use client";

import { deferWhileDragging } from "@/components/layout/panel-drag-freeze";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  Download,
  Ellipsis,
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
import type { ExamPrintArming } from "../paper-builder/print/print-arming";
import { printArmHandlers, usePrintArmed } from "../paper-builder/print/print-arm-ui";
import type { ExamPrintMode } from "@/lib/exams/print-event-meta";
import { FORMAT_COLORS, FormatFileIcon } from "./format-file-icon";
import { SaveButton } from "@/components/ui/save-button";
import { confirmNative } from "@/lib/browser-confirm";

// 인쇄 · PDF · PDF 해설 메뉴 항목 — 인쇄 준비 중(printBusy)에는 disabled 로 연타를 막는다. 누르는 순간(:active ·
// 무장 aria-busy) 눌린 모양이 click 전에 페인트된다.
const PRINT_MENU_ITEM_CLASS =
  "flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 aria-busy:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white";

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
  /** 미지정 = onPrint(PDF 는 인쇄 창의 「PDF로 저장」) */
  onDownloadPdf?: () => void;
  onDownloadPdfWithAnswers: () => void;
  onDownloadDocx: () => void;
  onDownloadDocxWithAnswers: () => void;
  onDownloadHwpx: () => void;
  onDownloadHwpxWithAnswers: () => void;
  /**
   * 인쇄 준비 · 인쇄 창 대기 중(인쇄 컨트롤러 busy) — 인쇄 버튼을 스피너로 바꾸고 인쇄 · PDF ·
   * PDF 해설을 막아 연타로 두 번 인쇄되지 않게 한다. DOCX · HWPX(isPending) 경로와는 별개.
   */
  printBusy?: boolean;
  /**
   * 인쇄 컨트롤러의 누름 무장(printCtl.arming) — 인쇄 · PDF · PDF 해설을 누르는 순간(pointerdown · Enter/Space)
   * 버튼 · 상태 표시줄이 「준비 중」으로 click 전에 페인트된다. 무장은 disabled 를 켜지 않는다(CC-2).
   */
  printArming?: ExamPrintArming;
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
  printBusy = false,
  printArming,
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
  const printDisabled = actionDisabled || printBusy;
  const downloadPdf = onDownloadPdf ?? onPrint;
  // 누름 무장 — 이 툴바만 다시 그려진다(호스트 무변). 스피너 · aria-busy 는 무장에도 켜되 disabled 는 printBusy 만.
  const printArmed = usePrintArmed(printArming);
  const [pressedPrintItem, setPressedPrintItem] = useState<string | null>(null);
  const armedItem = printArmed !== null ? pressedPrintItem : null;
  const armFor = (item: string, mode: ExamPrintMode) =>
    printArmHandlers(printArming, mode, () => setPressedPrintItem(item));
  const templateLabel = TEMPLATE_META[template].label;
  const compactTemplateLabel = templateLabel.trim().slice(0, 1) || templateLabel;

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const updateCompactLabels = () => {
      // 720: 풀 라벨 전체 폭 실측 근사(배포 라벨+저장 필요 칩+우측 6버튼).
      // 620 이던 시절 682px(스튜디오 조판 — 편집 패널 기본 펼침)에서 배포
      // 라벨이 「저장 필요」 칩 아래로 겹치던 실측 결함의 교정.
      setCompactLabels(toolbar.getBoundingClientRect().width < 720);
    };

    updateCompactLabels();

    if (typeof ResizeObserver === "undefined") return;

    // 패널 드래그 중엔 라벨 전환을 미루고 놓을 때 1회(panel-drag-freeze.ts).
    const deferred = deferWhileDragging<void>(() => updateCompactLabels());
    const resizeObserver = new ResizeObserver(() => deferred.observe(undefined));
    resizeObserver.observe(toolbar);
    return () => {
      resizeObserver.disconnect();
      deferred.dispose();
    };
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
    // 어떤 폭에서도 자식이 툴바 밖으로 나가지 않는다(26-09-08 §11.9-④ 후속): 좌측
    // 클러스터는 shrink-0(종전 min-w-0 이라 aside 508~599 에서 0 으로 압착돼 「/」
    // 조각만 남았다), 우측은 min-w-0 + 자체 flex-wrap, 툴바도 flex-wrap 으로 2줄
    // 꺾임을 허용한다. 높이는 h-11 고정 대신 min-h-11 + py-1.5(버튼 h-8 + 12 = 44,
    // 1줄일 땐 종전과 동일). compactLabels(<720)에선 좌측 아이콘만·우측 인쇄/다운로드는
    // 「⋯」 오버플로 메뉴 1개로 접는다.
    <div
      ref={toolbarRef}
      data-preview-toolbar
      className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-slate-200 bg-white px-2 py-1.5 lg:gap-x-3 lg:px-4"
    >
      <div className="flex shrink-0 items-center gap-2">
        <Eye
          className="h-3.5 w-3.5 shrink-0 text-slate-400"
          aria-hidden={!compactLabels || undefined}
          // 라벨을 숨긴 compact 단계에선 아이콘이 용지 정보를 대신 말한다.
          role={compactLabels ? "img" : undefined}
          aria-label={compactLabels ? `${paperSize} 미리보기` : undefined}
        />
        <span
          className="whitespace-nowrap text-[12px] font-bold text-slate-600"
          title={`${paperSize} 미리보기`}
          hidden={compactLabels}
        >
          {`${paperSize} 미리보기`}
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
            className={`flex h-8 shrink-0 items-center justify-center gap-1.5 border border-[#3182F6]/45 bg-white text-[11px] font-bold text-[#3182F6] transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white ${
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
      <div className="no-print flex min-w-0 flex-wrap items-center justify-end gap-1">
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
            className="flex h-8 w-8 items-center justify-center border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="flex h-8 w-8 items-center justify-center border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        )}
        {/* 저장·인쇄·다운로드 — 모바일(<lg)에서는 하단 고정 바로 옮겨 숨긴다. */}
        {onSave && (
          <div className="hidden lg:flex">
            {/* 툴바 각진 문법(26-08-14 사용자 지시 — 둥근 모서리 제거) 동참.
                split(rounded-l/r-md)도 twMerge 가 rounded-none 으로 평탄화. */}
            <SaveButton
              className="rounded-none"
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
        {/* compact 에선 인쇄 버튼을 지우고 아래 「⋯」 메뉴 첫 항목으로 옮긴다. */}
        {!compactLabels && (
          <button
            type="button"
            onClick={onPrint}
            {...armFor("print", "plain")}
            disabled={printDisabled}
            aria-busy={printBusy || printArmed !== null || undefined}
            className="hidden h-8 items-center justify-center gap-1 border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 active:bg-slate-100 aria-busy:border-blue-200 aria-busy:bg-blue-50 aria-busy:text-[#3182F6] disabled:cursor-not-allowed disabled:opacity-50 lg:flex lg:min-w-[64px]"
          >
            {printBusy || printArmed !== null ? (
              <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <Printer className="h-3.5 w-3.5" />
            )}
            <span className="hidden lg:inline">인쇄</span>
          </button>
        )}
        <div ref={downloadMenuRef} className="relative hidden lg:block">
          {compactLabels ? (
            // 오버플로 트리거 — 다운로드 메뉴를 그대로 재사용하되 「인쇄」 를 앞에 붙인다.
            <button
              type="button"
              onClick={() => setDownloadOpen((open) => !open)}
              disabled={actionDisabled}
              aria-expanded={downloadOpen}
              aria-haspopup="true"
              title="인쇄 · 다운로드"
              aria-label="인쇄 · 다운로드"
              className="flex h-8 w-8 items-center justify-center border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ellipsis className="h-4 w-4" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDownloadOpen((open) => !open)}
              disabled={actionDisabled}
              aria-expanded={downloadOpen}
              aria-haspopup="true"
              className="flex h-8 items-center justify-center gap-1.5 border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 lg:min-w-[98px] lg:px-3"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              <span className="hidden lg:inline">다운로드</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>
          )}
          {downloadOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/70">
              {compactLabels && (
                <>
                  <button
                    type="button"
                    onClick={() => runDownload(onPrint)}
                    {...armFor("print-menu", "plain")}
                    disabled={printBusy}
                    aria-busy={printBusy || armedItem === "print-menu" || undefined}
                    className={PRINT_MENU_ITEM_CLASS}
                  >
                    {printBusy || armedItem === "print-menu" ? (
                      <Loader2 className="h-4 w-4 shrink-0 text-slate-500 motion-safe:animate-spin" aria-hidden="true" />
                    ) : (
                      <Printer className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                    )}
                    인쇄
                  </button>
                  <div className="my-1 h-px bg-slate-100" />
                </>
              )}
              <button
                type="button"
                onClick={() => runDownload(downloadPdf)}
                {...armFor("pdf", "plain")}
                disabled={printBusy}
                aria-busy={armedItem === "pdf" || undefined}
                className={PRINT_MENU_ITEM_CLASS}
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
                {...armFor("pdf-answers", "explanation")}
                disabled={printBusy}
                aria-busy={armedItem === "pdf-answers" || undefined}
                className={PRINT_MENU_ITEM_CLASS}
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
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center border border-red-300 text-red-500 transition-all hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
