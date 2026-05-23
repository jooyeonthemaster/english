"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  BuilderQuestion,
  ClassOption,
  Density,
  HeaderPatch,
  PaginationSettings,
  PaperTemplate,
  PassageStyle,
  QuestionCollection,
  SchoolOption,
} from "./paper-builder/types";
import {
  A4_HEIGHT_RATIO,
  DEFAULT_INSTRUCTIONS,
  SUBTYPE_LABELS,
} from "./paper-builder/constants";
import {
  buildGroups,
  formatDateInput,
  parseTags,
} from "./paper-builder/paper-item-utils";
import { paginateGroups } from "./paper-builder/pagination";
import { usePrintPortal } from "./paper-builder/hooks/use-print-portal";
import { useTemplateFloatingDrag } from "./paper-builder/hooks/use-template-floating-drag";
import { PrintStyles } from "./paper-builder/components/print-styles";
import { QuestionDetailModal } from "./paper-builder/components/question-detail-modal";
import { QuestionLibraryPanel } from "./paper-builder/components/question-library-panel";
import { TemplateFloatingButton } from "./paper-builder/components/template-floating-button";
import { TemplateSettingsPanel } from "./paper-builder/components/template-settings-panel";
import { PreviewPages } from "./exam-paper-builder-client-parts/preview-pages";
import { PreviewToolbar } from "./exam-paper-builder-client-parts/preview-toolbar";
import { PreviewZoomControls } from "./exam-paper-builder-client-parts/preview-zoom-controls";
import { saveExamPaperDraftFromBuilder } from "./exam-paper-builder-client-parts/save-draft";
import { usePaperItems } from "./exam-paper-builder-client-parts/use-paper-items";
import { usePreviewZoom } from "./exam-paper-builder-client-parts/use-preview-zoom";

interface ExamPaperBuilderClientProps {
  academyId: string;
  questions: BuilderQuestion[];
  collections: QuestionCollection[];
  classes: ClassOption[];
  schools: SchoolOption[];
}

const PREVIEW_PAGE_GAP = 20;

