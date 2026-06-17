"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, X } from "lucide-react";

import type { AnalysisReport, ActivityKind } from "@/lib/passage-report/analysis-report/schema";
import {
  ACTIVITY_CATALOG,
  activityPreviewLine,
  type ActivityCatalogEntry,
} from "@/lib/passage-report/analysis-report/study-activities";

const CATEGORY_ORDER: ActivityCatalogEntry["category"][] = [
  "빈칸/복원",
  "직독직해",
  "어순/배열",
  "어휘",
];

function groupedCatalog() {
  return CATEGORY_ORDER.map((cat) => ({
    cat,
    entries: ACTIVITY_CATALOG.filter((e) => e.category === cat),
  })).filter((g) => g.entries.length > 0);
}

/**
 * 학습 활동 팔레트 (인라인) — 편집 패널의 '활동' 탭에 그대로 들어가는 본문.
 * 타일마다 현재 지문 첫 문장으로 만든 라이브 미니 프리뷰를 보여준다. AI 호출 없음.
 *
 * 토글 동작(activityCounts 가 주어졌을 때):
 *  - 단순 온/오프 스위치. 카드를 누르면 토글된다.
 *    꺼짐 → 문서에 추가(onPick), 켜짐 → 그 유형 블록 전부 제거(onToggleOffKind).
 */
