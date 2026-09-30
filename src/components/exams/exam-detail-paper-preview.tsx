"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { cn } from "@/lib/utils";

import { PreviewPages } from "./exam-paper-builder-client-parts/preview-pages";
import { PreviewToolbar } from "./exam-paper-builder-client-parts/preview-toolbar";
import { PreviewZoomControls } from "./exam-paper-builder-client-parts/preview-zoom-controls";
import { usePreviewZoom } from "./exam-paper-builder-client-parts/use-preview-zoom";
import { PAPER_SIZE_SPECS, PREVIEW_PAGE_WIDTH } from "./paper-builder/constants";
import { PrintStyles } from "./paper-builder/components/print-styles";
import { usePrintPortal } from "./paper-builder/hooks/use-print-portal";
import { useOverflowGuardedPagination } from "./paper-builder/hooks/use-overflow-guarded-pagination";
import { PrintStatusBar } from "./paper-builder/print/print-status-bar";
import { useExamPrintController, type ExamPrintFinish } from "./paper-builder/print/use-exam-print-controller";
import { buildAnswerKeyLayout, EMPTY_ANSWER_KEY_LAYOUT } from "./paper-builder/answer-key-layout";
import { buildGroups, formatDateInput } from "./paper-builder/paper-item-utils";
import { resolvePaperLayout } from "./paper-builder/paper-layout-defaults";
import { buildPaperItemsFromExam, parseSavedPaperSettings, type SavedPaperSettings } from "./paper-builder/saved-paper-items";
import type { PaginationSettings, PaperItem } from "./paper-builder/types";
import type { ExamDetail } from "./exam-detail-client-parts/types";
import { MissingPassageBanner, useMissingSourcePassage } from "./exam-paper-builder-client-parts/missing-passage-warning";

const PREVIEW_PAGE_GAP = 20;

// 「무엇을 찍을지」(저장 설정 → PaperItem[]) 는 웹 빌더·재오픈·HWPX·DOCX 와 같은 공용 정본
// paper-builder/saved-paper-items 가 정한다(26-09-30 CORE-MODEL, docs/EXAM-PAPER-MODEL.md §2·§3 — 저장된 지문 끄기 존중,
// 빈 스냅숏 → DB 지문 → 떼어 낸 원문 보관본). 아래 두 이름은 컴포넌트 본문이 그대로 쓴다.
const parseBuilderSettings = (raw: string | null): SavedPaperSettings | null => parseSavedPaperSettings(raw);

function buildPaperItems(exam: ExamDetail, settings: SavedPaperSettings | null): PaperItem[] {
  return buildPaperItemsFromExam(exam.questions, settings);
}

// 레이아웃·머리글 값(기본값 포함)도 HWPX·DOCX 와 같은 정본 paper-layout-defaults.resolvePaperLayout 이 정한다
// (COH-8 — 예전에는 `?? true`·`?? DEFAULT_SHOW_PASSAGE_TITLE`·`|| DEFAULT_INSTRUCTIONS` 를 여기 두 컴포넌트에
// 복제했다). 운영 519개 시험지 전수 대조에서 인라인 판정과 차이 0(저장값이 모두 boolean·string 이었다).

function formatExamDate(value: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatDateInput(date);
}

// ?print=1 딥링크(유사 시험지 카드의 새 탭 [인쇄]) — 상세 화면 인스턴스만 반응한다. 서버 스냅숏 false →
// 하이드레이션 뒤 location 을 읽는다(SSR 안전). 구독 없음 — 파라미터는 자동 인쇄 시작 순간 우리가 지운다.
const DEEP_LINK_PRINT_PARAM = "print";
const subscribeNothing = () => () => undefined;
const readDeepLinkPrint = () => new URLSearchParams(window.location.search).get(DEEP_LINK_PRINT_PARAM) === "1";
const readDeepLinkPrintOnServer = () => false;

/** 자동 인쇄를 시작하며 ?print=1 을 지운다 — 새로고침 · 뒤로가기로 다시 인쇄되지 않게. */
function stripDeepLinkPrintParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(DEEP_LINK_PRINT_PARAM)) return;
  url.searchParams.delete(DEEP_LINK_PRINT_PARAM);
  // Next App Router 는 replaceState(null, …) 를 가로채 라우터 URL 과 동기화한다.
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export type ExamDetailPrintEntry = "detail" | "quick-view" | "card-dialog";

