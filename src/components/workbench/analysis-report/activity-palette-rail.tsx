import { ChevronLeft, ChevronRight, ImagePlus, Plus } from "lucide-react";
import type { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { ActivityPalettePanel } from "./activity-palette-modal";
import { WebtoonPickerModal } from "./webtoon-picker-modal";

type Props = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  activityWidth: number;
  widthDragging: boolean;
  onStartActivityDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  webtoonPickerOpen: boolean;
  passageId: string;
  onOpenWebtoonPicker: () => void;
  onCloseWebtoonPicker: () => void;
  onPickWebtoon: ComponentProps<typeof WebtoonPickerModal>["onPick"];
  report: ComponentProps<typeof ActivityPalettePanel>["report"];
  onPickActivity: ComponentProps<typeof ActivityPalettePanel>["onPick"];
  activityCounts: ComponentProps<typeof ActivityPalettePanel>["activityCounts"];
  onToggleOffKind: ComponentProps<typeof ActivityPalettePanel>["onToggleOffKind"];
  vocabTestSlot: ReactNode;
};

export function ActivityPaletteRail({
  collapsed,
  onToggleCollapsed,
  activityWidth,
  widthDragging,
  onStartActivityDrag,
  webtoonPickerOpen,
  passageId,
  onOpenWebtoonPicker,
  onCloseWebtoonPicker,
  onPickWebtoon,
  report,
  onPickActivity,
  activityCounts,
  onToggleOffKind,
  vocabTestSlot,
}: Props) {
  return (
    <>
      <div
        aria-hidden={collapsed}
        className="no-print flex h-full min-h-0 shrink-0 overflow-hidden"
        style={{
          width: collapsed ? 0 : activityWidth,
          transition: widthDragging ? "none" : "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <aside
          style={{ width: activityWidth }}
          className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white"
        >
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3.5">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-black text-slate-800">학습 활동 패널</p>
              <p className="truncate text-[10.5px] font-semibold text-slate-400">지문으로 즉석 생성 · AI 없음</p>
            </div>
          </div>
          {/* dir=rtl 로 스크롤바를 왼쪽에 두고, 내용은 dir=ltr 래퍼로 정상 방향 유지 */}
          <div dir="rtl" className="min-h-0 flex-1 overflow-y-auto p-2.5 [scrollbar-gutter:stable]">
            <div dir="ltr">
            {/* 지문 웹툰 삽입 — 생성한 웹툰을 문서/인쇄물에 이미지로 추가 */}
            <button
              type="button"
              onClick={onOpenWebtoonPicker}
              className="mb-2.5 flex w-full items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/40 px-3 py-2.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/70"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <ImagePlus className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-bold text-slate-800">
                  지문 웹툰 삽입
                </span>
                <span className="block text-[11px] leading-snug text-slate-500">
                  생성한 웹툰을 골라 문서에 추가합니다.
                </span>
              </span>
              <Plus className="size-3.5 shrink-0 text-blue-500" />
            </button>
            <WebtoonPickerModal
              open={webtoonPickerOpen}
              passageId={passageId}
              onClose={onCloseWebtoonPicker}
              onPick={onPickWebtoon}
            />
            <ActivityPalettePanel
              report={report}
              onPick={onPickActivity}
              activityCounts={activityCounts}
              onToggleOffKind={onToggleOffKind}
              vocabTestSlot={vocabTestSlot}
            />
            </div>
          </div>
        </aside>
      </div>
      {/* 학습 활동 세로 탭 — 항상 보임(편집 패널과 동일). 누르면 여닫힘. */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        title={collapsed ? "학습 활동 패널 열기" : "학습 활동 패널 닫기"}
        aria-label={collapsed ? "학습 활동 패널 열기" : "학습 활동 패널 닫기"}
        aria-expanded={!collapsed}
        className="no-print hidden h-full min-h-0 w-5 shrink-0 select-none flex-col items-center justify-center gap-1 border-r border-slate-200 bg-white/80 py-2 text-[11px] font-semibold text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-600 lg:flex"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
        <span style={{ writingMode: "vertical-rl" }}>학습 활동 패널</span>
      </button>
      {/* 학습 활동 폭 조절 핸들 — 펼쳤을 때만(핸들이 오른쪽 모서리) */}
      {!collapsed ? (
        <div
          onPointerDown={onStartActivityDrag}
          title="학습 활동 폭 조절"
          aria-hidden
          className="no-print hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-slate-100 transition-colors hover:bg-blue-200 active:bg-blue-300 lg:block"
        />
      ) : null}
    </>
  );
}
