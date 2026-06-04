"use client";

import { useCallback, useId, useRef, useState } from "react";
import { CloudUpload, FileText, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.pdf";
const MAX_BYTES = 10 * 1024 * 1024; // 10MB (matches MAX_INPUT_IMAGE_BYTES)

export type FastTrackFlow = "passage-analysis" | "question-generation";

export interface FastTrackUploadResponse {
  extractionJobId: string;
  triggerRunId?: string;
  status: string;
}

export interface FastTrackUploadPanelProps {
  flow: FastTrackFlow;
  /** Additional form fields appended after `file` — e.g. generationPlan,
   *  customPrompt, mode, count, questionType, questionTypeSettings. The panel
   *  reads these lazily on submit so the parent's latest state is captured. */
  buildExtraFields: () => Record<string, string>;
  /** Surface the OCR + enqueue summary back to the parent so it can flash a
   *  toast or update local state (e.g. clear the dropzone, refresh queues). */
  onSuccess?: (response: FastTrackUploadResponse) => void;
  /** Optional override to disable the submit button from the parent
   *  (e.g. when required settings on the side panel are missing). */
  disabledReason?: string | null;
  className?: string;
}

const ENDPOINT_BY_FLOW: Record<FastTrackFlow, string> = {
  "passage-analysis": "/api/workbench/ai-jobs/passage-analysis/from-upload",
  "question-generation": "/api/workbench/ai-jobs/question-generation/from-upload",
};

const LABEL_BY_FLOW: Record<
  FastTrackFlow,
  { actionLabel: string; helperText: string }
> = {
  "passage-analysis": {
    actionLabel: "이 페이지로 빠른 분석",
    helperText:
      "이미지나 1페이지 PDF를 올리면 곧바로 지문을 인식하고 분석 잡을 시작합니다.",
  },
  "question-generation": {
    actionLabel: "이 페이지로 빠른 생성",
    helperText:
      "이미지나 1페이지 PDF를 올리면 곧바로 지문을 인식하고 문제 생성 잡을 시작합니다.",
  },
};

async function readPdfPageCount(buffer: ArrayBuffer): Promise<number | null> {
  // Cheap client-side check — we count `/Type /Page` markers in the raw PDF
  // bytes. Not airtight (encrypted / linearised PDFs may not match) but good
  // enough to catch obvious multi-page uploads before they hit the server.
  try {
    const text = new TextDecoder("latin1").decode(new Uint8Array(buffer));
    const matches = text.match(/\/Type\s*\/Page(?![A-Za-z])/g);
    return matches ? matches.length : null;
  } catch {
    return null;
  }
}

/**
 * Convert a single-page PDF to a JPEG File using pdfjs-dist. Pdf.js ships a
 * webpack-incompatible ESM bundle so we load the prebuilt file directly
 * from /public (matches the pattern in src/lib/extraction/pdf-splitter.ts).
 */
async function pdfFirstPageToJpegFile(file: File): Promise<File> {
  const pdfjs = (await import(
    /* webpackIgnore: true */ "/pdf.min.mjs" as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  )) as any;
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas → blob failed"))),
      "image/jpeg",
      0.85,
    );
  });

  const stem = file.name.replace(/\.pdf$/i, "") || "upload";
  return new File([blob], `${stem}.jpg`, { type: "image/jpeg" });
}

