"use client";

import type { RefObject } from "react";
import {
  FileText,
  FileUp,
  Loader2,
  RotateCcw,
  Sparkles,
  UploadCloud,
} from "lucide-react";

interface StagedFile {
  fileName: string;
  totalPages: number;
}

interface SimilarExamUploadPanelProps {
  busy: boolean;
  splitting: boolean;
  splitMessage: string;
  staged: StagedFile | null;
  uploadProgress: number;
  selectedPassageCount: number;
  error: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onPickFiles: (files: FileList | File[]) => void;
  onGenerate: () => void;
  onClearStaged: () => void;
}

export function SimilarExamUploadPanel({
  busy,
  splitting,
  splitMessage,
  staged,
  uploadProgress,
  selectedPassageCount,
  error,
  fileInputRef,
  onPickFiles,
  onGenerate,
  onClearStaged,
}: SimilarExamUploadPanelProps) {
  const canGenerate = Boolean(staged) && selectedPassageCount > 0 && !busy;
  const disabledReason =
    selectedPassageCount === 0
      ? "왼쪽에서 지문을 1개 이상 선택하세요."
      : !staged
        ? "분석할 시험지를 먼저 업로드하세요."
        : null;

  return (
    <section className="flex min-h-[338px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">패턴 분석 시험지</h2>
          <p className="mt-1 text-sm text-slate-500">
            완성본 시험지를 넣고 선택한 지문으로 같은 출제 패턴의 새 시험지를 생성합니다.
          </p>
        </div>
        {(staged || error) && !busy && (
          <button
            type="button"
            onClick={onClearStaged}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="size-4" />
            다시 선택
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        {busy ? (
          <div className="flex min-h-[200px] flex-1 flex-col justify-center gap-6 rounded-lg border border-blue-100 bg-blue-50/30 px-6">
            <div className="flex items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
                <Loader2 className="size-6 animate-spin" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-slate-950">
                  {splitMessage || "작업 준비 중"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  업로드가 끝나면 아래 작업 목록에서 진행 상태를 확인할 수 있습니다.
                </p>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>{staged ? `${staged.totalPages}페이지` : "준비 중"}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          </div>
        ) : staged ? (
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {staged.fileName}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{staged.totalPages}페이지 준비됨</p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 text-xs font-semibold text-blue-600 hover:underline"
              >
                파일 변경
              </button>
            </div>

            <button
              type="button"
              disabled={!canGenerate}
              onClick={onGenerate}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Sparkles className="size-4" />
              시험지 생성 시작
            </button>
            {disabledReason && (
              <p className="text-center text-xs text-slate-400">{disabledReason}</p>
            )}
            <p className="text-center text-xs text-slate-400">
              현재 지문 {selectedPassageCount}개 선택됨
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              onPickFiles(event.dataTransfer.files);
            }}
            disabled={splitting}
            className="flex min-h-[220px] w-full flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/40 disabled:cursor-wait"
          >
            {splitting ? (
              <>
                <Loader2 className="mb-4 size-10 animate-spin text-blue-500" />
                <span className="text-lg font-semibold text-slate-950">
                  {splitMessage || "시험지 준비 중"}
                </span>
              </>
            ) : (
              <>
                <UploadCloud className="mb-4 size-10 text-blue-500" strokeWidth={1.7} />
                <span className="text-lg font-semibold text-slate-950">
                  분석할 시험지 PDF 또는 이미지 입력
                </span>
                <span className="mt-2 max-w-[640px] text-sm leading-6 text-slate-500">
                  업로드하면 미리보기만 준비됩니다. [시험지 생성 시작] 버튼을 눌러야 작업이 시작됩니다.
                </span>
                <span className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white">
                  <FileUp className="size-4" />
                  시험지 선택
                </span>
              </>
            )}
          </button>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            if (event.target.files) onPickFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </div>
    </section>
  );
}
