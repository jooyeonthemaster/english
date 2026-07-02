"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { MaterialExtractionIcon } from "@/components/icons/workflow-icons";
import {
  isInlineExtractionInFlight,
  useExtractionUpload,
} from "@/hooks/use-extraction-upload";
import { useExtractionStream } from "@/hooks/use-extraction-stream";
import {
  imagesToSlots,
  revokeSlotUrls,
  splitPdfToImages,
} from "@/lib/extraction/pdf-splitter";
import { useExtractionStore } from "@/lib/extraction/store";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  ACCEPTED_IMAGE_MIMES,
  ACCEPTED_PDF_MIMES,
  MAX_PAGE_IMAGE_BYTES,
  MAX_PAGES_PER_JOB,
  MAX_PDF_BYTES,
} from "@/lib/extraction/constants";
import type { ClientPageSlot } from "@/lib/extraction/types";

import { useQueueDrawer } from "../queue-drawer-context";
import { ExtractionManageClient } from "../extraction-manage-client";
import { isExtractable } from "../intake/crop/slot-meta";
import { TEXT_EXTRACTION_MIN_LENGTH } from "./constants";
import type { FileSourceType, InputMode, Props } from "./types";
import { summarizeFileNames } from "./utils";
import { UploadPanel } from "./components/upload-panel";

