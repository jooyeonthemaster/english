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
  /**
   * 파이널 원페이지 편집 컨텍스트 — 부제를 파이널 문맥(전면 시트 뒤 별지 추가)으로 바꾸고
   * 헤더 아래에 1줄 안내 스트립을 얹는다. 카탈로그·웹툰·단어시험지 슬롯 구성은 그대로.
   * 미전달(기본 학습지)이면 기존 렌더와 동일 — 무회귀.
   */
  finalContext?: boolean;
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
  /** 활동별 데이터 가용성 — 팔레트 패널로 그대로 전달(ok:false 카드 비활성 + 사유). */
  availability?: ComponentProps<typeof ActivityPalettePanel>["availability"];
  vocabTestSlot: ReactNode;
};

export function ActivityPaletteRail({
  koMode = false,
  finalContext = false,
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
  availability,
  vocabTestSlot,
}: Props) {
  // 국어(PRIME_KO) 편집기: 웹툰 삽입만 남으므로 패널 라벨을 콘텐츠 삽입 문맥으로.
  const panelTitle = koMode ? "콘텐츠 삽입 패널" : "학습 활동 패널";
  const panelSubtitle = koMode
    ? "웹툰 이미지 블록 추가"
    : finalContext
      ? "전면 시트 뒤 페이지로 추가 · AI 없음"
      : "지문으로 즉석 생성 · AI 없음";
  return (
    <>
      {/* data-panel-key: usePanelWidths 드래그 고속 경로 앵커 — 컨테이너·aside 둘 다
          activityWidth 를 쓰므로 드래그 중 style.width 를 둘 다 직접 기록한다. */}
      <div
        aria-hidden={collapsed}
        data-panel-key="activity"
        className="no-print flex h-full min-h-0 shrink-0 overflow-hidden"
        style={{
          width: collapsed ? 0 : activityWidth,
          transition: widthDragging ? "none" : "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <aside
          data-panel-key="activity"
          style={{ width: activityWidth }}
          className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white"
        >
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3.5">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-black text-slate-800">{panelTitle}</p>
              <p className="truncate text-[10.5px] font-semibold text-slate-400">{panelSubtitle}</p>
            </div>
          </div>
          {/* 파이널 문맥 안내 — 본편 1장 불변·추가물은 뒤 별지 계약을 1줄로 고지
              (부제·패널 인트로와의 3중첩 방지 — 인트로는 hideIntro 로 함께 제거). */}
          {finalContext ? (
            <p className="shrink-0 border-b border-slate-100 bg-slate-50/60 px-3.5 py-2 text-[11px] leading-relaxed text-slate-500">
              본편 1장 유지 · 추가한 활동·웹툰은{" "}
              <b className="font-semibold text-slate-600">2페이지부터 별지</b>로 붙어요
            </p>
          ) : null}
          {/* ══ [E34-R3] 단어 시험지 고정 밴드는 **철거**됐다 ═══════════════════
              구 구조: 스크롤 영역(dir=rtl div) **바깥**의 `shrink-0` 파란 그라데이션
              밴드. sticky 가 아니라 구조적 고정이었고, 그래서 카드가 섹션 헤더·접기·
              개수 배지·divide-y 행 골격을 통째로 우회해 **혼자 다른 UI** 가 됐다
              (26-08-24 사용자 지적: 「왜 상단 고정이고 지 혼자 UI 가 이상하지?
               이것도 「빈칸/복원」 섹션 바로 위에 있으면 되는 거야」).
              구 근거는 「끝까지 내려도 항상 보인다」 하나였는데, 상단 고정을 요구한
              스펙은 **0건**이었고 정작 카탈로그 정본 주석은 아직도 「팔레트 **하단**」
              이라 적고 있었다 — 비준된 적 없는 위치였다.
              → 이제 아래 `ActivityPalettePanel` 의 `leadingSection` 으로 내려가
                스크롤 영역 **안**에서 다른 활동과 같은 섹션 문법을 쓴다.
              ⚠ koMode 이중 가드는 사라지지 않았다 — 그 자리도 함께 옮겼다(아래).
                안 옮기면 국어 편집기에 빈 「어휘」 헤더가 샌다. */}
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
            {/* 영어 전용 학습 활동 카탈로그(빈칸·직독직해·어순) — KO 보고서에는 비노출.
                단어 시험지는 위 고정 밴드가 소유하므로 여기로 내려보내지 않는다(중복 노출 금지). */}
            {koMode ? null : (
              <ActivityPalettePanel
                report={report}
                onPick={onPickActivity}
                activityCounts={activityCounts}
                onToggleOffKind={onToggleOffKind}
                availability={availability}
                // 파이널: 헤더 부제+안내 스트립이 같은 내용(즉석 생성·AI 없음·별지)을 이미
                // 고지 — 패널 인트로 중복 제거. 기본 문서(false)는 기존 렌더와 동일.
                hideIntro={finalContext}
                // ── [E34-R3] 단어 시험지를 「빈칸/복원」 **바로 위** 섹션으로 ───────
                // 카탈로그 섹션과 **같은 크롬**(rounded-xl border + 헤더 + 개수 배지)을
                // 쓴다. 크롬을 여기서 복제하지 않고 패널이 그리는 헤더를 쓰는 것이
                // leadingSection 계약의 요점이다(두 벌이 되면 조용히 표류한다).
                // ⚠ 섹션 이름은 「어휘」 — CATEGORY_ORDER 에 이미 예약된 어휘장이라
                //   다른 섹션 제목과 문법이 통일된다.
                // ⚠ 접기 토글을 달지 않았다: 항목이 1개뿐이라 헤더=행 중복이고,
                //   패널의 collapsedSections 는 카탈로그 카테고리 키 전용이다.
                //   달려면 그 state 를 이 섹션까지 확장해야 하는데 이득이 없다.
                // ⚠ koMode 가드가 여기서도 산다 — `koMode ? null :` 분기 안이라
                //   국어 편집기에는 이 섹션 자체가 렌더되지 않는다(빈 헤더 누수 0).
                leadingSection={
                  vocabTestSlot ? (
                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex w-full items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-left">
                        <span className="min-w-0 flex-1 truncate text-[12px] font-black text-slate-700">
                          어휘
                        </span>
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums text-slate-400">
                          1
                        </span>
                      </div>
                      {vocabTestSlot}
                    </section>
                  ) : null
                }
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
