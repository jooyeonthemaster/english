"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  FileImage,
  Loader2,
  PanelBottomOpen,
  RefreshCw,
  Save,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useExtractionUpload } from "@/hooks/use-extraction-upload";
import { useExtractionStream } from "@/hooks/use-extraction-stream";
import {
  imagesToSlots,
  revokeSlotUrls,
  splitPdfToImages,
} from "@/lib/extraction/pdf-splitter";
import { useExtractionStore } from "@/lib/extraction/store";
import {
  ACCEPTED_IMAGE_MIMES,
  ACCEPTED_PDF_MIMES,
  MAX_PAGE_IMAGE_BYTES,
  MAX_PAGES_PER_JOB,
  MAX_PDF_BYTES,
} from "@/lib/extraction/constants";
import type {
  ClientPageSlot,
  ExtractionJobStatus,
  ExtractionSourceType,
  M1PassageDraftChangeSnapshot,
  M1PassageDraftSnapshot,
} from "@/lib/extraction/types";

interface Props {
  initialCreditBalance: number;
}

interface JobDetailResponse {
  job: {
    id: string;
    mode: string;
    status: ExtractionJobStatus;
    originalFileName: string | null;
    totalPages: number;
    successPages: number;
    failedPages: number;
    pendingPages: number;
    createdAt: string;
    completedAt: string | null;
  };
  pages?: Array<{
    pageIndex: number;
    sourceFileName?: string | null;
  }>;
  m1PassageDrafts: M1PassageDraftSnapshot[];
}

interface QueueJob {
  id: string;
  mode: string;
  status: ExtractionJobStatus;
  originalFileName: string | null;
  totalPages: number;
  successPages: number;
  failedPages: number;
  pendingPages: number;
  createdAt: string;
  completedAt: string | null;
  draftResultCount: number;
  resultCount: number;
  m1DraftPipelineError?: boolean;
}

interface M1DraftJobSummary {
  id: string;
  originalFileName: string | null;
  totalPages: number;
  status: ExtractionJobStatus;
  createdAt: string | Date;
  completedAt: string | Date | null;
  pages?: Array<{
    pageIndex: number;
    sourceFileName: string | null;
  }>;
}

type M1PassageDraftWithJob = M1PassageDraftSnapshot & {
  job?: M1DraftJobSummary;
};

type WorkPanel = "jobs" | null;

const ACCEPTED = [...ACCEPTED_PDF_MIMES, ...ACCEPTED_IMAGE_MIMES] as const;
const TERMINAL = new Set<ExtractionJobStatus>([
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
]);

function getDraftSourceFileNames(draft: M1PassageDraftWithJob): string[] {
  const pages = draft.job?.pages ?? [];
  const byPage = new Map(pages.map((page) => [page.pageIndex, page.sourceFileName] as const));
  return [
    ...new Set(
      draft.sourcePageIndex
        .map((pageIndex) => byPage.get(pageIndex))
        .filter((name): name is string => typeof name === "string" && name.length > 0),
    ),
  ];
}

function getDraftSourceLabel(draft: M1PassageDraftWithJob): string {
  const fileNames = getDraftSourceFileNames(draft);
  const pageLabel = `${draft.sourcePageIndex.map((page) => page + 1).join(", ")}페이지`;
  if (fileNames.length === 1) return `${fileNames[0]} · ${pageLabel}`;
  if (fileNames.length > 1) return `${fileNames[0]} 외 ${fileNames.length - 1}개 · ${pageLabel}`;
  return `${draft.job?.originalFileName ?? "원본 파일"} · ${pageLabel}`;
}

function getDraftSourceShortLabel(draft: M1PassageDraftWithJob): string {
  const fileNames = getDraftSourceFileNames(draft);
  if (fileNames.length === 1) return fileNames[0];
  if (fileNames.length > 1) return `${fileNames[0]} 외 ${fileNames.length - 1}개`;
  return draft.job?.originalFileName ?? `${draft.job?.totalPages ?? 0}페이지 작업`;
}

function summarizeFileNames(files: File[]): string {
  if (files.length === 0) return "이미지";
  if (files.length === 1) return files[0].name;
  return `${files[0].name} 외 ${files.length - 1}개`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
}

