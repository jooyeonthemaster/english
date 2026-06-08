"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { GripVertical, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { QuestionGenerationIcon } from "@/components/icons/workflow-icons";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { useSidebarFocus } from "@/components/layout/sidebar-focus-context";
import type { CollectionItem } from "@/components/workbench/shared/types";
import {
  imagesToSlots,
  revokeSlotUrls,
  splitPdfToImages,
} from "@/lib/extraction/pdf-splitter";
import type { ClientPageSlot, CropBox } from "@/lib/extraction/types";

import { ExtractionManageClient } from "../../exams/similar/_components/material-manager";
import { SimilarExamCenterPreview } from "../../exams/similar/_components/similar-exam-center-preview";
import {
  buildManualCropReferenceSlot,
  ManualQuestionCropBoard,
} from "../_components/manual-question-crop-board";
import { SimilarQuestionJobsPanel } from "./similar-question-jobs-panel";
import {
  blobToBase64,
  clampNumber,
  createClientRequestId,
  LEFT_COLLAPSED_STORAGE_KEY,
  LEFT_WIDTH_STORAGE_KEY,
  LEFT_MAX,
  LEFT_MIN,
  PANEL_DRAG_THRESHOLD,
  PANEL_MIN_CENTER,
  PANEL_TOGGLE_HANDLE_WIDTH,
  readStoredCollapsed,
  readStoredLeftWidth,
  mediaTypeForBlob,
} from "./similar-question-generator-utils";

// 동형 문제 생성 — 동형 시험지 생성 셸 차용:
// 좌=자료 관리(기존 지문 풀에서 선택) / 중앙=원본 문항(사진·PDF) 미리보기 + 실행 + 결과.
// 텍스트 지문 붙여넣기는 폐기. 선택한 자료(draft)를 from-drafts 로 등록 → passageId →
// 그 지문으로 동형 문항 생성.

interface SimilarQuestionGeneratorClientProps {
  academyId: string;
  draftCollections: CollectionItem[];
  draftMembership: Record<string, Set<string>>;
}

interface StagedFile {
  fileName: string;
  totalPages: number;
}

