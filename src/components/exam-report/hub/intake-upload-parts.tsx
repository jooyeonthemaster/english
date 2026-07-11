"use client";

// ============================================================================
// 학생 시험 리포트 — 인테이크 패널 프레젠테이션 조각
//
// intake-upload-panel(컨테이너)이 소유한 상태를 받아 그리기만 한다.
// 생성 페이지들과 같은 부품을 미러: 드롭존(generate-upload-panel) ·
// 페이지 작업대(inline-crop-board 썸네일 레일) · 사용 순서 가이드 카드 +
// 우 레일 폭 조절 훅/핸들(text-input-board) · 풀폭 CTA(StartButton).
// ============================================================================

import { useCallback, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Database,
  FileText,
  FileUp,
  GripVertical,
  ImageIcon,
  Loader2,
  PlayCircle,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { EXAM_ANALYSIS_MIN_CREDITS } from "@/lib/exam-report/types";
import { UploadMetaChip } from "@/components/workbench/shared/upload-meta-chip";
import type { UploadSlot } from "./upload-helpers";

// ── 업로드 진행 바 ───────────────────────────────────────────────────────────
export function ProgressBar({ label, ratio }: { label: string; ratio: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── 드롭존(빈 상태) — 문제생성 파일업로드 탭과 동일 룩 ──────────────────────
export function UploadDropzone({
  dragging,
  busy,
  ingesting,
  maxPages,
  pdfMaxMb,
  onPick,
}: {
  dragging: boolean;
  busy: boolean;
  ingesting: boolean;
  maxPages: number;
  pdfMaxMb: number;
  onPick: () => void;
}) {
  return (
    <div
      className={
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border p-3 transition-colors max-lg:min-h-[45vh] " +
        (dragging ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50/70")
      }
    >
      <button
        type="button"
        disabled={busy}
        onClick={onPick}
        className="flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-blue-500 bg-white px-6 py-8 text-center transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="inline-flex items-center gap-2 text-[14px] font-extrabold text-blue-700">
          {ingesting ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <UploadCloud className="size-5" aria-hidden="true" />
          )}
          {ingesting ? "페이지 불러오는 중…" : "파일을 끌어놓거나 클릭해서 추가"}
        </span>
        <span className="flex flex-wrap items-center justify-center gap-2">
          <UploadMetaChip icon={<ImageIcon className="size-3.5" aria-hidden="true" />}>
            PNG·JPG·WEBP / PDF
          </UploadMetaChip>
          <UploadMetaChip icon={<FileText className="size-3.5" aria-hidden="true" />}>
            최대 {maxPages}페이지
          </UploadMetaChip>
          <UploadMetaChip icon={<Database className="size-3.5" aria-hidden="true" />}>
            PDF {pdfMaxMb}MB
          </UploadMetaChip>
        </span>
      </button>
    </div>
  );
}

// ── 페이지 작업대 — 좌 96px 썸네일 레일 + 중앙 큰 미리보기(크롭보드 미러) ────
export function PageWorkbench({
  slots,
  busy,
  selectedId,
  onSelect,
  onRemove,
  onMove,
  onClearAll,
  onAddMore,
}: {
  slots: UploadSlot[];
  busy: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onClearAll: () => void;
  onAddMore: () => void;
}) {
  if (slots.length === 0) return null;
  // 선택 슬롯이 삭제됐으면 첫 페이지로 폴백(findIndex -1 → 0).
  const currentIndex = Math.max(
    0,
    slots.findIndex((s) => s.id === selectedId),
  );
  const current = slots[currentIndex];
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white max-lg:min-h-[45vh] lg:flex-row">
      {/* 썸네일 레일 — PC 세로 96px / 모바일 가로 스트립 */}
      <div className="flex shrink-0 flex-row gap-1.5 overflow-x-auto border-b border-slate-100 bg-slate-50 p-1.5 lg:w-24 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:border-b-0 lg:border-r">
        {slots.map((slot, i) => {
          const isCur = i === currentIndex;
          return (
            <div
              key={slot.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(slot.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(slot.id);
                }
              }}
              title={`${i + 1}페이지 보기`}
              className={
                "group relative block w-16 shrink-0 cursor-pointer overflow-hidden rounded-md border bg-white transition-colors lg:w-full " +
                (isCur
                  ? "border-blue-500 ring-2 ring-blue-300"
                  : "border-slate-200 hover:border-blue-300")
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slot.previewUrl}
                alt={`페이지 ${i + 1}`}
                className="block max-h-28 w-full bg-white object-contain"
                draggable={false}
              />
              <span
                className={
                  "absolute left-1 top-1 inline-flex size-4 items-center justify-center rounded text-[9px] font-bold " +
                  (isCur ? "bg-blue-600 text-white" : "bg-slate-900/70 text-white")
                }
              >
                {i + 1}
              </span>
              {!busy ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(slot.id);
                    }}
                    className="absolute right-1 top-1 rounded-full bg-slate-900/60 p-0.5 text-white opacity-0 transition-opacity hover:bg-rose-500 group-hover:opacity-100"
                    aria-label={`페이지 ${i + 1} 삭제`}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                  {/* 순서 변경 — 레일 순서(=페이지 순서) 앞/뒤 이동 */}
                  <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-gradient-to-t from-slate-900/70 to-transparent p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMove(i, -1);
                      }}
                      disabled={i === 0}
                      className="rounded bg-white/90 p-0.5 text-slate-700 disabled:opacity-30"
                      aria-label="앞으로"
                    >
                      <ChevronUp className="size-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMove(i, 1);
                      }}
                      disabled={i === slots.length - 1}
                      className="rounded bg-white/90 p-0.5 text-slate-700 disabled:opacity-30"
                      aria-label="뒤로"
                    >
                      <ChevronDown className="size-3" aria-hidden="true" />
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* 중앙 큰 미리보기 */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-slate-100 px-2.5">
          <span className="truncate text-[10.5px] font-bold text-slate-500">
            {currentIndex + 1} / {slots.length}페이지
            {current?.name ? ` · ${current.name}` : ""}
          </span>
          <button
            type="button"
            onClick={onClearAll}
            disabled={busy}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[10.5px] text-slate-400 transition-colors hover:text-rose-500 disabled:opacity-50"
          >
            <Trash2 className="size-3" aria-hidden="true" />
            모두 지우기
          </button>
        </div>
        <div className="min-h-0 flex-1 bg-slate-50/50 p-2">
          {current ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={current.previewUrl}
              alt={`페이지 ${currentIndex + 1} 미리보기`}
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : null}
        </div>
        <div className="shrink-0 border-t border-slate-100 p-1.5">
          <button
            type="button"
            onClick={onAddMore}
            disabled={busy}
            className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-blue-500 bg-white text-[12px] font-extrabold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            이미지·PDF 더 추가
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 빈 상태 "사용 순서" 가이드 — text-input-board 미러(신규 클래스 접두) ─────
export function IntakeEmptyGuide() {
  const steps = [
    { icon: FileUp, label: "파일 추가" },
    { icon: ClipboardList, label: "시험 정보 입력" },
    { icon: PlayCircle, label: "등록하고 분석 시작" },
  ];
  return (
    <>
      <div className="smoat-exam-empty-guide mx-auto flex w-full max-w-[640px] flex-col rounded-lg border border-slate-200 bg-slate-50/80 p-4">
        {/* pill 은 제목 위 단독 행 — 좁은 레일에서 제목이 pill 옆으로 밀려 어색하게 꺾이는 것 방지 */}
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="inline-flex w-fit items-center gap-1.5 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white">
            <PlayCircle className="size-3.5" aria-hidden="true" />
            사용 순서
          </div>
          <h3 className="smoat-exam-empty-guide__title min-w-0 text-[15px] font-extrabold leading-snug text-slate-950">
            시험지 사진을 올리면 문항 분석이 시작돼요
          </h3>
          {/* 필기 허용 안심 카피 — 분석은 인쇄된 문항 기준이라 학생 필기·채점 흔적이
              있어도 무방(마킹 실물 사진 실측으로 검증됨). "깨끗한 원본" 오해 방지. */}
          <p className="min-w-0 text-[12px] leading-relaxed text-slate-500">
            학생 필기나 채점 표시가 있는 시험지도 괜찮습니다 — 인쇄된 문항을
            기준으로 분석합니다.
          </p>
        </div>
        <ol className="smoat-exam-empty-guide__steps mt-3 grid gap-2">
          {steps.map((step, index) => (
            <li
              key={step.label}
              className="smoat-exam-empty-guide__step flex min-w-0 items-center gap-2 rounded-md bg-white px-2.5 py-2 text-[12px] font-bold text-slate-700 ring-1 ring-slate-200"
            >
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-extrabold text-blue-700">
                {index + 1}
              </span>
              <step.icon className="size-3.5 text-blue-600" aria-hidden="true" />
              <span className="min-w-0 leading-snug">{step.label}</span>
            </li>
          ))}
        </ol>
      </div>
      {/* 레일 폭에 따른 가이드 반응형 — text-input-board 의 container query 미러 */}
      <style>{`
        .smoat-exam-review-scroll {
          container-type: inline-size;
        }
        .smoat-exam-empty-guide {
          margin-top: clamp(0.75rem, 5cqw, 1.5rem);
          padding: clamp(0.75rem, 4cqw, 1rem);
        }
        .smoat-exam-empty-guide__steps {
          grid-template-columns: 1fr;
        }
        @container (max-width: 359px) {
          .smoat-exam-empty-guide__title {
            flex-basis: 100%;
            font-size: 13px;
          }
          .smoat-exam-empty-guide__step {
            padding-block: 0.45rem;
          }
        }
        @container (min-width: 420px) {
          .smoat-exam-empty-guide__title {
            flex-basis: 100%;
          }
          .smoat-exam-empty-guide__steps {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .smoat-exam-empty-guide__step {
            align-items: flex-start;
            flex-direction: column;
            min-height: 4.5rem;
          }
        }
        @container (min-width: 560px) {
          .smoat-exam-empty-guide__title {
            flex-basis: auto;
          }
          .smoat-exam-empty-guide__step {
            min-height: 4rem;
          }
        }
      `}</style>
    </>
  );
}

// ── 우 레일 폭 조절 — text-input-board 의 훅/핸들 미러(키만 exam-report) ─────
const RAIL_W_KEY = "smoat:exam-report:rail-width";
const RAIL_W_DEFAULT = 420;
const clampRailW = (w: number) => Math.min(760, Math.max(320, Math.round(w)));

export function useRailWidth() {
  const [railWidth, setRailWidth] = useState<number>(() => {
    if (typeof window === "undefined") return RAIL_W_DEFAULT;
    const raw = window.localStorage.getItem(RAIL_W_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isNaN(n) ? RAIL_W_DEFAULT : clampRailW(n);
  });
  const beginRailResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startW = railWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      let latest = startW;
      const move = (e: PointerEvent) => {
        e.preventDefault();
        // 왼쪽으로 끌면 우측 고정 레일이 넓어진다.
        latest = clampRailW(startW - (e.clientX - startX));
        setRailWidth(latest);
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        try {
          window.localStorage.setItem(RAIL_W_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [railWidth],
  );
  return { railWidth, beginRailResize };
}

export function RailResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      title="드래그하여 시험 정보 패널 폭 조절"
      aria-label="시험 정보 패널 폭 조절"
      className="group/rhandle no-print hidden h-full min-h-0 w-3 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 border-l border-slate-100 bg-slate-50 py-1 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 lg:flex"
    >
      <GripVertical
        className="size-3 opacity-50 transition-opacity group-hover/rhandle:opacity-80"
        aria-hidden="true"
      />
      <span style={{ writingMode: "vertical-rl" }}>시험 정보</span>
    </button>
  );
}

// ── 풀폭 CTA — text-input-board StartButton 미러 + 과금 뱃지 ────────────────
export function IntakeCta({
  disabled,
  busy,
  busyLabel,
  pageCount,
  isError,
  onClick,
}: {
  disabled: boolean;
  busy: boolean;
  busyLabel: string;
  pageCount: number;
  isError: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      // aria-disabled — 비활처럼 보이되 클릭은 살려, handleStart 의 검증 토스트가
      // 막힌 사유(페이지 없음/제목 없음)를 안내한다.
      aria-disabled={disabled}
      className={
        "inline-flex h-12 w-full items-center justify-center rounded-lg border text-[14px] font-extrabold text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
        (busy
          ? "cursor-wait border-blue-600 bg-blue-600"
          : disabled
            ? "cursor-not-allowed border-blue-200 bg-blue-300"
            : "cursor-pointer border-blue-600 bg-blue-600 hover:bg-blue-700")
      }
    >
      {busy ? (
        <>
          <Loader2 className="mr-2 size-5 animate-spin" aria-hidden="true" />
          {busyLabel}
        </>
      ) : (
        <>
          <PlayCircle className="mr-2 size-5" aria-hidden="true" />
          {isError ? "다시 시도" : "등록하고 분석 시작"}
          {pageCount > 0 ? ` (${pageCount}페이지)` : ""}
          {/* 과금 안내 — CreditCostChip 은 고정액 전용이라 동일 룩의 span 으로 표기.
              단가는 lib/exam-report/types 의 계약(문항당 1cr · 최소 15cr)을 따른다. */}
          <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
            문항당 ◈1 · 최소 {EXAM_ANALYSIS_MIN_CREDITS}
          </span>
        </>
      )}
    </button>
  );
}
