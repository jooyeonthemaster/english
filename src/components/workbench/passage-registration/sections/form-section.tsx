"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { ExtractionManageClient } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import {
  IntakeSurface,
  type IntakeView,
  type IntakeTab,
} from "@/app/(director)/director/workbench/generate/intake/intake-surface";
import { GenerateUploadPanel } from "@/app/(director)/director/workbench/generate/intake/generate-upload-panel";
import type { PendingExtraction } from "../use-create-extraction";
import type { CollectionItem } from "@/components/workbench/shared/types";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { PassageAnalysisIcon } from "@/components/icons/workflow-icons";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type { AnalysisTone } from "@/lib/passage-analysis-options";
import type { DraftCollectionItem, SavedPrompt } from "../types";
import type { PassageInputRow } from "../passage-input/types";
import { PassageInputStack } from "../passage-input/passage-input-stack";

interface FormSectionProps {
  academyId: string;
  formCollapsed: boolean;
  setFormCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;

  // Multi-passage stack (the right "지문" section)
  rows: PassageInputRow[];
  setRows: Dispatch<SetStateAction<PassageInputRow[]>>;
  analyzing: boolean;
  onAnalyze: (plan: QuestionGenerationPlan) => void;

  // 자료 관리 picker (left grid)
  draftRefreshToken: number;
  onSelectDraft: (draft: M1PassageDraftWithJob) => void;
  onLoadSelectedDrafts: (drafts: M1PassageDraftWithJob[]) => void;
  /** 우측 워크스페이스에 이미 불러온 드래프트 id — 자료 카드 '불러옴' 표시. */
  loadedDraftIds?: string[];
  draftCollections: DraftCollectionItem[];
  draftMembership: Record<string, string[]>;