export function ExamPaperBuilderClient({
  academyId,
  questions,
  collections,
  classes,
  schools,
}: ExamPaperBuilderClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [savedExamId, setSavedExamId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [difficulty, setDifficulty] = useState("ALL");
  const [selectedSubTypes, setSelectedSubTypes] = useState<string[]>([]);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [detailQuestion, setDetailQuestion] = useState<BuilderQuestion | null>(null);
  const {
    scrollerRef: previewScrollerRef,
    zoom: previewZoom,
    baseWidth: previewBaseWidth,
    controlsPos: previewZoomControlsPos,
    zoomIn: zoomPreviewIn,
    zoomOut: zoomPreviewOut,
    reset: resetPreviewZoom,
    handleControlsDragStart: handlePreviewZoomControlsDragStart,
  } = usePreviewZoom();

  const [title, setTitle] = useState(`새 시험지 ${formatDateInput(new Date())}`);
  const [subtitle, setSubtitle] = useState("영어 내신 대비");
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [studentNameLabel, setStudentNameLabel] = useState("이름");
  const [academyLogoDataUrl, setAcademyLogoDataUrl] = useState<string | null>(null);
  const [examDate] = useState("");
  const [classId] = useState("");
  const [schoolId] = useState("");
  const [grade] = useState("");
  const [semester] = useState("");
  const [examType] = useState("MIDTERM");

  const [template, setTemplate] = useState<PaperTemplate>("clean");
  const [columns, setColumns] = useState<1 | 2>(2);
  const [density, setDensity] = useState<Density>("comfortable");
  const [passageStyle, setPassageStyle] = useState<PassageStyle>("boxed");
  const showAnswerSpace = true;
  const [showPassageTitle, setShowPassageTitle] = useState(true);
  const [showQuestionMeta, setShowQuestionMeta] = useState(true);
  const {
    paperItems,
    activeItemId,
    setActiveItemId,
    totalPoints,
    toggleQuestion,
    selectAllFiltered,
    clearPaper,
    updateItem,
    tryToggleKeepWithPrev,
    updateGroupPassage,
    removeItem,
    moveItemToDropTarget,
    ungroupItem,
    regroupByPassage,
  } = usePaperItems(markDirty);
  const {
    offset: templateFloatingOffset,
    panelOpen: templatePanelOpen,
    setPanelOpen: setTemplatePanelOpen,
    hostRef: templateFloatingHostRef,
    startDrag: startTemplateFloatingDrag,
    handleClick: handleTemplateFloatingButtonClick,
  } = useTemplateFloatingDrag();
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragPlacement, setDragPlacement] = useState<"before" | "after">("before");

  const selectedQuestionIds = useMemo(
    () => new Set(paperItems.map((item) => item.questionId)),
    [paperItems],
  );

  const filteredQuestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return questions.filter((question) => {
      if (selectedCollectionId && !question.collectionItems.some((item) => item.collectionId === selectedCollectionId)) {
        return false;
      }
      if (difficulty !== "ALL" && question.difficulty !== difficulty) return false;
      if (selectedSubTypes.length > 0 && !selectedSubTypes.includes(question.subType || "")) {
        return false;
      }
      if (approvedOnly && !question.approved) return false;
      if (starredOnly && !question.starred) return false;
      if (query) {
        const tags = parseTags(question.tags).join(" ");
        const haystack = [
          question.questionText,
          question.correctAnswer,
          question.passage?.title || "",
          question.passage?.content || "",
          tags,
          SUBTYPE_LABELS[question.subType || ""] || "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [questions, search, selectedCollectionId, difficulty, selectedSubTypes, approvedOnly, starredOnly]);

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
  const overflowItemIds = paginationResult.overflowItems;
  const previewContentHeight =
    paperPages.length > 0
      ? paperPages.length * previewBaseWidth * A4_HEIGHT_RATIO +
        (paperPages.length - 1) * PREVIEW_PAGE_GAP
      : 0;

  function markDirty() {
    setDirty(true);
  }

  function updateHeader(patch: HeaderPatch) {
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.subtitle !== undefined) setSubtitle(patch.subtitle);
    if (patch.instructions !== undefined) setInstructions(patch.instructions);
    if (patch.studentNameLabel !== undefined) setStudentNameLabel(patch.studentNameLabel);
    if (patch.academyLogoDataUrl !== undefined) setAcademyLogoDataUrl(patch.academyLogoDataUrl);
    markDirty();
  }

  function handleLogoUpload(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 로고로 넣을 수 있습니다.");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("로고 이미지는 1.5MB 이하로 올려주세요.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        toast.error("로고 이미지를 읽지 못했습니다.");
        return;
      }
      setAcademyLogoDataUrl(result);
      markDirty();
    };
    reader.onerror = () => toast.error("로고 이미지를 읽지 못했습니다.");
    reader.readAsDataURL(file);
  }

  async function saveDraft(): Promise<string | null> {
    const result = await saveExamPaperDraftFromBuilder({
      academyId,
      savedExamId,
      title,
      classId,
      schoolId,
      grade,
      semester,
      examType,
      examDate,
      totalPoints,
      template,
      columns,
      density,
      showAnswerSpace,
      showPassageTitle,
      showQuestionMeta,
      passageStyle,
      subtitle,
      studentNameLabel,
      instructions,
      academyLogoDataUrl,
      paperItems,
      classes,
      schools,
    });

    if (!result.success) return null;

    setSavedExamId(result.id);
    setDirty(false);
    return result.id;
  }

  function handleSave() {
    startTransition(async () => {
      await saveDraft();
    });
  }

  function handlePrint() {
    if (paperItems.length === 0) {
      toast.error("인쇄할 문제를 먼저 선택해주세요.");
      return;
    }
    window.setTimeout(() => window.print(), 50);
  }

  usePrintPortal();

  function triggerDocxDownload(examId: string, withAnswers: boolean) {
    const link = document.createElement("a");
    link.href = withAnswers
      ? `/api/exams/${examId}/export-docx?answers=true`
      : `/api/exams/${examId}/export-docx`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function handleDownloadDocx() {
    startTransition(async () => {
      const examId = dirty || !savedExamId ? await saveDraft() : savedExamId;
      if (!examId) return;
      triggerDocxDownload(examId, false);
    });
  }

  function handleDownloadDocxWithAnswers() {
    startTransition(async () => {
      const examId = dirty || !savedExamId ? await saveDraft() : savedExamId;
      if (!examId) return;
      triggerDocxDownload(examId, true);
    });
  }

  function triggerHwpxDownload(examId: string, withAnswers: boolean) {
    const link = document.createElement("a");
    link.href = withAnswers
      ? `/api/exams/${examId}/export-hwpx?answers=true`
      : `/api/exams/${examId}/export-hwpx`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function handleDownloadHwpx() {
    startTransition(async () => {
      const examId = dirty || !savedExamId ? await saveDraft() : savedExamId;
      if (!examId) return;
      triggerHwpxDownload(examId, false);
    });
  }

  function handleDownloadHwpxWithAnswers() {
    startTransition(async () => {
      const examId = dirty || !savedExamId ? await saveDraft() : savedExamId;
      if (!examId) return;
      triggerHwpxDownload(examId, true);
    });
  }

  function handleGoToManage() {
    if (dirty || !savedExamId) {
      startTransition(async () => {
        const examId = await saveDraft();
        if (examId) router.push("/director/workbench/exams");
      });
      return;
    }
    router.push("/director/workbench/exams");
  }

  const templateSettingsPanel = (
    <TemplateSettingsPanel
      template={template}
      setTemplate={setTemplate}
      academyLogoDataUrl={academyLogoDataUrl}
      setAcademyLogoDataUrl={setAcademyLogoDataUrl}
      onLogoUpload={handleLogoUpload}
      columns={columns}
      setColumns={setColumns}
      density={density}
      setDensity={setDensity}
      passageStyle={passageStyle}
      setPassageStyle={setPassageStyle}
      showPassageTitle={showPassageTitle}
      setShowPassageTitle={setShowPassageTitle}
      showQuestionMeta={showQuestionMeta}
      setShowQuestionMeta={setShowQuestionMeta}
      markDirty={markDirty}
      onClosePanel={() => setTemplatePanelOpen(false)}
      onPointerDownHeader={startTemplateFloatingDrag}
    />
  );

  return (
    <div id="exam-builder-shell" className="flex h-[calc(100dvh-64px)] min-h-0 flex-col overflow-hidden bg-[#F4F6F9]">
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-white lg:grid-cols-[minmax(520px,1fr)_minmax(560px,48vw)]">
        <QuestionLibraryPanel
          paperItemsCount={paperItems.length}
          filteredQuestions={filteredQuestions}
          selectedQuestionIds={selectedQuestionIds}
          collections={collections}
          search={search}
          setSearch={setSearch}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          selectedSubTypes={selectedSubTypes}
          setSelectedSubTypes={setSelectedSubTypes}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          approvedOnly={approvedOnly}
          setApprovedOnly={setApprovedOnly}
          starredOnly={starredOnly}
          setStarredOnly={setStarredOnly}
          selectedCollectionId={selectedCollectionId}
          setSelectedCollectionId={setSelectedCollectionId}
          onToggleQuestion={toggleQuestion}
          onSelectAllFiltered={() => selectAllFiltered(filteredQuestions)}
          onRegroupByPassage={regroupByPassage}
          onClearPaper={clearPaper}
          onShowDetail={setDetailQuestion}
        />

        <section className="flex min-w-0 flex-col overflow-hidden bg-slate-100/70">
          <PreviewToolbar
            template={template}
            dirty={dirty}
            isPending={isPending}
            paperItemsCount={paperItems.length}
            onGoToManage={handleGoToManage}
            onPrint={handlePrint}
            onDownloadDocx={handleDownloadDocx}
            onDownloadDocxWithAnswers={handleDownloadDocxWithAnswers}
            onDownloadHwpx={handleDownloadHwpx}
            onDownloadHwpxWithAnswers={handleDownloadHwpxWithAnswers}
            onSave={handleSave}
          />

          <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-100/70">
            {paperItems.length > 0 && (
              <PreviewZoomControls
                zoom={previewZoom}
                position={previewZoomControlsPos}
                onZoomIn={zoomPreviewIn}
                onZoomOut={zoomPreviewOut}
                onReset={resetPreviewZoom}
                onDragStart={handlePreviewZoomControlsDragStart}
              />
            )}
            <div className="flex h-full min-h-0">
              <div
                id="exam-paper-print-root"
                ref={previewScrollerRef}
                onPointerDownCapture={(event) => {
                  const target = event.target as HTMLElement;
                  if (!target.closest("[data-paper-item-id]")) {
                    setActiveItemId(null);
                  }
                }}
                className="min-h-0 flex-1 overflow-auto overscroll-contain px-5 py-5"
              >
                <PreviewPages
                  paperItems={paperItems}
                  paperPages={paperPages}
                  overflowItemIds={overflowItemIds}
                  previewBaseWidth={previewBaseWidth}
                  previewZoom={previewZoom}
                  previewContentHeight={previewContentHeight}
                  title={title}
                  subtitle={subtitle}
                  instructions={instructions}
                  studentNameLabel={studentNameLabel}
                  academyLogoDataUrl={academyLogoDataUrl}
                  template={template}
                  columns={columns}
                  density={density}
                  passageStyle={passageStyle}
                  showAnswerSpace={showAnswerSpace}
                  showPassageTitle={showPassageTitle}
                  showQuestionMeta={showQuestionMeta}
                  activeItemId={activeItemId}
                  setActiveItemId={setActiveItemId}
                  updateHeader={updateHeader}
                  updateItem={updateItem}
                  updateGroupPassage={updateGroupPassage}
                  moveItemToDropTarget={moveItemToDropTarget}
                  removeItem={removeItem}
                  ungroupItem={ungroupItem}
                  regroupByPassage={regroupByPassage}
                  tryToggleKeepWithPrev={tryToggleKeepWithPrev}
                  draggingItemId={draggingItemId}
                  setDraggingItemId={setDraggingItemId}
                  dragOverItemId={dragOverItemId}
                  setDragOverItemId={setDragOverItemId}
                  dragPlacement={dragPlacement}
                  setDragPlacement={setDragPlacement}
                  schools={schools}
                  classes={classes}
                  schoolId={schoolId}
                  classId={classId}
                  examDate={examDate}
                />
              </div>
            </div>
          </div>

        </section>
      </div>

      <TemplateFloatingButton
        hostRef={templateFloatingHostRef}
        offset={templateFloatingOffset}
        panelOpen={templatePanelOpen}
        onPointerDown={startTemplateFloatingDrag}
        onClick={handleTemplateFloatingButtonClick}
        panel={templateSettingsPanel}
      />

      {detailQuestion && (
        <QuestionDetailModal question={detailQuestion} onClose={() => setDetailQuestion(null)} />
      )}

      <PrintStyles />
    </div>
  );
}
