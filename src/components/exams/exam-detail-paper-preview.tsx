"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { incrementExamPrintCount } from "@/actions/exams";
import { PreviewPages } from "./exam-paper-builder-client-parts/preview-pages";
import { PreviewToolbar } from "./exam-paper-builder-client-parts/preview-toolbar";
import { PreviewZoomControls } from "./exam-paper-builder-client-parts/preview-zoom-controls";
import { usePreviewZoom } from "./exam-paper-builder-client-parts/use-preview-zoom";
import {
  DEFAULT_INSTRUCTIONS,
  DEFAULT_SHOW_PASSAGE_TITLE,
  PAPER_SIZE_SPECS,
  PREVIEW_PAGE_WIDTH,
} from "./paper-builder/constants";
import { PrintStyles } from "./paper-builder/components/print-styles";
import { usePrintPortal } from "./paper-builder/hooks/use-print-portal";
import { paginateGroups } from "./paper-builder/pagination";
import {
  buildGroups,
  formatDateInput,
  makeCustomPaperBlock,
  makePaperItem,
  parseOptions,
} from "./paper-builder/paper-item-utils";
import { shouldIncludeSourcePassageByDefault } from "./paper-builder/passage-policy";
import {
  normalizeInlineText,
  normalizePassageText,
  normalizeQuestionText,
} from "./paper-builder/text-normalization";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { buildCanonicalSentenceInsertOptionsFrom } from "@/lib/sentence-insert-options";
import type {
  BuilderQuestion,
  BreakBefore,
  Density,
  InsertablePaperBlockType,
  PaperCover,
  PaperItem,
  PaperSize,
  PaperTemplate,
  PaginationSettings,
  PassageStyle,
} from "./paper-builder/types";
import { normalizePaperCover } from "./paper-builder/saved-template-settings";
import type { ExamDetail, ExamQuestion } from "./exam-detail-client-parts/types";

const PREVIEW_PAGE_GAP = 20;

type SavedBuilderItem = {
  localId?: string;
  blockType?: "question";
  questionId?: string;
  orderNum?: number;
  points?: number;
  groupId?: string | null;
  includePassage?: boolean;
  passageTitle?: string;
  passageContent?: string;
  questionText?: string;
  options?: Array<{ label: string; text: string }>;
  correctAnswer?: string;
  answerSpaceLines?: number;
  objectiveAnswerSlots?: number;
  objectiveAnswerTexts?: string[];
  sectionTitle?: string;
  teacherNote?: string;
  breakBefore?: BreakBefore;
  keepWithPrev?: boolean;
};

type SavedBuilderBlock = Omit<SavedBuilderItem, "blockType"> & {
  localId?: string;
  blockType?: PaperItem["blockType"];
  locked?: boolean;
  blockTitle?: string;
  blockText?: string;
  blockAlign?: PaperItem["blockAlign"];
  blockFontSize?: PaperItem["blockFontSize"];
  blockAccentColor?: string;
  dividerStyle?: PaperItem["dividerStyle"];
  dividerThickness?: number;
  spacerHeight?: number;
  imageDataUrl?: string | null;
  imageAlt?: string;
  imageWidth?: number;
};

type SavedBuilderSettings = {
  source?: string;
  version?: number;
  template?: string;
  layout?: {
    columns?: 1 | 2;
    paperSize?: PaperSize;
    density?: Density;
    showAnswerSpace?: boolean;
    showPassageTitle?: boolean;
    showQuestionMeta?: boolean;
    passageStyle?: PassageStyle;
  };
  header?: {
    subtitle?: string;
    studentNameLabel?: string;
    instructions?: string;
    academyLogoDataUrl?: string | null;
  };
  cover?: Partial<PaperCover>;
  items?: SavedBuilderItem[];
  blocks?: SavedBuilderBlock[];
};

function parseBuilderSettings(raw: string | null): SavedBuilderSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SavedBuilderSettings) : null;
  } catch {
    return null;
  }
}

function asPaperTemplate(value: unknown): PaperTemplate {
  const templates: PaperTemplate[] = ["clean", "mock", "worksheet", "minimal", "academy", "modern", "classic", "colorband"];
  return templates.includes(value as PaperTemplate) ? (value as PaperTemplate) : "clean";
}

