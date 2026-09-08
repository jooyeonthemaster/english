"use client";

// ============================================================================
// 학생 시험 리포트 — 인테이크(사진 업로드 단일 패널, 프레젠테이션)
//
// 상태머신/등록 시퀀스는 intake-upload-state.ts(useIntakeUpload)가 소유하고,
// 이 파일은 프레젠테이션만 그린다.
// 빈 상태(페이지 0) = **단일 컬럼 히어로**(드롭존+사용 순서 — 26-09-03: 2컬럼
// 빈 상태가 스튜디오 중앙 열에서 266×750 세로 막대로 찌그러지던 것 수리).
// 페이지가 생기면 호스트 폭으로 갈린다(useContainerNarrow, 뷰포트 아님):
//  · 넓음(≥880) — 생성 페이지들(text-input-board)과 동일한 좌 작업대 + 폭조절
//    핸들 + 우 레일(헤더/메타 폼/CTA 3분할) 2컬럼(허브).
//  · 좁음(<880, 스튜디오 중앙 열) — 페이지 그리드 → 시험 정보 → 안내 세로 스택
//    + 하단 고정 CTA. 2컬럼을 강행하면 미리보기 230px·레일 380px·CTA 절단.
// v4: 리다이렉트 없음 — 허브 하단 "분석 현황 보드"가 낙관 카드+진행률을 그린다.
// v5(플로우 개편): 학생 동시 등록 모드 폐기 — 빈 시험지 분석 단일 경로.
// 학생은 분석 완료 후 보드 카드의 "학생 추가"에서 이어진다.
// ============================================================================