export function ActivityPalettePanel({
  report,
  onPick,
  columns = 1,
  vocabTestSlot,
  activityCounts,
  onToggleOffKind,
}: {
  report: AnalysisReport;
  onPick: (kind: ActivityKind) => void;
  columns?: 1 | 2;
  vocabTestSlot?: ReactNode;
  /** 문서에 추가된 유형별 블록 개수. 미전달 시 토글 UI 없이 기존 '추가' 동작만. */
  activityCounts?: Partial<Record<ActivityKind, number>>;
  /** ON 스위치/카드 클릭 — 그 유형의 활동 블록을 문서에서 전부 제거. */
  onToggleOffKind?: (kind: ActivityKind) => void;
}) {
  const byCategory = groupedCatalog();
  // 섹션 여닫힘 — 편집 패널 PanelSection 과 동일한 셰브론 토글. 기본 펼침.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-3">
      <p className="rounded-md border border-slate-100 bg-white px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
        추출된 지문 데이터로 즉석 생성 · <b className="font-semibold text-slate-600">AI 없음</b> · 무제한 다시 섞기.
        카드를 누르면 문서에 추가되고 바로 설정이 열려요.
      </p>
      {byCategory.map((group) => {
        const collapsed = collapsedSections.has(group.cat);
        return (
          <section
            key={group.cat}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <PaletteSectionHeader
              title={group.cat}
              count={group.entries.length}
              collapsed={collapsed}
              onToggle={() => toggleSection(group.cat)}
            />
            {!collapsed ? (
              columns === 2 ? (
                <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2">
                  {group.entries.map((entry) => (
                    <ActivityTile
                      key={entry.kind}
                      report={report}
                      entry={entry}
                      onPick={onPick}
                      count={activityCounts?.[entry.kind] ?? 0}
                      onToggleOff={onToggleOffKind}
                    />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {group.entries.map((entry) => (
                    <ActivityTile
                      key={entry.kind}
                      report={report}
                      entry={entry}
                      onPick={onPick}
                      count={activityCounts?.[entry.kind] ?? 0}
                      onToggleOff={onToggleOffKind}
                      grouped
                    />
                  ))}
                </div>
              )
            ) : null}
          </section>
        );
      })}
      {vocabTestSlot ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <PaletteSectionHeader
            title="어휘"
            collapsed={collapsedSections.has("__vocab")}
            onToggle={() => toggleSection("__vocab")}
          />
          {!collapsedSections.has("__vocab") ? <div className="p-2.5">{vocabTestSlot}</div> : null}
        </section>
      ) : null}
    </div>
  );
}

/**
 * 팔레트 카테고리 섹션 헤더 — 편집 패널 PanelSection 과 통일된 셰브론 여닫힘 토글.
 * 헤더 전체가 토글 버튼이라 안쪽 셰브론은 장식(span)으로 둔다.
 */
function PaletteSectionHeader({
  title,
  count,
  collapsed,
  onToggle,
}: {
  title: string;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      title={`${title} ${collapsed ? "펼치기" : "접기"}`}
      className="flex w-full items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-left transition-colors hover:bg-slate-100/70"
    >
      <span className="min-w-0 flex-1 truncate text-[12px] font-black text-slate-700">{title}</span>
      {typeof count === "number" ? (
        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums text-slate-400">
          {count}
        </span>
      ) : null}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400" aria-hidden>
        {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

/**
 * 학습 활동 팔레트 모달 — (레거시) 전체 화면 모달 버전. 편집 패널 '활동' 탭으로 대체됨.
 * 다른 진입점에서 모달이 필요할 때를 위해 유지한다.
 */
export function ActivityPaletteModal({
  report,
  onPick,
  onClose,
}: {
  report: AnalysisReport;
  onPick: (kind: ActivityKind) => void;
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold text-slate-800">학습 활동 추가</h3>
            <p className="mt-0.5 text-[11.5px] text-slate-500">추가할 활동을 고르세요.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <ActivityPalettePanel report={report} onPick={onPick} columns={2} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * 팔레트 카드 헤더용 ON 스위치 — 활성 유형을 한 번에 끈다(stopPropagation 으로
 * 카드 클릭과 분리). 카드(role="button") 안에 중첩되므로 실제 <button> 으로 둔다.
 */
export function ActivityToggleSwitch({
  on,
  title,
  onClick,
}: {
  on: boolean;
  title: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    // 큰 글씨(smoat-large-ui) 모드가 button.w-7 의 min-width 를 키워 폭이 틀어진다.
    // 편집 패널 스위치(span 트랙)와 동일하게, 크기 클래스는 내부 span 에만 두고 버튼엔 두지 않는다.
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={title}
      aria-label={title}
      onClick={onClick}
      className="inline-flex shrink-0"
    >
      <span
        aria-hidden="true"
        className={`relative block h-4 w-7 shrink-0 rounded-full transition-colors ${
          on ? "bg-sky-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute left-0 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
            on ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function ActivityTile({
  report,
  entry,
  onPick,
  count = 0,
  onToggleOff,
  grouped = false,
}: {
  report: AnalysisReport;
  entry: ActivityCatalogEntry;
  onPick: (kind: ActivityKind) => void;
  count?: number;
  onToggleOff?: (kind: ActivityKind) => void;
  /** 묶음(섹션 카드) 안의 행으로 렌더 — 개별 테두리 없이 구분선으로만 나뉜다. */
  grouped?: boolean;
}) {
  const preview = activityPreviewLine(report, entry.kind);
  const disabled = !entry.enabled;
  const added = count > 0;

  // 단순 온/오프 토글 — 카드를 누르면 켜고(추가) 끈다(전부 제거).
  const toggle = () => {
    if (disabled) return;
    if (added) onToggleOff?.(entry.kind);
    else onPick(entry.kind);
  };
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  };

  return (
    // 헤더의 스위치가 실제 <button> 이라 카드 자체는 div[role=button] 으로(중첩 버튼 금지).
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={toggle}
      onKeyDown={handleCardKeyDown}
      title={disabled ? undefined : added ? `${entry.labelKo} 끄기` : `${entry.labelKo} 켜기`}
      className={
        grouped
          ? // 묶음 행: 테두리 없이 구분선(divide-y)으로만 나뉘는 행. added 는 옅은 파랑 배경으로 표시.
            `group flex flex-col gap-1.5 px-3 py-2.5 text-left transition-colors ${
              disabled
                ? "cursor-not-allowed opacity-60"
                : added
                  ? "cursor-pointer bg-blue-50/40 hover:bg-blue-50/70"
                  : "cursor-pointer hover:bg-slate-50/80"
            }`
          : `group flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors ${
              disabled
                ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
                : added
                  ? "cursor-pointer border-blue-200 bg-blue-50/30 hover:border-blue-300 hover:bg-blue-50/60"
                  : "cursor-pointer border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
            }`
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-bold text-slate-800">{entry.labelKo}</span>
        {disabled ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-400">곧 추가</span>
        ) : (
          <ActivityToggleSwitch
            on={added}
            title={added ? `${entry.labelKo} 끄기` : `${entry.labelKo} 켜기`}
            onClick={(event) => {
              event.stopPropagation();
              toggle();
            }}
          />
        )}
      </div>
      <p className="text-[11px] leading-snug text-slate-500">{entry.description}</p>
      <div className="mt-0.5 rounded-md border border-slate-100 bg-slate-50/80 px-2 py-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          {added ? "켜짐 — 다시 누르면 꺼져요" : "미리보기"}
        </span>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-700">{preview}</p>
      </div>
    </div>
  );
}