function asPaperSize(value: unknown): PaperSize {
  return value === "B4" ? "B4" : "A4";
}

function asDensity(value: unknown): Density {
  return value === "compact" ? "compact" : "comfortable";
}

function asPassageStyle(value: unknown): PassageStyle {
  void value;
  return "plain";
}

function asBreakBefore(value: unknown): BreakBefore {
  return value === "column" || value === "page" ? value : "auto";
}

function asObjectiveAnswerTexts(value: unknown, slots: number): string[] {
  if (!Array.isArray(value) || slots <= 0) return [];
  return value.slice(0, slots).map((text) => String(text ?? ""));
}

function printablePassageTitle(savedTitle: string | undefined, sourceTitle: string | undefined): string {
  const saved = normalizeInlineText(savedTitle || "");
  if (!saved) return "";
  return saved === normalizeInlineText(sourceTitle || "") ? "" : saved;
}

function examQuestionToBuilderQuestion(eq: ExamQuestion, saved?: SavedBuilderItem): BuilderQuestion {
  const q = eq.question;
  const questionText = normalizeQuestionText(
    repairGrammarCorrectionQuestionText({
      subType: q.subType,
      questionText: saved?.questionText ?? q.questionText,
      structuredData: q.structuredData,
    }),
  );
  const passageContent = normalizePassageText(saved?.passageContent ?? q.passage?.content ?? "");
  const passageTitle = normalizeInlineText(saved?.passageTitle ?? q.passage?.title ?? "");
  const passage =
    q.passage || passageContent
      ? {
          id: q.passage?.id ?? `saved:${q.id}`,
          title: passageTitle,
          content: passageContent,
          grade: q.passage?.grade ?? null,
          semester: q.passage?.semester ?? null,
          publisher: q.passage?.publisher ?? null,
          school: q.passage?.school ?? null,
        }
      : null;

  return {
    id: q.id,
    type: q.type,
    subType: q.subType,
    questionText,
    structuredData: q.structuredData,
    options: q.options,
    correctAnswer: saved?.correctAnswer ?? q.correctAnswer,
    points: saved?.points ?? eq.points ?? q.points ?? 1,
    difficulty: q.difficulty,
    tags: q.tags,
    aiGenerated: q.aiGenerated,
    approved: q.approved,
    starred: q.starred,
    createdAt: q.createdAt,
    passage,
    explanation: q.explanation
      ? {
          id: q.explanation.id || "",
          content: q.explanation.content,
          keyPoints: q.explanation.keyPoints ?? null,
          wrongOptionExplanations: q.explanation.wrongOptionExplanations ?? null,
        }
      : null,
    collectionItems: q.collectionItems || [],
    examLinks: [],
    _count: q._count || { examLinks: 0 },
  };
}

