"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Eye, FileText, GripVertical, Loader2, Maximize2, Minus, Plus, Printer, Save } from "lucide-react";
import { saveExamPaperDraft } from "@/actions/exam-paper-builder";
import type {
  BuilderQuestion,
  ClassOption,
  Density,
  DropPlacement,
  HeaderPatch,
  PaginationSettings,
  PaperItem,
  PaperTemplate,
  PassageStyle,
  QuestionCollection,
  SchoolOption,
} from "./paper-builder/types";
import { A4_HEIGHT_RATIO, DEFAULT_INSTRUCTIONS, PREVIEW_PAGE_WIDTH, SUBTYPE_LABELS } from "./paper-builder/constants";
import { TEMPLATE_META } from "./paper-builder/templates";
import {
  buildGroups,
  formatDateInput,
  makePaperItem,
  parseTags,
  reindexItems,
} from "./paper-builder/paper-item-utils";
import { paginateGroups } from "./paper-builder/pagination";
import { usePrintPortal } from "./paper-builder/hooks/use-print-portal";
import { useTemplateFloatingDrag } from "./paper-builder/hooks/use-template-floating-drag";
import { A4PaperPage } from "./paper-builder/components/a4-paper-page";
import { PrintStyles } from "./paper-builder/components/print-styles";
import { QuestionDetailModal } from "./paper-builder/components/question-detail-modal";
import { QuestionLibraryPanel } from "./paper-builder/components/question-library-panel";
import { TemplateFloatingButton } from "./paper-builder/components/template-floating-button";
import { TemplateSettingsPanel } from "./paper-builder/components/template-settings-panel";

interface ExamPaperBuilderClientProps {
  academyId: string;
  questions: BuilderQuestion[];
  collections: QuestionCollection[];
  classes: ClassOption[];
  schools: SchoolOption[];
}

