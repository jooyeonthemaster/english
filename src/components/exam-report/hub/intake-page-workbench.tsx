"use client";

// ============================================================================
// 학생 시험 리포트 — 인테이크 페이지 작업대 2종(intake-upload-parts 에서 분리, 26-09-03)
//
// · PageWorkbench — 넓은 호스트(컨테이너 ≥ INTAKE_STACK_BREAKPOINT): 좌 96px
//   썸네일 레일 + 중앙 큰 미리보기(inline-crop-board 크롭보드 미러). 우 레일이
//   옆에 선다(허브 1274px).
// · PageGrid — 좁은 호스트(스튜디오 중앙 열 ~670~770px): 툴바 + 페이지 타일
//   그리드(auto-fill) + 선택 페이지 미리보기. 시험 정보·CTA 는 패널이 아래에
//   쌓는다. 26-09-03 실측: 스튜디오 770px 에서 2컬럼은 미리보기 230px·레일
//   380px 로 양쪽 다 죽고 CTA 라벨이 잘렸다("이건 왜 개선을 안 해").
// 타일(번호·삭제·앞뒤 이동)은 PageTile 하나를 두 작업대가 공유한다.
// ============================================================================

import { ChevronDown, ChevronUp, Layers, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UploadSlot } from "./upload-helpers";

interface PageActions {
  busy: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}

/** 페이지 타일 — 번호 배지 + hover 삭제/앞뒤 이동. 레일·그리드 공용. */
function PageTile({
  slot,
  index,
  total,
  isCur,
  busy,
  onSelect,
  onRemove,
  onMove,
  className,
  imgClassName,
}: PageActions & {
  slot: UploadSlot;
  index: number;
  total: number;
  isCur: boolean;
  className?: string;
  imgClassName: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(slot.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(slot.id);
        }
      }}
      title={`${index + 1}페이지 보기`}
      className={cn(
        "group relative block cursor-pointer overflow-hidden rounded-md border bg-white transition-colors",
        isCur
          ? "border-blue-500 ring-2 ring-blue-300"
          : "border-slate-200 hover:border-blue-300",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slot.previewUrl}
        alt={`페이지 ${index + 1}`}
        className={cn("block w-full bg-white object-contain", imgClassName)}
        draggable={false}
      />
      <span
        className={cn(
          "absolute left-1 top-1 inline-flex size-4 items-center justify-center rounded text-[9px] font-bold",
          isCur ? "bg-blue-600 text-white" : "bg-slate-900/70 text-white",
        )}
      >
        {index + 1}
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
            aria-label={`페이지 ${index + 1} 삭제`}
          >
            <X className="size-3" aria-hidden="true" />
          </button>
          {/* 순서 변경 — 타일 순서(=페이지 순서) 앞/뒤 이동 */}
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-gradient-to-t from-slate-900/70 to-transparent p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMove(index, -1);
              }}
              disabled={index === 0}
              className="rounded bg-white/90 p-0.5 text-slate-700 disabled:opacity-30"
              aria-label="앞으로"
            >
              <ChevronUp className="size-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMove(index, 1);
              }}
              disabled={index === total - 1}
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
}

interface WorkbenchProps extends PageActions {
  slots: UploadSlot[];
  selectedId: string | null;
  onClearAll: () => void;
  onAddMore: () => void;
}

/** 선택 슬롯이 삭제됐으면 첫 페이지로 폴백(findIndex -1 → 0). */
function currentOf(slots: UploadSlot[], selectedId: string | null) {
  const index = Math.max(
    0,
    slots.findIndex((s) => s.id === selectedId),
  );
  return { index, slot: slots[index] };
}

// ── 넓은 호스트 — 좌 96px 썸네일 레일 + 중앙 큰 미리보기 ─────────────────────
export function PageWorkbench({
  slots,
  busy,
  selectedId,
  onSelect,
  onRemove,
  onMove,
  onClearAll,
  onAddMore,
}: WorkbenchProps) {
  if (slots.length === 0) return null;
  const { index: currentIndex, slot: current } = currentOf(slots, selectedId);
  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex w-24 shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-slate-100 bg-slate-50 p-1.5">
        {slots.map((slot, i) => (
          <PageTile
            key={slot.id}
            slot={slot}
            index={i}
            total={slots.length}
            isCur={i === currentIndex}
            busy={busy}
            onSelect={onSelect}
            onRemove={onRemove}
            onMove={onMove}
            className="w-full shrink-0"
            imgClassName="max-h-28"
          />
        ))}
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-slate-100 px-2.5">
          <span className="truncate text-[10.5px] font-bold text-slate-500">
            {currentIndex + 1} / {slots.length}페이지
            {current?.name ? ` · ${current.name}` : ""}
          </span>
          <ClearAllButton busy={busy} onClick={onClearAll} />
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
          <AddMoreButton
            busy={busy}
            onClick={onAddMore}
            className="h-8 w-full"
          />
        </div>
      </div>
    </div>
  );
}

// ── 좁은 호스트 — 툴바 + 타일 그리드 + 선택 페이지 미리보기(세로 스택) ───────
export function PageGrid({
  slots,
  busy,
  selectedId,
  onSelect,
  onRemove,
  onMove,
  onClearAll,
  onAddMore,
}: WorkbenchProps) {
  if (slots.length === 0) return null;
  const { index: currentIndex, slot: current } = currentOf(slots, selectedId);
  return (
    <div data-intake-page-grid className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] font-bold text-slate-900">
          <Layers
            className="size-4 shrink-0 text-blue-600"
            aria-hidden="true"
          />
          등록할 시험지 {slots.length}페이지
        </span>
        <ClearAllButton busy={busy} onClick={onClearAll} />
        <AddMoreButton
          busy={busy}
          onClick={onAddMore}
          className="ml-auto h-8 px-3"
        />
      </div>

      <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(104px,1fr))]">
        {slots.map((slot, i) => (
          <PageTile
            key={slot.id}
            slot={slot}
            index={i}
            total={slots.length}
            isCur={i === currentIndex}
            busy={busy}
            onSelect={onSelect}
            onRemove={onRemove}
            onMove={onMove}
            imgClassName="aspect-[3/4]"
          />
        ))}
      </div>

      {/* 선택 페이지 미리보기 — 타일(~110px)로는 판독 불가라 사진 상태 확인용으로 둔다 */}
      {current ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex h-8 items-center border-b border-slate-100 px-2.5">
            <span className="truncate text-[10.5px] font-bold text-slate-500">
              {currentIndex + 1} / {slots.length}페이지
              {current.name ? ` · ${current.name}` : ""}
            </span>
          </div>
          <div className="h-72 bg-slate-50/50 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.previewUrl}
              alt={`페이지 ${currentIndex + 1} 미리보기`}
              className="h-full w-full object-contain"
              draggable={false}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClearAllButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[10.5px] text-slate-400 transition-colors hover:text-rose-500 disabled:opacity-50"
    >
      <Trash2 className="size-3" aria-hidden="true" />
      모두 지우기
    </button>
  );
}

function AddMoreButton({
  busy,
  onClick,
  className,
}: {
  busy: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-blue-500 bg-white text-[12px] font-extrabold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <Plus className="size-3.5" aria-hidden="true" />
      이미지·PDF 더 추가
    </button>
  );
}
