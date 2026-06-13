"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";

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
 *  - 미추가 유형: 카드 클릭 = 문서에 추가(onPick) + 설정 열림.
 *  - 추가된 유형: 헤더에 ON 스위치(+개수) — 스위치 클릭 = 그 유형 블록 전부 제거,
 *    카드 클릭 = 기존 블록 선택·설정 열기(onFocusKind), ＋ 버튼 = 하나 더 추가.
 */
export function ActivityPalettePanel({
  report,
  onPick,
  columns = 1,
  vocabTestSlot,
  activityCounts,
  onToggleOffKind,
  onFocusKind,
}: {
  report: AnalysisReport;
  onPick: (kind: ActivityKind) => void;
  columns?: 1 | 2;
  vocabTestSlot?: ReactNode;
  /** 문서에 추가된 유형별 블록 개수. 미전달 시 토글 UI 없이 기존 '추가' 동작만. */
  activityCounts?: Partial<Record<ActivityKind, number>>;
  /** ON 스위치 클릭 — 그 유형의 활동 블록을 문서에서 전부 제거. */
  onToggleOffKind?: (kind: ActivityKind) => void;
  /** 추가된 유형의 카드 클릭 — 기존 블록을 선택·스크롤해 설정을 연다. */
  onFocusKind?: (kind: ActivityKind) => void;
}) {
  const byCategory = groupedCatalog();
  return (
    <div className="space-y-3">
      <p className="rounded-md border border-slate-100 bg-white px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
        추출된 지문 데이터로 즉석 생성 · <b className="font-semibold text-slate-600">AI 없음</b> · 무제한 다시 섞기.
        카드를 누르면 문서에 추가되고 바로 설정이 열려요.
      </p>
      {byCategory.map((group) => (
        <section
          key={group.cat}
          className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 shadow-sm"
        >
          <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-2.5 py-2">
            <span className="h-3.5 w-1 shrink-0 rounded-full bg-blue-500" aria-hidden />
            <h4 className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-wider text-slate-600">
              {group.cat}
            </h4>
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums text-slate-400">
              {group.entries.length}
            </span>
          </div>
          <div className={columns === 2 ? "grid grid-cols-1 gap-2 p-2 sm:grid-cols-2" : "grid grid-cols-1 gap-2 p-2"}>
            {group.entries.map((entry) => (
              <ActivityTile
                key={entry.kind}
                report={report}
                entry={entry}
                onPick={onPick}
                count={activityCounts?.[entry.kind] ?? 0}
                onToggleOff={onToggleOffKind}
                onFocusExisting={onFocusKind}
              />
            ))}
          </div>
        </section>
      ))}
      {vocabTestSlot ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-2.5 py-2">
            <span className="h-3.5 w-1 shrink-0 rounded-full bg-blue-500" aria-hidden />
            <h4 className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-wider text-slate-600">어휘</h4>
          </div>
          <div className="p-2">{vocabTestSlot}</div>
        </section>
      ) : null}
    </div>
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
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
        on ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-300 hover:bg-slate-400"
      }`}
    >
      <span
        className={`absolute left-0 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
          on ? "translate-x-3.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ActivityTile({
  report,
  entry,
  onPick,
  count = 0,
  onToggleOff,
  onFocusExisting,
}: {
  report: AnalysisReport;
  entry: ActivityCatalogEntry;
  onPick: (kind: ActivityKind) => void;
  count?: number;
  onToggleOff?: (kind: ActivityKind) => void;
  onFocusExisting?: (kind: ActivityKind) => void;
}) {
  const preview = activityPreviewLine(report, entry.kind);
  const disabled = !entry.enabled;
  const added = count > 0;

  // 추가된 유형의 카드 클릭은 (또 추가가 아니라) 기존 블록 선택·설정 열기.
  const handleCardClick = () => {
    if (disabled) return;
    if (added && onFocusExisting) onFocusExisting(entry.kind);
    else onPick(entry.kind);
  };
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardClick();
    }
  };

  return (
    // 헤더의 스위치·＋가 실제 <button> 이라 카드 자체는 div[role=button] 으로(중첩 버튼 금지).
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      title={
        disabled
          ? undefined
          : added
            ? `${entry.labelKo} 설정 열기 (문서의 블록으로 이동)`
            : `${entry.labelKo} 추가`
      }
      className={`group flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors ${
        disabled
          ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
          : added
            ? "cursor-pointer border-blue-200 bg-blue-50/30 hover:border-blue-300 hover:bg-blue-50/60"
            : "cursor-pointer border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-bold text-slate-800">{entry.labelKo}</span>
        {disabled ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-400">곧 추가</span>
        ) : added ? (
          <span className="flex shrink-0 items-center gap-1.5">
            {count > 1 ? (
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums text-blue-700">
                {count}개
              </span>
            ) : null}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPick(entry.kind);
              }}
              title={`${entry.labelKo} 하나 더 추가`}
              aria-label={`${entry.labelKo} 하나 더 추가`}
              className="flex h-5 w-5 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100"
            >
              <Plus className="h-3 w-3" />
            </button>
            {onToggleOff ? (
              <ActivityToggleSwitch
                on
                title={`${entry.labelKo} 끄기 — 문서에서 ${count}개 제거`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleOff(entry.kind);
                }}
              />
            ) : (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">켜짐</span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 ring-1 ring-blue-100 transition-colors group-hover:bg-blue-100">
            <Plus className="h-3 w-3" /> 추가
          </span>
        )}
      </div>
      <p className="text-[11px] leading-snug text-slate-500">{entry.description}</p>
      <div className="mt-0.5 rounded-md border border-slate-100 bg-slate-50/80 px-2 py-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          {added ? "추가됨 — 카드를 누르면 설정이 열려요" : "미리보기"}
        </span>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-700">{preview}</p>
      </div>
    </div>
  );
}
