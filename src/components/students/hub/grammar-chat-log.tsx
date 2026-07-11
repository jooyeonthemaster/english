"use client";

// 학생 상세 허브 — 어법 질문 로그 (일자별 그룹 + 문항 컨텍스트 점프).
// 학생이 어떤 문항/개념을 보다가 질문했는지 칩으로 표기하고, 칩 클릭 시
// 그 문항의 강사 뷰 모달로 점프한다. 긴 AI 답변은 3줄 클램프 + 펼치기.

import { useMemo, useState } from "react";
import { MessageCircleQuestion, ExternalLink } from "lucide-react";
import type { GrammarLabStudentDetail } from "@/actions/grammar-drill-admin";
import { CONCEPT_SKELETON_BY_ID } from "@/lib/grammar-drill/curriculum";
import { cn } from "@/lib/utils";
import { GrammarItemModal } from "./grammar-item-modal";

type ChatRow = GrammarLabStudentDetail["chatMessages"][number];

const PERIOD_OPTIONS = [
  ["ALL", "전체"],
  ["7D", "7일"],
  ["30D", "30일"],
] as const;
type PeriodKey = (typeof PERIOD_OPTIONS)[number][0];

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/** contextItemId("u02-c1-mu-009") → 개념 라벨 */
function contextLabel(itemId: string | null): string | null {
  if (!itemId) return null;
  const conceptId = itemId.split("-").slice(0, 2).join("-");
  const title = CONCEPT_SKELETON_BY_ID.get(conceptId)?.title;
  return title ? `${title} · ${itemId}` : itemId;
}

export function GrammarChatLog({ messages }: { messages: ChatRow[] }) {
  const [modalItemId, setModalItemId] = useState<string | null>(null);
  const [questionsOnly, setQuestionsOnly] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>("ALL");
  // 펼친 AI 답변 id 집합 — 클램프 해제 토글
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const now = Date.now();
    const limitDays = period === "7D" ? 7 : period === "30D" ? 30 : null;
    return messages.filter(
      (m) =>
        (!questionsOnly || m.role === "user") &&
        (limitDays === null ||
          now - new Date(m.createdAt).getTime() < limitDays * 86_400_000),
    );
  }, [messages, questionsOnly, period]);

  const groups = useMemo(() => {
    const map = new Map<string, ChatRow[]>();
    for (const m of visible) {
      const key = dayKey(m.createdAt);
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [visible]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-12">
        <MessageCircleQuestion className="size-8 text-slate-300" aria-hidden />
        <p className="text-[13px] text-slate-400">아직 AI 질문 기록이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setQuestionsOnly((v) => !v)}
          aria-pressed={questionsOnly}
          className={cn(
            "h-8 rounded-md border px-3 text-[12.5px] font-semibold transition-colors",
            questionsOnly
              ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
          )}
        >
          질문만 보기
        </button>
        <div className="flex items-center gap-1" role="group" aria-label="기간 필터">
          {PERIOD_OPTIONS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              aria-pressed={period === key}
              className={cn(
                "h-8 rounded-md border px-2.5 text-[12px] font-semibold transition-colors",
                period === key
                  ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11.5px] text-slate-400">
          학생이 문제를 풀다가 AI에게 질문한 기록입니다. 문항 칩을 누르면 질문 시점의
          문항을 확인할 수 있습니다.
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-[13px] text-slate-400">
          조건에 맞는 기록이 없습니다.
        </p>
      ) : null}

      {groups.map(([day, rows]) => (
        <div key={day} className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
              {day}
            </span>
            <span className="h-px flex-1 bg-slate-100" aria-hidden />
            <span className="text-[11px] tabular-nums text-slate-300">
              질문 {rows.filter((r) => r.role === "user").length}건
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {rows.map((m) => {
              const isUser = m.role === "user";
              const ctx = isUser ? contextLabel(m.contextItemId) : null;
              // 긴 AI 답변만 클램프 — 짧은 답변은 그대로 노출
              const clampable =
                !isUser && (m.content.length > 180 || m.content.split("\n").length > 4);
              const isOpen = expanded.has(m.id);
              return (
                <div
                  key={m.id}
                  className={cn("flex", isUser ? "justify-start" : "justify-end")}
                >
                  <div
                    className={cn(
                      "flex max-w-[720px] flex-col gap-1.5 rounded-xl border px-3.5 py-2.5",
                      isUser
                        ? "border-blue-100 bg-blue-50/50"
                        : "border-slate-100 bg-white",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-[10.5px] font-bold",
                          isUser ? "text-blue-600" : "text-slate-400",
                        )}
                      >
                        {isUser ? "학생 질문" : "AI 답변"}
                      </span>
                      <span className="text-[10.5px] text-slate-300">
                        {new Date(m.createdAt).toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {ctx && m.contextItemId ? (
                        <button
                          type="button"
                          onClick={() => setModalItemId(m.contextItemId)}
                          className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10.5px] font-medium text-blue-600 transition-colors hover:bg-blue-50"
                          title="질문 시점의 문항 보기"
                        >
                          {ctx}
                          <ExternalLink className="size-2.5" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        "whitespace-pre-line text-[13px] leading-relaxed",
                        isUser ? "text-slate-800" : "text-slate-600",
                        clampable && !isOpen ? "line-clamp-3" : null,
                      )}
                    >
                      {m.content}
                    </p>
                    {clampable ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(m.id)}
                        aria-expanded={isOpen}
                        className="self-start text-[11px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
                      >
                        {isOpen ? "접기" : "펼치기"}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <GrammarItemModal
        open={modalItemId !== null}
        onClose={() => setModalItemId(null)}
        itemId={modalItemId}
        attempt={null}
      />
    </div>
  );
}