import { useRef, useState } from "react";
import { Layers, Loader2, UserRoundPlus, X } from "lucide-react";
import type { DragEvent } from "react";
import { MAX_PDF_BYTES } from "@/lib/extraction/constants";
import { ExamMetaForm, type ExamMetaValue } from "./exam-meta-form";
import {
  ACCEPT,
  MAX_PAGES,
  useIntakeUpload,
  type ResumeDraftTarget,
} from "./intake-upload-state";
import { IntakeEmptyHero } from "./intake-empty-hero";
import { PageGrid, PageWorkbench } from "./intake-page-workbench";
import {
  INTAKE_STACK_BREAKPOINT,
  IntakeCreditCaption,
  IntakeCta,
  ProgressBar,
  RailResizeHandle,
  useContainerNarrow,
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
   * 작업 큐 갱신을 담당한다. hasStudent 는 낙관 행 학생 수 표기용
   * (플로우 개편 후 항상 false — 시그니처는 허브 호환을 위해 유지).
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
  // 드롭 핸들러 — 빈 상태 히어로·페이지 작업대가 같은 세트를 쓴다.
  const dropHandlers = {
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!busy) setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
    },
  };
  // 우 레일 폭(lg+) — 생성 페이지들과 동일한 드래그 조절 + localStorage 영속.
  const { railWidth, beginRailResize } = useRailWidth();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const narrow = useContainerNarrow(rootRef, INTAKE_STACK_BREAKPOINT);

  // CTA busy 라벨 — 진행 단계를 버튼 안에서 그대로 읽게(생성 페이지 톤).
  const ctaBusyLabel =
    phase === "uploading"
      ? `페이지 업로드 중 (${progress.uploaded}/${progress.total})`
      : phase === "attaching"
        ? "시험지를 등록하는 중…"
        : "페이지를 불러오는 중…";

  // 다음 행동 안내 — 학생 동시 등록 폐기(플로우 개편). 인테이크는 시험지 분석만
  // 하고(학생 필기 유무 무관 — 인쇄 문항 기준 분석), 학생은 분석 완료 카드의
  // "학생 추가"로. 2컬럼 레일·세로 스택 공용.
  const studentLaterNote = (
    <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100">
        <UserRoundPlus className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 text-xs leading-relaxed text-slate-500">
        <p className="text-[12.5px] font-bold text-slate-700">
          학생은 분석이 끝난 뒤 추가해요
        </p>
        <p className="mt-0.5">
          분석이 완료되면 아래 분석 현황 카드의{" "}
          <span className="font-semibold text-blue-700">학생 추가</span>로 바로
          이어져요. 답안은 학생에게 입력 링크를 보내 받거나, 선생님이 직접
          기입할 수 있습니다.
        </p>
      </div>
    </div>
  );

  // 푸터(진행 바 / 에러 / CTA) — @container 로 CTA 과금 pill ↔ 캡션 전환.
  const footer = (
    <div className="@container shrink-0 border-t border-slate-100 bg-white p-2.5">
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
      <IntakeCreditCaption visible={!busy && slots.length > 0} />
    </div>
  );

  return (
    <div
      ref={rootRef}
      data-intake-panel
      data-intake-layout={
        slots.length === 0 ? "empty" : narrow ? "stack" : "split"
      }
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white"
    >
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
            이어서 등록:{" "}
            <span className="font-semibold">{resumeDraft.title}</span>
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

      {slots.length === 0 ? (
        /* ── 빈 상태: 단일 컬럼 히어로(카드 전체 드롭 타깃) ── */
        <div {...dropHandlers} className="flex min-h-0 flex-1 flex-col p-3.5">
          <IntakeEmptyHero
            dragging={dragging}
            busy={busy}
            ingesting={phase === "ingesting"}
            errorMsg={phase === "error" ? errorMsg : null}
            maxPages={MAX_PAGES}
            pdfMaxMb={Math.round(MAX_PDF_BYTES / 1024 / 1024)}
            onPick={() => inputRef.current?.click()}
          />
        </div>
      ) : narrow ? (
        /* ── 좁은 호스트: 페이지 그리드 → 시험 정보 → 안내 세로 스택 + 고정 CTA ── */
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            {...dropHandlers}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5"
          >
            <PageGrid
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
              <div className="flex shrink-0 items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                페이지를 불러오는 중입니다…
              </div>
            )}
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <ExamMetaForm
                value={meta}
                onChange={onMetaChange}
                disabled={busy}
              />
            </div>
            {studentLaterNote}
          </div>
          {footer}
        </div>
      ) : (
        /* ── 넓은 호스트 2컬럼: 좌 작업대 + 폭조절 핸들 + 우 레일(3분할) ── */
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* 좌 — 작업대(페이지 미리보기). 드롭 추가 허용. */}
          <div
            {...dropHandlers}
            className="relative flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-100 p-3.5 lg:border-b-0"
          >
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
          </div>

          {/* 좌우 폭 조절 핸들(lg+) */}
          <RailResizeHandle onPointerDown={beginRailResize} />

          {/* 우 — 레일: 헤더 / 본문(가이드 또는 시험 정보) / CTA 3분할 */}
          <aside
            data-rail-panel
            style={{ width: railWidth }}
            // lg:max-w-[50%](26-09-01): 폭은 절대 px 영속이라 좁은 호스트(스튜디오
            // 중앙 열 ~700px)에서 420px 레일이 좌 작업대를 짓눌렀다 — 컨테이너
            // 절반 상한으로 좌우 밸런스를 구조적으로 보장한다. 허브(넓은 프레임)는
            // 420 < 50% 라 픽셀 불변. 드래그 실기록 폭이 상한을 넘어도 CSS 가
            // 시각 폭을 캡한다(무해 — 넓은 화면으로 돌아가면 기록 폭 복원).
            className="flex min-h-0 max-w-full flex-col bg-white max-lg:!w-full lg:shrink-0 lg:max-w-[50%]"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900">
                <Layers className="size-4 text-blue-600" aria-hidden="true" />
                등록할 시험지 {slots.length}페이지
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-2.5">
              <div className="flex flex-col gap-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <ExamMetaForm
                    value={meta}
                    onChange={onMetaChange}
                    disabled={busy}
                  />
                </div>

                {studentLaterNote}
              </div>
            </div>

            {footer}
          </aside>
        </div>
      )}
    </div>
  );
}
