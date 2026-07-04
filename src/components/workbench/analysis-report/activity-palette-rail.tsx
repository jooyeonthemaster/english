import { ChevronLeft, ChevronRight, GripVertical, ImagePlus, Plus } from "lucide-react";
import type { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { ActivityPalettePanel } from "./activity-palette-modal";
import { WebtoonPickerModal } from "./webtoon-picker-modal";

type Props = {
  /**
   * PRIME_KO(국어 학습지) 편집 컨텍스트 — 영어 전용인 학습 활동 카탈로그와
   * 단어 시험지 슬롯을 숨기고, 과목 중립인 웹툰 삽입만 남긴다(라벨도 국어 문맥).
   * 미전달(영어 기본)이면 기존 렌더와 동일 — 무회귀.
   */
  koMode?: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  activityWidth: number;
  widthDragging: boolean;
  onStartActivityDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  /** 드래그(폭조절) 직후의 click 인지 — true 면 토글을 생략한다. */
  onConsumeDragClick: () => boolean;
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
  koMode = false,
  collapsed,
  onToggleCollapsed,
  activityWidth,
  widthDragging,
  onStartActivityDrag,
  onConsumeDragClick,
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
  // 국어(PRIME_KO) 편집기: 웹툰 삽입만 남으므로 패널 라벨을 콘텐츠 삽입 문맥으로.
  const panelTitle = koMode ? "콘텐츠 삽입 패널" : "학습 활동 패널";
  const panelSubtitle = koMode
    ? "웹툰 이미지 블록 추가"
    : "지문으로 즉석 생성 · AI 없음";
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
              <p className="truncate text-[12px] font-black text-slate-800">{panelTitle}</p>
              <p className="truncate text-[10.5px] font-semibold text-slate-400">{panelSubtitle}</p>
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
              subject={koMode ? "KOREAN" : undefined}
              onClose={onCloseWebtoonPicker}
              onPick={onPickWebtoon}
            />
            {/* 영어 전용 학습 활동 카탈로그(빈칸·직독직해·어순·어휘) — KO 보고서에는 비노출 */}
            {koMode ? null : (
              <ActivityPalettePanel
                report={report}
                onPick={onPickActivity}
                activityCounts={activityCounts}
                onToggleOffKind={onToggleOffKind}
                vocabTestSlot={vocabTestSlot}
              />
            )}
            </div>
          </div>
        </aside>
      </div>
      {/* 학습 활동 세로 탭 = 여닫기 + 폭조절 겸용 핸들(시험지 생성 UI와 동일).
          펼친 상태: 드래그로 폭 조절, 클릭으로 닫기. 접힌 상태: 클릭으로 열기. */}
      <button
        type="button"
        onPointerDown={collapsed ? undefined : onStartActivityDrag}
        onClick={() => {
          if (!collapsed && onConsumeDragClick()) return;
          onToggleCollapsed();
        }}
        title={collapsed ? `${panelTitle} 열기` : "드래그하여 폭 조절 · 클릭하여 닫기"}
        aria-label={collapsed ? `${panelTitle} 열기` : `${panelTitle} 닫기`}
        aria-expanded={!collapsed}
        className={cn(
          "group/lhandle no-print hidden h-full min-h-0 w-5 shrink-0 touch-none select-none flex-col items-center justify-center gap-1 border-r border-slate-200 bg-white/80 py-2 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600 lg:flex",
          !collapsed && "cursor-col-resize",
        )}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
        <span style={{ writingMode: "vertical-rl" }}>{panelTitle}</span>
        {!collapsed ? (
          <GripVertical className="h-3 w-3 opacity-40 transition-opacity group-hover/lhandle:opacity-70" />
        ) : null}
      </button>
    </>
  );
}
