"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GripVertical } from "lucide-react";

import { ExamPaperGenerationIcon } from "@/components/icons/workflow-icons";
import { useTaskQueue } from "@/components/workbench/task-queue";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { useSidebarFocus } from "@/components/layout/sidebar-focus-context";
import type { CollectionItem } from "@/components/workbench/shared/types";
import {
  imagesToSlots,
  revokeSlotUrls,
  splitPdfToImages,
} from "@/lib/extraction/pdf-splitter";
import type { ClientPageSlot } from "@/lib/extraction/types";
import { cn } from "@/lib/utils";

import { ExtractionManageClient } from "./_components/material-manager";
import { SimilarExamJobsPanel } from "./_components/similar-exam-jobs-panel";
import { SimilarExamCenterPreview } from "./_components/similar-exam-center-preview";
import { SimilarExamToolbar } from "./_components/similar-exam-toolbar";
import {
  SimilarExamCommandBar,
  type SimilarQuickCommand,
} from "./_components/similar-exam-command-bar";

interface UploadTarget {
  pageIndex: number;
  uploadUrl: string;
  uploadPath: string;
  token?: string;
  expiresAt: string;
}

interface CreateJobResponse {
  jobId: string;
  uploadTargets: UploadTarget[];
}

interface StagedFile {
  fileName: string;
  sourceType: "PDF" | "IMAGES";
  totalPages: number;
}

interface SimilarExamGeneratorClientProps {
  academyId: string;
  draftCollections: CollectionItem[];
  draftMembership: Record<string, Set<string>>;
}

const ROUTE_PATH = "/director/workbench/similar-exams";

// ─── 좌패널(자료 관리) 폭/접힘 ───
const LEFT_WIDTH_STORAGE_KEY = "smoat.similarExam.leftWidth.v2";
const LEFT_COLLAPSED_STORAGE_KEY = "smoat.similarExam.leftCollapsed.v2";
const PANEL_TOGGLE_HANDLE_WIDTH = 24;
const PANEL_DRAG_THRESHOLD = 4;
const PANEL_MIN_CENTER = 460;
const LEFT_DEFAULT = 580;
const LEFT_MIN = 380;
const LEFT_MAX = 860;
const BUILDER_HEADER_AUTO_HIDE_DELAY_MS = 2000;
const BUILDER_HEADER_HIDE_ZONE_PX = 96;

function clampNumber(value: number, min: number, max: number) {
  const normalizedMax = Math.max(min, max);
  return Math.min(Math.max(value, min), normalizedMax);
}

function readStoredLeftWidth(): number {
  if (typeof window === "undefined") return LEFT_DEFAULT;
  const raw = Number(window.localStorage.getItem(LEFT_WIDTH_STORAGE_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return LEFT_DEFAULT;
  return clampNumber(raw, LEFT_MIN, LEFT_MAX);
}

function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LEFT_COLLAPSED_STORAGE_KEY) === "true";
}

function mimeTypeForBlob(blob: Blob) {
  if (blob.type === "image/png") return "image/png";
  if (blob.type === "image/webp") return "image/webp";
  return "image/jpeg";
}

async function putWithLimit(
  slots: ClientPageSlot[],
  targets: UploadTarget[],
  onProgress: (uploaded: number) => void,
) {
  const queue = [...slots];
  const byIndex = new Map(targets.map((target) => [target.pageIndex, target]));
  let uploaded = 0;

  async function worker() {
    for (;;) {
      const slot = queue.shift();
      if (!slot) return;
      const target = byIndex.get(slot.pageIndex);
      if (!target)
        throw new Error(`No upload target for page ${slot.pageIndex}`);

      const res = await fetch(target.uploadUrl, {
        method: "PUT",
        body: slot.blob,
        headers: {
          "Content-Type": slot.blob.type || "image/jpeg",
          "x-upsert": "true",
        },
      });
      if (!res.ok)
        throw new Error(`${slot.pageIndex + 1}페이지 업로드에 실패했습니다.`);
      uploaded += 1;
      onProgress(uploaded);
    }
  }

  await Promise.all([worker(), worker(), worker(), worker()]);
}

