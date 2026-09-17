"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, History, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { QuestionCardItem } from "@/components/workbench/question-card";
import {
  Q_TYPE_LABELS,
  Q_SUBTYPE_LABELS,
  Q_DIFF,
} from "@/components/workbench/passage-detail/constants";

// ─────────────────────────────────────────────────────────────
// 지문 카드 하단 토글 — 이 지문으로 생성된 문제 요약
//   카드 폭(≈260px)에 맞춰 한 줄짜리 컴팩트 행으로 보여준다.
//   클릭 이벤트는 토글 영역에서 멈춰 지문 상세 모달이 열리지 않게 한다.
// ─────────────────────────────────────────────────────────────

function stripText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[*_`#>]/g, "")
    .trim();
}

function SummaryRow({
  q,
  num,
  onOpen,
}: {
  q: QuestionCardItem;
  num: number;
  // 전달되면 페이지 이동 대신 이 콜백으로 인페이지 문제 상세 팝업을 연다.
  onOpen?: (q: QuestionCardItem) => void;
}) {
  const router = useRouter();
  const typeLabel = Q_TYPE_LABELS[q.type] || q.type;
  const subLabel = q.subType ? Q_SUBTYPE_LABELS[q.subType] || q.subType : null;
  const diff = Q_DIFF[q.difficulty];
  const examLinks = q._count?.examLinks ?? 0;
  const text = stripText(q.questionText || subLabel || typeLabel);

  const openDetail = () => {
    if (onOpen) onOpen(q);
    else router.push(`/director/questions/${q.id}`);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        openDetail();
      }}
      className="cursor-pointer rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1.5 transition-colors hover:border-slate-200 hover:bg-slate-100/70"
    >
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] font-bold text-slate-400">{num}.</span>
        <span className="inline-flex items-center rounded bg-slate-100 px-1 py-0.5 text-[9.5px] font-medium text-slate-600">
          {typeLabel}
        </span>
        {subLabel && (
          <span className="text-[9.5px] text-slate-500">{subLabel}</span>
        )}
        <span
          className={`inline-flex items-center rounded border px-1 py-0.5 text-[9.5px] font-semibold ${
            diff?.cls || "bg-slate-100 text-slate-500 border-slate-200"
          }`}
        >
          {diff?.label || q.difficulty}
        </span>
        {examLinks > 0 && (
          <span className="ml-auto text-[9.5px] font-medium text-slate-400">
            {examLinks}개 시험지
          </span>
        )}
      </div>
      {text && (
        <p className="mt-1 text-[10.5px] leading-snug text-slate-600 line-clamp-1">
          {text}
        </p>
      )}
    </div>
  );
}

export function PassageQuestionsSummary({
  questions,
  onOpenQuestion,
  fallbackCount,
  loadQuestions,
}: {
  questions: QuestionCardItem[];
  // 전달되면 문제 행 클릭 시 페이지 이동 대신 인페이지 상세 팝업을 연다.
  onOpenQuestion?: (q: QuestionCardItem) => void;
  /**
   * 지연(lazy) 모드(additive) — questions 가 비어 있어도 서버 집계상 문제가
   * 있는 지문에 토글을 그리기 위한 수. loadQuestions 와 함께 전달될 때만
   * 동작하며, 미전달 호스트는 기존 동작(목록 없으면 미렌더) 그대로다.
   */
  fallbackCount?: number;
  /**
   * 지연 모드의 목록 로더 — 팝오버 최초 오픈 시 1회 호출한다. 실패하면
   * 로드 상태를 버리고 다음 오픈에서 재시도한다.
   */
  loadQuestions?: () => Promise<QuestionCardItem[]>;
}) {
  const [open, setOpen] = useState(false);
  const [lazyItems, setLazyItems] = useState<QuestionCardItem[] | null>(null);
  const [lazyState, setLazyState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const lazyBusyRef = useRef(false);

  // 즉시 목록(기존 호스트)이 우선 — 지연 모드는 목록이 비었을 때만 켠다.
  const eager = questions.length > 0;
  const lazyEnabled = !eager && !!loadQuestions && (fallbackCount ?? 0) > 0;
  const items = eager ? questions : (lazyItems ?? []);
  // 라벨 수 — 로드 전엔 서버 집계(fallbackCount), 로드 후엔 실목록 수.
  const count = eager
    ? questions.length
    : lazyItems !== null
      ? lazyItems.length
      : (fallbackCount ?? 0);

  if (!eager && !lazyEnabled) return null;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next || !lazyEnabled || !loadQuestions) return;
    if (lazyItems !== null || lazyBusyRef.current) return;
    lazyBusyRef.current = true;
    setLazyState("loading");
    void loadQuestions()
      .then((list) => {
        setLazyItems(list);
        setLazyState("idle");
      })
      // 실패 — lazyItems 를 null 로 남겨 다음 오픈에서 재시도한다.
      .catch(() => setLazyState("error"))
      .finally(() => {
        lazyBusyRef.current = false;
      });
  };

  return (
    <div
      className="mt-2.5 border-t border-slate-100 pt-2"
      onClick={(e) => e.stopPropagation()}
    >
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            {/* History 아이콘 — "이미 생성된" 상징. */}
            <History className="h-3 w-3 shrink-0 text-slate-400" />
            <span>생성된 문제 {count}개</span>
            <ChevronDown
              className={`ml-auto h-3.5 w-3.5 text-slate-400 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 max-w-[90vw] p-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {lazyState === "loading" ? (
              <div className="flex items-center justify-center gap-1.5 py-4 text-[11px] text-slate-400">
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
                문제 목록을 불러오는 중…
              </div>
            ) : lazyState === "error" ? (
              <div className="py-4 text-center text-[11px] text-slate-400">
                문제 목록을 불러오지 못했습니다. 닫았다가 다시 열면 재시도합니다.
              </div>
            ) : items.length === 0 ? (
              <div className="py-4 text-center text-[11px] text-slate-400">
                표시할 문제가 없습니다.
              </div>
            ) : (
              items.map((q, idx) => (
                <SummaryRow
                  key={q.id}
                  q={q}
                  num={idx + 1}
                  onOpen={
                    onOpenQuestion
                      ? (question) => {
                          setOpen(false);
                          onOpenQuestion(question);
                        }
                      : undefined
                  }
                />
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