function savedItemToPaperItem(saved: SavedBuilderItem, eq: ExamQuestion, index: number): PaperItem {
  const sourceQuestion = examQuestionToBuilderQuestion(eq, saved);
  const localId = saved.localId || `${sourceQuestion.id}-saved-${index}`;
  const passageContent = normalizePassageText(saved.passageContent ?? sourceQuestion.passage?.content ?? "");
  const defaultIncludePassage = shouldIncludeSourcePassageByDefault({
    ...sourceQuestion,
    passage: sourceQuestion.passage
      ? { ...sourceQuestion.passage, content: passageContent }
      : sourceQuestion.passage,
  });
  const rawOptions = Array.isArray(saved.options)
    ? saved.options.map((option, optionIndex) => ({
        label: normalizeInlineText(option.label || String(optionIndex + 1)),
        text: normalizeQuestionText(option.text || ""),
      }))
    : parseOptions(sourceQuestion.options);
  const options =
    sourceQuestion.subType === "SENTENCE_INSERT"
      ? buildCanonicalSentenceInsertOptionsFrom(rawOptions)
      : rawOptions;
  const objectiveAnswerSlots = Math.max(0, Math.min(10, Number(saved.objectiveAnswerSlots) || 0));
  const answerSpaceLines =
    sourceQuestion.subType === "GRAMMAR_CORRECTION"
      ? 0
      : Math.max(0, Math.min(12, Number(saved.answerSpaceLines) || (options.length === 0 ? 4 : 0)));

  return {
    localId,
    questionId: sourceQuestion.id,
    sourceQuestion,
    orderNum: saved.orderNum || index + 1,
    points: saved.points || eq.points || sourceQuestion.points || 1,
    groupId: saved.groupId ?? `single:${localId}`,
    includePassage: defaultIncludePassage || (saved.includePassage === true),
    passageTitle: printablePassageTitle(saved.passageTitle, eq.question.passage?.title),
    passageContent,
    questionText: sourceQuestion.questionText,
    options,
    correctAnswer: saved.correctAnswer ?? sourceQuestion.correctAnswer ?? "",
    answerSpaceLines,
    objectiveAnswerSlots,
    objectiveAnswerTexts: asObjectiveAnswerTexts(saved.objectiveAnswerTexts, objectiveAnswerSlots),
    sectionTitle: saved.sectionTitle || "",
    teacherNote: saved.teacherNote || "",
    breakBefore: asBreakBefore(saved.breakBefore),
    keepWithPrev: Boolean(saved.keepWithPrev),
    blockType: "question",
    locked: false,
    blockTitle: "",
    blockText: "",
    blockAlign: "left",
    blockFontSize: "md",
    blockAccentColor: "#2563EB",
    dividerStyle: "solid",
    dividerThickness: 1,
    spacerHeight: 32,
    imageDataUrl: null,
    imageAlt: "",
    imageWidth: 70,
  };
}

function savedBlockToPaperItem(saved: SavedBuilderBlock, index: number): PaperItem | null {
  const blockType = saved.blockType;
  if (
    blockType !== "text" &&
    blockType !== "section" &&
    blockType !== "divider" &&
    blockType !== "spacer" &&
    blockType !== "image"
  ) {
    return null;
  }

  const base = makeCustomPaperBlock(blockType as InsertablePaperBlockType, index + 1);
  const localId = saved.localId || base.localId;
  const blockText = saved.blockText ?? saved.questionText ?? base.blockText;
  const blockTitle = saved.blockTitle ?? saved.sectionTitle ?? base.blockTitle;

  const objectiveAnswerSlots = Math.max(0, Math.min(10, Number(saved.objectiveAnswerSlots) || base.objectiveAnswerSlots));

  return {
    ...base,
    localId,
    questionId: `custom:${localId}`,
    sourceQuestion: {
      ...base.sourceQuestion,
      id: localId,
      questionText: blockText || blockTitle || base.sourceQuestion.questionText,
    },
    groupId: saved.groupId ?? `block:${localId}`,
    questionText: blockText || blockTitle || base.questionText,
    breakBefore: asBreakBefore(saved.breakBefore),
    keepWithPrev: Boolean(saved.keepWithPrev),
    locked: Boolean(saved.locked),
    blockTitle,
    blockText,
    blockAlign:
      saved.blockAlign === "center" || saved.blockAlign === "right"
        ? saved.blockAlign
        : "left",
    blockFontSize:
      saved.blockFontSize === "sm" || saved.blockFontSize === "lg"
        ? saved.blockFontSize
        : base.blockFontSize,
    blockAccentColor: saved.blockAccentColor || base.blockAccentColor,
    dividerStyle:
      saved.dividerStyle === "dashed" || saved.dividerStyle === "dotted"
        ? saved.dividerStyle
        : "solid",
    dividerThickness: Math.max(1, Math.min(8, Number(saved.dividerThickness) || base.dividerThickness)),
    spacerHeight: Math.max(8, Math.min(160, Number(saved.spacerHeight) || base.spacerHeight)),
    imageDataUrl: saved.imageDataUrl ?? null,
    imageAlt: saved.imageAlt || "",
    imageWidth: Math.max(20, Math.min(100, Number(saved.imageWidth) || base.imageWidth)),
    objectiveAnswerSlots,
    objectiveAnswerTexts: asObjectiveAnswerTexts(saved.objectiveAnswerTexts, objectiveAnswerSlots),
  };
}

