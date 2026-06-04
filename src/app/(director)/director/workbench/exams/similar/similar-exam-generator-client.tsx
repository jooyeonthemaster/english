"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createWorkbenchPassage } from "@/actions/workbench";
import { ExamPaperGenerationIcon } from "@/components/icons/workflow-icons";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTaskQueue } from "@/components/workbench/task-queue";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import {
  imagesToSlots,
  revokeSlotUrls,
  splitPdfToImages,
} from "@/lib/extraction/pdf-splitter";
import type { ClientPageSlot } from "@/lib/extraction/types";

import { SimilarExamJobsPanel } from "./_components/similar-exam-jobs-panel";
import {
  SimilarExamPassageSelector,
  type SelectedSource,
} from "./_components/similar-exam-passage-selector";
import { SimilarExamUploadPanel } from "./_components/similar-exam-upload-panel";

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

type SimilarExamGeneratorClientProps = Record<string, never>;

const ROUTE_PATH = "/director/workbench/similar-exams";
const LEFT_PANE_STORAGE_KEY = "smoat:similar-exam:left-pane-width";
const LEFT_PANE_MIN = 460;
const LEFT_PANE_DEFAULT = 680;
const RIGHT_PANE_MIN = 520;
const HANDLE_HIT_WIDTH = 12;

function readStoredLeftPaneWidth() {
  if (typeof window === "undefined") return LEFT_PANE_DEFAULT;
  const raw = window.localStorage.getItem(LEFT_PANE_STORAGE_KEY);
  const value = raw ? Number.parseInt(raw, 10) : LEFT_PANE_DEFAULT;
  return Number.isFinite(value) ? Math.max(LEFT_PANE_MIN, value) : LEFT_PANE_DEFAULT;
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
      if (!target) throw new Error(`No upload target for page ${slot.pageIndex}`);

      const res = await fetch(target.uploadUrl, {
        method: "PUT",
        body: slot.blob,
        headers: {
          "Content-Type": slot.blob.type || "image/jpeg",
          "x-upsert": "true",
        },
      });
      if (!res.ok) throw new Error(`${slot.pageIndex + 1}페이지 업로드에 실패했습니다.`);
      uploaded += 1;
      onProgress(uploaded);
    }
  }

  await Promise.all([worker(), worker(), worker(), worker()]);
}