  // Intake (이미지·PDF) — port of the 문제 생성 intake surface so new 자료 can be
  // extracted from image/PDF right here.
  intakeView: IntakeView;
  setIntakeView: (v: IntakeView) => void;
  intakeTab: IntakeTab;
  setIntakeTab: (v: IntakeTab) => void;
  onExtractionBegin: (id: string, count: number) => void;
  onExtractionResult: (id: string, jobId: string | null) => void;
  extractionPending: PendingExtraction[];

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
const LEFT_PANE_MAX_RATIO = 0.62;
const RIGHT_PANE_MIN = 480;
const HANDLE_HIT_WIDTH = 12;

const FORM_PANE_STORAGE_KEY = "smoat:passage-form:pane-height";
const FORM_PANE_MIN = 500;
const FORM_PANE_DEFAULT = 700;
const FORM_PANE_MAX = 1400;

const LEFT_PANE_OPEN_STORAGE_KEY = "smoat:passage-form:left-pane-open";

// 좌측 자료 패널 핸들의 클릭/드래그 구분 임계값(px).
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

export function FormSection(props: FormSectionProps) {
  const { formCollapsed, setFormCollapsed } = props;

  const splitContainerRef = useRef<HTMLDivElement>(null);
  // 마키(영역 드래그) 시작 영역 = "자료 관리" 좌측 패널 전체. 아래 지문 목록 큐와
  // boundary 가 분리돼 서로 섞이지 않는다(드래그 선택 영역 구분).
  const materialBoundaryRef = useRef<HTMLDivElement>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(
    readStoredLeftPaneWidth,
  );
  const [formHeight, setFormHeight] = useState<number>(readStoredFormHeight);
  const [leftPaneOpen, setLeftPaneOpen] = useState<boolean>(
    readStoredLeftPaneOpen,
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
          description="추출된 자료를 불러오거나 직접 입력한 지문을 바탕으로 어휘, 문법, 구조, 출제 포인트를 분석합니다."
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
            {/* ─── 2-Pane Layout: 자료 관리 | 지문 입력 ─── */}
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
                    style={{ width: `min(${leftPaneWidth}px, 62%)` }}
                  >
                    <IntakeSurface
                      intakeView={props.intakeView}
                      setIntakeView={props.setIntakeView}
                      intakeTab={props.intakeTab}
                      setIntakeTab={props.setIntakeTab}
                      libraryLabel="자료 관리"
                      libraryCount={0}
                      showPasteTab={false}
                      upload={
                        <GenerateUploadPanel
                          onBegin={props.onExtractionBegin}
                          onResult={props.onExtractionResult}
                          inFlightCount={props.extractionPending.length}
                        />
                      }
                      library={
                        /* 진행 중 추출 표시는 ExtractionManageClient 내부에서 서버 jobMeta
                           기반으로(새로고침/다른 기기에도 유지) 자료 그리드 안에 직접 렌더한다. */
                        <ExtractionManageEmbed
                          academyId={props.academyId}
                          draftCollections={props.draftCollections}
                          draftMembership={props.draftMembership}
                          onSelectDraft={props.onSelectDraft}
                          onLoadSelectedDrafts={props.onLoadSelectedDrafts}
                          loadedDraftIds={props.loadedDraftIds}
                          marqueeBoundaryRef={materialBoundaryRef}
                          refreshToken={props.draftRefreshToken}
                          sessionPending={props.extractionPending}
                        />
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onPointerDown={handleCloseLeftPanePointerDown}
                    onDoubleClick={resetLeftPaneWidth}
                    title="클릭하여 닫기 · 좌우로 드래그하여 너비 조절 · 더블 클릭하여 초기화"
                    className="group/lhandle mx-1 flex w-4 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100"
                  >
                    <span>{"<"}</span>
                    <span style={{ writingMode: "vertical-rl" }}>자료 닫기</span>
                    <GripVertical className="h-3 w-3 opacity-40 transition-opacity group-hover/lhandle:opacity-70" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={toggleLeftPaneOpen}
                  title="클릭하여 자료 패널 열기"
                  className="mx-1 flex min-h-0 w-4 shrink-0 select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600"
                >
                  <span>{">"}</span>
                  <span style={{ writingMode: "vertical-rl" }}>자료 열기</span>
                </button>
              )}

              {/* RIGHT: 지문 입력 (선생님의 노하우·분석 말투·지문 정보 옵션 패널 제거) */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <PassageInputStack
                  rows={props.rows}
                  setRows={props.setRows}
                  saving={props.analyzing}
                  onAnalyze={props.onAnalyze}
                />
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
              className="group/fhandle flex h-3 cursor-row-resize select-none items-center justify-center"
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
              className="absolute right-4 top-1/2 inline-flex -translate-y-1/2 cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
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
  onSelectDraft: (draft: M1PassageDraftWithJob) => void;
  onLoadSelectedDrafts: (drafts: M1PassageDraftWithJob[]) => void;
  /** 우측 워크스페이스에 이미 불러온 드래프트 id — 자료 카드 '불러옴' 표시. */
  loadedDraftIds?: string[];
  /** 마키(영역 드래그) 시작 영역 = 자료 관리 패널 전체. 같은 페이지의 지문 목록 큐와
   *  영역이 섞이지 않도록 분리한다. */
  marqueeBoundaryRef?: React.RefObject<HTMLElement | null>;
  /** Bumped on extraction job create/complete to force an immediate refresh. */
  refreshToken?: number;
  /** Session in-flight extractions → immediate in-grid "추출 중" skeletons. */
  sessionPending?: PendingExtraction[];
}

function ExtractionManageEmbed({
  academyId,
  draftCollections,
  draftMembership,
  onSelectDraft,
  onLoadSelectedDrafts,
  loadedDraftIds,
  marqueeBoundaryRef,
  refreshToken,
  sessionPending,
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
      onSelectDraftExternal={onSelectDraft}
      onLoadSelectedDrafts={onLoadSelectedDrafts}
      loadedExternalDraftIds={loadedDraftIds}
      marqueeBoundaryRef={marqueeBoundaryRef}
      draftDetailActionMode="import"
      refreshToken={refreshToken}
      sessionPending={sessionPending}
    />
  );
}