export function SimilarExamGeneratorClient({
  academyId,
  draftCollections,
  draftMembership,
}: SimilarExamGeneratorClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const slotsRef = useRef<ClientPageSlot[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const headerAutoHideReadyRef = useRef(false);
  const suppressHandleClickRef = useRef(false);
  const { triggerRefresh } = useTaskQueue();
  const { setCollapseRequested: setSidebarCollapseRequested } =
    useSidebarFocus();

  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [staged, setStaged] = useState<StagedFile | null>(null);
  const [slots, setSlots] = useState<ClientPageSlot[]>([]);
  const [splitting, setSplitting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [splitMessage, setSplitMessage] = useState("");
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [leftWidth, setLeftWidth] = useState(readStoredLeftWidth);
  const [leftCollapsed, setLeftCollapsed] = useState(readStoredCollapsed);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [jobsRefreshKey, setJobsRefreshKey] = useState(0);

  const uploadProgress = useMemo(() => {
    const total = staged?.totalPages ?? 0;
    if (total <= 0) return 0;
    return Math.round((uploaded / total) * 100);
  }, [staged, uploaded]);

  const selectedCount = selectedDraftIds.size;
  const canGenerate = Boolean(staged) && selectedCount > 0 && !busy;

  const clearStaged = useCallback(() => {
    revokeSlotUrls(slotsRef.current);
    slotsRef.current = [];
    setSlots([]);
    setStaged(null);
    setSplitMessage("");
    setUploaded(0);
    setError(null);
  }, []);

  useEffect(() => () => revokeSlotUrls(slotsRef.current), []);

  // 좌패널이 열려 있으면(자료 관리 + 중앙 동시 노출) 전역 사이드바 접기 요청.
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
      // 무시.
    }
  }, [leftWidth]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        LEFT_COLLAPSED_STORAGE_KEY,
        String(leftCollapsed),
      );
    } catch {
      // 무시.
    }
  }, [leftCollapsed]);

  // 컨테이너 크기에 맞춰 좌패널 폭 재조정(중앙 최소폭 보장).
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
        const next = clampNumber(
          current,
          LEFT_MIN,
          Math.max(LEFT_MIN, maxLeft),
        );
        return next === current ? current : next;
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // ─── 헤더 자동 숨김 ───
  useEffect(() => {
    const autoHideTimer = window.setTimeout(() => {
      headerAutoHideReadyRef.current = true;
      setHeaderVisible(false);
    }, BUILDER_HEADER_AUTO_HIDE_DELAY_MS);
    return () => window.clearTimeout(autoHideTimer);
  }, []);
  useEffect(() => {
    if (!headerVisible) return;
    const handleMouseMove = (event: MouseEvent) => {
      if (!headerAutoHideReadyRef.current) return;
      if (event.clientY >= BUILDER_HEADER_HIDE_ZONE_PX) setHeaderVisible(false);
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [headerVisible]);

  // Stage the picked file locally (split to page images for preview). Does NOT
  // create a job or start anything — that happens on the explicit generate click.
  const pickFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0 || busy || splitting) return;

      clearStaged();
      setSplitting(true);
      setError(null);

      try {
        const pdf =
          list.length === 1 && list[0].type === "application/pdf"
            ? list[0]
            : null;

        setSplitMessage(
          pdf ? "PDF 페이지를 이미지로 변환 중" : "이미지 순서를 정리 중",
        );
        const nextSlots = pdf
          ? await splitPdfToImages(pdf, {
              onProgress: (progress) => {
                if (progress.phase === "rendering") {
                  setSplitMessage(
                    `${(progress.pageIndex ?? 0) + 1}/${progress.totalPages ?? "?"}페이지 변환 중`,
                  );
                }
              },
            })
          : await imagesToSlots(list);

        slotsRef.current = nextSlots;
        setSlots(nextSlots);
        setStaged({
          fileName: pdf ? pdf.name : (list[0]?.name ?? "업로드한 시험지"),
          sourceType: pdf ? "PDF" : "IMAGES",
          totalPages: nextSlots.length,
        });
        setSplitMessage("");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "시험지를 준비하지 못했습니다.";
        setError(message);
        toast.error(message);
      } finally {
        setSplitting(false);
      }
    },
    [busy, splitting, clearStaged],
  );

  const requestFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const generate = useCallback(async () => {
    if (busy) return;
    const currentSlots = slotsRef.current;
    if (!staged || currentSlots.length === 0) {
      toast.error("분석할 시험지를 먼저 입력하세요.");
      return;
    }
    const draftIds = Array.from(selectedDraftIds);
    if (draftIds.length === 0) {
      toast.error("왼쪽 자료에서 지문을 1개 이상 선택하세요.");
      return;
    }

    setBusy(true);
    setError(null);
    setUploaded(0);

    try {
      // Register selected extraction drafts as passages server-side (full text
      // stays on the server) → draftId→passageId.
      setSplitMessage("선택 자료를 지문으로 준비 중");
      const regRes = await fetch("/api/similar-exams/passages/from-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ draftIds }),
      });
      if (!regRes.ok) {
        const data = await regRes.json().catch(() => ({}));
        throw new Error(
          data?.error || "추출 자료를 지문으로 저장하지 못했습니다.",
        );
      }
      const regData = (await regRes.json()) as {
        passages?: Array<{ draftId: string; passageId: string }>;
      };
      const passageIds = (regData.passages ?? []).map((p) => p.passageId);
      if (passageIds.length === 0) {
        throw new Error("활용 가능한 지문이 없습니다.");
      }

      setSplitMessage("작업 생성 중");
      const createRes = await fetch("/api/similar-exams/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: staged.sourceType,
          originalFileName: staged.fileName,
          totalPages: currentSlots.length,
          passageIds,
          pages: currentSlots.map((slot) => ({
            pageIndex: slot.pageIndex,
            size: slot.bytes,
            sourceFileName: slot.sourceFileName ?? undefined,
            mimeType: mimeTypeForBlob(slot.blob),
          })),
        }),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error(data?.error || "작업을 만들지 못했습니다.");
      }
      const created = (await createRes.json()) as CreateJobResponse;

      setSplitMessage("시험지 업로드 중");
      await putWithLimit(currentSlots, created.uploadTargets, setUploaded);

      const startRes = await fetch(
        `/api/similar-exams/jobs/${created.jobId}/start`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!startRes.ok) {
        const data = await startRes.json().catch(() => ({}));
        throw new Error(data?.error || "생성 작업을 시작하지 못했습니다.");
      }

      toast.success("패턴 기반 시험지 생성 작업을 시작했습니다.");
      triggerRefresh();
      setJobsRefreshKey((value) => value + 1);
      clearStaged();
      setBusy(false);
      router.replace(ROUTE_PATH);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.";
      setError(message);
      setBusy(false);
      toast.error(message);
    }
  }, [busy, staged, selectedDraftIds, triggerRefresh, clearStaged, router]);

  // ─── 좌패널 핸들: 클릭=여닫기, 드래그=폭 조절 ───
  function toggleLeftCollapsed() {
    if (suppressHandleClickRef.current) {
      suppressHandleClickRef.current = false;
      return;
    }
    setLeftCollapsed((c) => !c);
  }

  function handleLeftResizePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
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

    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }

  // ─── 단축키: Ctrl/⌘+K · "/" 로 빠른 실행 토글 ───
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (commandPaletteOpen && event.key === "Escape") {
        event.preventDefault();
        setCommandPaletteOpen(false);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
        return;
      }
      if (!editing && event.key === "/") {
        event.preventDefault();
        openCommandPalette();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandPaletteOpen, openCommandPalette]);

  const quickCommands: SimilarQuickCommand[] = [
    {
      id: "toggle-left",
      label: leftCollapsed ? "자료 패널 열기" : "자료 패널 닫기",
      description: "왼쪽 자료 관리 패널을 여닫기",
      run: () => setLeftCollapsed((c) => !c),
    },
    {
      id: "pick-file",
      label: staged ? "분석 시험지 변경" : "분석 시험지 선택",
      description: "패턴을 분석할 완성본 시험지 입력",
      run: requestFileDialog,
    },
    {
      id: "clear-staged",
      label: "분석 시험지 초기화",
      description: "입력한 분석 시험지를 비웁니다",
      disabled: !staged || busy,
      run: clearStaged,
    },
    {
      id: "generate",
      label: "시험지 생성 시작",
      description: "선택 자료 + 분석 시험지로 생성 작업 시작",
      disabled: !canGenerate,
      run: generate,
    },
  ];

  const leftColumnWidth = leftCollapsed ? 0 : leftWidth;
  const gridColumns = `${leftColumnWidth}px ${PANEL_TOGGLE_HANDLE_WIDTH}px minmax(${PANEL_MIN_CENTER}px,1fr)`;

  return (
    <div className="relative bg-[#F4F6F9] md:-m-6">
      {/* 작업 화면 — 스크롤 전 한 화면(뷰포트)을 가득 채운다 */}
      <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-white lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden">
        {/* 자동 숨김 헤더 */}
        <div
          aria-hidden={!headerVisible}
          className={cn(
            "shrink-0 overflow-hidden border-b bg-white px-5 transition-[max-height,padding,opacity,transform,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            headerVisible
              ? "max-h-20 translate-y-0 border-slate-200/80 py-3 opacity-100"
              : "pointer-events-none max-h-0 -translate-y-3 border-transparent py-0 opacity-0",
          )}
        >
          <div
            className={cn(
              "transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              headerVisible ? "translate-y-0" : "-translate-y-2",
            )}
          >
            <WorkflowPageTitle
              icon={ExamPaperGenerationIcon}
              title="동형 시험지 생성"
              beta
              description="자료를 선택하고 완성본 시험지를 넣어 같은 출제 패턴으로 새 시험지를 생성합니다."
            />
          </div>
        </div>
        <button
          type="button"
          onMouseEnter={() => setHeaderVisible(true)}
          onFocus={() => setHeaderVisible(true)}
          onClick={() => setHeaderVisible(true)}
          title="헤더 보기"
          aria-label="헤더 보기"
          className={cn(
            "absolute left-0 top-0 z-40 h-4 w-4 bg-slate-900/10 shadow-[2px_2px_8px_rgba(15,23,42,0.12)] backdrop-blur-sm transition-[opacity,transform,background-color] duration-300 ease-out [clip-path:polygon(0_0,100%_0,0_100%)] hover:bg-blue-500/20 focus:bg-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-200",
            headerVisible
              ? "pointer-events-none -translate-x-1 -translate-y-1 opacity-0"
              : "translate-x-0 translate-y-0 opacity-100",
          )}
        />

        <div
          ref={gridRef}
          className="grid grid-cols-1 gap-2 p-2 lg:min-h-0 lg:flex-1 lg:gap-0 lg:overflow-hidden lg:p-0 lg:[grid-template-columns:var(--similar-grid-columns)]"
          style={
            {
              "--similar-grid-columns": gridColumns,
            } as CSSProperties
          }
        >
          {/* ─── 좌패널: 자료 관리 (포크본 ExtractionManageClient) ─── */}
          {leftCollapsed ? (
            <div aria-hidden className="min-w-0 overflow-hidden" />
          ) : (
            <div
              ref={leftColRef}
              className="flex h-[72vh] min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 lg:h-auto lg:min-h-0 lg:rounded-none lg:border-0 lg:border-r"
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
              className="mx-1 hidden h-full min-h-0 w-4 shrink-0 select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 lg:flex"
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
              className="group/lhandle mx-1 hidden h-full min-h-0 w-4 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 lg:flex"
            >
              <span>{"<"}</span>
              <span style={{ writingMode: "vertical-rl" }}>자료 관리</span>
              <GripVertical className="h-3 w-3 opacity-40 transition-opacity group-hover/lhandle:opacity-70" />
            </button>
          )}

          {/* ─── 중앙: 패턴 분석 시험지 입력/미리보기 ─── */}
          <section className="flex h-[80vh] min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-100/70 lg:h-auto lg:rounded-none lg:border-0">
            <SimilarExamToolbar
              staged={Boolean(staged)}
              totalPages={staged?.totalPages ?? 0}
              busy={busy}
              canGenerate={canGenerate}
              selectedPassageCount={selectedCount}
              onOpenCommandPalette={() =>
                setCommandPaletteOpen((open) => !open)
              }
              onGenerate={generate}
            />
            <SimilarExamCommandBar
              open={commandPaletteOpen}
              commands={quickCommands}
              onClose={() => setCommandPaletteOpen(false)}
            />
            <SimilarExamCenterPreview
              staged={staged}
              slots={slots}
              splitting={splitting}
              splitMessage={splitMessage}
              busy={busy}
              uploadProgress={uploadProgress}
              error={error}
              onPickFiles={pickFiles}
              onRequestFileDialog={requestFileDialog}
            />
          </section>
        </div>
      </div>

      {/* ─── 하단: 스크롤 시 노출되는 생성 작업 (시험지 관리 톤 카드 + 상태) ─── */}
      <SimilarExamJobsPanel refreshKey={jobsRefreshKey} />

      <input
        ref={fileInputRef}
        type="file"
        multiple
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