export function SimilarQuestionGeneratorClient({
  academyId,
  draftCollections,
  draftMembership,
}: SimilarQuestionGeneratorClientProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const slotsRef = useRef<ClientPageSlot[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const suppressHandleClickRef = useRef(false);
  const { setCollapseRequested: setSidebarCollapseRequested } = useSidebarFocus();

  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [staged, setStaged] = useState<StagedFile | null>(null);
  const [slots, setSlots] = useState<ClientPageSlot[]>([]);
  const [cropBoxes, setCropBoxes] = useState<CropBox[]>([]);
  const [splitting, setSplitting] = useState(false);
  const [splitMessage, setSplitMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gradeInfo, setGradeInfo] = useState("고3");
  const [jobsRefreshKey, setJobsRefreshKey] = useState(0);

  const [leftWidth, setLeftWidth] = useState(readStoredLeftWidth);
  const [leftCollapsed, setLeftCollapsed] = useState(readStoredCollapsed);

  const selectedCount = selectedDraftIds.size;
  const canRun = Boolean(staged) && cropBoxes.length > 0 && !busy && !splitting;

  const clearStaged = useCallback(() => {
    revokeSlotUrls(slotsRef.current);
    slotsRef.current = [];
    setSlots([]);
    setCropBoxes([]);
    setStaged(null);
    setSplitMessage("");
    setError(null);
  }, []);

  useEffect(() => () => revokeSlotUrls(slotsRef.current), []);

  // 좌패널이 열려 있으면 전역 사이드바 접기 요청(동형 시험지 생성과 동일).
  useEffect(() => {
    setSidebarCollapseRequested(!leftCollapsed);
  }, [leftCollapsed, setSidebarCollapseRequested]);
  useEffect(() => {
    return () => setSidebarCollapseRequested(false);
  }, [setSidebarCollapseRequested]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LEFT_WIDTH_STORAGE_KEY, String(leftWidth));
    } catch {
      // 무시
    }
  }, [leftWidth]);
  useEffect(() => {
    try {
      window.localStorage.setItem(LEFT_COLLAPSED_STORAGE_KEY, String(leftCollapsed));
    } catch {
      // 무시
    }
  }, [leftCollapsed]);

  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? element.clientWidth;
      const maxLeft = Math.min(
        LEFT_MAX,
        width - PANEL_TOGGLE_HANDLE_WIDTH - PANEL_MIN_CENTER,
      );
      setLeftWidth((current) => {
        const next = clampNumber(current, LEFT_MIN, Math.max(LEFT_MIN, maxLeft));
        return next === current ? current : next;
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pickFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0 || busy || splitting) return;
      // 참조 문항은 한 페이지(이미지 1장 또는 1페이지 PDF)만 허용.
      if (list.length > 1) {
        toast.error("참조 문항은 이미지 한 장 또는 1페이지 PDF만 넣어주세요.");
        return;
      }
      clearStaged();
      setSplitting(true);
      setError(null);
      try {
        const file = list[0];
        const pdf = file.type === "application/pdf" ? file : null;
        setSplitMessage(pdf ? "PDF 페이지를 이미지로 변환 중" : "이미지 정리 중");
        const nextSlots = pdf
          ? await splitPdfToImages(pdf, {
              onProgress: (p) => {
                if (p.phase === "rendering") {
                  setSplitMessage(
                    `${(p.pageIndex ?? 0) + 1}/${p.totalPages ?? "?"}페이지 변환 중`,
                  );
                }
              },
            })
          : await imagesToSlots([file]);
        if (nextSlots.length > 1) {
          revokeSlotUrls(nextSlots);
          const message =
            "여러 페이지 PDF는 지원하지 않습니다. 문항이 담긴 한 페이지만 넣어주세요.";
          setError(message);
          toast.error(message);
          setSplitMessage("");
          return;
        }
        slotsRef.current = nextSlots;
        setSlots(nextSlots);
        setCropBoxes([]);
        setStaged({
          fileName: pdf ? pdf.name : file?.name ?? "업로드한 문항",
          totalPages: nextSlots.length,
        });
        setSplitMessage("");
      } catch (err) {
        const message = err instanceof Error ? err.message : "문항을 준비하지 못했습니다.";
        setError(message);
        toast.error(message);
      } finally {
        setSplitting(false);
      }
    },
    [busy, splitting, clearStaged],
  );

  const requestFileDialog = useCallback(() => fileInputRef.current?.click(), []);

  const run = useCallback(async () => {
    const currentSlots = slotsRef.current;
    if (!staged || currentSlots.length === 0) {
      toast.error("분석할 문항(사진/PDF)을 먼저 입력하세요.");
      return;
    }
    if (cropBoxes.length === 0) {
      toast.error("문항 영역을 먼저 수동으로 크롭해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 선택 자료(draft) → passage 등록(from-drafts).
      let passageIds: string[] = [];
      const draftIds = Array.from(selectedDraftIds);
      if (draftIds.length > 0) {
        const regRes = await fetch("/api/similar-exams/passages/from-drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ draftIds }),
        });
        if (!regRes.ok) {
          const data = await regRes.json().catch(() => ({}));
          throw new Error(data?.error || "선택 자료를 지문으로 준비하지 못했습니다.");
        }
        const regData = (await regRes.json()) as {
          passages?: Array<{ draftId: string; passageId: string }>;
        };
        passageIds = (regData.passages ?? []).map((p) => p.passageId);
      }

      if (passageIds.length === 0) {
        // draft 는 골랐지만 본문이 없어 0건 등록된 경우와, 아예 미선택을 구분해 안내.
        toast.warning(
          draftIds.length > 0
            ? "선택한 자료에서 동형에 쓸 지문 본문을 만들지 못했습니다. 본문이 있는 자료를 골라주세요."
            : "동형을 입힐 지문을 왼쪽 자료에서 1개 이상 선택하세요.",
        );
        return;
      }
      // 일부만 등록된 경우(본문 없음/등록 실패) 조용히 진행하지 않고 알린 뒤 가능한 만큼 진행.
      if (passageIds.length < draftIds.length) {
        toast.warning(
          `선택한 자료 ${draftIds.length}개 중 ${passageIds.length}개만 지문으로 등록됐어요. 나머지는 본문이 없어 제외됩니다.`,
        );
      }

      const manualReferenceSlot = await buildManualCropReferenceSlot(
        currentSlots[0],
        cropBoxes,
      );
      const images = [
        {
          data: await blobToBase64(manualReferenceSlot.blob),
          mediaType: mediaTypeForBlob(manualReferenceSlot.blob),
        },
      ];

      const clientRequestId = createClientRequestId();

      // 작업을 큐에 등록만 하고 즉시 반환(논블로킹) — 생성은 백그라운드 워커가 처리.
      const res = await fetch("/api/similar-exams/question-generation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          clientRequestId,
          images,
          passageIds,
          gradeInfo,
          manualCrop: true,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        jobId?: string;
        requestId?: string;
      };
      if (!res.ok) {
        const trace = data.requestId ?? clientRequestId;
        throw new Error(`${data.error || "요청 실패"} (요청 ${trace})`);
      }
      if (!data.jobId) {
        throw new Error(`작업 ID를 받지 못했습니다. (요청 ${data.requestId ?? clientRequestId})`);
      }

      setJobsRefreshKey((value) => value + 1);
      clearStaged();
      toast.success(
        `동형 생성 작업을 큐에 등록했어요. 작업 ID: ${data.jobId.slice(-6)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [staged, cropBoxes, selectedDraftIds, gradeInfo, clearStaged]);

  // ─── 좌패널 핸들: 클릭=여닫기, 드래그=폭 조절 (동형 시험지 생성과 동일) ───
  function toggleLeftCollapsed() {
    if (suppressHandleClickRef.current) {
      suppressHandleClickRef.current = false;
      return;
    }
    setLeftCollapsed((c) => !c);
  }

  function handleLeftResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    suppressHandleClickRef.current = false;
    const container = gridRef.current;
    const startX = event.clientX;
    const startWidth = leftWidth;
    const containerWidth = container?.getBoundingClientRect().width ?? 0;
    const maxLeft = Math.min(
      LEFT_MAX,
      containerWidth - PANEL_TOGGLE_HANDLE_WIDTH - PANEL_MIN_CENTER,
    );
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    let didDrag = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      if (!didDrag) {
        if (Math.abs(deltaX) < PANEL_DRAG_THRESHOLD) return;
        didDrag = true;
        suppressHandleClickRef.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }
      moveEvent.preventDefault();
      setLeftWidth(
        clampNumber(startWidth + deltaX, LEFT_MIN, Math.max(LEFT_MIN, maxLeft)),
      );
    };
    const finish = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (didDrag) {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
      }
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }

  const leftColumnWidth = leftCollapsed ? 0 : leftWidth;
  const gridColumns = `${leftColumnWidth}px ${PANEL_TOGGLE_HANDLE_WIDTH}px minmax(${PANEL_MIN_CENTER}px,1fr)`;

  return (
    <div className="relative bg-[#F4F6F9] md:-m-6">
      <div className="relative flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white">
        <div className="shrink-0 border-b border-slate-200/80 bg-white px-5 py-3">
          <WorkflowPageTitle
            icon={QuestionGenerationIcon}
            title="동형 문제 생성"
            description="원본 문항(사진/PDF)을 분석하고, 왼쪽 자료에서 지문을 골라 같은 출제 의도의 동형 문항을 생성합니다."
          />
        </div>

        <div
          ref={gridRef}
          className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:[grid-template-columns:var(--sq-grid-columns)]"
          style={{ "--sq-grid-columns": gridColumns } as CSSProperties}
        >
          {/* ─── 좌: 자료 관리 (기존 지문 풀에서 선택) ─── */}
          {leftCollapsed ? (
            <div aria-hidden className="min-w-0 overflow-hidden" />
          ) : (
            <div
              ref={leftColRef}
              className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-slate-200"
            >
              <ExtractionManageClient
                embedded
                academyId={academyId}
                initialCollections={draftCollections}
                initialCollectionMembership={draftMembership}
                onSelectionChange={setSelectedDraftIds}
                marqueeBoundaryRef={leftColRef}
              />
            </div>
          )}

          {leftCollapsed ? (
            <button
              type="button"
              onClick={() => setLeftCollapsed(false)}
              title="자료 관리 패널 열기"
              aria-label="자료 관리 패널 열기"
              aria-expanded={false}
              className="mx-1 hidden h-full min-h-0 w-4 shrink-0 select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100 lg:flex"
            >
              <span>{">"}</span>
              <span style={{ writingMode: "vertical-rl" }}>자료 관리</span>
            </button>
          ) : (
            <button
              type="button"
              onPointerDown={handleLeftResizePointerDown}
              onClick={toggleLeftCollapsed}
              title="드래그하여 폭 조절 · 클릭하여 닫기"
              aria-label="자료 관리 패널 닫기"
              aria-expanded
              className="group/lhandle mx-1 hidden h-full min-h-0 w-4 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100 lg:flex"
            >
              <span>{"<"}</span>
              <span style={{ writingMode: "vertical-rl" }}>자료 관리</span>
              <GripVertical className="h-3 w-3 opacity-40 transition-opacity group-hover/lhandle:opacity-70" />
            </button>
          )}

          {/* ─── 중앙: 원본 문항 미리보기 + 실행 + 결과 ─── */}
          <section className="flex min-w-0 flex-col overflow-hidden bg-slate-100/70">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
              <span className="text-[12px] font-bold text-slate-700">
                {staged ? `${staged.fileName} · ${staged.totalPages}p` : "문항 미입력"}
              </span>
              {staged ? (
                <button
                  type="button"
                  onClick={clearStaged}
                  disabled={busy}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 disabled:opacity-50"
                >
                  초기화
                </button>
              ) : null}
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                선택 지문 {selectedCount}
              </span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
                크롭 {cropBoxes.length}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
                  학년
                  <input
                    value={gradeInfo}
                    onChange={(e) => setGradeInfo(e.target.value)}
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-[12px]"
                  />
                </label>
                <button
                  type="button"
                  onClick={run}
                  disabled={!canRun}
                  title={cropBoxes.length === 0 ? "문항 영역을 먼저 크롭해 주세요" : undefined}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {busy
                    ? "큐 등록 중…"
                    : cropBoxes.length === 0
                      ? "크롭 필요"
                      : "동형 생성 큐에 추가"}
                </button>
              </div>
            </div>

            {staged && slots[0] ? (
              <ManualQuestionCropBoard
                slot={slots[0]}
                boxes={cropBoxes}
                busy={busy}
                error={error}
                onBoxesChange={setCropBoxes}
                onPickFiles={pickFiles}
                onRequestFileDialog={requestFileDialog}
              />
            ) : (
              <SimilarExamCenterPreview
                staged={staged}
                slots={slots}
                splitting={splitting}
                splitMessage={splitMessage}
                busy={false}
                uploadProgress={0}
                error={error}
                onPickFiles={pickFiles}
                onRequestFileDialog={requestFileDialog}
                emptyTitle="분석할 문항 이미지 1장 또는 1페이지 PDF 입력"
                emptyHint="문항이 담긴 사진 1장(또는 1페이지 PDF)을 올리세요. 왼쪽 자료에서 지문을 고르면 지문마다 동형 문항이 생성됩니다(여러 문항 × 여러 지문)."
                pickLabel="문항 선택"
              />
            )}
          </section>
        </div>
      </div>

      {/* ─── 하단: 생성한 동형 문항 목록 (동형 시험지 생성 톤) ─── */}
      <SimilarQuestionJobsPanel refreshKey={jobsRefreshKey} running={busy} />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) pickFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
