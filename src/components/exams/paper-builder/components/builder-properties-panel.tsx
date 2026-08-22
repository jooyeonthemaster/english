import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BookOpen, ChevronDown, ChevronUp, Columns2, Copy, FileText, Group, Heading1, Image as ImageIcon, Layers, Lock, Rows3, Shuffle, Space, Trash2, Type, Ungroup, Unlock } from "lucide-react";
import { optionOrdinalLabel } from "../option-display";
import { isSourcePassageForcedForItem, shouldRenderSourcePassageForItem } from "../paper-item-utils";
import type { BreakBefore, InsertablePaperBlockType, PaperItem } from "../types";
import { CustomBlockInspector } from "./builder-properties-panel-parts/custom-block-inspector";
import { IconToggleButton, NumberStepper, PanelSection, TextButton, clampInt } from "./builder-properties-panel-parts/panel-controls";
import { BLOCK_LABELS, PANEL_SECTION_COLLAPSED_STORAGE_KEY, PANEL_SECTION_ORDER_STORAGE_KEY, QUESTION_PREVIEW_HEIGHT_DEFAULT, QUESTION_PREVIEW_HEIGHT_MAX_FLOOR, QUESTION_PREVIEW_HEIGHT_MIN, QUESTION_PREVIEW_HEIGHT_STORAGE_KEY, isPanelSectionId, readStoredCollapsedPanelSections, readStoredPanelSectionOrder, readStoredQuestionPreviewHeight } from "./builder-properties-panel-parts/panel-storage";
import type { PanelSectionId } from "./builder-properties-panel-parts/panel-storage";
import { KeepTogetherIcon } from "./keep-together-icon";

interface BuilderPropertiesPanelProps {
  activeItem: PaperItem | null;
  paperItems: PaperItem[];
  activeItemId: string | null;
  paperItemsCount: number;
  totalPoints: number;
  autoPointTotal: number | null;
  showPassageTitle: boolean;
  activeTab: "edit" | "settings";
  onTabChange: (tab: "edit" | "settings") => void;
  settingsPanel: ReactNode;
  onSelectItem: (localId: string) => void;
  onInsertBlock: (type: InsertablePaperBlockType) => void;
  onUploadImageBlock: (dataUrl: string, imageAlt: string) => void;
  onDuplicateItem: (localId: string) => void;
  onToggleLockItem: (localId: string) => void;
  onTogglePassageTitle: () => void;
  onUpdateItem: (localId: string, patch: Partial<PaperItem>) => void;
  onToggleKeepWithPrev: (localId: string) => void;
  onUngroupItem: (localId: string) => void;
  onRegroupByPassage: () => void;
  onShuffleQuestions: (options: { keepGroups: boolean; anchorBlocks: boolean }) => void;
  onRemoveItem: (localId: string) => void;
}










































