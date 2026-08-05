"use client";

import { ListTree } from "lucide-react";
import { useState } from "react";

import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { ActivityToggleSwitch } from "./activity-palette-modal";
import type { OutlineEntry } from "./report-sections";

/**
 * 목차의 두 번째 축 — '삽입한 블록'(학습 활동·웹툰 이미지·자유 텍스트·여백).
 * 섹션(hiddenSections 슬롯키)과 달리 이쪽은 blockMeta[id].hidden 축이다.
 * 커스텀 블록은 헤더 슬롯을 만들지 않으므로 섹션 번호를 소비하지 않는다.
 */
export type OutlineCustomEntry = {
  id: string;
  label: string;
  hidden: boolean;
};

/** 마지막 남은 섹션을 끄려 할 때 보여줄 이유(스위치 title). */
const LAST_SECTION_HINT = "마지막 남은 섹션이라 끌 수 없어요 — 본문이 통째로 비어버립니다.";

/**
 * 섹션 목차 팝오버 — 상단바 좌측 슬롯(outlineSlot)에 꽂혀 편집기 문서의
 * '헤더 슬롯' 목록을 보여주고, 섹션/삽입 블록을 비파괴로 켜고 끈다.
 *
 * 설계 메모
 *  · 목록·번호·제목은 전부 reportOutline()(report-sections/section-slots)이 계산한
 *    최종 표시값이다. 여기서 라벨 폴백을 다시 하지 않는다(이중 진실원 금지).
 *  · 토글은 부모(편집기)의 setReport 히스토리 reducer 를 타므로 Ctrl+Z 로 되돌아간다.
 *  · 팝오버 껍데기는 공용 Radix Popover 재사용 — 외부 클릭/Esc/포커스 복귀가 이미 검증돼 있다.
 */
export function SectionOutlinePopover({
  entries,
  customEntries,
  pageCount,
  onToggleSection,
  onToggleCustom,
  onJump,
}: {
  entries: OutlineEntry[];
  customEntries: OutlineCustomEntry[];
  /** 트리거 칩에 노출할 총 페이지 수 — 모바일은 좌측 페이지 레일이 숨겨져 여기가 유일한 표시처다. */
  pageCount: number;
  onToggleSection: (key: string) => void;
  onToggleCustom: (id: string) => void;
  onJump: (blockId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const onCount = entries.filter((entry) => !entry.hidden).length;
  const offCount = entries.length - onCount + customEntries.filter((entry) => entry.hidden).length;
  // 마지막 하나까지 끄면 본문이 빈 문서가 된다 — 그 항목의 OFF 만 막는다(켜기는 항상 허용).
  const lockLastSection = onCount <= 1;

  const isEmpty = entries.length === 0 && customEntries.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          title="목차 — 섹션 켜고 끄기"
          className={cn(
            "flex h-8 min-w-0 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11.5px] font-bold transition-colors",
            open
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
          )}
        >
          <ListTree className="size-3.5 shrink-0" aria-hidden />
          {/* 모바일(<sm)은 상단바 우측 컨트롤과 폭을 다투므로 라벨을 접는다. */}
          <span className="hidden sm:inline">목차</span>
          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-semibold tabular-nums text-slate-500">
            {pageCount || 1}
            <span className="hidden sm:inline">페이지</span>
            <span className="sm:hidden">p</span>
          </span>
          {offCount > 0 ? (
            <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-semibold tabular-nums text-amber-700">
              {offCount}
              <span className="hidden sm:inline">개 꺼짐</span>
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        // 인쇄 규칙(.no-print 강제 숨김)에 편승 — 편집기 컨텍스트에서 뜨는 레이어는 지면에 나오면 안 된다.
        className="no-print w-[302px] max-w-[calc(100vw-1.5rem)] border-slate-200 p-0"
      >
        <PopoverArrow />
        <div className="border-b border-slate-100 px-3 py-2.5">
          <p className="text-[12px] font-black text-slate-800">목차</p>
          <p className="mt-0.5 text-[10.5px] font-medium leading-relaxed text-slate-500">
            끈 항목은 <span className="font-bold text-slate-600">인쇄물에서 통째로 빠지고</span> 남은 섹션
            번호가 다시 매겨집니다. 제목을 누르면 그 위치로 이동해요.
          </p>
        </div>

        <div className="max-h-[52vh] space-y-1 overflow-y-auto p-2 [scrollbar-gutter:stable]">
          {isEmpty ? (
            <p className="px-1 py-6 text-center text-[11px] font-semibold text-slate-400">
              켜고 끌 섹션이 없습니다.
            </p>
          ) : null}

          {entries.map((entry) => {
            const blocked = !entry.hidden && lockLastSection;
            return (
              <div
                key={entry.key}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
                  entry.hidden
                    ? "border-slate-200 bg-slate-50"
                    : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40",
                )}
              >
                <button
                  type="button"
                  disabled={entry.hidden}
                  onClick={() => {
                    onJump(entry.headId);
                    setOpen(false);
                  }}
                  title={entry.hidden ? "꺼진 섹션 — 켜면 이동할 수 있어요" : `${entry.titleKo}(으)로 이동`}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                >
                  <span
                    className={cn(
                      "w-5 shrink-0 text-[11px] font-black tabular-nums",
                      entry.hidden ? "text-slate-300" : "text-blue-600",
                    )}
                  >
                    {entry.no ? String(entry.no).padStart(2, "0") : "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[12px] font-bold",
                        entry.hidden ? "text-slate-400 line-through" : "text-slate-800",
                      )}
                    >
                      {entry.titleKo}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-[10px] font-medium italic tracking-wide",
                        entry.hidden ? "text-slate-300" : "text-slate-400",
                      )}
                    >
                      {entry.titleEn}
                    </span>
                  </span>
                </button>
                <span className={cn("flex shrink-0", blocked && "cursor-not-allowed opacity-40")}>
                  <ActivityToggleSwitch
                    on={!entry.hidden}
                    title={
                      blocked
                        ? LAST_SECTION_HINT
                        : entry.hidden
                          ? `${entry.titleKo} 켜기`
                          : `${entry.titleKo} 끄기`
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      if (blocked) return;
                      onToggleSection(entry.key);
                    }}
                  />
                </span>
              </div>
            );
          })}

          {customEntries.length ? (
            <>
              <p className="px-1 pb-0.5 pt-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                삽입한 블록
              </p>
              {customEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
                    entry.hidden
                      ? "border-slate-200 bg-slate-50"
                      : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40",
                  )}
                >
                  <button
                    type="button"
                    disabled={entry.hidden}
                    onClick={() => {
                      onJump(entry.id);
                      setOpen(false);
                    }}
                    title={entry.hidden ? "꺼진 블록 — 켜면 이동할 수 있어요" : `${entry.label}(으)로 이동`}
                    className={cn(
                      "min-w-0 flex-1 truncate text-left text-[12px] font-bold disabled:cursor-default",
                      entry.hidden ? "text-slate-400 line-through" : "text-slate-800",
                    )}
                  >
                    {entry.label}
                  </button>
                  <ActivityToggleSwitch
                    on={!entry.hidden}
                    title={entry.hidden ? `${entry.label} 켜기` : `${entry.label} 끄기`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleCustom(entry.id);
                    }}
                  />
                </div>
              ))}
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