export function FastTrackUploadPanel({
  flow,
  buildExtraFields,
  onSuccess,
  disabledReason,
  className,
}: FastTrackUploadPanelProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultBanner, setResultBanner] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const labels = LABEL_BY_FLOW[flow];

  const validateAndSet = useCallback(async (next: File | null) => {
    setResultBanner(null);
    if (!next) {
      setFile(null);
      setValidationError(null);
      return;
    }

    if (!ACCEPTED_MIME.includes(next.type)) {
      setValidationError(
        "이미지(JPG/PNG/WebP) 또는 PDF 파일만 올릴 수 있어요.",
      );
      setFile(null);
      return;
    }
    if (next.size === 0) {
      setValidationError("빈 파일입니다.");
      setFile(null);
      return;
    }
    if (next.size > MAX_BYTES) {
      setValidationError("파일은 10MB 이하만 올릴 수 있어요.");
      setFile(null);
      return;
    }

    if (next.type === "application/pdf") {
      try {
        const buffer = await next.arrayBuffer();
        const pageCount = await readPdfPageCount(buffer);
        if (pageCount !== null && pageCount > 1) {
          setValidationError(
            "빠른 모드는 1페이지 PDF만 지원해요. 여러 페이지는 자료 추출에서 처리해주세요.",
          );
          setFile(null);
          return;
        }
      } catch {
        // If we can't read the PDF page count, fall through and let pdfjs
        // surface a more informative error during conversion.
      }

      try {
        const converted = await pdfFirstPageToJpegFile(next);
        setValidationError(null);
        setFile(converted);
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setValidationError(`PDF를 이미지로 변환하지 못했어요: ${message}`);
        setFile(null);
        return;
      }
    }

    setValidationError(null);
    setFile(next);
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      const dropped = event.dataTransfer.files?.[0] ?? null;
      await validateAndSet(dropped);
    },
    [validateAndSet],
  );

  const handleFileInput = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = event.target.files?.[0] ?? null;
      await validateAndSet(picked);
      event.target.value = "";
    },
    [validateAndSet],
  );

  const handleSubmit = useCallback(async () => {
    if (!file || submitting) return;
    setSubmitting(true);
    setResultBanner(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const extras = buildExtraFields();
      for (const [key, value] of Object.entries(extras)) {
        if (typeof value === "string" && value.length > 0) {
          formData.append(key, value);
        }
      }

      const res = await fetch(ENDPOINT_BY_FLOW[flow], {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = (await res.json().catch(() => ({}))) as Partial<
        FastTrackUploadResponse & { error?: string; details?: string }
      >;

      if (!res.ok) {
        const message =
          (data && (data.error || data.details)) || `요청 실패 (${res.status})`;
        setResultBanner({ tone: "error", text: message });
        return;
      }

      const response = data as FastTrackUploadResponse;
      const followUpLabel =
        flow === "passage-analysis" ? "분석" : "문제 생성";
      setResultBanner({
        tone: "success",
        text: `자료 추출을 시작했어요. 추출과 복원이 끝나면 지문마다 ${followUpLabel} 잡이 자동으로 시작됩니다. 잡 큐에서 진행 상태를 확인할 수 있어요.`,
      });
      setFile(null);
      onSuccess?.(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setResultBanner({ tone: "error", text: message });
    } finally {
      setSubmitting(false);
    }
  }, [buildExtraFields, file, flow, onSuccess, submitting]);

  const submitDisabled = !file || submitting || Boolean(disabledReason);

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-3 bg-white p-5",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[13px] text-slate-600">
        <Sparkles className="size-4 text-blue-500" />
        <span>{labels.helperText}</span>
      </div>

      <label
        htmlFor={fileInputId}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={handleDrop}
        className={cn(
          "flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-slate-50/60 px-4 py-8 text-center transition",
          dragging
            ? "border-blue-400 bg-blue-50/70"
            : "border-slate-300 hover:border-blue-300 hover:bg-blue-50/40",
          submitting && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={handleFileInput}
          disabled={submitting}
        />
        <CloudUpload className="size-9 text-blue-400" />
        <div className="space-y-1">
          <p className="text-[14px] font-semibold text-slate-700">
            이미지 또는 1페이지 PDF를 끌어다 놓거나 클릭해 선택
          </p>
          <p className="text-[12px] text-slate-400">
            JPG · PNG · WebP · PDF (최대 10MB)
          </p>
        </div>
        {file ? (
          <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-700">
            <FileText className="size-3.5 text-slate-400" />
            <span className="max-w-[260px] truncate">{file.name}</span>
            <span className="text-slate-400">
              · {(file.size / 1024).toFixed(0)} KB
            </span>
          </div>
        ) : null}
      </label>

      {validationError ? (
        <p className="text-[12px] font-medium text-rose-600">{validationError}</p>
      ) : null}

      {resultBanner ? (
        <p
          className={cn(
            "rounded-md border px-3 py-2 text-[12px] font-medium",
            resultBanner.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700",
          )}
        >
          {resultBanner.text}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-[11px] text-slate-400">
          여러 페이지가 있는 PDF는 자료 추출 페이지에서 처리해주세요.
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitDisabled}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13px] font-semibold text-white shadow-sm transition",
            submitDisabled
              ? "bg-slate-300"
              : "bg-blue-600 hover:bg-blue-700",
          )}
          title={disabledReason ?? undefined}
        >
          {submitting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {labels.actionLabel}
        </button>
      </div>
    </div>
  );
}