export function BulkExtractClient({ initialCreditBalance }: Props) {
  void initialCreditBalance;

  const router = useRouter();
  const phase = useExtractionStore((s) => s.phase);
  const jobId = useExtractionStore((s) => s.jobId);
  const error = useExtractionStore((s) => s.error);
  const slots = useExtractionStore((s) => s.slots);
  const splitProgress = useExtractionStore((s) => s.splitProgress);
  const uploadProgress = useExtractionStore((s) => s.uploadProgress);
  const setMode = useExtractionStore((s) => s.setMode);
  const setPhase = useExtractionStore((s) => s.setPhase);
  const setError = useExtractionStore((s) => s.setError);
  const setJobId = useExtractionStore((s) => s.setJobId);
  const setSlots = useExtractionStore((s) => s.setSlots);
  const setSource = useExtractionStore((s) => s.setSource);
  const setSplitProgress = useExtractionStore((s) => s.setSplitProgress);
  const setUploadProgress = useExtractionStore((s) => s.setUploadProgress);
  const startUpload = useExtractionUpload();

  const [sourceName, setSourceName] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<ExtractionSourceType | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [activePanel, setActivePanel] = useState<WorkPanel>(null);

  const bootstrapped = useRef(false);
  const fileInputId = "m1-passage-workroom-file-input";

  useExtractionStream({
    jobId,
    enabled: phase === "processing" || phase === "starting" || phase === "uploading",
  });

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    setMode("PASSAGE_ONLY");

    if (typeof window !== "undefined") {
      const resumeJobId = new URLSearchParams(window.location.search).get("jobId");
      if (resumeJobId) {
        router.replace(`/director/workbench/passages/import/jobs?jobId=${resumeJobId}`);
        return;
      }
    }

    setPhase("idle");
  }, [router, setMode, setPhase]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (phase === "preparing" || phase === "uploading" || phase === "starting") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [phase]);

  const appendSlots = useCallback(
    (incoming: ClientPageSlot[]) => {
      const offset = slots.length;
      const adjusted = incoming.map((slot, index) => ({
        ...slot,
        pageIndex: offset + index,
      }));
      const next = [...slots, ...adjusted];
      setSlots(next);
      setSource(
        `${next.length}페이지`,
        incoming.length === 1 ? "IMAGES" : sourceType ?? "IMAGES",
      );
    },
    [setSlots, setSource, slots, sourceType],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      setError(null);

      const pdf = arr.find((file) =>
        ACCEPTED_PDF_MIMES.includes(file.type as (typeof ACCEPTED_PDF_MIMES)[number]),
      );
      const allImages = arr.every((file) =>
        ACCEPTED_IMAGE_MIMES.includes(file.type as (typeof ACCEPTED_IMAGE_MIMES)[number]),
      );

      try {
        if (pdf) {
          if (arr.length > 1) {
            setError("PDF는 한 번에 하나만 추가해 주세요.");
            return;
          }
          if (pdf.size > MAX_PDF_BYTES) {
            setError(
              `PDF 파일은 최대 ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB까지 업로드할 수 있습니다.`,
            );
            return;
          }
          if (slots.length >= MAX_PAGES_PER_JOB) {
            setError(`한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`);
            return;
          }
          setPhase("preparing");
          setSplitProgress({ pageIndex: 0, totalPages: 0 });
          const pages = await splitPdfToImages(pdf, {
            onProgress: (progress) => {
              if (progress.phase !== "done") {
                setSplitProgress({
                  pageIndex: progress.pageIndex,
                  totalPages: progress.totalPages,
                });
              }
            },
          });
          if (slots.length + pages.length > MAX_PAGES_PER_JOB) {
            revokeSlotUrls(pages);
            setError(`한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`);
            setPhase("idle");
            return;
          }
          appendSlots(pages);
          setSourceName((current) => current ?? pdf.name);
          setSourceType("PDF");
          setSource(pdf.name, "PDF");
          setPhase("idle");
          setSplitProgress(null);
          return;
        }

        if (allImages) {
          if (slots.length + arr.length > MAX_PAGES_PER_JOB) {
            setError(`한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`);
            return;
          }
          const oversized = arr.find((file) => file.size > MAX_PAGE_IMAGE_BYTES);
          if (oversized) {
            setError(`${oversized.name} 파일이 너무 큽니다. 이미지는 5MB 이하로 올려 주세요.`);
            return;
          }
          const pages = await imagesToSlots(arr);
          appendSlots(pages);
          setSourceName((current) => current ?? summarizeFileNames(arr));
          setSourceType("IMAGES");
          setSource(summarizeFileNames(arr), "IMAGES");
          setPhase("idle");
          return;
        }

        setError("PDF, PNG, JPG, WebP 파일만 업로드할 수 있습니다.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "파일을 처리하지 못했습니다.");
        setPhase("idle");
      } finally {
        setSplitProgress(null);
      }
    },
    [
      appendSlots,
      setError,
      setPhase,
      setSource,
      setSplitProgress,
      slots.length,
    ],
  );

  const startExtraction = useCallback(async () => {
    if (slots.length === 0) {
      setError("추출할 파일을 먼저 추가해 주세요.");
      return;
    }
    const nextJobId = await startUpload({
      slots,
      sourceType: sourceType ?? "IMAGES",
      originalFileName: sourceName,
      mode: "PASSAGE_ONLY",
    });
    if (nextJobId) {
      setJobId(nextJobId);
      setSlots([]);
      setSourceName(null);
      setSourceType(null);
      setUploadProgress(null);
      setActivePanel("jobs");
      setQueueRefreshKey((value) => value + 1);
    }
  }, [
    setError,
    setJobId,
    setSlots,
    setUploadProgress,
    slots,
    sourceName,
    sourceType,
    startUpload,
  ]);

  const clearFiles = useCallback(() => {
    setSlots([]);
    setSourceName(null);
    setSourceType(null);
    setError(null);
  }, [setError, setSlots]);

  const togglePanel = useCallback((panel: Exclude<WorkPanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel));
  }, []);

  useEffect(() => {
    if (!activePanel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivePanel(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePanel]);

  const busy =
    phase === "preparing" ||
    phase === "uploading" ||
    phase === "starting" ||
    phase === "processing";

  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] bg-[#F4F6F9] px-6 py-6 xl:px-8">
      <main className="mx-auto flex max-w-[1680px] flex-col gap-4">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <UploadCloud className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h1 className="text-[20px] font-bold tracking-tight text-slate-950">자료 추출</h1>
                <p className="mt-1 text-[13px] text-slate-500">
                  PDF 또는 이미지를 등록하면 백그라운드에서 지문을 추출하고 복원합니다.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQueueRefreshKey((value) => value + 1)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                새로고침
              </button>
              <button
                type="button"
                onClick={() => togglePanel("jobs")}
                className={
                  "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12px] font-bold transition-colors " +
                  (activePanel === "jobs"
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-slate-50")
                }
              >
                <PanelBottomOpen className="size-3.5" aria-hidden="true" />
                작업 목록
              </button>
            </div>
          </div>

          {error ? (
            <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="grid gap-4 p-6 xl:grid-cols-[minmax(420px,0.95fr)_minmax(320px,0.65fr)]">
            <UploadPanel
              busy={busy}
              dragActive={dragActive}
              fileInputId={fileInputId}
              slots={slots}
              splitProgress={splitProgress}
              uploadProgress={uploadProgress}
              onClear={clearFiles}
              onFiles={handleFiles}
              onStart={startExtraction}
              onDragActiveChange={setDragActive}
            />
            <ExtractionRunPanel
              busy={busy}
              pageCount={slots.length}
              activeJobId={jobId}
              onOpenManage={() => router.push("/director/workbench/passages/import/jobs")}
            />
          </div>
        </section>

        <button
          type="button"
          onClick={() => togglePanel("jobs")}
          className={
            "fixed bottom-24 right-8 z-40 inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-bold shadow-lg transition-all " +
            (activePanel === "jobs"
              ? "border-blue-500 bg-blue-600 text-white"
              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700")
          }
        >
          <PanelBottomOpen className="size-4" aria-hidden="true" />
          작업 목록
        </button>

        {activePanel === "jobs" ? (
          <div className="fixed bottom-40 right-8 z-50 w-[min(520px,calc(100vw-40px))]">
            <div className="relative max-h-[min(620px,calc(100vh-220px))] overflow-y-auto rounded-lg bg-white shadow-2xl ring-1 ring-slate-200/80 [&>section>div:first-child]:pr-14">
              <button
                type="button"
                onClick={() => setActivePanel(null)}
                className="absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900"
                aria-label="작업 목록 닫기"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
              <QueuePanel
                activeJobId={jobId}
                refreshKey={queueRefreshKey}
                onDeleteActiveJob={() => {
                  setJobId(null);
                  setPhase("idle");
                }}
                onOpenJob={(id) => {
                  setJobId(id);
                  setPhase("processing");
                  setActivePanel(null);
                  router.push("/director/workbench/passages/import/jobs?jobId=" + id);
                }}
              />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export function ExtractionManageClient() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<M1PassageDraftWithJob[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [resultScope, setResultScope] = useState<"all" | "job">("all");
  const [jobId, setJobId] = useState<string | null>(null);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? drafts[0] ?? null,
    [drafts, selectedDraftId],
  );

  const loadJobDetails = useCallback(async (nextJobId: string) => {
    setLoadingDetails(true);
    setError(null);
    try {
      const res = await fetch("/api/extraction/jobs/" + nextJobId, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("작업 정보를 불러오지 못했습니다.");

      const data = (await res.json()) as JobDetailResponse;
      const jobSummary: M1DraftJobSummary = {
        id: data.job.id,
        originalFileName: data.job.originalFileName,
        totalPages: data.job.totalPages,
        status: data.job.status,
        createdAt: data.job.createdAt,
        completedAt: data.job.completedAt,
        pages: (data.pages ?? []).map((page) => ({
          pageIndex: page.pageIndex,
          sourceFileName: page.sourceFileName ?? null,
        })),
      };
      const nextDrafts = data.m1PassageDrafts.map((draft) => ({
        ...draft,
        job: jobSummary,
      }));
      setDrafts(nextDrafts);
      setSelectedDraftId(nextDrafts[0]?.id ?? null);
      setResultScope("job");
      setJobId(nextJobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "작업 정보를 불러오지 못했습니다.");
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const loadAllDrafts = useCallback(async () => {
    setLoadingDetails(true);
    setError(null);
    try {
      const res = await fetch("/api/extraction/m1-passages?limit=200", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("자료 목록을 불러오지 못했습니다.");

      const data = (await res.json()) as { drafts: M1PassageDraftWithJob[] };
      setDrafts(data.drafts);
      setSelectedDraftId(data.drafts[0]?.id ?? null);
      setResultScope("all");
      setJobId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "자료 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const nextJobId =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("jobId");
    if (nextJobId) {
      void loadJobDetails(nextJobId);
      return;
    }
    void loadAllDrafts();
  }, [loadAllDrafts, loadJobDetails]);

  const showAllResults = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    void loadAllDrafts();
  }, [loadAllDrafts]);

  const refreshResults = useCallback(() => {
    setQueueRefreshKey((value) => value + 1);
    if (resultScope === "job" && jobId) {
      void loadJobDetails(jobId);
      return;
    }
    void loadAllDrafts();
  }, [jobId, loadAllDrafts, loadJobDetails, resultScope]);

  const openJob = useCallback(
    (nextJobId: string) => {
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "?jobId=" + nextJobId);
      }
      void loadJobDetails(nextJobId);
    },
    [loadJobDetails],
  );

  const updateDraftText = useCallback((id: string, teacherText: string) => {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, teacherText } : draft)),
    );
  }, []);

  const saveDraft = useCallback(async (draft: M1PassageDraftSnapshot) => {
    setSavingId(draft.id);
    setError(null);
    try {
      const res = await fetch("/api/extraction/m1-passages/" + draft.id, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title ?? null,
          teacherText: draft.teacherText,
        }),
      });
      if (!res.ok) throw new Error("수정 내용을 저장하지 못했습니다.");

      const data = (await res.json()) as { draft: M1PassageDraftSnapshot };
      setDrafts((current) =>
        current.map((item) =>
          item.id === data.draft.id
            ? {
                ...item,
                ...data.draft,
              }
            : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "수정 내용을 저장하지 못했습니다.");
    } finally {
      setSavingId(null);
    }
  }, []);

  const deleteDraft = useCallback(async (draft: M1PassageDraftSnapshot) => {
    const ok =
      typeof window === "undefined" ? true : window.confirm("이 추출 지문을 삭제할까요?");
    if (!ok) return;

    setDeletingDraftId(draft.id);
    setError(null);
    try {
      const res = await fetch("/api/extraction/m1-passages/" + draft.id, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("지문을 삭제하지 못했습니다.");

      setDrafts((current) => {
        const next = current.filter((item) => item.id !== draft.id);
        setSelectedDraftId((selected) =>
          selected === draft.id ? next[0]?.id ?? null : selected,
        );
        return next;
      });
      setQueueRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "지문을 삭제하지 못했습니다.");
    } finally {
      setDeletingDraftId(null);
    }
  }, []);

  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] bg-[#F4F6F9] px-6 py-6 xl:px-8">
      <main className="mx-auto flex max-w-[1680px] flex-col gap-4">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <FileImage className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h1 className="text-[20px] font-bold tracking-tight text-slate-950">자료 관리</h1>
                <p className="mt-1 text-[13px] text-slate-500">
                  추출된 지문을 작업별로 확인하고 복원본을 수정한 뒤 저장합니다.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/director/workbench/passages/import")}
                className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                자료 추출
              </button>
              {resultScope === "job" ? (
                <button
                  type="button"
                  onClick={showAllResults}
                  className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  전체 결과
                </button>
              ) : null}
              <button
                type="button"
                onClick={refreshResults}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                새로고침
              </button>
            </div>
          </div>

          {error ? (
            <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="grid gap-4 p-6 xl:grid-cols-[minmax(320px,0.44fr)_minmax(360px,0.56fr)]">
            <QueuePanel
              activeJobId={jobId}
              refreshKey={queueRefreshKey}
              onDeleteActiveJob={showAllResults}
              onOpenJob={openJob}
            />
            <ResultSelectorPanel
              busy={false}
              drafts={drafts}
              loading={loadingDetails}
              selectedDraftId={selectedDraftId}
              onSelect={setSelectedDraftId}
            />
          </div>
        </section>

        <ResultPanel
          busy={false}
          drafts={drafts}
          loading={loadingDetails}
          selectedDraft={selectedDraft}
          savingId={savingId}
          deletingDraftId={deletingDraftId}
          onDelete={deleteDraft}
          onSave={saveDraft}
          onTextChange={updateDraftText}
        />
      </main>
    </div>
  );
}

function ExtractionRunPanel({
  activeJobId,
  busy,
  pageCount,
  onOpenManage,
}: {
  activeJobId: string | null;
  busy: boolean;
  pageCount: number;
  onOpenManage: () => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-[15px] font-bold text-slate-900">추출 진행</h2>
        <p className="mt-0.5 text-[12px] text-slate-500">
          이 화면에서는 자료를 넣고 추출 작업을 시작합니다.
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-slate-700">선택 자료</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-100">
              {pageCount}페이지
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-[12px] text-slate-500">
            <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
              <span>추출 방식</span>
              <strong className="text-slate-800">지문 전용</strong>
            </div>
            <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
              <span>검수 위치</span>
              <strong className="text-slate-800">자료 관리</strong>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-4">
          <div className="text-[13px] font-bold text-blue-900">작업 완료 후 흐름</div>
          <div className="mt-2 space-y-2 text-[12px] leading-5 text-blue-800">
            <p>추출이 시작되면 작업 목록에서 처리 상태를 확인할 수 있습니다.</p>
            <p>원문 비교, 복원본 수정, 저장과 삭제는 자료 관리에서 이어서 진행합니다.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenManage}
          className="mt-auto inline-flex h-10 w-full items-center justify-center rounded-md border border-sky-200 bg-white text-[13px] font-bold text-sky-700 shadow-sm hover:bg-sky-50"
        >
          {activeJobId || busy ? "진행 작업 관리로 이동" : "자료 관리 열기"}
        </button>
      </div>
    </aside>
  );
}

function UploadPanel({
  busy,
  dragActive,
  fileInputId,
  slots,
  splitProgress,
  uploadProgress,
  onClear,
  onFiles,
  onStart,
  onDragActiveChange,
}: {
  busy: boolean;
  dragActive: boolean;
  fileInputId: string;
  slots: ClientPageSlot[];
  splitProgress: { pageIndex?: number; totalPages?: number } | null;
  uploadProgress: { uploaded: number; total: number } | null;
  onClear: () => void;
  onFiles: (files: FileList | File[]) => void;
  onStart: () => void;
  onDragActiveChange: (active: boolean) => void;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">자료 입력</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">
            PDF와 이미지를 계속 추가할 수 있습니다.
          </p>
        </div>
        {slots.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            비우기
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <label
          htmlFor={fileInputId}
          onDragOver={(event) => {
            event.preventDefault();
            onDragActiveChange(true);
          }}
          onDragLeave={() => onDragActiveChange(false)}
          onDrop={(event) => {
            event.preventDefault();
            onDragActiveChange(false);
            if (event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files);
          }}
          className={
            "flex min-h-[118px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-5 text-center transition-colors " +
            (dragActive
              ? "border-sky-500 bg-sky-50"
              : "border-slate-300 bg-slate-50/60 hover:border-sky-400 hover:bg-sky-50/40")
          }
        >
          <input
            id={fileInputId}
            type="file"
            className="sr-only"
            accept={ACCEPTED.join(",")}
            multiple
            disabled={busy}
            onChange={(event) => {
              if (event.target.files) onFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <UploadCloud className="size-8 text-sky-600" strokeWidth={1.7} />
          <div className="mt-2 text-[13px] font-bold text-slate-800">
            파일을 끌어놓거나 클릭해서 추가
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            PDF, PNG, JPG, WebP ? 최대 {MAX_PAGES_PER_JOB}페이지 ? PDF 최대 {Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB
          </div>
        </label>

        {splitProgress ? (
          <ProgressLine
            label="PDF 페이지 분리 중"
            value={splitProgress.pageIndex ?? 0}
            max={Math.max(1, splitProgress.totalPages ?? 1)}
          />
        ) : null}
        {uploadProgress ? (
          <ProgressLine
            label="업로드 중"
            value={uploadProgress.uploaded}
            max={Math.max(1, uploadProgress.total)}
          />
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-bold text-slate-800">선택한 자료</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-100">
              {slots.length}페이지
            </span>
          </div>

          {slots.length === 0 ? (
            <div className="flex min-h-[64px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-white text-center text-[12px] text-slate-400">
              파일을 추가하면 페이지 목록이 여기에 표시됩니다.
            </div>
          ) : (
            <div className="grid max-h-[210px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
              {slots.map((slot) => (
                <div
                  key={slot.pageIndex + '-' + slot.previewUrl}
                  className="min-w-0 rounded-md border border-slate-200 bg-white p-2"
                  title={slot.sourceFileName ?? slot.pageIndex + 1 + '페이지'}
                >
                  <div className="relative aspect-[4/3] overflow-hidden rounded border border-slate-200 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={slot.previewUrl}
                      alt={slot.pageIndex + 1 + '페이지'}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-0 left-0 rounded-tr bg-slate-950/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {slot.pageIndex + 1}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] font-bold text-slate-800">
                    {slot.sourceFileName ?? slot.pageIndex + 1 + '페이지 이미지'}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-1 text-[10.5px] text-slate-500">
                    <span>{slot.pageIndex + 1}페이지</span>
                    <span>{formatBytes(slot.bytes)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onStart}
          disabled={busy || slots.length === 0}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-sky-600 px-5 text-[13px] font-bold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              작업 중
            </>
          ) : (
            "추출 시작"
          )}
        </button>
      </div>
    </section>
  );
}

function ResultSelectorPanel({
  busy,
  drafts,
  loading,
  selectedDraftId,
  onSelect,
}: {
  busy: boolean;
  drafts: M1PassageDraftWithJob[];
  loading: boolean;
  selectedDraftId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-[14px] font-bold text-slate-900">자료 목록</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            검토할 추출 지문을 선택합니다.
          </p>
        </div>
        <span className="rounded bg-slate-50 px-2 py-1 text-[11px] font-bold text-sky-700">
          {drafts.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex max-h-[360px] flex-col gap-1.5 overflow-y-auto pr-1 xl:max-h-none">
          {drafts.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-8 text-center text-[12px] text-slate-400">
              {busy || loading
                ? "추출 결과를 기다리는 중입니다."
                : "아직 추출 결과가 없습니다."}
            </div>
          ) : (
            drafts.map((draft, index) => (
              <button
                key={draft.id}
                type="button"
                onClick={() => onSelect(draft.id)}
                className={
                  "rounded-md border px-3 py-2 text-left transition-colors " +
                  ((selectedDraftId ?? drafts[0]?.id) === draft.id
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white hover:border-sky-200")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-bold text-slate-800">
                    {draft.title ?? `지문 ${index + 1}`}
                  </span>
                  <RestorationBadge status={draft.restorationStatus} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>표시 {index + 1}</span>
                  <span>
                    {draft.sourcePageIndex.map((page) => page + 1).join(", ")}페이지
                  </span>
                </div>
                {draft.job ? (
                  <div
                    className="mt-1 truncate text-[10.5px] text-slate-400"
                    title={getDraftSourceLabel(draft)}
                  >
                    {getDraftSourceShortLabel(draft)}
                  </div>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function ResultPanel({
  busy,
  drafts,
  loading,
  selectedDraft,
  savingId,
  deletingDraftId,
  onDelete,
  onSave,
  onTextChange,
}: {
  busy: boolean;
  drafts: M1PassageDraftWithJob[];
  loading: boolean;
  selectedDraft: M1PassageDraftWithJob | null;
  savingId: string | null;
  deletingDraftId: string | null;
  onDelete: (draft: M1PassageDraftSnapshot) => void;
  onSave: (draft: M1PassageDraftSnapshot) => void;
  onTextChange: (id: string, teacherText: string) => void;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">자료 추출 결과</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">
            선택한 지문의 원문과 복원본을 크게 비교합니다.
          </p>
        </div>
        <span className="rounded bg-slate-50 px-2 py-1 text-[11px] font-bold text-sky-700">
          결과 {drafts.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {loading ? (
          <EmptyState
            icon={<Loader2 className="size-7 animate-spin" />}
            title="결과를 불러오는 중"
          />
        ) : selectedDraft ? (
          <PassageCompare
            draft={selectedDraft}
            saving={savingId === selectedDraft.id}
            deleting={deletingDraftId === selectedDraft.id}
            onDelete={() => onDelete(selectedDraft)}
            onSave={() => onSave(selectedDraft)}
            onTextChange={(value) => onTextChange(selectedDraft.id, value)}
          />
        ) : (
          <EmptyState
            icon={<FileImage className="size-7" />}
            title={busy ? "추출 결과를 기다리는 중입니다." : "추출된 지문이 여기에 표시됩니다."}
            description="자료 목록에서 검토할 지문을 선택할 수 있습니다."
          />
        )}
      </div>
    </section>
  );
}

function PassageCompare({
  draft,
  deleting,
  saving,
  onDelete,
  onSave,
  onTextChange,
}: {
  draft: M1PassageDraftWithJob;
  deleting: boolean;
  saving: boolean;
  onDelete: () => void;
  onSave: () => void;
  onTextChange: (value: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[17px] font-bold text-slate-950">
              지문 {draft.passageOrder + 1}
            </h3>
            <RestorationBadge status={draft.restorationStatus} />
            <RestorationMethodBadge draft={draft} />
          </div>
          <p className="mt-1 text-[12px] text-slate-500">
            출처 {getDraftSourceLabel(draft)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting || saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-[12px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {deleting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-3.5" aria-hidden="true" />
            )}
            삭제
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-[12px] font-bold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-3.5" aria-hidden="true" />
            )}
            수정 저장
          </button>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        <TextBox title="원문" tone="raw">
          {draft.rawText}
        </TextBox>
        <EditableRestoredTextBox
          value={draft.teacherText}
          changes={draft.changes}
          onChange={onTextChange}
        />
      </div>
    </div>
  );
}

function TextBox({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "raw" | "restored";
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-[13px] font-bold text-slate-900">{title}</span>
        <span
          className={
            "rounded px-1.5 py-0.5 text-[10.5px] font-bold " +
            (tone === "raw"
              ? "bg-slate-100 text-slate-600"
              : "bg-emerald-50 text-emerald-700")
          }
        >
          {tone === "raw" ? "RAW" : "RESTORED"}
        </span>
      </div>
      <div className="min-h-[260px] whitespace-pre-wrap px-4 py-3 text-[14px] leading-7 text-slate-800">
        {children}
      </div>
    </div>
  );
}

function EditableRestoredTextBox({
  value,
  changes,
  onChange,
}: {
  value: string;
  changes: M1PassageDraftChangeSnapshot[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-[13px] font-bold text-slate-900">복원문</span>
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700">
          RESTORED
        </span>
      </div>
      <div className="relative min-h-[320px]">
        <div
          aria-hidden="true"
          className="pointer-events-none min-h-[320px] whitespace-pre-wrap px-4 py-3 text-[14px] leading-7 text-slate-800"
        >
          <HighlightedText text={value} changes={changes} />
        </div>
        <textarea
          aria-label="복원문 수정"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className="absolute inset-0 h-full min-h-[320px] w-full resize-none overflow-hidden rounded-b-lg border-0 bg-transparent px-4 py-3 text-[14px] leading-7 text-transparent caret-slate-950 outline-none selection:bg-sky-200/60 focus:ring-2 focus:ring-sky-200"
        />
      </div>
    </div>
  );
}

function HighlightedText({
  text,
  changes,
}: {
  text: string;
  changes: M1PassageDraftChangeSnapshot[];
}) {
  const parts = useMemo(() => {
    const targets = changes
      .map((change) => change.after)
      .filter((after) => after.trim().length >= 3)
      .sort((a, b) => b.length - a.length);
    if (targets.length === 0) return [text];

    const result: Array<{ text: string; changed: boolean }> = [];
    let cursor = 0;
    while (cursor < text.length) {
      const match = targets.find((target) => text.startsWith(target, cursor));
      if (match) {
        result.push({ text: match, changed: true });
        cursor += match.length;
      } else {
        const nextIndex = targets
          .map((target) => text.indexOf(target, cursor + 1))
          .filter((index) => index >= 0)
          .sort((a, b) => a - b)[0];
        const end = nextIndex ?? text.length;
        result.push({ text: text.slice(cursor, end), changed: false });
        cursor = end;
      }
    }
    return result;
  }, [changes, text]);

  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : part.changed ? (
          <mark key={index} className="rounded bg-amber-100 text-slate-900">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function QueuePanel({
  activeJobId,
  refreshKey,
  onDeleteActiveJob,
  onOpenJob,
}: {
  activeJobId: string | null;
  refreshKey: number;
  onDeleteActiveJob: () => void;
  onOpenJob: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "running" | "done" | "waiting">("all");
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/extraction/jobs?limit=50", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: QueueJob[] };
      setJobs(data.jobs.filter((job) => job.mode === "PASSAGE_ONLY"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    const timer = window.setInterval(() => void loadJobs(), 10000);
    return () => window.clearInterval(timer);
  }, [loadJobs]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs, refreshKey]);

  const filtered = jobs.filter((job) => {
    if (filter === "all") return true;
    if (filter === "running") return job.status === "PROCESSING";
    if (filter === "waiting") return job.status === "PENDING";
    return TERMINAL.has(job.status);
  });
  const runningCount = jobs.filter((job) => job.status === "PROCESSING").length;

  const deleteJob = useCallback(
    async (job: QueueJob) => {
      const ok =
        typeof window === "undefined"
          ? true
          : window.confirm("이 추출 작업과 결과를 삭제할까요?");
      if (!ok) return;

      const res = await fetch("/api/extraction/jobs/" + job.id, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) return;
      setJobs((current) => current.filter((item) => item.id !== job.id));
      if (job.id === activeJobId) onDeleteActiveJob();
    },
    [activeJobId, onDeleteActiveJob],
  );

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-[14px] font-bold text-slate-900">작업 목록</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            백그라운드 추출 상태를 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {runningCount > 0 ? (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10.5px] font-bold text-emerald-700">
              진행 {runningCount}
            </span>
          ) : null}
          <span className="rounded bg-slate-50 px-2 py-1 text-[11px] font-bold text-sky-700">
            {jobs.length}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <QueueFilter active={filter === "all"} onClick={() => setFilter("all")}>
              전체
            </QueueFilter>
            <QueueFilter active={filter === "running"} onClick={() => setFilter("running")}>
              진행중
            </QueueFilter>
            <QueueFilter active={filter === "done"} onClick={() => setFilter("done")}>
              완료
            </QueueFilter>
            <QueueFilter active={filter === "waiting"} onClick={() => setFilter("waiting")}>
              대기중
            </QueueFilter>
          </div>
          <button
            type="button"
            onClick={() => void loadJobs()}
            className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="작업목록 새로고침"
          >
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          </button>
        </div>

        <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1 xl:max-h-none">
          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 py-8 text-center text-[12px] text-slate-400">
              표시할 작업이 없습니다.
            </div>
          ) : (
            filtered.map((job) => (
              <div
                key={job.id}
                className={
                  "w-full rounded-md border px-3 py-2 text-left transition-colors " +
                  (job.id === activeJobId
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white hover:border-sky-200")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenJob(job.id)}
                    className="min-w-0 flex-1 truncate text-left text-[12px] font-bold text-slate-800"
                  >
                    {job.originalFileName ?? job.totalPages + "페이지 이미지"}
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {job.m1DraftPipelineError ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-bold text-red-600">
                        저장 실패
                      </span>
                    ) : null}
                    <JobStatusBadge status={job.status} />
                    {TERMINAL.has(job.status) ? (
                      <button
                        type="button"
                        onClick={() => void deleteJob(job)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="추출 작업 삭제"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenJob(job.id)}
                  className="mt-1 flex w-full items-center justify-between text-left text-[11px] text-slate-500"
                >
                  <span>
                    {job.m1DraftPipelineError
                      ? "\uACB0\uACFC \uC800\uC7A5 \uC2E4\uD328 · \uC7AC\uCD94\uCD9C \uD544\uC694"
                      : job.successPages +
                        "/" +
                        job.totalPages +
                        "\uD398\uC774\uC9C0 · \uACB0\uACFC " +
                        job.resultCount}
                  </span>
                  <span>{formatDate(job.createdAt)}</span>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function ProgressLine({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const ratio = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] font-semibold text-slate-500">
        <span>{label}</span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${ratio}%` }} />
      </div>
    </div>
  );
}

function QueueFilter({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full px-2.5 py-1 text-[11px] font-bold " +
        (active ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white text-slate-500")
      }
    >
      {children}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[460px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-center">
      <div className="text-slate-400">{icon}</div>
      <div className="mt-3 text-[14px] font-bold text-slate-700">{title}</div>
      {description ? <div className="mt-1 text-[12px] text-slate-400">{description}</div> : null}
    </div>
  );
}

function getRestorationMethod(draft: M1PassageDraftSnapshot): string | null {
  const metadata = draft.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const restoration = (metadata as { restoration?: unknown }).restoration;
  if (!restoration || typeof restoration !== "object" || Array.isArray(restoration)) {
    return null;
  }
  const method = (restoration as { method?: unknown }).method;
  return typeof method === "string" ? method : null;
}

function RestorationMethodBadge({ draft }: { draft: M1PassageDraftSnapshot }) {
  const method = getRestorationMethod(draft);
  if (!method) return null;

  const label =
    method === "LOCAL_DB"
      ? "DB 원문"
      : method === "WEB_SEARCH"
        ? "웹 원문"
        : method.includes("WEB")
          ? "웹 후보"
          : method.includes("AI")
            ? "AI 복원"
            : method === "CODE_FALLBACK"
              ? "표식 보정"
              : method === "FAILED"
                ? "수동 필요"
                : "후보 검토";

  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">
      {label}
    </span>
  );
}

function RestorationBadge({ status }: { status: string }) {
  if (status === "NO_RESTORATION_NEEDED") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
        복원 불필요
      </span>
    );
  }
  if (status === "PARTIAL" || status === "FAILED") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-700">
        확인 필요
      </span>
    );
  }
  return (
    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10.5px] font-bold text-sky-700">
      복원됨
    </span>
  );
}

function JobStatusBadge({ status }: { status: ExtractionJobStatus }) {
  const label =
    status === "PROCESSING"
      ? "진행중"
      : status === "PENDING"
        ? "대기중"
        : status === "COMPLETED"
          ? "완료"
          : status === "PARTIAL"
            ? "부분완료"
            : status === "FAILED"
              ? "실패"
              : "취소";
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">
      {label}
    </span>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
