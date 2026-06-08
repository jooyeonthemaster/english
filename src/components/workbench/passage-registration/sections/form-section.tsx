"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExtractionManageClient } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import type { CollectionItem } from "@/components/workbench/shared/types";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { PassageAnalysisIcon } from "@/components/icons/workflow-icons";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  getQuestionGenerationCreditCost,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import type { AnalysisTone } from "@/lib/passage-analysis-options";
import type { DraftCollectionItem, SavedPrompt } from "../types";
import { blockHasContent, type PassageBlock } from "../block-types";
import { CompactOptionsRow } from "./compact-options-row";
import { MultiPassageEditor } from "./multi-passage-editor";

interface FormSectionProps {
  academyId: string;
  formCollapsed: boolean;
  setFormCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  hasContent: boolean;
  saving: boolean;
  onAnalyze: (
    analysisGenerationPlan: QuestionGenerationPlan,
    analysisTone: AnalysisTone,
  ) => void | Promise<void>;

  // Passage blocks (center editor)
  blocks: PassageBlock[];
  updateBlock: (id: string, patch: Partial<PassageBlock>) => void;
  addEmptyBlock: () => void;
  removeBlock: (id: string) => void;
  toggleCollapse: (id: string) => void;
  setAllCollapsed: (collapsed: boolean) => void;

  // Draft selection (left grid)
  selectedDraftIds: Set<string>;
  draftRefreshToken: number;
  onSelectDraft: (draft: M1PassageDraftWithJob) => void;
  draftCollections: DraftCollectionItem[];
  draftMembership: Record<string, string[]>;
  onBulkAnalyze: (
    drafts: M1PassageDraftWithJob[],
    generationPlan: QuestionGenerationPlan,
  ) => Promise<void>;
  bulkAnalyzing: boolean;

  // Metadata
  schools: Array<{
    id: string;
    name: string;
    type: string;
    publisher: string | null;
  }>;
  schoolId: string;
  setSchoolId: (v: string) => void;
  grade: string;
  setGrade: (v: string) => void;
  semester: string;
  setSemester: (v: string) => void;
  unit: string;
  setUnit: (v: string) => void;
  source: string;
  setSource: (v: string) => void;
  publisher: string;
  setPublisher: (v: string) => void;
  publisherCustom: string;
  setPublisherCustom: (v: string) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
  tags: string[];
  addTag: () => void;
  removeTag: (tag: string) => void;

  // Prompt
  analysisPrompt: string;
  setAnalysisPrompt: (v: string) => void;
  analysisTone: AnalysisTone;
  setAnalysisTone: (v: AnalysisTone) => void;
  savedPrompts: SavedPrompt[];
  showSavedPrompts: boolean;
  setShowSavedPrompts: (v: boolean | ((prev: boolean) => boolean)) => void;
  newPromptName: string;
  setNewPromptName: (v: string) => void;
  savingPrompt: boolean;
  onSavePrompt: () => void;
  onDeletePrompt: (id: string) => void;
}

const LEFT_PANE_STORAGE_KEY = "smoat:passage-form:left-pane-width";
const LEFT_PANE_MIN = 400;
const LEFT_PANE_DEFAULT = 480;
const LEFT_PANE_MAX_RATIO = 0.5;
const RIGHT_PANE_MIN = 520;
const HANDLE_HIT_WIDTH = 12;

const FORM_PANE_STORAGE_KEY = "smoat:passage-form:pane-height";
const FORM_PANE_MIN = 500;
const FORM_PANE_DEFAULT = 700;
const FORM_PANE_MAX = 1400;

const OPTIONS_OPEN_STORAGE_KEY = "smoat:passage-form:options-open";

const LEFT_PANE_OPEN_STORAGE_KEY = "smoat:passage-form:left-pane-open";

const OPTIONS_WIDTH_STORAGE_KEY = "smoat:passage-form:options-width";
const OPTIONS_WIDTH_MIN = 220;
const OPTIONS_WIDTH_DEFAULT = 300;
const OPTIONS_WIDTH_MAX = 600;
const OPTIONS_DRAG_THRESHOLD = 4;

function readStoredLeftPaneWidth(): number {
  if (typeof window === "undefined") return LEFT_PANE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(LEFT_PANE_STORAGE_KEY);
    if (!raw) return LEFT_PANE_DEFAULT;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return LEFT_PANE_DEFAULT;
    return Math.max(LEFT_PANE_MIN, n);
  } catch {
    return LEFT_PANE_DEFAULT;
  }
}

