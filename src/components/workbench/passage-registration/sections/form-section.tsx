"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";
import { ExtractionManageClient } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import {
  IntakeSurface,
  type IntakeView,
  type IntakeTab,
} from "@/app/(director)/director/workbench/generate/intake/intake-surface";
import { GenerateUploadPanel } from "@/app/(director)/director/workbench/generate/intake/generate-upload-panel";
import type { PastedPassageInput } from "@/app/(director)/director/workbench/generate/intake/multi-passage-paste";
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

  // ── Header (defaults to the 학습지 생성 title; overridable for reuse) ──
  title?: string;
  description?: string;
  titleIcon?: LucideIcon;
  /** Left-panel library tab label. Defaults to "자료 관리". */
  libraryLabel?: string;
  /**
   * 라이브러리(내 지문함) 콘텐츠 override. 주어지면 IntakeSurface 의 library 로 그대로
   * 쓰고, 없으면 추출 드래프트 그리드(ExtractionManageEmbed)로 폴백한다. 학습지 생성은
   * 문제생성의 PassageCardGrid 를 넘겨 "내 지문함" 을 그대로 쓴다(웹툰 등은 폴백 유지).
   */
  library?: ReactNode;

  /**
   * 기출 지문 브라우저(ExamPassageLibrary). 주어지면 intake 탭에 "기출 지문"이
   * 노출된다(직접 입력 · 파일업로드 · 기출 지문). 문제 생성과 동일한 메커니즘.
   */
  examBrowser?: ReactNode;

  // ── Right pane override ──
  // When provided, this replaces the built-in PassageInputStack (학습지 분석 액션).
  // The 웹툰 생성 page passes its own WebtoonInputStack here so the 자료 관리 + 지문
  // 편집 레이아웃은 그대로 두고 하단 액션만 교체된다.
  rightPane?: ReactNode;

  // Multi-passage stack (the right "지문" section) — used only by the default
  // (학습지) right pane. Optional so reuse paths can omit them with `rightPane`.
  rows?: PassageInputRow[];
  setRows?: Dispatch<SetStateAction<PassageInputRow[]>>;
  analyzing?: boolean;
  onAnalyze?: (plan: QuestionGenerationPlan) => void;
  /** '지문 추가' → 내 지문함으로 돌아가 지문을 골라 담는다. */
  onAddPassage?: () => void;
  /** 변형 지문 생성 → 새 Passage 저장 + 새 행 추가. */
  onAddVariant?: (args: {
    sourcePassageId: string | null;
    title: string;
    content: string;
    mode: import("@/lib/passage-transform/schema").WholePassageTransformMode;
    direction?: import("@/lib/passage-transform/schema").VariantDirection;
  }) => Promise<boolean>;

  // 자료 관리 picker (left grid) — ExtractionManageEmbed 폴백에서만 사용. library
  // override 를 넘기는 경로(학습지 내 지문함)에서는 생략 가능.
  draftRefreshToken?: number;
  onSelectDraft?: (draft: M1PassageDraftWithJob) => void;
  onLoadSelectedDrafts?: (drafts: M1PassageDraftWithJob[]) => void;
  /** 우측 워크스페이스에 이미 불러온 드래프트 id — 자료 카드 '불러옴' 표시. */
  loadedDraftIds?: string[];
  draftCollections?: DraftCollectionItem[];
  draftMembership?: Record<string, string[]>;

  // Intake (이미지·PDF) — port of the 문제 생성 intake surface so new 자료 can be
  // extracted from image/PDF right here.
  intakeView: IntakeView;
  setIntakeView: (v: IntakeView) => void;
  intakeTab: IntakeTab;
  setIntakeTab: (v: IntakeTab) => void;
  onExtractionBegin: (id: string, count: number) => void;
  onExtractionResult: (id: string, jobId: string | null) => void;
  extractionPending: PendingExtraction[];

  // 워크스페이스 (지문 입력 및 필기창) — 문제생성처럼 자료함 위를 덮는 오버레이.
  // 기본(학습지) 우측 패널이 아니라 overlay 로 떠, 직접 입력·파일업로드 → 자료함 →
  // 워크스페이스 흐름을 만든다. rightPane 으로 교체하는 reuse 경로는 영향 없음.
  workspaceOpen?: boolean;
  setWorkspaceOpen?: (v: boolean) => void;
  workspaceActive?: boolean;
  /** 직접 입력 탭 제출 → 워크스페이스 스택에 적재. */
  onSubmitPastedRows?: (
    rows: PastedPassageInput[],
  ) => boolean | void | Promise<boolean | void>;
  pasteSaving?: boolean;

  // ── 모바일 스텝 플로우(<lg 전용) — PC 무영향 ──
  /** IntakeSurface 탭 노출 제어(스텝이 이동을 담당하면 "hidden"/"sources"). */
  mobileStepTabs?: "sources" | "hidden";
  /** 직접 입력 보드의 시작 동작을 하단 고정 바가 대신 호출. */
  pasteStartRef?: import("react").MutableRefObject<(() => void) | null>;
  /** 직접 입력 누적 지문 수·작업 상태 알림(하단 바 라벨용). */
  onPasteStateChange?: (state: { count: number; busy: boolean }) => void;
  /** 학습지 구성(기본/실전) 제어 리프트 — 하단 고정 바 '생성하기'용. */
  includeWorksheet?: boolean;
  setIncludeWorksheet?: (v: boolean) => void;

  // Metadata + Prompt — vestigial (not rendered by FormSection). Optional so
  // reuse paths (웹툰 생성) can omit them; the 학습지 container still passes them.
  schools?: Array<{
    id: string;
    name: string;
    type: string;
    publisher: string | null;
  }>;
  schoolId?: string;
  setSchoolId?: (v: string) => void;
  grade?: string;
  setGrade?: (v: string) => void;
  semester?: string;
  setSemester?: (v: string) => void;
  unit?: string;
  setUnit?: (v: string) => void;
  source?: string;
  setSource?: (v: string) => void;
  publisher?: string;
  setPublisher?: (v: string) => void;
  publisherCustom?: string;
  setPublisherCustom?: (v: string) => void;
  tagInput?: string;
  setTagInput?: (v: string) => void;
  tags?: string[];
  addTag?: () => void;
  removeTag?: (tag: string) => void;
  analysisPrompt?: string;
  setAnalysisPrompt?: (v: string) => void;
  analysisTone?: AnalysisTone;
  setAnalysisTone?: (v: AnalysisTone) => void;
  savedPrompts?: SavedPrompt[];
  showSavedPrompts?: boolean;
  setShowSavedPrompts?: (v: boolean | ((prev: boolean) => boolean)) => void;
  newPromptName?: string;
  setNewPromptName?: (v: string) => void;
  savingPrompt?: boolean;
  onSavePrompt?: () => void;
  onDeletePrompt?: (id: string) => void;
}

