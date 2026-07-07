"use client";

// 문제 카드 헤더 오른쪽의 "생성된 문제 N개" 팝오버 — 같은 지문 × 같은 유형으로
// 생성된 형제 문항 이력을 보여준다. 처음 열 때 한 번만 서버 액션으로 지연 로드하고
// 상태에 캐시한다(카드마다 목록 로드 비용을 물지 않기 위해 lazy).
// 카드의 클릭 선택/영역 드래그와 충돌하지 않도록 트리거·콘텐츠 모두 전파를 막고
// data-*-ignore 를 단다(quick-actions-menu 와 동일 패턴).
// 행 클릭: 팝오버를 닫고 (a) onOpenQuestion(상세 모달) 우선, (b) 없으면 같은
// 화면에 떠 있는 카드로 스크롤, (c) 그것도 없으면 문제 관리 페이지로 이동.

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, History, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDate } from "@/lib/utils";
import { getPassageSubtypeQuestionHistory } from "@/actions/workbench/passage-lookups";
import { SUBTYPE_LABELS, DIFFICULTY_CONFIG } from "../question-type-filter";

type HistoryEntry = Awaited<
  ReturnType<typeof getPassageSubtypeQuestionHistory>
>[number];

export function GenerationHistoryPopover({
  passageId,
  subType,
  currentQuestionId,
  compact = false,
  onOpenQuestion,
}: {
  passageId: string;
  subType: string;
  currentQuestionId: string;
  compact?: boolean;
  onOpenQuestion?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // 처음 열 때만 로드 — 이후에는 상태 캐시를 그대로 쓴다.
    if (next && entries === null && !loading) {
      setLoading(true);
      getPassageSubtypeQuestionHistory(passageId, subType)
        .then((rows) => setEntries(rows))
        .catch(() => setEntries([]))
        .finally(() => setLoading(false));
    }
  };

  const handleRowClick = (id: string) => {
    setOpen(false);
    if (onOpenQuestion) {
      onOpenQuestion(id);
      return;
    }
    // 같은 화면에 카드가 떠 있으면 스크롤로 끌어온다(시험지 미리보기와 동일 anchor).
    const el =
      typeof document !== "undefined"
        ? document.querySelector(
            `[data-question-card-id="${
              typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id
            }"]`,
          )
        : null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    router.push(`/director/questions/${id}`);
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const subLabel = SUBTYPE_LABELS[subType] || subType;
  const label =
    entries === null ? "생성 이력" : `생성된 문제 ${entries.length}개`;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-drag-select-ignore
          data-card-click-ignore="true"
          onClick={stop}
          aria-expanded={open}
          aria-label="이 지문에서 같은 유형으로 생성된 문제 이력 보기"
          title="같은 지문 · 같은 유형 생성 이력"
          className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 ${
            compact ? "h-5" : "h-6"
          }`}
        >
          <History className="h-3 w-3 text-slate-400" aria-hidden="true" />
          <span className="whitespace-nowrap">{label}</span>
          <ChevronDown
            className={`h-3 w-3 text-slate-400 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        onClick={stop}
        data-card-click-ignore="true"
        className="w-80 max-w-[90vw] p-1.5"
      >
        <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold text-slate-500">
          같은 지문 · {subLabel} 생성 이력
        </p>
        {loading ? (
          <div className="flex items-center justify-center gap-1.5 py-4 text-[11px] text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            불러오는 중…
          </div>
        ) : !entries || entries.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-slate-400">
            생성된 문제가 없습니다.
          </p>
        ) : (
          <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            {entries.map((entry) => {
              const isCurrent = entry.id === currentQuestionId;
              const diff = DIFFICULTY_CONFIG[entry.difficulty];
              const rowInner = (
                <>
                  <div className="flex w-full items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      title={entry.approved ? "검수완료" : "미검수"}
                      className={`size-1.5 shrink-0 rounded-full ${
                        entry.approved ? "bg-emerald-500" : "bg-red-300"
                      }`}
                    />
                    <span className="shrink-0 text-[11px] font-semibold text-slate-700">
                      {(entry.subType && SUBTYPE_LABELS[entry.subType]) ||
                        entry.subType ||
                        subLabel}
                    </span>
                    {diff && (
                      <span
                        className={`shrink-0 rounded border px-1 text-[10px] font-bold ${diff.className}`}
                      >
                        {diff.label}
                      </span>
                    )}
                    {isCurrent && (
                      <span className="shrink-0 rounded bg-blue-100 px-1 text-[10px] font-bold text-blue-700">
                        현재 문항
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-[10px] tabular-nums text-slate-400">
                      {formatDate(entry.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 w-full truncate pl-3 text-left text-[11px] text-slate-500">
                    {entry.questionText}
                  </p>
                </>
              );
              if (isCurrent) {
                return (
                  <div
                    key={entry.id}
                    className="rounded-md bg-blue-50/50 px-2 py-1.5 ring-1 ring-inset ring-blue-300"
                  >
                    {rowInner}
                  </div>
                );
              }
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleRowClick(entry.id)}
                  className="cursor-pointer rounded-md px-2 py-1.5 text-left transition-colors hover:bg-slate-100"
                >
                  {rowInner}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