export function ExamDetailPaperPreview({
  exam,
  className,
  forceMountAllPages = false,
  autoPrint = false,
  printEntry,
  onPrintFinished,
}: {
  exam: ExamDetail;
  /** 컨테이너 높이 제어 — 미지정 시 상세 페이지용 기본 높이를 사용한다. */
  className?: string;
  /** 모든 페이지를 즉시 마운트(지연 마운트 끔) — 렌더 전수 검증 하네스 전용(additive). */
  forceMountAllPages?: boolean;
  /** 마운트 뒤 자동 인쇄 1회(카드 인쇄 대화상자 · StrictMode 안전). exam 이 확정된 뒤에 마운트할 것. */
  autoPrint?: boolean;
  /** 원격 측정 진입점. 미지정 = 상세 화면('detail') — 이때만 ?print=1 딥링크에 반응한다. */
  printEntry?: ExamDetailPrintEntry;
  /** 인쇄 잡 종료(printed = afterprint · blocked · cancelled · empty) — 카드 대화상자가 닫기에 쓴다. */
  onPrintFinished?: (finish: ExamPrintFinish) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragOverPartKey, setDragOverPartKey] = useState<string | null>(null);
  const [dragPlacement, setDragPlacement] = useState<"before" | "after">("before");

  const settings = useMemo(() => parseBuilderSettings(exam.settings), [exam.settings]);
  const paperLayout = useMemo(() => resolvePaperLayout(settings), [settings]);
  const { template, paperSize, columns, density, passageStyle, cover, header: paperHeader } = paperLayout;
  const { showAnswerSpace, showPassageTitle, showQuestionMeta } = paperLayout;

  const {
    scrollerRef,
    zoom,
    baseWidth,
    controlsPos,
    zoomIn,
    zoomOut,
    reset,
    fitToScreen,
    handleControlsDragStart,
  } = usePreviewZoom(paperSize);

  // Ctrl+P · printToPDF(기다릴 수 없는 경로)의 동기 안전망 — 포털을 실제로 태운 beforeprint 에서만 true.
  // rootRef 는 #exam-paper-print-root 요소 그 자체의 ref 여야 한다(래퍼면 포털이 서지 않는다).
  const portalMountAll = usePrintPortal(paperSize, { rootRef: scrollerRef });

  const paperItems = useMemo(() => buildPaperItems(exam, settings), [exam, settings]);
  const paperGroups = useMemo(() => buildGroups(paperItems), [paperItems]);
  const missingPassage = useMissingSourcePassage(paperItems); // 「원문 지문 없음」 배너·칩·내보내기 경고

  // 인쇄 · PDF · PDF 해설 · 자동 인쇄는 전부 이 컨트롤러로만 부른다 — 준비 완료 신호가 모두 참일 때만
  // 인쇄(시간 추측 타이머 금지 · docs/EXAM-PRINT-PIPELINE.md). printCtl.explanation = 해설 포함 인쇄 중.
  // 컨트롤러는 가드의 isSettled 를, 가드는 printCtl.explanation 을 쓰는 순환이라 가드 신호는 레이아웃
  // 이펙트가 채우는 ref 로 넘긴다(인쇄 잡은 커밋 뒤에만 읽는다).
  const guardSignalsRef = useRef<{ isSettled: () => boolean; requestMeasure: () => void } | null>(null);
  const isGuardSettled = useCallback(() => guardSignalsRef.current?.isSettled() ?? false, []);
  const requestGuardMeasure = useCallback(() => guardSignalsRef.current?.requestMeasure(), []);
  const entry = printEntry ?? "detail";
  const deepLinkParam = useSyncExternalStore(subscribeNothing, readDeepLinkPrint, readDeepLinkPrintOnServer);
  const deepLink = !autoPrint && entry === "detail" && deepLinkParam;
  const printCtl = useExamPrintController({
    rootRef: scrollerRef,
    isGuardSettled,
    requestMeasure: requestGuardMeasure,
    hasItems: paperItems.length > 0,
    emptyMessage: "인쇄할 문제가 없습니다.",
    examId: exam.id,
    entry,
    autoStart: autoPrint || deepLink,
    autoStartEntry: deepLink ? "deep-link" : entry,
    // rAF 콜백 안 — 자동 인쇄가 실제로 시작되는 순간에만 지운다(StrictMode 가짜 언마운트에 안전).
    onAutoStart: deepLink ? stripDeepLinkPrintParam : undefined,
    onFinished: missingPassage.withPrintWarning(onPrintFinished), // afterprint 뒤 「원문 지문 없음」 토스트(막지 않음)
  });

  const paginationSettings = useMemo<PaginationSettings>(
    () => ({
      paperSize,
      columns,
      density,
      passageStyle,
      showAnswerSpace,
      showPassageTitle,
      showQuestionMeta,
      template,
      includeAnswers: printCtl.explanation,
      textMetrics: "exam-font",
    }),
    [paperSize, columns, density, passageStyle, showAnswerSpace, showPassageTitle, showQuestionMeta, template, printCtl.explanation],
  );
  // 추정 분할 + 실측 넘침 보정(편집 빌더와 같은 가드 — 그려진 칸이 넘치면 다시 나눈다).
  const { paginationResult, requestMeasure, isSettled } = useOverflowGuardedPagination(
    paperGroups,
    paginationSettings,
    scrollerRef,
  );
  useLayoutEffect(() => {
    guardSignalsRef.current = { isSettled, requestMeasure };
  }, [isSettled, requestMeasure]);
  const paperPages = paginationResult.pages;
  // 시험지 맨 뒤 정답표 페이지(들) — PDF 인쇄에 정답지가 포함되도록 미리보기에 렌더.
  // (해설 포함 PDF 는 인라인 해설을 쓰므로 정답표를 빼서 DOCX 해설과 동일하게 맞춘다.)
  const answerKey = useMemo(
    () =>
      printCtl.explanation
        ? EMPTY_ANSWER_KEY_LAYOUT
        : buildAnswerKeyLayout(paperItems, { paperSize, density }),
    [paperItems, paperSize, density, printCtl.explanation],
  );
  // 표지가 켜져 있으면 본문 앞에 한 장 더 렌더되므로 zoom-spacer 높이에 반영한다.
  const renderedPageCount =
    paperPages.length + (cover.enabled ? 1 : 0) + answerKey.pages.length;
  const previewContentHeight =
    renderedPageCount > 0
      ? renderedPageCount * baseWidth * PAPER_SIZE_SPECS[paperSize].heightRatio +
        (renderedPageCount - 1) * PREVIEW_PAGE_GAP
      : 0;

  function handleDownloadDocx() {
    startTransition(() => {
      const link = document.createElement("a");
      link.href = `/api/exams/${exam.id}/export-docx?t=${Date.now()}`;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  function handleDownloadDocxWithAnswers() {
    startTransition(() => {
      const link = document.createElement("a");
      link.href = `/api/exams/${exam.id}/export-docx?answers=true&t=${Date.now()}`;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  function handleDownloadHwpx() {
    startTransition(() => {
      const link = document.createElement("a");
      link.href = `/api/exams/${exam.id}/export-hwpx?t=${Date.now()}`;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  function handleDownloadHwpxWithAnswers() {
    startTransition(() => {
      const link = document.createElement("a");
      link.href = `/api/exams/${exam.id}/export-hwpx?answers=true&t=${Date.now()}`;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  const classes = exam.class ? [{ id: exam.class.id, name: exam.class.name }] : [];
  const schools = exam.school ? [{ id: exam.school.id, name: exam.school.name }] : [];

  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100/70 shadow-sm",
        className ?? "h-[calc(100dvh-282px)] min-h-[620px]",
      )}
    >
      <PreviewToolbar
        template={template}
        paperSize={paperSize}
        dirty={false}
        isPending={isPending}
        paperItemsCount={paperItems.length}
        // click 안에서 동기로 부르고(빠른 경로 · Safari 제스처) 누름에서 무장한다(click 전 「준비 중」 페인트). PDF = onPrint.
        onPrint={() => printCtl.print("plain")}
        printArming={printCtl.arming}
        onDownloadPdfWithAnswers={() => printCtl.print("explanation")}
        printBusy={printCtl.busy}
        onDownloadDocx={missingPassage.wrapExport("DOCX", handleDownloadDocx)}
        onDownloadDocxWithAnswers={missingPassage.wrapExport("DOCX", handleDownloadDocxWithAnswers)}
        onDownloadHwpx={missingPassage.wrapExport("HWPX", handleDownloadHwpx)}
        onDownloadHwpxWithAnswers={missingPassage.wrapExport("HWPX", handleDownloadHwpxWithAnswers)}
      />
      {/* 인쇄 진행 · 제스처 폴백 · 실패 사유 — 모든 폭에서 보인다(툴바 인쇄 버튼은 lg 미만에서 숨음). */}
      <PrintStatusBar controller={printCtl} />
      <MissingPassageBanner state={missingPassage} pages={paperPages} scrollRootRef={scrollerRef} />

      <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-100/70">
        {paperItems.length > 0 && (
          <PreviewZoomControls
            zoom={zoom}
            position={controlsPos}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={reset}
            onFit={fitToScreen}
            onDragStart={handleControlsDragStart}
          />
        )}
        <div
          id="exam-paper-print-root"
          ref={scrollerRef}
          className="h-full min-h-0 overflow-auto overscroll-contain px-5 py-5"
        >
          <PreviewPages
            paperItems={paperItems}
            paperPages={paperPages}
            overflowItemIds={paginationResult.overflowItems}
            previewBaseWidth={baseWidth || PREVIEW_PAGE_WIDTH}
            previewZoom={zoom}
            previewContentHeight={previewContentHeight}
            singlePageHeight={
              (baseWidth || PREVIEW_PAGE_WIDTH) *
              PAPER_SIZE_SPECS[paperSize].heightRatio
            }
            answerKey={answerKey}
            forceMountAll={forceMountAllPages || printCtl.forceMountAll || portalMountAll}
            onPageMounted={requestMeasure}
            title={exam.title}
            paperSize={paperSize}
            subtitle={paperHeader.subtitle}
            instructions={paperHeader.instructions}
            studentNameLabel={paperHeader.studentNameLabel}
            academyLogoDataUrl={paperHeader.academyLogoDataUrl}
            template={template}
            columns={columns}
            density={density}
            passageStyle={passageStyle}
            showAnswerSpace={showAnswerSpace}
            showPassageTitle={showPassageTitle}
            showQuestionMeta={showQuestionMeta}
            cover={cover}
            updateCover={() => undefined}
            activeItemId={activeItemId}
            setActiveItemId={setActiveItemId}
            lineCaret={null}
            setLineCaret={() => undefined}
            updateHeader={() => undefined}
            updateItem={() => undefined}
            updateGroupPassage={() => undefined}
            moveItemToDropTarget={() => undefined}
            removeItem={() => undefined}
            ungroupItem={() => undefined}
            regroupByPassage={() => undefined}
            tryToggleKeepWithPrev={() => undefined}
            draggingItemId={draggingItemId}
            setDraggingItemId={setDraggingItemId}
            dragOverItemId={dragOverItemId}
            setDragOverItemId={setDragOverItemId}
            dragOverPartKey={dragOverPartKey}
            setDragOverPartKey={setDragOverPartKey}
            dragPlacement={dragPlacement}
            setDragPlacement={setDragPlacement}
            schools={schools}
            classes={classes}
            schoolId={exam.school?.id || ""}
            classId={exam.class?.id || ""}
            examDate={formatExamDate(exam.examDate)}
            readOnly
          />
        </div>
      </div>

      <PrintStyles paperSize={paperSize} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// ExamFirstPagePreview — 시험지 카드 좌측에 들어가는 "첫 장" 실제 렌더.
//   상세 미리보기와 동일한 빌더 파이프라인(buildPaperItems → groups → 페이지
//   분할)을 거친 뒤, 첫 페이지(표지가 켜져 있으면 표지) 한 장만 목표 폭에 맞춰
//   축소 렌더한다. 툴바/줌/스크롤 없이 종이 한 장만 보여준다.
//
//   `maxPages`(26-09-03, additive · 기본 1 = 기존 호출부 무회귀): 렌더할 장 수
//   상한. 표지는 **한 장으로 계산**한다(표지+본문 1장 = maxPages 2). 시험 분석
//   레일의 [원본] 탭이 「조판된 시험지 전체」를 보여주려고 쓴다 — 이 컴포넌트를
//   고른 이유는 ExamDetailPaperPreview 가 레일에 들어갈 수 없기 때문이다:
//   그쪽은 `#exam-paper-print-root` + usePrintPortal 로 **앱 전역 인쇄**를
//   가로채고(학습지 조판 인쇄를 794x1123 → 0x0 으로 백지화시킨 실측 이력),
//   툴바·줌 컨트롤까지 달고 온다. 이쪽은 순수 CSS scale 한 겹이라 안전하다.
//   여러 장을 그려도 PreviewPages 가 IntersectionObserver 로 지연 마운트한다.
// ---------------------------------------------------------------------------
export function ExamFirstPagePreview({
  exam,
  width = 320,
  maxPages = 1,
}: {
  exam: ExamDetail;
  width?: number;
  maxPages?: number;
}) {
  const settings = useMemo(() => parseBuilderSettings(exam.settings), [exam.settings]);
  const paperLayout = useMemo(() => resolvePaperLayout(settings), [settings]);
  const { template, paperSize, columns, density, passageStyle, cover, header: paperHeader } = paperLayout;
  const { showAnswerSpace, showPassageTitle, showQuestionMeta } = paperLayout;

  const paperItems = useMemo(() => buildPaperItems(exam, settings), [exam, settings]);
  const paperGroups = useMemo(() => buildGroups(paperItems), [paperItems]);
  const paginationSettings = useMemo<PaginationSettings>(
    () => ({
      paperSize,
      columns,
      density,
      passageStyle,
      showAnswerSpace,
      showPassageTitle,
      showQuestionMeta,
      template,
      textMetrics: "exam-font",
    }),
    [paperSize, columns, density, passageStyle, showAnswerSpace, showPassageTitle, showQuestionMeta, template],
  );
  // 첫 장 미리보기도 실측 넘침 보정을 건다 — 카드의 첫 장이 실제 시험지 첫 장과 같게.
  const previewRootRef = useRef<HTMLDivElement>(null);
  const { paginationResult, requestMeasure } = useOverflowGuardedPagination(
    paperGroups,
    paginationSettings,
    previewRootRef,
  );

  const baseWidth = PREVIEW_PAGE_WIDTH;
  const heightRatio = PAPER_SIZE_SPECS[paperSize].heightRatio;
  const zoom = width / baseWidth;

  // 렌더 장 수: 표지가 켜져 있으면 그 한 장이 예산을 먼저 먹는다.
  // maxPages=1(기본)이면 「표지 한 장」 또는 「본문 첫 장」 — 구 동작과 동일하다.
  const showCover = cover.enabled;
  const bodyBudget = Math.max(0, showCover ? maxPages - 1 : maxPages);
  const firstPages = paginationResult.pages.slice(0, bodyBudget);
  const renderCover = showCover ? cover : { ...cover, enabled: false };
  // zoom-spacer 높이는 **베이스 단위**로 넘긴다(PreviewPages 가 zoom 을 곱한다).
  // 상세 미리보기(:496)와 같은 산식 — 장 사이 PREVIEW_PAGE_GAP 을 포함한다.
  const renderedPageCount = firstPages.length + (showCover ? 1 : 0);
  const contentHeight =
    renderedPageCount > 0
      ? renderedPageCount * baseWidth * heightRatio +
        (renderedPageCount - 1) * PREVIEW_PAGE_GAP
      : 0;

  const classes = exam.class ? [{ id: exam.class.id, name: exam.class.name }] : [];
  const schools = exam.school ? [{ id: exam.school.id, name: exam.school.name }] : [];

  const noop = () => undefined;

  if (paperItems.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[11px] text-slate-300">
        미리보기 없음
      </div>
    );
  }

  return (
    <div
      ref={previewRootRef}
      className="overflow-hidden bg-white"
      style={{ width, height: contentHeight * zoom }}
      aria-hidden
    >
      <PreviewPages
        paperItems={paperItems}
        paperPages={firstPages}
        overflowItemIds={paginationResult.overflowItems}
        previewBaseWidth={baseWidth}
        previewZoom={zoom}
        previewContentHeight={contentHeight}
        singlePageHeight={baseWidth * heightRatio}
        answerKey={EMPTY_ANSWER_KEY_LAYOUT}
        onPageMounted={requestMeasure}
        title={exam.title}
        paperSize={paperSize}
        subtitle={paperHeader.subtitle}
        instructions={paperHeader.instructions}
        studentNameLabel={paperHeader.studentNameLabel}
        academyLogoDataUrl={paperHeader.academyLogoDataUrl}
        template={template}
        columns={columns}
        density={density}
        passageStyle={passageStyle}
        showAnswerSpace={showAnswerSpace}
        showPassageTitle={showPassageTitle}
        showQuestionMeta={showQuestionMeta}
        cover={renderCover}
        updateCover={noop}
        activeItemId={null}
        setActiveItemId={noop}
        lineCaret={null}
        setLineCaret={noop}
        updateHeader={noop}
        updateItem={noop}
        updateGroupPassage={noop}
        moveItemToDropTarget={noop}
        removeItem={noop}
        ungroupItem={noop}
        regroupByPassage={noop}
        tryToggleKeepWithPrev={noop}
        draggingItemId={null}
        setDraggingItemId={noop}
        dragOverItemId={null}
        setDragOverItemId={noop}
        dragOverPartKey={null}
        setDragOverPartKey={noop}
        dragPlacement="before"
        setDragPlacement={noop}
        schools={schools}
        classes={classes}
        schoolId={exam.school?.id || ""}
        classId={exam.class?.id || ""}
        examDate={formatExamDate(exam.examDate)}
        readOnly
      />
    </div>
  );
}