export function SimilarExamGeneratorClient(_props: SimilarExamGeneratorClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const slotsRef = useRef<ClientPageSlot[]>([]);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const { triggerRefresh } = useTaskQueue();

  const [selectedSources, setSelectedSources] = useState<SelectedSource[]>([]);
  const [staged, setStaged] = useState<StagedFile | null>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState(readStoredLeftPaneWidth);
  const [splitting, setSplitting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [splitMessage, setSplitMessage] = useState("");
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jobsRefreshKey, setJobsRefreshKey] = useState(0);

  const uploadProgress = useMemo(() => {
    const total = staged?.totalPages ?? 0;
    if (total <= 0) return 0;
    return Math.round((uploaded / total) * 100);
  }, [staged, uploaded]);

  const handleSourcesChange = useCallback((selected: SelectedSource[]) => {
    setSelectedSources(selected);
  }, []);

  const clearStaged = useCallback(() => {
    revokeSlotUrls(slotsRef.current);
    slotsRef.current = [];
    setStaged(null);
    setSplitMessage("");
    setUploaded(0);
    setError(null);
  }, []);

  useEffect(() => () => revokeSlotUrls(slotsRef.current), []);

  const beginLeftPaneResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = leftPaneWidth;
      const containerWidth = splitContainerRef.current?.getBoundingClientRect().width ?? 0;
      const maxWidth = Math.max(
        LEFT_PANE_MIN,
        containerWidth - RIGHT_PANE_MIN - HANDLE_HIT_WIDTH,
      );
      let latest = startWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const onMove = (moveEvent: PointerEvent) => {
        latest = Math.min(maxWidth, Math.max(LEFT_PANE_MIN, startWidth + moveEvent.clientX - startX));
        setLeftPaneWidth(latest);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.localStorage.setItem(LEFT_PANE_STORAGE_KEY, String(latest));
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [leftPaneWidth],
  );

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
          list.length === 1 && list[0].type === "application/pdf" ? list[0] : null;

        setSplitMessage(pdf ? "PDF 페이지를 이미지로 변환 중" : "이미지 순서를 정리 중");
        const slots = pdf
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

        slotsRef.current = slots;
        setStaged({
          fileName: pdf ? pdf.name : list[0]?.name ?? "업로드한 시험지",
          sourceType: pdf ? "PDF" : "IMAGES",
          totalPages: slots.length,
        });
        setSplitMessage("");
      } catch (err) {
        const message = err instanceof Error ? err.message : "시험지를 준비하지 못했습니다.";
        setError(message);
        toast.error(message);
      } finally {
        setSplitting(false);
      }
    },
    [busy, splitting, clearStaged],
  );

  const generate = useCallback(async () => {
    if (busy) return;
    const slots = slotsRef.current;
    if (!staged || slots.length === 0) {
      toast.error("분석할 시험지를 먼저 업로드하세요.");
      return;
    }
    if (selectedSources.length === 0) {
      toast.error("지문을 1개 이상 선택하세요.");
      return;
    }

    setBusy(true);
    setError(null);
    setUploaded(0);

    try {
      // Resolve selected sources → passage ids. Unregistered extraction drafts
      // are registered as real passages on demand.
      const hasDrafts = selectedSources.some((src) => src.kind === "draft");
      if (hasDrafts) setSplitMessage("선택 자료를 지문으로 준비 중");
      const passageIds: string[] = [];
      for (const src of selectedSources) {
        if (src.kind === "passage") {
          passageIds.push(src.id);
          continue;
        }
        const result = await createWorkbenchPassage({
          title: src.title,
          content: src.content,
          sourceDraftId: src.draftId,
        });
        if (!result.success || !result.id) {
          throw new Error(result.error || "추출 자료를 지문으로 저장하지 못했습니다.");
        }
        passageIds.push(result.id);
      }
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
          totalPages: slots.length,
          passageIds,
          pages: slots.map((slot) => ({
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
      await putWithLimit(slots, created.uploadTargets, setUploaded);

      const startRes = await fetch(`/api/similar-exams/jobs/${created.jobId}/start`, {
        method: "POST",
        credentials: "include",
      });
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
      const message = err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.";
      setError(message);
      setBusy(false);
      toast.error(message);
    }
  }, [busy, staged, selectedSources, triggerRefresh, clearStaged, router]);

  return (
    <TooltipProvider>
      <div className="flex min-h-[calc(100vh-64px)] flex-col">
        <div className="flex-1 overflow-y-auto bg-[#F4F6F9]">
          <div className="border-b border-slate-200/80 bg-white px-6 py-3">
            <WorkflowPageTitle
              icon={ExamPaperGenerationIcon}
              title="패턴 기반 시험지 생성"
              description="지문을 선택하고 완성본 시험지를 넣어 같은 출제 패턴으로 새 시험지를 생성합니다."
            />
          </div>

          <div className="border-b border-slate-200 bg-white">
            <div className="px-6 pb-5">
              <div
                ref={splitContainerRef}
                className="flex h-[calc(100vh-126px)] min-h-[720px] flex-col gap-4 xl:flex-row xl:gap-0"
                style={{ "--left-pane-w": `${leftPaneWidth}px` } as React.CSSProperties}
              >
                <div className="flex min-h-0 min-w-0 w-full flex-col xl:w-[var(--left-pane-w)] xl:shrink-0">
                  <SimilarExamPassageSelector onChange={handleSourcesChange} />
                </div>

                <div
                  onPointerDown={beginLeftPaneResize}
                  onDoubleClick={() => setLeftPaneWidth(LEFT_PANE_DEFAULT)}
                  role="separator"
                  aria-orientation="vertical"
                  title="드래그하여 너비 조절"
                  className="group/hhandle mx-1 hidden w-3 shrink-0 cursor-col-resize select-none items-center justify-center xl:flex"
                >
                  <div className="h-12 w-0.5 rounded-full bg-slate-200 transition-colors group-hover/hhandle:bg-blue-400 group-active/hhandle:bg-blue-500" />
                </div>

                <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto xl:flex-1">
                  <SimilarExamUploadPanel
                    busy={busy}
                    splitting={splitting}
                    splitMessage={splitMessage}
                    staged={staged}
                    uploadProgress={uploadProgress}
                    selectedPassageCount={selectedSources.length}
                    error={error}
                    fileInputRef={fileInputRef}
                    onPickFiles={pickFiles}
                    onGenerate={generate}
                    onClearStaged={clearStaged}
                  />
                  <SimilarExamJobsPanel refreshKey={jobsRefreshKey} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