const PREVIEW_ZOOM_MIN = 0.5;
const PREVIEW_ZOOM_MAX = 2.5;
const PREVIEW_ZOOM_STEP = 0.25;
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
  const [questionType, setQuestionType] = useState("ALL");
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [detailQuestion, setDetailQuestion] = useState<BuilderQuestion | null>(null);
  const previewScrollerRef = useRef<HTMLDivElement>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewBaseWidth, setPreviewBaseWidth] = useState(PREVIEW_PAGE_WIDTH);
  const [previewZoomControlsPos, setPreviewZoomControlsPos] = useState({ top: 12, right: 12 });

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
  const [paperItems, setPaperItems] = useState<PaperItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
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
  const [dragPlacement, setDragPlacement] = useState<DropPlacement>("before");

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
      if (questionType !== "ALL" && question.type !== questionType) return false;
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
  }, [questions, search, selectedCollectionId, difficulty, questionType, approvedOnly, starredOnly]);

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
  const activeItem = useMemo(
    () => paperItems.find((item) => item.localId === activeItemId) || paperItems[0] || null,
    [paperItems, activeItemId],
  );
  const totalPoints = useMemo(
    () => paperItems.reduce((sum, item) => sum + item.points, 0),
    [paperItems],
  );

  function markDirty() {
    setDirty(true);
  }

  useEffect(() => {
    const scroller = previewScrollerRef.current;
    if (!scroller) return;

    const updatePreviewBaseWidth = () => {
      const styles = window.getComputedStyle(scroller);
      const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const availableWidth = Math.max(320, scroller.clientWidth - paddingX);
      setPreviewBaseWidth(Math.min(PREVIEW_PAGE_WIDTH, availableWidth));
    };

    updatePreviewBaseWidth();
    const observer = new ResizeObserver(updatePreviewBaseWidth);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  function zoomPreviewIn() {
    setPreviewZoom((zoom) => Math.min(PREVIEW_ZOOM_MAX, Math.round((zoom + PREVIEW_ZOOM_STEP) * 100) / 100));
  }

  function zoomPreviewOut() {
    setPreviewZoom((zoom) => Math.max(PREVIEW_ZOOM_MIN, Math.round((zoom - PREVIEW_ZOOM_STEP) * 100) / 100));
  }

  function resetPreviewZoom() {
    setPreviewZoom(1);
  }

  function handlePreviewZoomControlsDragStart(event: ReactMouseEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startMouseX = event.clientX;
    const startMouseY = event.clientY;
    const startTop = previewZoomControlsPos.top;
    const startRight = previewZoomControlsPos.right;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const handleMove = (moveEvent: MouseEvent) => {
      setPreviewZoomControlsPos({
        top: Math.max(0, startTop + (moveEvent.clientY - startMouseY)),
        right: Math.max(0, startRight - (moveEvent.clientX - startMouseX)),
      });
    };
    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }

  function toggleQuestion(question: BuilderQuestion) {
    setPaperItems((current) => {
      const exists = current.some((item) => item.questionId === question.id);
      if (exists) {
        const next = reindexItems(current.filter((item) => item.questionId !== question.id));
        if (activeItem?.questionId === question.id) setActiveItemId(next[0]?.localId || null);
        return next;
      }
      const nextItem = makePaperItem(question, current.length + 1, current);
      setActiveItemId(nextItem.localId);
      return [...current, nextItem];
    });
    markDirty();
  }

  function selectAllFiltered() {
    setPaperItems((current) => {
      const existing = new Set(current.map((item) => item.questionId));
      const additions = filteredQuestions
        .filter((question) => !existing.has(question.id))
        .slice(0, 80)
        .reduce<PaperItem[]>((acc, question) => {
          const next = makePaperItem(question, current.length + acc.length + 1, [...current, ...acc]);
          acc.push(next);
          return acc;
        }, []);
      if (additions[0]) setActiveItemId(additions[0].localId);
      return reindexItems([...current, ...additions]);
    });
    markDirty();
  }

  function clearPaper() {
    setPaperItems([]);
    setActiveItemId(null);
    markDirty();
  }

  function updateItem(localId: string, patch: Partial<PaperItem>) {
    setPaperItems((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    );
    markDirty();
  }

  function tryToggleKeepWithPrev(localId: string) {
    const current = paperItems.find((item) => item.localId === localId);
    if (!current) return;

    if (current.keepWithPrev) {
      updateItem(localId, { keepWithPrev: false });
      return;
    }

    const itemIndex = paperItems.findIndex((item) => item.localId === localId);
    if (itemIndex <= 0) {
      toast.error("앞 문항이 없어서 강제 배치할 수 없습니다.");
      return;
    }

    updateItem(localId, { keepWithPrev: true });
  }

  function updateGroupPassage(groupId: string | null, patch: Pick<Partial<PaperItem>, "passageTitle" | "passageContent">) {
    if (!groupId) return;
    setPaperItems((current) =>
      current.map((item) => (item.groupId === groupId ? { ...item, ...patch } : item)),
    );
    markDirty();
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

  function removeItem(localId: string) {
    setPaperItems((current) => {
      const next = reindexItems(current.filter((item) => item.localId !== localId));
      setActiveItemId(next[0]?.localId || null);
      return next;
    });
    markDirty();
  }

  function moveItemToDropTarget(sourceLocalId: string, targetLocalId: string, placement: DropPlacement) {
    if (sourceLocalId === targetLocalId) return;
    setPaperItems((current) => {
      const sourceIndex = current.findIndex((item) => item.localId === sourceLocalId);
      if (sourceIndex < 0) return current;
      const sourceItem = current[sourceIndex];
      const withoutSource = current.filter((item) => item.localId !== sourceLocalId);
      const targetIndex = withoutSource.findIndex((item) => item.localId === targetLocalId);
      if (targetIndex < 0) return current;
      const next = [...withoutSource];
      next.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, sourceItem);
      return reindexItems(next);
    });
    setActiveItemId(sourceLocalId);
    markDirty();
  }

  function ungroupItem(localId: string) {
    setPaperItems((current) =>
      current.map((item) =>
        item.localId === localId
          ? {
            ...item,
            groupId: `single:${item.localId}`,
            includePassage: Boolean(item.passageContent),
          }
          : item,
      ),
    );
    markDirty();
  }

  function regroupByPassage() {
    setPaperItems((current) => {
      if (current.length === 0) return current;

      const groupKey = (item: PaperItem) =>
        item.sourceQuestion.passage
          ? `passage:${item.sourceQuestion.passage.id}`
          : `solo:${item.questionId}`;

      const firstSeen = new Map<string, number>();
      current.forEach((item, index) => {
        const key = groupKey(item);
        if (!firstSeen.has(key)) firstSeen.set(key, index);
      });

      const sorted = [...current]
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
          const keyA = groupKey(a.item);
          const keyB = groupKey(b.item);
          const orderA = firstSeen.get(keyA) ?? 0;
          const orderB = firstSeen.get(keyB) ?? 0;
          if (orderA !== orderB) return orderA - orderB;
          return a.index - b.index;
        })
        .map(({ item }) => item);

      const seen = new Set<string>();
      const grouped = sorted.map((item) => {
        const groupId = groupKey(item);
        const includePassage = Boolean(item.sourceQuestion.passage && !seen.has(groupId));
        seen.add(groupId);
        return { ...item, groupId, includePassage };
      });

      return reindexItems(grouped);
    });
    markDirty();
  }

  async function saveDraft(): Promise<string | null> {
    if (paperItems.length === 0) {
      toast.error("시험지에 넣을 문제를 선택해주세요.");
      return null;
    }

    const result = await saveExamPaperDraft(academyId, {
      examId: savedExamId,
      title,
      type: "OFFLINE",
      classId: classId || null,
      schoolId: schoolId || null,
      grade: grade ? Number(grade) : null,
      semester: semester || null,
      examType: examType || null,
      examDate: examDate || null,
      totalPoints: totalPoints || paperItems.length,
      template,
      layout: {
        columns,
        density,
        showAnswerSpace,
        showPassageTitle,
        showQuestionMeta,
        passageStyle,
        pageNumberStyle: "center",
      },
      header: {
        subtitle,
        schoolName: schools.find((school) => school.id === schoolId)?.name,
        className: classes.find((cls) => cls.id === classId)?.name,
        studentNameLabel,
        instructions,
        academyLogoDataUrl,
      },
      items: paperItems.map((item) => ({
        questionId: item.questionId,
        orderNum: item.orderNum,
        points: item.points,
        groupId: item.groupId,
        includePassage: item.includePassage,
        passageTitle: item.passageTitle,
        passageContent: item.passageContent,
        questionText: item.questionText,
        options: item.options,
        correctAnswer: item.correctAnswer,
        answerSpaceLines: item.answerSpaceLines,
        sectionTitle: item.sectionTitle,
        teacherNote: item.teacherNote,
      })),
    });

    if (!result.success) {
      toast.error(result.error || "시험지 저장 실패");
      return null;
    }

    setSavedExamId(result.id || null);
    setDirty(false);
    toast.success("시험지 관리에 초안으로 저장되었습니다.");
    return result.id || null;
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

  function handleDownloadDocx() {
    startTransition(async () => {
      const examId = dirty || !savedExamId ? await saveDraft() : savedExamId;
      if (!examId) return;
      const link = document.createElement("a");
      link.href = `/api/exams/${examId}/export-docx`;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
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
          questionType={questionType}
          setQuestionType={setQuestionType}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          approvedOnly={approvedOnly}
          setApprovedOnly={setApprovedOnly}
          starredOnly={starredOnly}
          setStarredOnly={setStarredOnly}
          selectedCollectionId={selectedCollectionId}
          setSelectedCollectionId={setSelectedCollectionId}
          onToggleQuestion={toggleQuestion}
          onSelectAllFiltered={selectAllFiltered}
          onRegroupByPassage={regroupByPassage}
          onClearPaper={clearPaper}
          onShowDetail={setDetailQuestion}
        />

        <section className="flex min-w-0 flex-col overflow-hidden bg-slate-100/70">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[12px] font-bold text-slate-600">A4 미리보기</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                {TEMPLATE_META[template].label}
              </span>
            </div>
            <div className="no-print flex shrink-0 items-center gap-1.5">
              {dirty && (
                <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 sm:inline-flex">
                  저장 필요
                </span>
              )}
              <button
                onClick={handleGoToManage}
                className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                시험지 관리
              </button>
              <button
                onClick={handlePrint}
                className="flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5" />
                인쇄
              </button>
              <button
                onClick={handleDownloadDocx}
                disabled={isPending || paperItems.length === 0}
                className="flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                DOCX
              </button>
              <button
                onClick={handleSave}
                disabled={isPending || paperItems.length === 0}
                className="flex h-8 items-center gap-1 rounded-md bg-slate-900 px-2.5 text-[11px] font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                저장
              </button>
            </div>
          </div>


          <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-100/70">
            {paperItems.length > 0 && (
              <div
                className="no-print pointer-events-auto absolute z-20 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 p-1 shadow-md backdrop-blur-sm"
                style={{ top: previewZoomControlsPos.top, right: previewZoomControlsPos.right }}
              >
                <span
                  onMouseDown={handlePreviewZoomControlsDragStart}
                  className="inline-flex size-6 cursor-grab items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
                  title="드래그해서 이동"
                  aria-label="컨트롤 이동"
                >
                  <GripVertical className="size-4" aria-hidden="true" />
                </span>
                <span className="h-4 w-px bg-slate-200" />
                <PreviewZoomButton onClick={zoomPreviewOut} disabled={previewZoom <= PREVIEW_ZOOM_MIN} label="축소">
                  <Minus className="size-3.5" aria-hidden="true" />
                </PreviewZoomButton>
                <button
                  type="button"
                  onClick={resetPreviewZoom}
                  disabled={previewZoom === 1}
                  className="inline-flex h-6 min-w-[42px] cursor-pointer items-center justify-center rounded px-1.5 text-[11px] font-bold tabular-nums text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent"
                  title="원래 크기"
                >
                  {Math.round(previewZoom * 100)}%
                </button>
                <PreviewZoomButton onClick={zoomPreviewIn} disabled={previewZoom >= PREVIEW_ZOOM_MAX} label="확대">
                  <Plus className="size-3.5" aria-hidden="true" />
                </PreviewZoomButton>
                <PreviewZoomButton onClick={resetPreviewZoom} disabled={previewZoom === 1} label="화면에 맞추기">
                  <Maximize2 className="size-3.5" aria-hidden="true" />
                </PreviewZoomButton>
              </div>
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
                {paperItems.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                      <FileText className="h-7 w-7 text-slate-300" />
                    </div>
                    <p className="mt-4 text-[14px] font-bold text-slate-600">문제를 선택하면 A4 미리보기가 생성됩니다</p>
                    <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-slate-400">
                      같은 지문에서 만든 문제는 기본적으로 하나의 지문 묶음으로 배치됩니다.
                    </p>
                  </div>
                ) : (
                  <div
                    className="exam-preview-zoom-spacer mx-auto"
                    style={{
                      width: previewBaseWidth * previewZoom,
                      height: previewContentHeight * previewZoom,
                    }}
                  >
                    <div
                      className="exam-preview-zoom-content flex flex-col items-center gap-5"
                      style={{
                        width: previewBaseWidth,
                        transform: `scale(${previewZoom})`,
                        transformOrigin: "top left",
                      }}
                    >
                      {paperPages.map((pageColumns, pageIndex) => (
                        <A4PaperPage
                          key={pageIndex}
                          pageIndex={pageIndex}
                          pageCount={paperPages.length}
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
                          pageColumns={pageColumns}
                          activeItemId={activeItemId}
                          setActiveItemId={setActiveItemId}
                          onHeaderChange={updateHeader}
                          onUpdateItem={updateItem}
                          onUpdateGroupPassage={updateGroupPassage}
                          onMoveItemToDropTarget={moveItemToDropTarget}
                          onRemoveItem={removeItem}
                          onUngroupItem={ungroupItem}
                          onRegroupByPassage={regroupByPassage}
                          onToggleKeepWithPrev={tryToggleKeepWithPrev}
                          overflowItemIds={overflowItemIds}
                          draggingItemId={draggingItemId}
                          setDraggingItemId={setDraggingItemId}
                          dragOverItemId={dragOverItemId}
                          setDragOverItemId={setDragOverItemId}
                          dragPlacement={dragPlacement}
                          setDragPlacement={setDragPlacement}
                          schoolName={schools.find((school) => school.id === schoolId)?.name || ""}
                          className={classes.find((cls) => cls.id === classId)?.name || ""}
                          examDate={examDate}
                        />
                      ))}
                    </div>
                  </div>
                )}
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

function PreviewZoomButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex size-6 cursor-pointer items-center justify-center rounded text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
