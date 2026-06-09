"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ChevronsDownUp,
  ChevronsUpDown,
  ListStart,
  PencilLine,
  Scissors,
  TextCursorInput,
  Trash2,
  X,
} from "lucide-react";

import type { QueueItem } from "../generate-page-types";
import type { WorkspaceRowsApi } from "./use-workspace-rows";
import { WorkspacePassageRow } from "./workspace-passage-row";

// ============================================================================
// 지문 워크스페이스 — 불러온 지문 스택 + 빈 상태 가이드 + 기능 코치마크.
// ============================================================================

const COACHMARK_DISMISS_KEY = "smoat:generate:workspace-coachmark-dismissed";

function readCoachmarkDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(COACHMARK_DISMISS_KEY) === "1";
  } catch {
    return true;
  }
}

interface PassageWorkspaceProps {
  api: WorkspaceRowsApi;
  /** 왼쪽 라이브러리에서 체크된 지문 수. */
  selectedCount: number;
  onLoadSelected: () => void;
  generating: boolean;
  sessionQueue: QueueItem[];
  questionCountByPassage: Map<string, number>;
}

export function PassageWorkspace({
  api,
  selectedCount,
  onLoadSelected,
  generating,
  sessionQueue,
  questionCountByPassage,
}: PassageWorkspaceProps) {
  const { rows } = api;
  const [coachDismissed, setCoachDismissed] = useState(true);
  useEffect(() => {
    setCoachDismissed(readCoachmarkDismissed());
  }, []);
  const dismissCoach = () => {
    setCoachDismissed(true);
    try {
      window.localStorage.setItem(COACHMARK_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const allCollapsed = rows.length > 0 && rows.every((r) => r.collapsed);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-slate-50/60">
      {/* ── 헤더 ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-white px-3 py-2">
        <h3 className="shrink-0 text-[13px] font-bold text-slate-800">
          지문 워크스페이스
          {rows.length > 0 ? (
            <span className="ml-1.5 rounded bg-blue-600 px-1.5 py-0.5 text-[11px] font-bold text-white tabular-nums">
              {rows.length}
            </span>
          ) : null}
        </h3>
        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">
          불러온 지문을 편집·AI 변형한 뒤 문제를 생성하세요
        </span>
        {selectedCount > 0 ? (
          <button
            type="button"
            onClick={onLoadSelected}
            disabled={generating}
            title={`왼쪽에서 선택한 ${selectedCount}개 지문을 워크스페이스로 불러옵니다`}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-[11.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
            선택 지문 불러오기
            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
              {selectedCount}개
            </span>
          </button>
        ) : null}
        {rows.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => api.setAllCollapsed(!allCollapsed)}
              className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-500 hover:text-slate-700"
              title={allCollapsed ? "모두 펼치기" : "모두 접기"}
            >
              {allCollapsed ? (
                <ChevronsUpDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronsDownUp className="h-3.5 w-3.5" />
              )}
              {allCollapsed ? "모두 펼치기" : "모두 접기"}
            </button>
            <button
              type="button"
              onClick={api.clear}
              disabled={generating}
              className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-400 hover:border-red-200 hover:text-red-500 disabled:opacity-40"
              title="워크스페이스 비우기 (지문은 삭제되지 않음)"
            >
              <Trash2 className="h-3.5 w-3.5" />
              비우기
            </button>
          </>
        ) : null}
      </div>

      {/* ── 본문 ── */}
      {rows.length === 0 ? (
        <EmptyState selectedCount={selectedCount} onLoadSelected={onLoadSelected} />
      ) : (
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
          {!coachDismissed ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2.5">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[12px] font-bold text-blue-800">
                  이 워크스페이스에서 할 수 있는 것
                </p>
                <ul className="space-y-0.5 text-[11.5px] leading-relaxed text-blue-700/90">
                  <li className="flex items-center gap-1.5">
                    <PencilLine className="h-3 w-3 shrink-0" />
                    본문을 직접 수정 — 생성 시 변형본이 새 지문으로 저장돼요
                  </li>
                  <li className="flex items-center gap-1.5">
                    <TextCursorInput className="h-3 w-3 shrink-0" />
                    문장을 드래그 → <strong>AI 문장 변형</strong> (뜻은 같게 표현만)
                  </li>
                  <li className="flex items-center gap-1.5">
                    <ListStart className="h-3 w-3 shrink-0" />
                    <strong>앞 맥락 추가</strong> — 지문과 이어지는 새 앞 문단 생성
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Scissors className="h-3 w-3 shrink-0" />
                    긴 지문은 드래그 → <strong>이 범위만 출제</strong>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={dismissCoach}
                className="shrink-0 rounded-md p-1 text-blue-400 hover:bg-blue-100 hover:text-blue-600"
                title="다시 보지 않기"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {rows.map((row, index) => (
            <WorkspacePassageRow
              key={row.localId}
              index={index}
              row={row}
              disabled={generating}
              sessionQueue={sessionQueue}
              savedQuestionCount={
                (questionCountByPassage.get(row.passageId) ?? 0) +
                (row.variantOfId
                  ? questionCountByPassage.get(row.variantOfId) ?? 0
                  : 0)
              }
              onChangeContent={(content) => api.setContent(row.localId, content)}
              onSetRange={(range) => api.setRange(row.localId, range)}
              onSetOverride={(override) =>
                api.setOverride(row.localId, override)
              }
              onToggleCollapsed={() => api.toggleCollapsed(row.localId)}
              onRemove={() => api.removeRow(row.localId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  selectedCount,
  onLoadSelected,
}: {
  selectedCount: number;
  onLoadSelected: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-8">
      <div className="w-full max-w-[420px] space-y-2.5">
        <Step
          n={1}
          title="왼쪽 ‘내 지문’에서 지문 선택"
          desc="체크박스로 여러 지문을 한 번에 선택할 수 있어요."
        />
        <Step
          n={2}
          title="‘선택 지문 불러오기’로 이곳에 불러오기"
          desc="불러온 지문은 자유롭게 편집할 수 있어요."
        />
        <Step
          n={3}
          title="편집 · AI 변형 · 출제 범위 지정"
          desc="문장을 드래그하면 AI 변형, ‘앞 맥락 추가’로 지문 확장."
        />
        <Step
          n={4}
          title="유형·난이도 설정 후 문제 생성"
          desc="오른쪽 전체 설정 또는 지문별 유형 지정."
        />
      </div>
      <button
        type="button"
        onClick={onLoadSelected}
        disabled={selectedCount === 0}
        title={
          selectedCount === 0
            ? "왼쪽 ‘내 지문’에서 지문을 먼저 선택하세요"
            : `선택한 ${selectedCount}개 지문을 불러옵니다`
        }
        className="flex h-10 w-full max-w-[420px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-[13px] font-bold text-white shadow-md shadow-blue-200/60 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
      >
        <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
        {selectedCount === 0
          ? "왼쪽에서 지문을 선택하세요"
          : `선택 지문 불러오기 (${selectedCount}개)`}
      </button>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
      <span className="mt-0.5 flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
        {n}
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-bold text-slate-700">
          {title}
        </span>
        <span className="block text-[11.5px] leading-relaxed text-slate-400">
          {desc}
        </span>
      </span>
    </div>
  );
}
