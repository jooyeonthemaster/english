"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Loader2,
  Wand2,
  Check,
  X,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PassageAnnotationEditor,
  type Annotation,
} from "@/components/workbench/editor";
import { ExtractionManageClient } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import type { CollectionItem } from "@/components/workbench/shared/types";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type { AnalysisTone } from "@/lib/passage-analysis-options";
import type { DraftCollectionItem, SavedPrompt } from "../types";
import { CompactOptionsRow } from "./compact-options-row";

interface FormSectionProps {
  academyId: string;
  formCollapsed: boolean;
  setFormCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  hasContent: boolean;
  wordCount: number;
  saving: boolean;
  onSave: (
    analysisGenerationPlan: QuestionGenerationPlan,
    analysisTone: AnalysisTone,
  ) => void;

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
  schools: Array<{ id: string; name: string; type: string; publisher: string | null }>;
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
const LEFT_PANE_MIN = 460;
const LEFT_PANE_DEFAULT = 480;
const LEFT_PANE_MAX_RATIO = 0.5;
const RIGHT_PANE_MIN = 480;
const HANDLE_HIT_WIDTH = 12;

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

  const beginLeftPaneResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = leftPaneWidth;
      const containerWidth =
        splitContainerRef.current?.getBoundingClientRect().width ?? 0;
      const ratioCap = containerWidth > 0
        ? Math.floor(containerWidth * LEFT_PANE_MAX_RATIO)
        : Number.POSITIVE_INFINITY;
      const maxWidth = Math.max(
        LEFT_PANE_MIN,
        Math.min(
          ratioCap,
          containerWidth - RIGHT_PANE_MIN - HANDLE_HIT_WIDTH,
        ),
      );
      let latest = startWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        latest = Math.min(
          maxWidth,
          Math.max(LEFT_PANE_MIN, startWidth + (ev.clientX - startX)),
        );
        setLeftPaneWidth(latest);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(
            LEFT_PANE_STORAGE_KEY,
            String(latest),
          );
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [leftPaneWidth],
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

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="px-6 pb-5">
          {/* ─── 2-Pane Layout: 자료 관리 | Editor + Compact Bottom ─── */}
          <div
            ref={splitContainerRef}
            className="flex flex-col xl:flex-row gap-4 xl:gap-0 h-[700px]"
            style={
              { "--left-pane-w": `${leftPaneWidth}px` } as React.CSSProperties
            }
          >
            {/* LEFT: 자료 관리 picker (embedded ExtractionManageClient) */}
            <div className="flex min-h-0 min-w-0 w-full flex-col xl:w-[var(--left-pane-w)] xl:shrink-0">
              <ExtractionManageEmbed
                academyId={props.academyId}
                draftCollections={props.draftCollections}
                draftMembership={props.draftMembership}
                selectedDraftId={props.selectedDraftId}
                onSelectDraft={props.onSelectDraft}
              />
            </div>

            {/* RESIZE HANDLE — desktop only */}
            <div
              onPointerDown={beginLeftPaneResize}
              onDoubleClick={resetLeftPaneWidth}
              role="separator"
              aria-orientation="vertical"
              title="드래그하여 너비 조절 · 더블 클릭하여 초기화"
              className="group/hhandle hidden xl:flex shrink-0 mx-1 w-3 cursor-col-resize items-center justify-center select-none"
            >
              <div className="h-12 w-0.5 rounded-full bg-slate-200 transition-colors group-hover/hhandle:bg-blue-400 group-active/hhandle:bg-blue-500" />
            </div>

            {/* RIGHT: Editor + Compact options row */}
            <div className="flex flex-col min-h-0 min-w-0 gap-3 xl:flex-1">
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
                    지문 내용 {!imageFile ? <span className="text-red-500">*</span> : null}
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
                      "왼쪽에서 추출 자료를 선택하거나, 영어 지문을 직접 붙여넣으세요...\n\n텍스트를 드래그하여 핵심 단어, 어법 포인트, 중요 문장을 마킹할 수 있습니다."
                    }
                  />
                </div>
              </div>

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

          {/* ─── Action buttons ─── */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
            <p className="text-[12px] text-slate-400">
              {hasContent ? (
                <>
                  <Check className="w-3 h-3 inline text-green-500 mr-0.5" />
                  {imageFile && !content.trim()
                    ? "이미지 첨부됨 · 등록 시 텍스트 자동 추출"
                    : `지문 입력 완료 · ${wordCount} words`}
                </>
              ) : (
                "왼쪽에서 자료를 선택하거나, 지문 내용을 입력하세요"
              )}
            </p>
            <div className="flex items-center gap-2">
              {/* TEMP: 모델 선택 UI 숨김 시 기본 생성 단일 버튼만 노출 */}
              {FEATURE_FLAGS.SHOW_MODEL_SELECTOR && (
              <Button
                variant="outline"
                onClick={() => onSave("STANDARD", props.analysisTone)}
                disabled={saving || !hasContent}
                className="h-9 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-1.5" />
                )}
                일반 분석 등록
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                  5 크레딧
                </span>
              </Button>
              )}
              <Button
                className="bg-blue-600 hover:bg-blue-700 h-9"
                onClick={() =>
                  onSave(
                    FEATURE_FLAGS.SHOW_MODEL_SELECTOR ? "PREMIUM" : "STANDARD",
                    props.analysisTone,
                  )
                }
                disabled={saving || !hasContent}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-1.5" />
                )}
                분석 등록
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold bg-white/20 px-1.5 py-0.5 rounded">
                  {FEATURE_FLAGS.SHOW_MODEL_SELECTOR ? "10" : "5"} 크레딧
                </span>
              </Button>
            </div>
          </div>
      </div>
    </div>
  );
}

interface ExtractionManageEmbedProps {
  academyId: string;
  draftCollections: DraftCollectionItem[];
  draftMembership: Record<string, string[]>;
  selectedDraftId: string | null;
  onSelectDraft: (draft: M1PassageDraftWithJob) => void;
}

function ExtractionManageEmbed({
  academyId,
  draftCollections,
  draftMembership,
  selectedDraftId,
  onSelectDraft,
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
    />
  );
}