export function BuilderPropertiesPanel({
  activeItem,
  paperItems,
  activeItemId,
  paperItemsCount,
  totalPoints,
  autoPointTotal,
  showPassageTitle,
  activeTab,
  onTabChange,
  settingsPanel,
  onSelectItem,
  onInsertBlock,
  onUploadImageBlock,
  onDuplicateItem,
  onToggleLockItem,
  onTogglePassageTitle,
  onUpdateItem,
  onToggleKeepWithPrev,
  onUngroupItem,
  onRegroupByPassage,
  onShuffleQuestions,
  onRemoveItem,
}: BuilderPropertiesPanelProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const questionPreviewBodyRef = useRef<HTMLTextAreaElement>(null);
  const hasActiveItem = Boolean(activeItem);
  const activeIsQuestion = activeItem?.blockType === "question";
  const activeLocked = Boolean(activeItem?.locked);
  const activePassageForced = activeItem ? isSourcePassageForcedForItem(activeItem) : false;
  const activePassageRendered = activePassageForced || (activeItem ? shouldRenderSourcePassageForItem(activeItem) : false);
  const questionItemsCount = paperItems.filter((item) => item.blockType === "question").length;
  const [sectionOrder, setSectionOrder] = useState<PanelSectionId[]>(
    readStoredPanelSectionOrder,
  );
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<PanelSectionId[]>(
    readStoredCollapsedPanelSections,
  );
  const [questionPreviewHeight, setQuestionPreviewHeight] = useState(
    readStoredQuestionPreviewHeight,
  );
  const [questionPreviewMaxHeight, setQuestionPreviewMaxHeight] = useState(
    QUESTION_PREVIEW_HEIGHT_DEFAULT,
  );
  const [draggingSectionId, setDraggingSectionId] = useState<PanelSectionId | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<PanelSectionId | null>(null);
  const [shuffleKeepGroups, setShuffleKeepGroups] = useState(true);
  const [shuffleAnchorBlocks, setShuffleAnchorBlocks] = useState(true);
  const [advancedQuestionOpen, setAdvancedQuestionOpen] = useState(false);
  const collapsedSections = new Set(collapsedSectionIds);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PANEL_SECTION_ORDER_STORAGE_KEY,
        JSON.stringify(sectionOrder),
      );
    } catch {
      // Panel order is a convenience setting; ignore storage failures.
    }
  }, [sectionOrder]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PANEL_SECTION_COLLAPSED_STORAGE_KEY,
        JSON.stringify(collapsedSectionIds),
      );
    } catch {
      // Collapsed state can safely remain session-only if storage is blocked.
    }
  }, [collapsedSectionIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        QUESTION_PREVIEW_HEIGHT_STORAGE_KEY,
        String(questionPreviewHeight),
      );
    } catch {
      // The preview height is a convenience preference.
    }
  }, [questionPreviewHeight]);

  useEffect(() => {
    if (!activeIsQuestion) return;

    const body = questionPreviewBodyRef.current;
    if (!body) return;

    const measure = () => {
      const nextMaxHeight = Math.max(
        QUESTION_PREVIEW_HEIGHT_MAX_FLOOR,
        Math.ceil(body.scrollHeight),
      );
      setQuestionPreviewMaxHeight(nextMaxHeight);
      setQuestionPreviewHeight((current) =>
        clampInt(current, QUESTION_PREVIEW_HEIGHT_MIN, nextMaxHeight),
      );
    };

    measure();
    const frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, [activeIsQuestion, activeItem?.localId, activeItem?.questionText]);

  function updateActiveItem(patch: Partial<PaperItem>) {
    if (!activeItem) return;
    onUpdateItem(activeItem.localId, patch);
  }

  function updateQuestionPreviewMaxHeight(element: HTMLTextAreaElement) {
    setQuestionPreviewMaxHeight(
      Math.max(QUESTION_PREVIEW_HEIGHT_MAX_FLOOR, Math.ceil(element.scrollHeight)),
    );
  }

  function updateObjectiveAnswerSlots(objectiveAnswerSlots: number) {
    if (!activeItem) return;
    const nextSlots = clampInt(objectiveAnswerSlots, 0, 10);
    const currentTexts = activeItem.objectiveAnswerTexts || [];
    onUpdateItem(activeItem.localId, {
      objectiveAnswerSlots: nextSlots,
      objectiveAnswerTexts: Array.from(
        { length: nextSlots },
        (_, index) => currentTexts[index] || "",
      ),
    });
  }

  function updateObjectiveAnswerText(slotIndex: number, text: string) {
    if (!activeItem) return;
    const slots = Math.max(0, Math.min(10, activeItem.objectiveAnswerSlots || 0));
    const currentTexts = activeItem.objectiveAnswerTexts || [];
    const nextTexts = Array.from(
      { length: slots },
      (_, index) => currentTexts[index] || "",
    );
    nextTexts[slotIndex] = text;
    onUpdateItem(activeItem.localId, { objectiveAnswerTexts: nextTexts });
  }

  function togglePanelSection(id: PanelSectionId) {
    setCollapsedSectionIds((current) =>
      current.includes(id)
        ? current.filter((sectionId) => sectionId !== id)
        : [...current, id],
    );
  }

  function reorderPanelSection(sourceId: PanelSectionId, targetId: PanelSectionId) {
    if (sourceId === targetId) return;
    setSectionOrder((current) => {
      const withoutSource = current.filter((sectionId) => sectionId !== sourceId);
      const targetIndex = withoutSource.indexOf(targetId);
      if (targetIndex < 0) return current;

      const next = [...withoutSource];
      next.splice(targetIndex, 0, sourceId);
      return next;
    });
  }

  function handlePanelSectionDragStart(
    event: DragEvent<HTMLButtonElement>,
    id: PanelSectionId,
  ) {
    setDraggingSectionId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }

  function handlePanelSectionDragOver(
    event: DragEvent<HTMLElement>,
    id: PanelSectionId,
  ) {
    const sourceId = draggingSectionId;
    if (!sourceId || sourceId === id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverSectionId(id);
  }

  function handlePanelSectionDrop(
    event: DragEvent<HTMLElement>,
    id: PanelSectionId,
  ) {
    event.preventDefault();
    const data = event.dataTransfer.getData("text/plain");
    const sourceId = isPanelSectionId(data) ? data : draggingSectionId;
    if (sourceId) reorderPanelSection(sourceId, id);
    setDraggingSectionId(null);
    setDragOverSectionId(null);
  }

  function handlePanelSectionDragEnd() {
    setDraggingSectionId(null);
    setDragOverSectionId(null);
  }

  function handleQuestionPreviewResizeStart(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const startY = event.clientY;
    const startHeight = questionPreviewHeight;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    const previousPointerEvents = document.body.style.pointerEvents;

    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    // 드래그 중 hover 스타일 재평가 차단 — 포인터 캡처 덕에 move 수신은 유지된다.
    document.body.style.pointerEvents = "none";

    // 포인터 캡처 — 커서가 얇은 핸들을 벗어나도 드래그가 끊기지 않는다.
    const handleEl = event.currentTarget;
    const pointerId = event.pointerId;
    try {
      handleEl.setPointerCapture(pointerId);
    } catch {
      // 캡처 미지원 브라우저는 window 리스너로 폴백
    }

    // 드래그 고속 경로 — 매 pointermove 의 setState 는 편집 패널 전체(문항
    // textarea·스텝퍼·섹션 목록)를 프레임마다 리렌더시킨다. 높이는 textarea
    // 한 곳(style.height)으로만 흐르므로 questionPreviewBodyRef 에 rAF
    // 코얼레싱으로 직접 쓰고, 놓을 때 한 번만 setState 로 커밋한다.
    // ref 미부착이면 종전 setState 경로 폴백(무회귀).
    let latest = startHeight;
    let rafId: number | null = null;
    const flush = () => {
      rafId = null;
      const body = questionPreviewBodyRef.current;
      if (body) body.style.height = `${latest}px`;
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      latest = clampInt(
        startHeight + moveEvent.clientY - startY,
        QUESTION_PREVIEW_HEIGHT_MIN,
        questionPreviewMaxHeight,
      );
      if (questionPreviewBodyRef.current) {
        if (rafId === null) rafId = requestAnimationFrame(flush);
      } else {
        setQuestionPreviewHeight(latest);
      }
    };

    const finishResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
      flush();
      // 커밋 1회 — localStorage 영속은 questionPreviewHeight effect 가 1회 수행.
      setQuestionPreviewHeight(latest);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      document.body.style.pointerEvents = previousPointerEvents;
      try {
        handleEl.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishResize, { once: true });
    window.addEventListener("pointercancel", finishResize, { once: true });
  }

  function setBreakBefore(next: BreakBefore) {
    if (!activeItem) return;
    updateActiveItem({
      breakBefore: activeItem.breakBefore === next ? "auto" : next,
    });
  }

  function handleImageSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onUploadImageBlock(reader.result, file.name.replace(/\.[^.]+$/, "") || "이미지");
      }
    };
    reader.readAsDataURL(file);
  }

  function outlineTitle(item: PaperItem) {
    if (item.blockType === "question") {
      return `${item.orderNum}번 ${item.questionText.replace(/\s+/g, " ").trim() || "문항"}`;
    }
    if (item.blockType === "section") return item.blockTitle || item.blockText || "섹션";
    if (item.blockType === "text") return item.blockText || "텍스트";
    if (item.blockType === "image") return item.imageAlt || "이미지";
    return BLOCK_LABELS[item.blockType];
  }

  function outlineIcon(item: PaperItem) {
    if (item.blockType === "question") return <FileText className="h-3.5 w-3.5" />;
    if (item.blockType === "section") return <Heading1 className="h-3.5 w-3.5" />;
    if (item.blockType === "text") return <Type className="h-3.5 w-3.5" />;
    if (item.blockType === "divider") return <Rows3 className="h-3.5 w-3.5" />;
    if (item.blockType === "spacer") return <Space className="h-3.5 w-3.5" />;
    return <ImageIcon className="h-3.5 w-3.5" />;
  }

  function panelSectionTitle(id: PanelSectionId) {
    if (id === "outline") return "블록 목록";
    if (id === "insert") return "블록 삽입";
    if (id === "inspector") return "선택 블록";
    return "문제 셔플링";
  }

  function panelSectionIcon(id: PanelSectionId) {
    if (id === "outline") return <Layers className="h-3.5 w-3.5 text-slate-400" />;
    if (id === "insert") return <Type className="h-3.5 w-3.5 text-slate-400" />;
    if (id === "inspector") return <FileText className="h-3.5 w-3.5 text-slate-400" />;
    return <Shuffle className="h-3.5 w-3.5 text-slate-400" />;
  }

  function panelSectionBadge(id: PanelSectionId) {
    if (id === "outline") {
      return (
        <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
          {paperItems.length}
        </span>
      );
    }

    if (id === "inspector" && activeIsQuestion && activeItem) {
      return (
        <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
          {activeItem.orderNum}번
        </span>
      );
    }

    return null;
  }

  function renderPanelSectionContent(id: PanelSectionId) {
    if (id === "outline") {
      return (
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
          {paperItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-center">
              <p className="text-[12px] font-bold text-slate-500">아직 블록이 없습니다</p>
            </div>
          ) : (
            paperItems.map((item) => {
              const selected = item.localId === activeItemId;
              return (
                <div
                  key={item.localId}
                  className={cn(
                    "group/outline flex min-w-0 items-center gap-1.5 rounded-md border px-1.5 py-1.5 transition-colors",
                    selected
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-slate-50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectItem(item.localId)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    title={outlineTitle(item)}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500">
                      {outlineIcon(item)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-bold">
                        {outlineTitle(item)}
                      </span>
                      <span className="block text-[10px] font-semibold text-slate-400">
                        {BLOCK_LABELS[item.blockType]}
                        {item.locked ? " · 잠김" : ""}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      );
    }

    if (id === "insert") {
      return (
        <div className="grid grid-cols-2 gap-1.5">
          <TextButton title="텍스트 삽입" onClick={() => onInsertBlock("text")}>
            <Type className="h-3.5 w-3.5" />
            텍스트
          </TextButton>
          <TextButton title="섹션 삽입" onClick={() => onInsertBlock("section")}>
            <Heading1 className="h-3.5 w-3.5" />
            섹션
          </TextButton>
          <TextButton title="구분선 삽입" onClick={() => onInsertBlock("divider")}>
            <Rows3 className="h-3.5 w-3.5" />
            구분선
          </TextButton>
          <TextButton title="여백 삽입" onClick={() => onInsertBlock("spacer")}>
            <Space className="h-3.5 w-3.5" />
            여백
          </TextButton>
          <button
            type="button"
            title="이미지 삽입"
            onClick={() => imageInputRef.current?.click()}
            className="col-span-2 flex h-7 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            이미지
          </button>
        </div>
      );
    }

    if (id === "shuffle") {
      const shuffleToggles = [
        {
          checked: shuffleKeepGroups,
          set: setShuffleKeepGroups,
          label: "지문 묶음 유지",
          hint: "같은 지문 문항을 함께 이동",
        },
        {
          checked: shuffleAnchorBlocks,
          set: setShuffleAnchorBlocks,
          label: "구분 블록 고정",
          hint: "섹션·구분선 등은 제자리 유지",
        },
      ];

      return (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold leading-snug text-slate-500">
            문항 순서를 무작위로 다시 배치합니다. 잠긴 문항은 항상 자리에
            고정됩니다.
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {shuffleToggles.map((toggle) => (
              <button
                key={toggle.label}
                type="button"
                onClick={() => toggle.set(!toggle.checked)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                  toggle.checked
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-[12px] font-bold">{toggle.label}</span>
                  <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">
                    {toggle.hint}
                  </span>
                </span>
                <span
                  className={cn(
                    "relative h-4 w-7 shrink-0 rounded-full transition-colors",
                    toggle.checked ? "bg-blue-500" : "bg-slate-300",
                  )}
                  aria-hidden="true"
                >
                  <span
                    className={cn(
                      "absolute left-0 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                      toggle.checked ? "translate-x-3.5" : "translate-x-0.5",
                    )}
                  />
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={paperItemsCount < 2}
              onClick={onRegroupByPassage}
              className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white text-[12px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Group className="h-3.5 w-3.5" />
              지문별
            </button>
            <button
              type="button"
              disabled={paperItemsCount < 2}
              onClick={() =>
                onShuffleQuestions({
                  keepGroups: shuffleKeepGroups,
                  anchorBlocks: shuffleAnchorBlocks,
                })
              }
              className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 text-[12px] font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Shuffle className="h-3.5 w-3.5" />
              셔플링
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        {!hasActiveItem && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-center">
            <p className="text-[12px] font-bold text-slate-500">선택 없음</p>
          </div>
        )}

        {activeItem && (
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onDuplicateItem(activeItem.localId)}
              className="flex h-7 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              <Copy className="h-3.5 w-3.5" />
              복제
            </button>
            <button
              type="button"
              onClick={() => onToggleLockItem(activeItem.localId)}
              aria-pressed={activeLocked}
              className={cn(
                "flex h-7 items-center justify-center gap-1 rounded-md border px-2 text-[11px] font-bold transition-colors",
                activeLocked
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700",
              )}
            >
              {activeLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              {activeLocked ? "잠김" : "잠금"}
            </button>
          </div>
        )}

        {activeItem && !activeIsQuestion && (
          <CustomBlockInspector
            item={activeItem}
            disabled={activeLocked}
            onUpdate={updateActiveItem}
          />
        )}

        {activeItem && activeIsQuestion && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70">
              <textarea
                key={activeItem.localId}
                ref={questionPreviewBodyRef}
                value={activeItem.questionText}
                disabled={activeLocked}
                onChange={(event) => {
                  updateQuestionPreviewMaxHeight(event.currentTarget);
                  updateActiveItem({ questionText: event.currentTarget.value });
                }}
                className="block w-full resize-none overflow-y-auto overscroll-contain border-0 bg-transparent px-2.5 py-2 text-[12px] font-bold leading-relaxed text-slate-700 outline-none transition-colors focus:bg-white disabled:cursor-not-allowed disabled:text-slate-400 [scrollbar-gutter:stable]"
                style={{ height: questionPreviewHeight }}
                aria-label="문항 텍스트 편집"
                spellCheck={false}
              />
              <button
                type="button"
                onPointerDown={handleQuestionPreviewResizeStart}
                className="flex h-3 w-full touch-none cursor-ns-resize items-center justify-center border-t border-slate-200 bg-slate-100/80 text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-500 active:bg-blue-100"
                title="문항 미리보기 높이 조절"
                aria-label="문항 미리보기 높이 조절"
              >
                <span className="h-0.5 w-10 rounded-full bg-current" />
              </button>
            </div>

            <NumberStepper
              label="선택 문항 배점"
              min={1}
              max={100}
              value={activeItem.points}
              disabled={activeLocked || autoPointTotal !== null}
              onChange={(points) => updateActiveItem({ points })}
            />
            {autoPointTotal !== null && (
              <p className="-mt-1 text-[10px] font-semibold leading-snug text-slate-400">
                자동 배점 적용 중 · 목표 총점 {autoPointTotal}점
              </p>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50/60">
              <button
                type="button"
                onClick={() => setAdvancedQuestionOpen((open) => !open)}
                className="flex h-8 w-full items-center justify-between px-2.5 text-left text-[11px] font-bold text-slate-500 transition-colors hover:bg-white"
                aria-expanded={advancedQuestionOpen}
              >
                고급 답란 설정
                {advancedQuestionOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {advancedQuestionOpen && (
                <div className="space-y-2 border-t border-slate-200 px-2.5 py-2">
                  <NumberStepper
                    label="서술형/주관식 답란"
                    min={0}
                    max={12}
                    value={activeItem.answerSpaceLines}
                    disabled={activeLocked}
                    onChange={(answerSpaceLines) => updateActiveItem({ answerSpaceLines })}
                  />
                  {activeItem.options.length > 0 && (
                    <>
                      <NumberStepper
                        label="객관식 추가 선지"
                        min={0}
                        max={10}
                        value={activeItem.objectiveAnswerSlots}
                        disabled={activeLocked}
                        onChange={updateObjectiveAnswerSlots}
                      />
                      {activeItem.objectiveAnswerSlots > 0 && (
                        <div>
                          <p className="mb-1.5 text-[11px] font-bold text-slate-500">
                            추가 선지 텍스트
                          </p>
                          <div className="space-y-1.5">
                            {Array.from({
                              length: Math.max(1, Math.min(10, activeItem.objectiveAnswerSlots)),
                            }).map((_, slotIndex) => {
                              const optionIndex = activeItem.options.length + slotIndex;
                              return (
                                <label
                                  key={`${activeItem.localId}-objective-text-${slotIndex}`}
                                  className="flex items-center gap-2"
                                >
                                  <span className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md bg-white text-[11px] font-black text-slate-600">
                                    {optionOrdinalLabel(optionIndex)}
                                  </span>
                                  <input
                                    type="text"
                                    disabled={activeLocked}
                                    value={activeItem.objectiveAnswerTexts?.[slotIndex] || ""}
                                    onChange={(event) =>
                                      updateObjectiveAnswerText(slotIndex, event.target.value)
                                    }
                                    placeholder="추가 선지 입력"
                                    className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-[11px] font-bold text-slate-500">흐름</p>
              <div className="grid grid-cols-2 gap-2">
                <IconToggleButton
                  active={activePassageRendered}
                  disabled={activeLocked || activePassageForced}
                  title={activePassageForced ? "이 유형은 원문 지문이 필수입니다." : "지문 표시 전환"}
                  onClick={() =>
                    updateActiveItem({ includePassage: !activeItem.includePassage })
                  }
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  지문
                </IconToggleButton>
                <IconToggleButton
                  active={showPassageTitle}
                  title="지문 이름 표기 켜기/끄기"
                  onClick={onTogglePassageTitle}
                >
                  <Type className="h-3.5 w-3.5" />
                  지문명
                </IconToggleButton>
                <IconToggleButton
                  active={activeItem.keepWithPrev}
                  disabled={activeLocked}
                  title="앞 블록과 묶기"
                  onClick={() => onToggleKeepWithPrev(activeItem.localId)}
                >
                  <KeepTogetherIcon className="h-3.5 w-3.5" />
                  묶기
                </IconToggleButton>
                <IconToggleButton
                  active={activeItem.breakBefore === "column"}
                  disabled={activeLocked}
                  title="다음 단으로 이동"
                  onClick={() => setBreakBefore("column")}
                >
                  <Columns2 className="h-3.5 w-3.5" />
                  다음 단
                </IconToggleButton>
                <IconToggleButton
                  active={activeItem.breakBefore === "page"}
                  disabled={activeLocked}
                  title="다음 페이지로 이동"
                  onClick={() => setBreakBefore("page")}
                >
                  <FileText className="h-3.5 w-3.5" />
                  다음 쪽
                </IconToggleButton>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={activeLocked}
                onClick={() => onUngroupItem(activeItem.localId)}
                className="flex h-7 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-45"
              >
                <Ungroup className="h-3.5 w-3.5" />
                묶음 해제
              </button>
              <button
                type="button"
                onClick={onRegroupByPassage}
                className="flex h-7 items-center justify-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
              >
                <Group className="h-3.5 w-3.5" />
                지문별
              </button>
            </div>
          </div>
        )}

        {activeItem && (
          <button
            type="button"
            disabled={activeLocked}
            onClick={() => onRemoveItem(activeItem.localId)}
            className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 text-[12px] font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Trash2 className="h-3.5 w-3.5" />
            블록 삭제
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <style jsx global>{`
        @keyframes exam-builder-tab-panel-enter {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .exam-builder-tab-panel {
          animation: exam-builder-tab-panel-enter 260ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        @media (prefers-reduced-motion: reduce) {
          .exam-builder-tab-panel {
            animation: none;
          }
        }
      `}</style>

      <aside className="hidden min-w-0 flex-col overflow-hidden border-l border-slate-200 bg-white lg:flex">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelected}
        />

        <div className="shrink-0 border-b border-slate-200 px-3 py-2">
          <div
            role="tablist"
            aria-label="시험지 편집 패널"
            className="relative grid grid-cols-2 overflow-hidden rounded-md border border-blue-200 bg-white p-1"
          >
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded bg-blue-600 shadow-sm shadow-blue-600/20 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                activeTab === "settings" && "translate-x-full",
              )}
            />
            {(["edit", "settings"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => onTabChange(tab)}
                className={cn(
                  "relative z-10 h-8 rounded px-2 text-[12px] font-black transition-colors duration-200",
                  activeTab === tab
                    ? "text-white"
                    : "text-blue-700 hover:text-blue-900",
                )}
              >
                {tab === "edit" ? "편집" : "시험지 설정"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 truncate text-[11px] font-semibold text-slate-400">
            {paperItemsCount}블록 · {questionItemsCount}문항 · 총점 {totalPoints}점
          </p>
        </div>

        <div
          key={activeTab}
          className="exam-builder-tab-panel min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-gutter:stable]"
        >
          {activeTab === "edit" ? (
            sectionOrder.map((sectionId) => (
              <PanelSection
                key={sectionId}
                id={sectionId}
                title={panelSectionTitle(sectionId)}
                badge={panelSectionBadge(sectionId)}
                icon={panelSectionIcon(sectionId)}
                collapsed={collapsedSections.has(sectionId)}
                dragging={draggingSectionId === sectionId}
                dragOver={dragOverSectionId === sectionId && draggingSectionId !== sectionId}
                onToggle={togglePanelSection}
                onDragStart={handlePanelSectionDragStart}
                onDragOver={handlePanelSectionDragOver}
                onDrop={handlePanelSectionDrop}
                onDragEnd={handlePanelSectionDragEnd}
              >
                {renderPanelSectionContent(sectionId)}
              </PanelSection>
            ))
          ) : (
            settingsPanel
          )}
        </div>
      </aside>
    </>
  );
}