function readStoredFormHeight(): number {
  if (typeof window === "undefined") return FORM_PANE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(FORM_PANE_STORAGE_KEY);
    if (!raw) return FORM_PANE_DEFAULT;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return FORM_PANE_DEFAULT;
    return Math.min(FORM_PANE_MAX, Math.max(FORM_PANE_MIN, n));
  } catch {
    return FORM_PANE_DEFAULT;
  }
}

function readStoredLeftPaneOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(LEFT_PANE_OPEN_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function readStoredOptionsWidth(): number {
  if (typeof window === "undefined") return OPTIONS_WIDTH_DEFAULT;
  try {
    const raw = window.localStorage.getItem(OPTIONS_WIDTH_STORAGE_KEY);
    if (!raw) return OPTIONS_WIDTH_DEFAULT;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return OPTIONS_WIDTH_DEFAULT;
    return Math.min(OPTIONS_WIDTH_MAX, Math.max(OPTIONS_WIDTH_MIN, n));
  } catch {
    return OPTIONS_WIDTH_DEFAULT;
  }
}

function readStoredOptionsOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(OPTIONS_OPEN_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

export function FormSection(props: FormSectionProps) {
  const {
    formCollapsed,
    setFormCollapsed,
    hasContent,
    saving,
    onAnalyze,
    blocks,
    updateBlock,
    addEmptyBlock,
    removeBlock,
    toggleCollapse,
    setAllCollapsed,
  } = props;

  const splitContainerRef = useRef<HTMLDivElement>(null);
  // 마키(영역 드래그) 시작 영역 = "자료 관리" 좌측 패널 전체. 아래 지문 목록 큐와
  // boundary 가 분리돼 서로 섞이지 않는다(드래그 선택 영역 구분).
  const materialBoundaryRef = useRef<HTMLDivElement>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(
    readStoredLeftPaneWidth,
  );
  const [formHeight, setFormHeight] = useState<number>(readStoredFormHeight);
  const [optionsOpen, setOptionsOpen] = useState<boolean>(
    readStoredOptionsOpen,
  );
  const [optionsWidth, setOptionsWidth] = useState<number>(
    readStoredOptionsWidth,
  );
  const [leftPaneOpen, setLeftPaneOpen] = useState<boolean>(
    readStoredLeftPaneOpen,
  );
  const primaryAnalysisPlan: QuestionGenerationPlan =
    FEATURE_FLAGS.SHOW_MODEL_SELECTOR ? "PREMIUM" : "STANDARD";
  // 분석은 내용이 입력된 지문마다 1건씩 과금된다(handleAnalyzeBlocks 의
  // filled.map 참조). 버튼의 크레딧 표기도 지문 수만큼 곱해 총액을 보여준다.
  const filledPassageCount = blocks.filter(blockHasContent).length;
  const standardAnalysisCreditCost =
    getQuestionGenerationCreditCost(CREDIT_COSTS.PASSAGE_ANALYSIS, "STANDARD") *
    filledPassageCount;
  const primaryAnalysisCreditCost =
    getQuestionGenerationCreditCost(
      CREDIT_COSTS.PASSAGE_ANALYSIS,
      primaryAnalysisPlan,
    ) * filledPassageCount;

  const toggleLeftPaneOpen = useCallback(() => {
    setLeftPaneOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(LEFT_PANE_OPEN_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleOptionsOpen = useCallback(() => {
    setOptionsOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(OPTIONS_OPEN_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const handleCloseOptionsPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startWidth = optionsWidth;
      let didDrag = false;
      let latest = startWidth;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        if (!didDrag) {
          if (Math.abs(delta) < OPTIONS_DRAG_THRESHOLD) return;
          didDrag = true;
          document.body.style.cursor = "ew-resize";
          document.body.style.userSelect = "none";
        }
        // Button sits on the LEFT edge of the options column → drag right shrinks, left grows.
        latest = Math.min(
          OPTIONS_WIDTH_MAX,
          Math.max(OPTIONS_WIDTH_MIN, startWidth - delta),
        );
        setOptionsWidth(latest);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (didDrag) {
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          try {
            window.localStorage.setItem(
              OPTIONS_WIDTH_STORAGE_KEY,
              String(latest),
            );
          } catch {
            /* ignore */
          }
        } else {
          toggleOptionsOpen();
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [optionsWidth, toggleOptionsOpen],
  );

  const handleCloseLeftPanePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startWidth = leftPaneWidth;
      const containerWidth =
        splitContainerRef.current?.getBoundingClientRect().width ?? 0;
      const ratioCap =
        containerWidth > 0
          ? Math.floor(containerWidth * LEFT_PANE_MAX_RATIO)
          : Number.POSITIVE_INFINITY;
      const maxWidth = Math.max(
        LEFT_PANE_MIN,
        Math.min(ratioCap, containerWidth - RIGHT_PANE_MIN - HANDLE_HIT_WIDTH),
      );
      let didDrag = false;
      let latest = startWidth;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        if (!didDrag) {
          if (Math.abs(delta) < OPTIONS_DRAG_THRESHOLD) return;
          didDrag = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }
        latest = Math.min(
          maxWidth,
          Math.max(LEFT_PANE_MIN, startWidth + delta),
        );
        setLeftPaneWidth(latest);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (didDrag) {
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          try {
            window.localStorage.setItem(LEFT_PANE_STORAGE_KEY, String(latest));
          } catch {
            /* ignore */
          }
        } else {
          toggleLeftPaneOpen();
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [leftPaneWidth, toggleLeftPaneOpen],
  );

  const resetLeftPaneWidth = useCallback(() => {
    setLeftPaneWidth(LEFT_PANE_DEFAULT);
    try {
      window.localStorage.setItem(
        LEFT_PANE_STORAGE_KEY,
        String(LEFT_PANE_DEFAULT),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const beginFormResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startHeight = formHeight;
      let latest = startHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        latest = Math.min(
          FORM_PANE_MAX,
          Math.max(FORM_PANE_MIN, startHeight + (ev.clientY - startY)),
        );
        setFormHeight(latest);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(FORM_PANE_STORAGE_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [formHeight],
  );

  const resetFormHeight = useCallback(() => {
    setFormHeight(FORM_PANE_DEFAULT);
    try {
      window.localStorage.setItem(
        FORM_PANE_STORAGE_KEY,
        String(FORM_PANE_DEFAULT),
      );
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
        <WorkflowPageTitle
          icon={PassageAnalysisIcon}
          title="학습지 생성"
          description="추출된 자료나 직접 입력한 지문을 바탕으로 어휘, 문법, 구조, 출제 포인트를 분석합니다."
        />
        {formCollapsed ? (
          <button
            type="button"
            onClick={() => setFormCollapsed(false)}
            aria-expanded={false}
            title="학습지 생성 펼치기"
            className="ml-auto inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
          >
            <ChevronDown className="size-3.5" aria-hidden="true" />
            <span>펼치기</span>
          </button>
        ) : null}
      </div>

      {!formCollapsed ? (
      <>
      <div className="px-4 pt-4 pb-3">
        {/* ─── 2-Pane Layout: 자료 관리 | 입력 폼 ─── */}
        <div
          ref={splitContainerRef}
          className="flex w-full min-w-0 max-w-full flex-row gap-0 overflow-hidden"
          style={
            {
              "--left-pane-w": `${leftPaneWidth}px`,
              height: `${formHeight}px`,
            } as React.CSSProperties
          }
        >
          {/* LEFT: 자료 관리 picker (embedded ExtractionManageClient) */}
          {leftPaneOpen ? (
            <>
              <div
                ref={materialBoundaryRef}
                className="flex min-h-0 min-w-0 shrink-0 flex-col"
                style={{ width: `min(${leftPaneWidth}px, 44%)` }}
              >
                <ExtractionManageEmbed
                  academyId={props.academyId}
                  draftCollections={props.draftCollections}
                  draftMembership={props.draftMembership}
                  selectedDraftIds={props.selectedDraftIds}
                  onSelectDraft={props.onSelectDraft}
                  onBulkAnalyze={props.onBulkAnalyze}
                  bulkAnalyzing={props.bulkAnalyzing}
                  marqueeBoundaryRef={materialBoundaryRef}
                />
              </div>
              <button
                type="button"
                onPointerDown={handleCloseLeftPanePointerDown}
                onDoubleClick={resetLeftPaneWidth}
                title="클릭하여 닫기 · 좌우로 드래그하여 너비 조절 · 더블 클릭하여 초기화"
                className="group/lhandle flex w-4 shrink-0 cursor-col-resize touch-none flex-col items-center justify-center gap-1 mx-1 rounded-md text-[11px] font-semibold text-sky-400 hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100 select-none transition-colors py-1"
              >
                <span>{"<"}</span>
                <span style={{ writingMode: "vertical-rl" }}>자료 닫기</span>
                <GripVertical className="h-3 w-3 opacity-40 group-hover/lhandle:opacity-70 transition-opacity" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggleLeftPaneOpen}
              title="클릭하여 자료 패널 열기"
              className="flex min-h-0 w-4 shrink-0 flex-col items-center justify-center gap-1 mx-1 rounded-md py-1 text-[11px] font-semibold text-sky-400 hover:bg-sky-50 hover:text-sky-600 select-none transition-colors"
            >
              <span>{">"}</span>
              <span style={{ writingMode: "vertical-rl" }}>자료 열기</span>
            </button>
          )}

          {/* RIGHT: 지문 입력 | 옵션 */}
          <div
            className="grid min-h-0 min-w-0 flex-1"
            style={{
              gridTemplateColumns: optionsOpen
                ? `minmax(0,1fr) ${optionsWidth}px`
                : "minmax(0,1fr) 16px",
              columnGap: "0.25rem",
            }}
          >
            <div className="flex min-h-0 min-w-0 flex-col gap-3">
              {/* Multi-passage editor — scrollable, collapsible stack */}
              <MultiPassageEditor
                blocks={blocks}
                updateBlock={updateBlock}
                addEmptyBlock={addEmptyBlock}
                removeBlock={removeBlock}
                toggleCollapse={toggleCollapse}
                setAllCollapsed={setAllCollapsed}
              />

              <div
                className={
                  FEATURE_FLAGS.SHOW_MODEL_SELECTOR
                    ? "grid w-full shrink-0 grid-cols-1 gap-2 2xl:grid-cols-2"
                    : "w-full shrink-0"
                }
              >
                {FEATURE_FLAGS.SHOW_MODEL_SELECTOR && (
                  <Button
                    variant="outline"
                    onClick={() => onAnalyze("STANDARD", props.analysisTone)}
                    disabled={saving || !hasContent}
                    className="h-9 w-full rounded-lg border-blue-200 px-3 text-[12.5px] font-bold text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Wand2 className="size-4" />
                    )}
                    일반 분석 시작
                    <span className="inline-flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-blue-700">
                      {filledPassageCount}개 선택
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-blue-700">
                      {standardAnalysisCreditCost.toLocaleString("ko-KR")}{" "}
                      크레딧
                    </span>
                  </Button>
                )}
                <Button
                  onClick={() => onAnalyze(primaryAnalysisPlan, props.analysisTone)}
                  disabled={saving || !hasContent}
                  className="h-9 w-full rounded-lg bg-blue-600 px-3 text-[12.5px] font-bold hover:bg-blue-700"
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Wand2 className="size-4" />
                  )}
                  분석 시작
                  <span className="inline-flex items-center gap-0.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                    {filledPassageCount}개 선택
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                    {primaryAnalysisCreditCost.toLocaleString("ko-KR")} 크레딧
                  </span>
                </Button>
              </div>
            </div>

            {optionsOpen ? (
              <div className="flex min-h-0 min-w-[220px] flex-row gap-1">
                <button
                  type="button"
                  onPointerDown={handleCloseOptionsPointerDown}
                  title="클릭하여 닫기 · 좌우로 드래그하여 너비 조절"
                  className="group/ohandle flex w-4 shrink-0 cursor-ew-resize touch-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-sky-400 hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100 select-none transition-colors"
                >
                  <span>{">"}</span>
                  <span style={{ writingMode: "vertical-rl" }}>옵션 닫기</span>
                  <GripVertical className="h-3 w-3 opacity-40 group-hover/ohandle:opacity-70 transition-opacity" />
                </button>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                  {/* Compact options row — 선생님의 노하우 + 지문 정보 */}
                  <CompactOptionsRow
                    schools={props.schools}
                    schoolId={props.schoolId}
                    setSchoolId={props.setSchoolId}
                    grade={props.grade}
                    setGrade={props.setGrade}
                    semester={props.semester}
                    setSemester={props.setSemester}
                    unit={props.unit}
                    setUnit={props.setUnit}
                    source={props.source}
                    setSource={props.setSource}
                    publisher={props.publisher}
                    setPublisher={props.setPublisher}
                    publisherCustom={props.publisherCustom}
                    setPublisherCustom={props.setPublisherCustom}
                    tagInput={props.tagInput}
                    setTagInput={props.setTagInput}
                    tags={props.tags}
                    addTag={props.addTag}
                    removeTag={props.removeTag}
                    analysisPrompt={props.analysisPrompt}
                    setAnalysisPrompt={props.setAnalysisPrompt}
                    analysisTone={props.analysisTone}
                    setAnalysisTone={props.setAnalysisTone}
                    savedPrompts={props.savedPrompts}
                    showSavedPrompts={props.showSavedPrompts}
                    setShowSavedPrompts={props.setShowSavedPrompts}
                    newPromptName={props.newPromptName}
                    setNewPromptName={props.setNewPromptName}
                    savingPrompt={props.savingPrompt}
                    onSavePrompt={props.onSavePrompt}
                    onDeletePrompt={props.onDeletePrompt}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={toggleOptionsOpen}
                title="클릭하여 옵션 패널 열기"
                className="flex min-h-0 w-4 flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-sky-400 hover:bg-sky-50 hover:text-sky-600 select-none transition-colors"
              >
                <span>{"<"}</span>
                <span style={{ writingMode: "vertical-rl" }}>옵션 열기</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Form pane vertical resize handle ─── */}
      <div className="relative pb-2.5">
        <div
          onPointerDown={beginFormResize}
          onDoubleClick={resetFormHeight}
          role="separator"
          aria-orientation="horizontal"
          title="드래그하여 높이 조절 · 더블 클릭하여 초기화"
          className="group/fhandle h-3 cursor-row-resize flex items-center justify-center select-none"
        >
          <div className="h-0.5 w-24 rounded-full bg-slate-200 transition-colors group-hover/fhandle:bg-blue-400 group-active/fhandle:bg-blue-500" />
        </div>
        <button
          type="button"
          onClick={() => setFormCollapsed(true)}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-expanded
          title="학습지 생성 접기"
          className="absolute right-4 top-1/2 -translate-y-1/2 inline-flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
        >
          <ChevronUp className="size-3.5" aria-hidden="true" />
          <span>접기</span>
        </button>
      </div>
      </>
      ) : null}
    </section>
  );
}

interface ExtractionManageEmbedProps {
  academyId: string;
  draftCollections: DraftCollectionItem[];
  draftMembership: Record<string, string[]>;
  selectedDraftIds: Set<string>;
  onSelectDraft: (draft: M1PassageDraftWithJob) => void;
  onBulkAnalyze: (
    drafts: M1PassageDraftWithJob[],
    generationPlan: QuestionGenerationPlan,
  ) => Promise<void>;
  bulkAnalyzing: boolean;
  /** 마키(영역 드래그) 시작 영역 = 자료 관리 패널 전체. 같은 페이지의 지문 목록 큐와
   *  영역이 섞이지 않도록 분리한다. */
  marqueeBoundaryRef?: React.RefObject<HTMLElement | null>;
}

function ExtractionManageEmbed({
  academyId,
  draftCollections,
  draftMembership,
  selectedDraftIds,
  onSelectDraft,
  onBulkAnalyze,
  bulkAnalyzing,
  marqueeBoundaryRef,
}: ExtractionManageEmbedProps) {
  const membership = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const [k, v] of Object.entries(draftMembership)) map[k] = new Set(v);
    return map;
  }, [draftMembership]);

  const collections = useMemo<CollectionItem[]>(
    () => draftCollections.map((c) => ({ ...c, createdAt: null })),
    [draftCollections],
  );

  return (
    <ExtractionManageClient
      embedded
      academyId={academyId}
      initialCollections={collections}
      initialCollectionMembership={membership}
      selectedExternalDraftIds={selectedDraftIds}
      onSelectDraftExternal={onSelectDraft}
      onBulkAnalyze={onBulkAnalyze}
      bulkAnalyzing={bulkAnalyzing}
      marqueeBoundaryRef={marqueeBoundaryRef}
      draftDetailActionMode="import"
    />
  );
}
