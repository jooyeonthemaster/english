"use client";

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { GripVertical, ImageIcon, Loader2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PassageAnnotationEditor,
  type Annotation,
} from "@/components/workbench/editor";
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
import type { DraftCollectionItem, SavedPrompt } from "../types";
import { CompactOptionsRow } from "./compact-options-row";

interface FormSectionProps {
  academyId: string;
  formCollapsed: boolean;
  setFormCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  hasContent: boolean;
  wordCount: number;
  saving: boolean;
  onSave: (analysisGenerationPlan: QuestionGenerationPlan) => void;

  // Editor
  title: string;
  setTitle: (v: string) => void;
  content: string;
  setContent: (v: string) => void;
  annotations: Annotation[];
  setAnnotations: (v: Annotation[]) => void;
  imageFile: File | null;
  imagePreview: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDrop: (e: React.DragEvent) => void;

  // Draft selection (left grid)
  selectedDraftId: string | null;
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
    hasContent,
    wordCount,
    saving,
    onSave,
    imageFile,
    imagePreview,
    content,
    title,
    setTitle,
    setContent,
    annotations,
    setAnnotations,
    fileInputRef,
    onFileSelect,
    onRemoveImage,
    onPaste,
    onDrop,
  } = props;

  const splitContainerRef = useRef<HTMLDivElement>(null);
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
  const standardAnalysisCreditCost = getQuestionGenerationCreditCost(
    CREDIT_COSTS.PASSAGE_ANALYSIS,
    "STANDARD",
  );
  const primaryAnalysisCreditCost = getQuestionGenerationCreditCost(
    CREDIT_COSTS.PASSAGE_ANALYSIS,
    primaryAnalysisPlan,
  );

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
          title="지문 분석"
          description="추출된 자료나 직접 입력한 지문을 바탕으로 어휘, 문법, 구조, 출제 포인트를 분석합니다."
        />
      </div>

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
                className="flex min-h-0 min-w-0 shrink-0 flex-col"
                style={{ width: `min(${leftPaneWidth}px, 44%)` }}
              >
                <ExtractionManageEmbed
                  academyId={props.academyId}
                  draftCollections={props.draftCollections}
                  draftMembership={props.draftMembership}
                  selectedDraftId={props.selectedDraftId}
                  onSelectDraft={props.onSelectDraft}
                  onBulkAnalyze={props.onBulkAnalyze}
                  bulkAnalyzing={props.bulkAnalyzing}
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
              {/* Title row + image */}
              <div className="flex items-center gap-2 shrink-0">
                <Input
                  id="title"
                  placeholder="제목 (비워두면 자동 생성)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-[13px] h-9 border-slate-200 flex-1"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={onFileSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-all border text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300 shrink-0"
                  title="이미지로 지문 등록"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  이미지
                </button>
              </div>

              {imagePreview ? (
                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg shrink-0">
                  <img
                    src={imagePreview}
                    alt="원본"
                    className="h-10 rounded object-contain"
                  />
                  <p className="text-[12px] text-slate-500 flex-1">
                    이미지 첨부됨 · 등록 시 AI가 텍스트를 자동 추출합니다
                  </p>
                  <button
                    type="button"
                    onClick={onRemoveImage}
                    className="p-1 rounded hover:bg-slate-200 transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              ) : null}

              {/* Editor — top 60% of right pane */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between mb-1.5 shrink-0">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    지문 내용{" "}
                    {!imageFile ? (
                      <span className="text-red-500">*</span>
                    ) : null}
                  </span>
                  <div className="flex items-center gap-3">
                    {wordCount > 0 ? (
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        {wordCount} words
                      </span>
                    ) : null}
                    {annotations.length > 0 ? (
                      <span className="text-[11px] text-blue-600 font-medium">
                        마킹 {annotations.length}개
                      </span>
                    ) : null}
                  </div>
                </div>
                <div
                  className="flex-1 min-h-0 border border-slate-200 rounded-lg overflow-hidden bg-white"
                  onPaste={onPaste}
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <PassageAnnotationEditor
                    content={content}
                    onContentChange={setContent}
                    annotations={annotations}
                    onAnnotationsChange={setAnnotations}
                    placeholder={
                      "왼쪽에서 추출 자료를 선택하거나, 영어 지문을 직접 붙여넣으세요...\n\n텍스트를 드래그하여 핵심 단어, 주요 문법, 중요 문장을 마킹할 수 있습니다."
                    }
                  />
                </div>
              </div>

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
                    onClick={() => onSave("STANDARD")}
                    disabled={saving || !hasContent}
                    className="h-9 w-full rounded-lg border-blue-200 px-3 text-[12.5px] font-bold text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Wand2 className="size-4" />
                    )}
                    일반 분석 시작
                    <span className="inline-flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                      {standardAnalysisCreditCost.toLocaleString("ko-KR")}{" "}
                      크레딧
                    </span>
                  </Button>
                )}
                <Button
                  onClick={() => onSave(primaryAnalysisPlan)}
                  disabled={saving || !hasContent}
                  className="h-9 w-full rounded-lg bg-blue-600 px-3 text-[12.5px] font-bold hover:bg-blue-700"
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Wand2 className="size-4" />
                  )}
                  분석 시작
                  <span className="inline-flex items-center gap-0.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
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
    </section>
  );
}

interface ExtractionManageEmbedProps {
  academyId: string;
  draftCollections: DraftCollectionItem[];
  draftMembership: Record<string, string[]>;
  selectedDraftId: string | null;
  onSelectDraft: (draft: M1PassageDraftWithJob) => void;
  onBulkAnalyze: (
    drafts: M1PassageDraftWithJob[],
    generationPlan: QuestionGenerationPlan,
  ) => Promise<void>;
  bulkAnalyzing: boolean;
}

function ExtractionManageEmbed({
  academyId,
  draftCollections,
  draftMembership,
  selectedDraftId,
  onSelectDraft,
  onBulkAnalyze,
  bulkAnalyzing,
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
      selectedExternalDraftId={selectedDraftId}
      onSelectDraftExternal={onSelectDraft}
      onBulkAnalyze={onBulkAnalyze}
      bulkAnalyzing={bulkAnalyzing}
    />
  );
}