function buildPaperItems(exam: ExamDetail, settings: SavedBuilderSettings | null): PaperItem[] {
  const byQuestionId = new Map(exam.questions.map((eq) => [eq.question.id, eq]));
  const savedBlocks =
    settings?.source === "exam-paper-builder-v2" && Array.isArray(settings.blocks)
      ? settings.blocks
      : [];
  const savedItems =
    (settings?.source === "exam-paper-builder-v1" || settings?.source === "exam-paper-builder-v2") &&
    Array.isArray(settings.items)
      ? settings.items
      : [];

  if (savedBlocks.length > 0) {
    const blocks = savedBlocks
      .map((saved, index) => {
        if (saved.blockType === "question") {
          if (!saved.questionId) return null;
          const eq = byQuestionId.get(saved.questionId);
          return eq ? savedItemToPaperItem({ ...saved, blockType: "question" }, eq, index) : null;
        }
        return savedBlockToPaperItem(saved, index);
      })
      .filter((item): item is PaperItem => Boolean(item));
    let questionOrder = 0;
    return blocks.map((item) =>
      item.blockType === "question"
        ? { ...item, orderNum: (questionOrder += 1) }
        : { ...item, orderNum: 0 },
    );
  }

  if (savedItems.length > 0) {
    return savedItems
      .map((saved, index) => {
        if (!saved.questionId) return null;
        const eq = byQuestionId.get(saved.questionId);
        return eq ? savedItemToPaperItem(saved, eq, index) : null;
      })
      .filter((item): item is PaperItem => Boolean(item))
      .sort((a, b) => a.orderNum - b.orderNum)
      .map((item, index) => ({ ...item, orderNum: index + 1 }));
  }

  return exam.questions.map((eq, index) => {
    const sourceQuestion = examQuestionToBuilderQuestion(eq);
    return {
      ...makePaperItem(sourceQuestion, index + 1, []),
      points: eq.points || sourceQuestion.points || 1,
    };
  });
}

function formatExamDate(value: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatDateInput(date);
}