const FORM_PANE_STORAGE_KEY = "smoat:passage-form:pane-height";
const FORM_PANE_MIN = 500;
const FORM_PANE_DEFAULT = 700;
const FORM_PANE_MAX = 1400;

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

export function FormSection(props: FormSectionProps) {
  const { formCollapsed, setFormCollapsed } = props;

  // 마키(영역 드래그) 시작 영역 = 워크플로 surface 전체. 아래 지문 목록 큐와
  // boundary 가 분리돼 서로 섞이지 않는다(드래그 선택 영역 구분).
  const materialBoundaryRef = useRef<HTMLDivElement>(null);
  const [formHeight, setFormHeight] = useState<number>(readStoredFormHeight);

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
      {/* 모바일은 상단 헤더·스텝바에 이미 제목이 있어 카드 내부 제목을 숨긴다.
          (PC는 그대로) 접힘 상태일 때만 '펼치기' 버튼을 위해 헤더 바를 남긴다. */}
      <div
        className={`${
          formCollapsed ? "flex" : "hidden lg:flex"
        } flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3`}
      >
        <WorkflowPageTitle
          className="hidden lg:flex"
          icon={props.titleIcon ?? PassageAnalysisIcon}
          title={props.title ?? "학습지 생성"}
          description={
            props.description ??
            "추출된 자료를 불러오거나 직접 입력한 지문을 바탕으로 어휘, 문법, 구조, 출제 포인트를 분석합니다."
          }
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
          {/* 모바일 좌우 여백을 문제생성(WorkspaceShell)과 동일하게 px-1.5 로 맞춘다.
              스텝퍼 아래 상단 여백도 문제생성과 맞추려 모바일에서 pt-6(WorkspaceShell
              내부 구조가 더 주는 ~8px 보정). 데스크톱은 lg: 로 기존과 동일(PC 무변경). */}
          <div className="px-1.5 pt-6 pb-2 lg:px-4 lg:pt-4 lg:pb-3">
            {/* ─── 단일 흐름: 직접 입력 · 파일업로드 › 자료함 › 워크스페이스 ───
                문제생성과 동일하게, 자료를 모으는 탭(직접 입력·파일업로드·자료함)
                위로 지문 입력·필기 스택(워크스페이스)을 오버레이로 띄운다. */}
            <div
              ref={materialBoundaryRef}
              // 모바일(<lg)은 formHeight(데스크톱 드래그 높이)를 무시하고 내용에 맞춰
              // 자동 높이로 둔다(빈 여백 박스 방지). IntakeSurface 가 자체적으로
              // 모바일 높이(오버레이 min-h-[55vh]·입력탭 max-lg 높이)를 관리한다.
              // `!h-auto`(important)로 인라인 height 를 덮는다. 데스크톱은 formHeight 유지.
              className="flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-md border border-slate-200 max-lg:!h-auto"
              style={{ height: `${formHeight}px` }}
            >
              <IntakeSurface
                intakeView={props.intakeView}
                setIntakeView={props.setIntakeView}
                intakeTab={props.intakeTab}
                setIntakeTab={props.setIntakeTab}
                libraryLabel={props.libraryLabel ?? "내 자료함"}
                libraryCount={0}
                // 직접 입력 탭은 paste 핸들러가 있으면 노출한다. rightPane(웹툰)
                // 경로도 onSubmitPastedRows 를 넘기면 직접 입력 › 파일업로드 ›
                // 자료 관리 › 워크스페이스 흐름을 학습지와 동일하게 갖는다.
                showPasteTab={!!props.onSubmitPastedRows}
                onSubmitPastedRows={props.onSubmitPastedRows}
                pasteSaving={props.pasteSaving}
                mobileStepTabs={props.mobileStepTabs}
                pasteStartRef={props.pasteStartRef}
                onPasteStateChange={props.onPasteStateChange}
                examBrowser={props.examBrowser}
                upload={
                  <GenerateUploadPanel
                    onBegin={props.onExtractionBegin}
                    onResult={props.onExtractionResult}
                    inFlightCount={props.extractionPending.length}
                  />
                }
                library={
                  props.library ??
                  /* 폴백: 추출 드래프트 그리드(웹툰 등). 진행 중 추출 표시는
                     ExtractionManageClient 내부에서 서버 jobMeta 기반으로 렌더한다. */
                  (props.draftCollections && props.onLoadSelectedDrafts ? (
                    <ExtractionManageEmbed
                      academyId={props.academyId}
                      draftCollections={props.draftCollections}
                      draftMembership={props.draftMembership ?? {}}
                      onSelectDraft={props.onSelectDraft ?? (() => {})}
                      onLoadSelectedDrafts={props.onLoadSelectedDrafts}
                      loadedDraftIds={props.loadedDraftIds}
                      marqueeBoundaryRef={materialBoundaryRef}
                      refreshToken={props.draftRefreshToken}
                      sessionPending={props.extractionPending}
                    />
                  ) : null)
                }
                workspaceActive={props.workspaceActive}
                onReopenWorkspace={
                  props.setWorkspaceOpen
                    ? () => props.setWorkspaceOpen!(true)
                    : undefined
                }
                onDismissOverlay={
                  props.setWorkspaceOpen
                    ? () => props.setWorkspaceOpen!(false)
                    : undefined
                }
                overlay={
                  props.workspaceOpen
                    ? (props.rightPane ??
                      (props.rows && props.setRows && props.onAnalyze ? (
                        <div className="flex min-h-0 flex-1 flex-col">
                          <PassageInputStack
                            rows={props.rows}
                            setRows={props.setRows}
                            saving={!!props.analyzing}
                            onAnalyze={props.onAnalyze}
                            onAddPassage={props.onAddPassage}
                            onAddVariant={props.onAddVariant}
                            includeWorksheet={props.includeWorksheet}
                            onIncludeWorksheetChange={props.setIncludeWorksheet}
                          />
                        </div>
                      ) : null))
                    : undefined
                }
              />
            </div>
          </div>

          {/* ─── Form pane vertical resize handle ─── */}
          {/* 데스크톱 전용: 폼 높이 드래그 조절 + 접기. 모바일은 스텝 플로우가
              레이아웃을 관리하므로 그랩바/접기 모두 숨긴다. */}
          <div className="relative hidden pb-2.5 lg:block">
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
