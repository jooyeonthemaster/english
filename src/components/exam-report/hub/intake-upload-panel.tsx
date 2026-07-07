"use client";

// ============================================================================
// 학생 시험 리포트 — 인테이크(사진 업로드 단일 패널, 프레젠테이션)
//
// 상태머신/등록 시퀀스는 intake-upload-state.ts(useIntakeUpload)가 소유하고,
// 이 파일은 생성 페이지들(text-input-board/generate-upload-panel)과 동일한
// 좌 작업대 + 폭조절 핸들 + 우 레일(헤더/본문/CTA 3분할) 체인만 그린다.
// 흐름: 드롭존(이미지 다중/PDF 1개) → 페이지 작업대(썸네일 레일+큰 미리보기)
// → 우 레일(시험 메타 폼 + "이 시험지는?" 라디오) → [등록하고 분석 시작].
// v4: 리다이렉트 없음 — 허브 하단 "분석 현황 보드"가 낙관 카드+진행률을 그린다.
// ============================================================================

import { useRef, useState } from "react";
import { Layers, Loader2, UserRound, X } from "lucide-react";
import { MAX_PDF_BYTES } from "@/lib/extraction/constants";
import { Input } from "@/components/ui/input";
import { OptionRadioCard } from "@/components/workbench/shared/option-radio-card";
import { ExamMetaForm, type ExamMetaValue } from "./exam-meta-form";
import {
  ACCEPT,
  MAX_PAGES,
  useIntakeUpload,
  type ResumeDraftTarget,
} from "./intake-upload-state";
import {
  IntakeCta,
  IntakeEmptyGuide,
  PageWorkbench,
  ProgressBar,
  RailResizeHandle,
  UploadDropzone,
  useRailWidth,
} from "./intake-upload-parts";

// 기존 소비처(hub-client 등) 경로 호환 — 상태머신 분할 후에도 타입은 여기서 재수출.
export type { ResumeDraftTarget } from "./intake-upload-state";

interface IntakeUploadPanelProps {
  meta: ExamMetaValue;
  onMetaChange: (next: ExamMetaValue) => void;
  /** 주입 시 draftIdRef 를 재사용(새 DRAFT 미생성) + 안내 칩 표시 */
  resumeDraft: ResumeDraftTarget | null;
  onCancelResume: () => void;
  /**
   * 등록+분석 시작 성공 콜백 — 허브가 보드 낙관 행 프리펜드·메타 리셋·
   * 작업 큐 갱신을 담당한다. hasStudent 는 낙관 행 학생 수 표기용.
   */
  onStarted: (analysisId: string, info: { hasStudent: boolean }) => void;
}