export function ExamDetailPaperPreview({ exam }: { exam: ExamDetail }) {
  const [isPending, startTransition] = useTransition();
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragOverPartKey, setDragOverPartKey] = useState<string | null>(null);
  const [dragPlacement, setDragPlacement] = useState<"before" | "after">("before");

  const settings = useMemo(() => parseBuilderSettings(exam.settings), [exam.settings]);
  const template = asPaperTemplate(settings?.template);
  const paperSize = asPaperSize(settings?.layout?.paperSize);
  const columns: 1 | 2 = settings?.layout?.columns === 1 ? 1 : 2;
  const density = asDensity(settings?.layout?.density);
  const passageStyle = asPassageStyle(settings?.layout?.passageStyle);
  const showAnswerSpace = settings?.layout?.showAnswerSpace ?? true;
  const showPassageTitle = settings?.layout?.showPassageTitle ?? DEFAULT_SHOW_PASSAGE_TITLE;
  const showQuestionMeta = settings?.layout?.showQuestionMeta ?? false;
  const cover = normalizePaperCover(settings?.cover);

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

  usePrintPortal(paperSize);

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
    }),
    [paperSize, columns, density, passageStyle, showAnswerSpace, showPassageTitle, showQuestionMeta, template],
  );
  const paginationResult = useMemo(
    () => paginateGroups(paperGroups, paginationSettings),
    [paperGroups, paginationSettings],
  );
  const paperPages = paginationResult.pages;
  // 표지가 켜져 있으면 본문 앞에 한 장 더 렌더되므로 zoom-spacer 높이에 반영한다.
  const renderedPageCount = paperPages.length + (cover.enabled ? 1 : 0);
  const previewContentHeight =
    renderedPageCount > 0
      ? renderedPageCount * baseWidth * PAPER_SIZE_SPECS[paperSize].heightRatio +
        (renderedPageCount - 1) * PREVIEW_PAGE_GAP
      : 0;

  function handlePrint() {
    if (paperItems.length === 0) {
      toast.error("인쇄할 문제가 없습니다.");
      return;
    }
    // PDF 인쇄 1회 → 인쇄 횟수 집계
    void incrementExamPrintCount(exam.id);
    window.setTimeout(() => window.print(), 50);
  }

  // ?print=1 로 열렸을 때(시험지 카드의 '인쇄' 버튼 → 새 탭) 미리보기가
  // 준비되면 자동으로 브라우저 인쇄 대화상자를 띄운다.
  const autoPrintedRef = useRef(false);
  useEffect(() => {
    if (autoPrintedRef.current) return;
    if (typeof window === "undefined") return;
    const shouldPrint =
      new URLSearchParams(window.location.search).get("print") === "1";
    if (!shouldPrint || paperItems.length === 0) return;
    autoPrintedRef.current = true;
    // 페이지 레이아웃/폰트가 안정된 뒤 인쇄가 뜨도록 약간의 지연을 둔다.
    const timer = window.setTimeout(() => handlePrint(), 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperItems.length]);

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
    <section className="flex h-[calc(100dvh-282px)] min-h-[620px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100/70 shadow-sm">
      <PreviewToolbar
        template={template}
        paperSize={paperSize}
        dirty={false}
        isPending={isPending}
        paperItemsCount={paperItems.length}
        onPrint={handlePrint}
        onDownloadPdf={handlePrint}
        onDownloadDocx={handleDownloadDocx}
        onDownloadDocxWithAnswers={handleDownloadDocxWithAnswers}
        onDownloadHwpx={handleDownloadHwpx}
        onDownloadHwpxWithAnswers={handleDownloadHwpxWithAnswers}
        onSave={() => toast.info("이미 저장된 시험지입니다.")}
      />

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
            title={exam.title}
            paperSize={paperSize}
            subtitle={settings?.header?.subtitle || ""}
            instructions={settings?.header?.instructions || DEFAULT_INSTRUCTIONS}
            studentNameLabel={settings?.header?.studentNameLabel || "이름"}
            academyLogoDataUrl={settings?.header?.academyLogoDataUrl || null}
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
// ---------------------------------------------------------------------------
export function ExamFirstPagePreview({
  exam,
  width = 320,
}: {
  exam: ExamDetail;
  width?: number;
}) {
  const settings = useMemo(() => parseBuilderSettings(exam.settings), [exam.settings]);
  const template = asPaperTemplate(settings?.template);
  const paperSize = asPaperSize(settings?.layout?.paperSize);
  const columns: 1 | 2 = settings?.layout?.columns === 1 ? 1 : 2;
  const density = asDensity(settings?.layout?.density);
  const passageStyle = asPassageStyle(settings?.layout?.passageStyle);
  const showAnswerSpace = settings?.layout?.showAnswerSpace ?? true;
  const showPassageTitle = settings?.layout?.showPassageTitle ?? DEFAULT_SHOW_PASSAGE_TITLE;
  const showQuestionMeta = settings?.layout?.showQuestionMeta ?? false;
  const cover = normalizePaperCover(settings?.cover);

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
    }),
    [paperSize, columns, density, passageStyle, showAnswerSpace, showPassageTitle, showQuestionMeta, template],
  );
  const paginationResult = useMemo(
    () => paginateGroups(paperGroups, paginationSettings),
    [paperGroups, paginationSettings],
  );

  const baseWidth = PREVIEW_PAGE_WIDTH;
  const heightRatio = PAPER_SIZE_SPECS[paperSize].heightRatio;
  const zoom = width / baseWidth;
  const pageHeight = width * heightRatio;

  // "첫 장": 표지가 켜져 있으면 표지 한 장, 아니면 본문 첫 페이지 한 장만 그린다.
  const showCover = cover.enabled;
  const firstPages = showCover ? [] : paginationResult.pages.slice(0, 1);
  const renderCover = showCover ? cover : { ...cover, enabled: false };

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
      className="overflow-hidden bg-white"
      style={{ width, height: pageHeight }}
      aria-hidden
    >
      <PreviewPages
        paperItems={paperItems}
        paperPages={firstPages}
        overflowItemIds={paginationResult.overflowItems}
        previewBaseWidth={baseWidth}
        previewZoom={zoom}
        previewContentHeight={baseWidth * heightRatio}
        title={exam.title}
        paperSize={paperSize}
        subtitle={settings?.header?.subtitle || ""}
        instructions={settings?.header?.instructions || DEFAULT_INSTRUCTIONS}
        studentNameLabel={settings?.header?.studentNameLabel || "이름"}
        academyLogoDataUrl={settings?.header?.academyLogoDataUrl || null}
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
