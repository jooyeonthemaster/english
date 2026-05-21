"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PreviewPages } from "./exam-paper-builder-client-parts/preview-pages";
import { PreviewToolbar } from "./exam-paper-builder-client-parts/preview-toolbar";
import { PreviewZoomControls } from "./exam-paper-builder-client-parts/preview-zoom-controls";
import { usePreviewZoom } from "./exam-paper-builder-client-parts/use-preview-zoom";
import {
  A4_HEIGHT_RATIO,
  DEFAULT_INSTRUCTIONS,
  PREVIEW_PAGE_WIDTH,
} from "./paper-builder/constants";
import { PrintStyles } from "./paper-builder/components/print-styles";
import { usePrintPortal } from "./paper-builder/hooks/use-print-portal";
import { paginateGroups } from "./paper-builder/pagination";
import {
  buildGroups,
  formatDateInput,
  makePaperItem,
  parseOptions,
} from "./paper-builder/paper-item-utils";
import { shouldIncludeSourcePassageByDefault } from "./paper-builder/passage-policy";
import {
  normalizeInlineText,
  normalizePassageText,
  normalizeQuestionText,
} from "./paper-builder/text-normalization";
import type {
  BuilderQuestion,
  BreakBefore,
  Density,
  PaperItem,
  PaperTemplate,
  PaginationSettings,
  PassageStyle,
} from "./paper-builder/types";
import type { ExamDetail, ExamQuestion } from "./exam-detail-client-parts/types";

const PREVIEW_PAGE_GAP = 20;

type SavedBuilderItem = {
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
  sectionTitle?: string;
  teacherNote?: string;
  breakBefore?: BreakBefore;
  keepWithPrev?: boolean;
};

type SavedBuilderSettings = {
  source?: string;
  template?: string;
  layout?: {
    columns?: 1 | 2;
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
  items?: SavedBuilderItem[];
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

function asDensity(value: unknown): Density {
  return value === "compact" ? "compact" : "comfortable";
}

function asPassageStyle(value: unknown): PassageStyle {
  return value === "plain" || value === "underlined" ? value : "boxed";
}

function asBreakBefore(value: unknown): BreakBefore {
  return value === "column" || value === "page" ? value : "auto";
}

function examQuestionToBuilderQuestion(eq: ExamQuestion, saved?: SavedBuilderItem): BuilderQuestion {
  const q = eq.question;
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
    questionText: normalizeQuestionText(saved?.questionText ?? q.questionText),
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
    _count: q._count || { examLinks: 0 },
  };
}

function savedItemToPaperItem(saved: SavedBuilderItem, eq: ExamQuestion, index: number): PaperItem {
  const sourceQuestion = examQuestionToBuilderQuestion(eq, saved);
  const localId = `${sourceQuestion.id}-saved-${index}`;
  const defaultIncludePassage = shouldIncludeSourcePassageByDefault(sourceQuestion);
  const options = Array.isArray(saved.options)
    ? saved.options.map((option, optionIndex) => ({
        label: normalizeInlineText(option.label || String(optionIndex + 1)),
        text: normalizeQuestionText(option.text || ""),
      }))
    : parseOptions(sourceQuestion.options);

  return {
    localId,
    questionId: sourceQuestion.id,
    sourceQuestion,
    orderNum: saved.orderNum || index + 1,
    points: saved.points || eq.points || sourceQuestion.points || 1,
    groupId: saved.groupId ?? `single:${localId}`,
    includePassage: saved.includePassage === false ? false : defaultIncludePassage,
    passageTitle: normalizeInlineText(saved.passageTitle ?? sourceQuestion.passage?.title ?? ""),
    passageContent: normalizePassageText(saved.passageContent ?? sourceQuestion.passage?.content ?? ""),
    questionText: normalizeQuestionText(saved.questionText ?? sourceQuestion.questionText),
    options,
    correctAnswer: saved.correctAnswer ?? sourceQuestion.correctAnswer ?? "",
    answerSpaceLines: Math.max(0, Math.min(12, Number(saved.answerSpaceLines) || (options.length === 0 ? 4 : 0))),
    sectionTitle: saved.sectionTitle || "",
    teacherNote: saved.teacherNote || "",
    breakBefore: asBreakBefore(saved.breakBefore),
    keepWithPrev: Boolean(saved.keepWithPrev),
  };
}

function buildPaperItems(exam: ExamDetail, settings: SavedBuilderSettings | null): PaperItem[] {
  const byQuestionId = new Map(exam.questions.map((eq) => [eq.question.id, eq]));
  const savedItems =
    settings?.source === "exam-paper-builder-v1" && Array.isArray(settings.items)
      ? settings.items
      : [];

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragPlacement, setDragPlacement] = useState<"before" | "after">("before");
  const {
    scrollerRef,
    zoom,
    baseWidth,
    controlsPos,
    zoomIn,
    zoomOut,
    reset,
    handleControlsDragStart,
  } = usePreviewZoom();

  usePrintPortal();

  const settings = useMemo(() => parseBuilderSettings(exam.settings), [exam.settings]);
  const template = asPaperTemplate(settings?.template);
  const columns: 1 | 2 = settings?.layout?.columns === 1 ? 1 : 2;
  const density = asDensity(settings?.layout?.density);
  const passageStyle = asPassageStyle(settings?.layout?.passageStyle);
  const showAnswerSpace = settings?.layout?.showAnswerSpace ?? true;
  const showPassageTitle = settings?.layout?.showPassageTitle ?? true;
  const showQuestionMeta = settings?.layout?.showQuestionMeta ?? true;

  const paperItems = useMemo(() => buildPaperItems(exam, settings), [exam, settings]);
  const paperGroups = useMemo(() => buildGroups(paperItems), [paperItems]);
  const paginationSettings = useMemo<PaginationSettings>(
    () => ({
      columns,
      density,
      passageStyle,
      showAnswerSpace,
      showPassageTitle,
      showQuestionMeta,
      template,
    }),
    [columns, density, passageStyle, showAnswerSpace, showPassageTitle, showQuestionMeta, template],
  );
  const paginationResult = useMemo(
    () => paginateGroups(paperGroups, paginationSettings),
    [paperGroups, paginationSettings],
  );
  const paperPages = paginationResult.pages;
  const previewContentHeight =
    paperPages.length > 0
      ? paperPages.length * baseWidth * A4_HEIGHT_RATIO +
        (paperPages.length - 1) * PREVIEW_PAGE_GAP
      : 0;

  function handlePrint() {
    if (paperItems.length === 0) {
      toast.error("인쇄할 문제가 없습니다.");
      return;
    }
    window.setTimeout(() => window.print(), 50);
  }

  function handleDownloadDocx() {
    startTransition(() => {
      const link = document.createElement("a");
      link.href = `/api/exams/${exam.id}/export-docx`;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  function handleDownloadDocxWithAnswers() {
    startTransition(() => {
      const link = document.createElement("a");
      link.href = `/api/exams/${exam.id}/export-docx?answers=true`;
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
        dirty={false}
        isPending={isPending}
        paperItemsCount={paperItems.length}
        onGoToManage={() => router.push("/director/workbench/exams")}
        onPrint={handlePrint}
        onDownloadDocx={handleDownloadDocx}
        onDownloadDocxWithAnswers={handleDownloadDocxWithAnswers}
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

      <PrintStyles />
    </section>
  );
}