export function BulkExtractClient({
  academyId,
  initialCreditBalance,
  initialCollections,
  initialCollectionMembership,
  subjectScope,
}: Props) {
  void initialCreditBalance;

  // 국어 라우트면 이어하기(resume)·자료 관리 임베드를 국어 경로로 스코프한다.
  // 미전달=영어 기본 경로(무회귀). 게이트-먼저-영어.
  const jobsRoutePath =
    subjectScope === "KOREAN"
      ? "/director/korean/extraction/jobs"
      : "/director/workbench/passages/import/jobs";

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
  const [sourceType, setSourceType] = useState<FileSourceType | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const queueDrawer = useQueueDrawer();
  const [inputMode, setInputMode] = useState<InputMode>("file");
  // 하단 자료 관리(ExtractionManageClient)에 "방금 시작한 추출 작업"을 즉시 반영시키는
  // 토큰. 이 탭에서 새 잡을 만들면(=jobId 변경) 1 증가시켜, 30초 백그라운드 폴링을
  // 기다리지 않고 작업 목록을 곧바로 새로고침한다. (학습지 생성 인테이크와 동일 경로)
  const [manageRefreshToken, setManageRefreshToken] = useState(0);
  // 적응형 인테이크 — 인라인 크롭 보드(모달 없이 업로드 영역에서 바로 크롭).
  const adaptiveIntake = FEATURE_FLAGS.EXTRACTION_ADAPTIVE_INTAKE;
  // P7-D2: 추출 산출 방식 — 기본 "원문 그대로(verbatim)", 옵션 "AI 복원(restored)".
  const [outputMode, setOutputMode] = useState<"verbatim" | "restored">(
    "verbatim",
  );
  const bootstrapped = useRef(false);
  const fileInputId = "m1-passage-workroom-file-input";

  const UPLOAD_COLLAPSE_KEY = "smoat:extraction-bulk:upload:collapsed";
  const UPLOAD_HEIGHT_KEY = "smoat:extraction-bulk:upload:height";
  const UPLOAD_MIN = 360;
  const UPLOAD_MAX = 1400;
  const UPLOAD_DEFAULT = 760;
  const [uploadCollapsed, setUploadCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(UPLOAD_COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [uploadHeight, setUploadHeight] = useState<number>(() => {
    if (typeof window === "undefined") return UPLOAD_DEFAULT;
    try {
      const raw = window.localStorage.getItem(UPLOAD_HEIGHT_KEY);
      if (!raw) return UPLOAD_DEFAULT;
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return UPLOAD_DEFAULT;
      return Math.min(UPLOAD_MAX, Math.max(UPLOAD_MIN, n));
    } catch {
      return UPLOAD_DEFAULT;
    }
  });

  const toggleUploadCollapsed = useCallback(() => {
    setUploadCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(UPLOAD_COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const beginUploadResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startHeight = uploadHeight;
      let latest = startHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        latest = Math.min(
          UPLOAD_MAX,
          Math.max(UPLOAD_MIN, startHeight + (ev.clientY - startY)),
        );
        setUploadHeight(latest);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(UPLOAD_HEIGHT_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [uploadHeight],
  );
  const resetUploadHeight = useCallback(() => {
    setUploadHeight(UPLOAD_DEFAULT);
    try {
      window.localStorage.setItem(UPLOAD_HEIGHT_KEY, String(UPLOAD_DEFAULT));
    } catch {
      /* ignore */
    }
  }, []);

  useExtractionStream({
    jobId,
    enabled:
      phase === "processing" || phase === "starting" || phase === "uploading",
  });

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    setMode("PASSAGE_ONLY");

    if (typeof window !== "undefined") {
      const resumeJobId = new URLSearchParams(window.location.search).get(
        "jobId",
      );
      if (resumeJobId) {
        router.replace(`${jobsRoutePath}?jobId=${resumeJobId}`);
        return;
      }
    }

    setPhase("idle");
  }, [router, setMode, setPhase, jobsRoutePath]);

  // (추출 완료 후 자료 관리 페이지로 자동 이동하던 동선은 제거 — 사용자가 이 페이지에
  //  머무르며 큐(작업 목록)에서 직접 결과를 확인한다.)

  // 잡 id가 생기는 즉시(=createJob 직후, OCR 전) 큐를 열고 새로고침해 항목이
  // 곧바로 보이게 한다. 예전엔 startUpload(이미지=OCR까지 동기)가 전부 끝난 뒤에야
  // 큐가 떠서 "추출 다 되고 나서 큐 생김"처럼 느껴졌다. setJobId는 createJob 직후
  // (업로드·OCR 진행 전) 호출되므로 여기서 켜면 처리 시작과 동시에 큐에 보인다.
  useEffect(() => {
    if (!jobId) return;
    queueDrawer.setOpen(true);
    queueDrawer.triggerRefresh();
    // 하단 자료 관리 목록도 즉시 새로고침해 방금 시작한 추출 작업이 곧바로 보이게 한다.
    setManageRefreshToken((n) => n + 1);
    // queueDrawer는 컨텍스트로 안정적 — jobId 변할 때만 실행.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        phase === "preparing" ||
        phase === "uploading" ||
        phase === "starting" ||
        phase === "processing" ||
        // 백그라운드(파이어 앤 포겟)로 도는 인라인 OCR이 남아 있으면 이탈 경고.
        // 도중 이탈하면 요청이 끊겨 잡이 PROCESSING으로 잔류(리퍼가 복구).
        isInlineExtractionInFlight()
      ) {
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
        slotId: slot.slotId ?? crypto.randomUUID(),
      }));
      const next = [...slots, ...adjusted];
      setSlots(next);
      setSource(
        `${next.length}페이지`,
        incoming.length === 1
          ? "IMAGES"
          : sourceType === "PDF"
            ? "PDF"
            : "IMAGES",
      );
    },
    [setSlots, setSource, slots, sourceType],
  );

  /**
   * Reorder slots in place (drag-and-drop). pageIndex is recomputed so the
   * upload step still posts a contiguous 0..N-1 ordering — the server uses
   * sourceFileName / OCR-based page-number signals for further auto-sorting,
   * but this manual reorder lets the user fix obvious cases before extraction
   * starts (e.g. when the multi-select arrived in a wrong order).
   */
  const reorderSlots = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || fromIndex >= slots.length) return;
      if (toIndex < 0 || toIndex >= slots.length) return;
      const next = [...slots];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setSlots(next.map((slot, i) => ({ ...slot, pageIndex: i })));
    },
    [setSlots, slots],
  );

  const removeSlot = useCallback(
    (index: number) => {
      if (index < 0 || index >= slots.length) return;
      const target = slots[index];
      // merged(여러 장 합친 결과)를 삭제하면, 재료들을 추출 대상으로 원복(고아 방지).
      let working = slots;
      if (target?.kind === "merged" && target.mergedFromSlotIds?.length) {
        const restore = new Set(target.mergedFromSlotIds);
        working = slots.map((s) =>
          s.slotId && restore.has(s.slotId)
            ? { ...s, kind: undefined, excludedFromExtraction: false }
            : s,
        );
      }
      const next = working
        .filter((_, i) => i !== index)
        .map((slot, i) => ({ ...slot, pageIndex: i }));
      setSlots(next);
      if (next.length === 0) {
        setSourceName(null);
        setSourceType(null);
        setError(null);
      }
    },
    [setError, setSlots, slots],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      setError(null);

      const pdf = arr.find((file) =>
        ACCEPTED_PDF_MIMES.includes(
          file.type as (typeof ACCEPTED_PDF_MIMES)[number],
        ),
      );
      const allImages = arr.every((file) =>
        ACCEPTED_IMAGE_MIMES.includes(
          file.type as (typeof ACCEPTED_IMAGE_MIMES)[number],
        ),
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
            setError(
              `한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`,
            );
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
            setError(
              `한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`,
            );
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
            setError(
              `한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`,
            );
            return;
          }
          const oversized = arr.find(
            (file) => file.size > MAX_PAGE_IMAGE_BYTES,
          );
          if (oversized) {
            setError(
              `${oversized.name} 파일이 너무 큽니다. 이미지는 5MB 이하로 올려 주세요.`,
            );
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
        setError(
          err instanceof Error ? err.message : "파일을 처리하지 못했습니다",
        );
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

  const startExtraction = useCallback(
    async (passageSlots?: ClientPageSlot[]) => {
    if (slots.length === 0) {
      setError("추출할 파일을 먼저 추가해 주세요.");
      return;
    }
    // 인라인 보드가 구운 지문 슬롯(crop/merged/original)을 그대로 사용. 보드가
    // 없거나 안 넘어온 경우엔 store slots. 추출 제외분(잘라낸 원본)만 거른 뒤
    // 0..N-1로 재인덱싱한다(원본은 excludedFromExtraction이 없어 그대로 통과).
    const source = passageSlots ?? slots;
    const extractable = source.filter(isExtractable);
    if (extractable.length === 0) {
      setError("추출할 자료가 없습니다. (잘라낸 원본은 추출에서 제외됩니다)");
      return;
    }
    const reindexed = extractable.map((slot, i) => ({ ...slot, pageIndex: i }));
    // HIGH-1 가드: 합친/잘린 이미지가 5MB 초과면 서버가 거부하므로 업로드 전 차단.
    const oversized = reindexed.find((s) => s.bytes > MAX_PAGE_IMAGE_BYTES);
    if (oversized) {
      setError(
        `"${oversized.sourceFileName ?? "한 자료"}"가 너무 큽니다 (${Math.round(MAX_PAGE_IMAGE_BYTES / 1024 / 1024)}MB 초과). 합칠 장수를 줄이거나 영역을 더 작게 잘라 주세요.`,
      );
      return;
    }
    const uploadSourceType: FileSourceType =
      sourceType === "PDF" ? "PDF" : "IMAGES";
    // 직전/완료된 잡 id를 먼저 비운다. 안 그러면 업로드(다운스케일 포함, 수 초)
    // 구간 동안 store.jobId가 옛 잡으로 남아, uploading에서 켜지는 SSE가 그 옛
    // 터미널 잡의 done을 받아 phase=reviewing→자동 네비로 새 업로드를 가로챈다
    // ("추출 눌렀는데 혼자 관리페이지로 가버림"의 원인). startTextExtraction과 대칭.
    setJobId(null);
    const nextJobId = await startUpload({
      slots: reindexed,
      sourceType: uploadSourceType,
      originalFileName: sourceName,
      mode: "PASSAGE_ONLY",
      outputMode: adaptiveIntake ? outputMode : undefined,
      // 국어 라우트면 subject="KOREAN"을 실어 잡 metadata.subject 로 전파 —
      // 승급 Passage 가 국어로 스코프된다(미전달 시 영어 승급 누수 방지).
      subject: subjectScope,
      previewSlot: slots[0] ?? null,
    });
    if (nextJobId) {
      // 큐 열기·새로고침은 jobId 변화 effect가 createJob 직후 즉시 처리한다.
      setJobId(nextJobId);
      setSlots([]);
      setSourceName(null);
      setSourceType(null);
      setUploadProgress(null);
      // 제출 완료 → 입력 영역을 중립(idle)으로 되돌려 곧바로 다음 추출을 시작할 수
      // 있게 한다. 진행 중인 잡은 "자료 목록"이 추적한다(인라인은 백그라운드 진행).
      setPhase("idle");
    }
    },
    [
      adaptiveIntake,
      outputMode,
      setError,
      setJobId,
      setPhase,
      setSlots,
      setUploadProgress,
      slots,
      sourceName,
      sourceType,
      startUpload,
      subjectScope,
    ],
  );

  // 여러 텍스트 지문을 한 작업(권)으로 묶어 추출. 성공 시 true(보드가 입력을 비움).
  const startTextExtraction = useCallback(
    async (
      passages: { title?: string; text: string }[],
    ): Promise<boolean> => {
      const cleaned = passages
        .map((p) => ({ title: p.title?.trim() || undefined, text: p.text.trim() }))
        .filter((p) => p.text.length >= TEXT_EXTRACTION_MIN_LENGTH);
      if (cleaned.length === 0) {
        setError(`텍스트는 ${TEXT_EXTRACTION_MIN_LENGTH}자 이상 입력해 주세요.`);
        return false;
      }

      try {
        setError(null);
        setPhase("starting");
        setJobId(null);
        // 버튼 누르는 즉시 큐를 연다(하단 자료 관리가 새 잡을 추적).
        queueDrawer.setOpen(true);
        const res = await fetch("/api/extraction/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            mode: "PASSAGE_ONLY",
            outputMode: adaptiveIntake ? outputMode : undefined,
            // 국어 라우트면 subject="KOREAN" — 텍스트 잡도 국어로 스코프.
            subject: subjectScope,
            passages: cleaned,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "텍스트 추출에 실패했습니다.");
        }
        const data = (await res.json()) as { jobId: string };
        setJobId(data.jobId);
        setPhase("reviewing");
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "텍스트 추출에 실패했습니다.",
        );
        setPhase("idle");
        return false;
      }
    },
    [
      adaptiveIntake,
      outputMode,
      queueDrawer,
      setError,
      setJobId,
      setPhase,
      subjectScope,
    ],
  );

  const clearFiles = useCallback(() => {
    setSlots([]);
    setSourceName(null);
    setSourceType(null);
    setError(null);
  }, [setError, setSlots]);

  const inputBusy =
    phase === "preparing" || phase === "uploading" || phase === "starting";

  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] py-4">
      <main className="flex w-full min-w-0 flex-col gap-4 px-4 sm:px-6 xl:px-8">
        <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
            <WorkflowPageTitle
              icon={MaterialExtractionIcon}
              title="자료 추출"
              description={
                adaptiveIntake
                  ? "PDF·이미지·텍스트를 등록해 지문을 추출합니다. 빈칸·순서 문제는 선택적으로 AI 복원할 수 있습니다."
                  : "PDF, 이미지, 텍스트를 등록하면 지문을 추출하고 원문 형태로 복원합니다."
              }
            />

            <div className="flex items-center gap-2">
              {uploadCollapsed ? (
                <button
                  type="button"
                  onClick={toggleUploadCollapsed}
                  aria-expanded={false}
                  title="자료 추출 펼치기"
                  className="inline-flex h-8 cursor-pointer items-center gap-1 px-1 text-[11.5px] font-medium text-slate-400 transition-colors hover:text-slate-600"
                >
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                  <span>펼치기</span>
                </button>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              <AlertCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>{error}</span>
            </div>
          ) : null}

          {!uploadCollapsed ? (
            <>
              <div
                className="grid min-h-0 grid-cols-1 overflow-hidden"
                style={{ height: uploadHeight }}
              >
                <UploadPanel
                  busy={inputBusy}
                  dragActive={dragActive}
                  fileInputId={fileInputId}
                  inputMode={inputMode}
                  slots={slots}
                  splitProgress={splitProgress}
                  uploadProgress={uploadProgress}
                  onClear={clearFiles}
                  onFiles={handleFiles}
                  onInputModeChange={setInputMode}
                  onStart={startExtraction}
                  onStartText={startTextExtraction}
                  onDragActiveChange={setDragActive}
                  onReorderSlots={reorderSlots}
                  onRemoveSlot={removeSlot}
                  onBeforeStart={() => {
                    // 직전 잡 id를 비우고 큐를 연다(하단 자료 관리가 새 잡을 추적).
                    setJobId(null);
                    queueDrawer.setOpen(true);
                  }}
                  outputMode={adaptiveIntake ? outputMode : undefined}
                  onOutputModeChange={adaptiveIntake ? setOutputMode : undefined}
                />
              </div>
              <div className="relative flex items-center justify-end px-4 pb-1 pt-1">
                <div
                  onPointerDown={beginUploadResize}
                  onDoubleClick={resetUploadHeight}
                  title="드래그하여 높이 조절 · 더블 클릭하여 초기화"
                  className="group/uhandle absolute left-1/2 top-1/2 inline-flex h-3 w-[200px] -translate-x-1/2 -translate-y-1/2 cursor-row-resize items-center justify-center px-1 select-none"
                >
                  <div className="h-0.5 w-full rounded-full bg-slate-200 transition-colors group-hover/uhandle:bg-blue-400 group-active/uhandle:bg-blue-500" />
                </div>
                <button
                  type="button"
                  onClick={toggleUploadCollapsed}
                  aria-expanded
                  title="자료 추출 접기"
                  className="inline-flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
                >
                  <ChevronUp className="size-3.5" aria-hidden="true" />
                  <span>접기</span>
                </button>
              </div>
            </>
          ) : null}
        </section>
      </main>

      {/* 하단: 자료 관리(전체 자료·폴더·검수) 전체를 인라인으로 — 폴더로 들어가도
          이 페이지를 벗어나지 않는다. 진행 중인 추출 작업은 ExtractionManageClient의
          작업 목록(자료 목록) 행에 그대로 나타나고, manageRefreshToken 으로 즉시
          새로고침된다. 페이지 배경/패딩은 위 래퍼가 제공하므로 pageBleed=false. */}
      <div className="mt-4">
        <ExtractionManageClient
          academyId={academyId}
          initialCollections={initialCollections}
          initialCollectionMembership={initialCollectionMembership}
          refreshToken={manageRefreshToken}
          pageBleed={false}
          showJobListRow={false}
          subjectScope={subjectScope}
        />
      </div>
    </div>
  );
}