export function IntakeUploadPanel({
  meta,
  onMetaChange,
  resumeDraft,
  onCancelResume,
  onStarted,
}: IntakeUploadPanelProps) {
  const {
    slots,
    paperKind,
    setPaperKind,
    studentName,
    setStudentName,
    phase,
    progress,
    errorMsg,
    selectedSlotId,
    setSelectedSlotId,
    busy,
    addFiles,
    removeSlot,
    moveSlot,
    clearAll,
    handleStart,
  } = useIntakeUpload({ meta, resumeDraft, onStarted });

  const [dragging, setDragging] = useState(false);
  // 우 레일 폭(lg+) — 생성 페이지들과 동일한 드래그 조절 + localStorage 영속.
  const { railWidth, beginRailResize } = useRailWidth();
  const inputRef = useRef<HTMLInputElement>(null);

  // CTA busy 라벨 — 진행 단계를 버튼 안에서 그대로 읽게(생성 페이지 톤).
  const ctaBusyLabel =
    phase === "uploading"
      ? `페이지 업로드 중 (${progress.uploaded}/${progress.total})`
      : phase === "attaching"
        ? "시험지를 등록하는 중…"
        : "페이지를 불러오는 중…";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white">
      {/* 숨김 파일 입력 — 드롭존/작업대 '더 추가'가 공유한다. */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* 이어서 등록 칩 — 고아 DRAFT 재사용 안내 */}
      {resumeDraft && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-blue-100 bg-blue-50 px-3.5 py-2">
          <span className="min-w-0 truncate text-sm text-blue-700">
            이어서 등록: <span className="font-semibold">{resumeDraft.title}</span>
          </span>
          <button
            type="button"
            onClick={onCancelResume}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-blue-500 hover:bg-blue-100 hover:text-blue-700 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            취소
          </button>
        </div>
      )}

      {/* ── 2컬럼: 좌 작업대 + 폭조절 핸들 + 우 레일(3분할) — 생성 페이지 체인 미러 ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* 좌 — 작업대(드롭존 / 페이지 미리보기). 드롭은 두 상태 모두 허용. */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
          }}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-100 p-3.5 lg:border-b-0"
        >
          {slots.length === 0 ? (
            <UploadDropzone
              dragging={dragging}
              busy={busy}
              ingesting={phase === "ingesting"}
              maxPages={MAX_PAGES}
              pdfMaxMb={Math.round(MAX_PDF_BYTES / 1024 / 1024)}
              onPick={() => inputRef.current?.click()}
            />
          ) : (
            <>
              <PageWorkbench
                slots={slots}
                busy={busy}
                selectedId={selectedSlotId}
                onSelect={setSelectedSlotId}
                onRemove={removeSlot}
                onMove={moveSlot}
                onClearAll={clearAll}
                onAddMore={() => inputRef.current?.click()}
              />
              {phase === "ingesting" && (
                <div className="mt-2 flex shrink-0 items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  페이지를 불러오는 중입니다…
                </div>
              )}
            </>
          )}
        </div>

        {/* 좌우 폭 조절 핸들(lg+) */}
        <RailResizeHandle onPointerDown={beginRailResize} />

        {/* 우 — 레일: 헤더 / 본문(가이드 또는 시험 정보) / CTA 3분할 */}
        <aside
          style={{ width: railWidth }}
          className="flex min-h-0 flex-col bg-white max-lg:!w-full lg:shrink-0"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900">
              <Layers className="size-4 text-blue-600" aria-hidden="true" />
              등록할 시험지 {slots.length}페이지
            </span>
          </div>

          <div className="smoat-exam-review-scroll min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-2.5">
            {slots.length === 0 ? (
              <IntakeEmptyGuide />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <ExamMetaForm value={meta} onChange={onMetaChange} disabled={busy} />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-slate-500">
                    이 시험지는?
                  </span>
                  <div
                    role="radiogroup"
                    aria-label="시험지 종류 선택"
                    className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  >
                    <OptionRadioCard
                      checked={paperKind === "student"}
                      disabled={busy}
                      title="학생 답안지"
                      description="학생이 풀고 채점된 시험지 — 학생을 함께 등록해 판독까지 진행합니다."
                      onSelect={() => setPaperKind("student")}
                    />
                    <OptionRadioCard
                      checked={paperKind === "clean"}
                      disabled={busy}
                      title="깨끗한 원본"
                      description="채점 전 시험지 — 문항 분석만 진행하고 학생은 나중에 추가합니다."
                      onSelect={() => setPaperKind("clean")}
                    />
                  </div>
                  {paperKind === "student" && (
                    <div className="relative mt-1">
                      <UserRound className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        placeholder="학생 이름 (예) 김민준"
                        disabled={busy}
                        className="bg-white pl-9"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white p-2.5">
            {phase === "uploading" && (
              <div className="mb-2">
                <ProgressBar
                  label={`페이지 업로드 중 (${progress.uploaded}/${progress.total})`}
                  ratio={progress.total ? progress.uploaded / progress.total : 0}
                />
              </div>
            )}
            {phase === "error" && errorMsg && (
              <p className="mb-1.5 text-center text-[11px] font-bold text-rose-600">
                {errorMsg}
              </p>
            )}
            <IntakeCta
              disabled={busy || slots.length === 0}
              busy={busy}
              busyLabel={ctaBusyLabel}
              pageCount={slots.length}
              isError={phase === "error"}
              onClick={() => {
                if (busy) return;
                void handleStart();
              }}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
