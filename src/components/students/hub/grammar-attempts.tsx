"use client";

// 학생 상세 허브 — 어법 시도 기록 (전체 폭 테이블 + 행 클릭 → 문항 상세 모달).
// 문항 미리보기는 잘리지 않게 2줄 클램프, 상세는 모달에서 원문 전체.
// 필터: 오답만 / 기간 / 유형 / 모드 / 개념(히트맵 셀 드릴다운 프리셋) — 전부 클라 처리.

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import type { GrammarLabStudentDetail } from "@/actions/grammar-drill-admin";
import {
  GRAMMAR_SOURCE_LABEL,
  GRAMMAR_TYPE_LABEL,
  formatDurationMs,
} from "@/lib/grammar-drill/display";
import { cn } from "@/lib/utils";
import { GrammarItemModal, type GrammarAttemptContext } from "./grammar-item-modal";

type AttemptRow = GrammarLabStudentDetail["recentAttempts"][number];

const PERIOD_OPTIONS = [
  ["ALL", "전체"],
  ["TODAY", "오늘"],
  ["7D", "7일"],
  ["30D", "30일"],
] as const;
type PeriodKey = (typeof PERIOD_OPTIONS)[number][0];

// 서울(UTC+9) 고정 일자 키 — "오늘" 판정용 (서버 집계와 동일 규칙)
const SEOUL_MS = 9 * 3600_000;
const seoulDay = (t: number) => Math.floor((t + SEOUL_MS) / 86_400_000);

function inPeriod(createdAt: string, period: PeriodKey): boolean {
  if (period === "ALL") return true;
  const t = new Date(createdAt).getTime();
  const now = Date.now();
  if (period === "TODAY") return seoulDay(t) === seoulDay(now);
  const days = period === "7D" ? 7 : 30;
  return now - t < days * 86_400_000;
}

export function GrammarAttempts({
  attempts,
  conceptPreset = null,
}: {
  attempts: AttemptRow[];
  /** 히트맵 셀 드릴다운 프리셋 — 부모가 key 리마운트로 주입한다 */
  conceptPreset?: { conceptId: string; title: string } | null;
}) {
  const [wrongOnly, setWrongOnly] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [conceptFilter, setConceptFilter] = useState(conceptPreset);
  const [selected, setSelected] = useState<AttemptRow | null>(null);

  const filtered = useMemo(
    () =>
      attempts.filter(
        (a) =>
          (!wrongOnly || !a.correct) &&
          inPeriod(a.createdAt, period) &&
          (typeFilter === "ALL" || a.itemType === typeFilter) &&
          (sourceFilter === "ALL" || a.source === sourceFilter) &&
          (!conceptFilter || a.conceptId === conceptFilter.conceptId),
      ),
    [attempts, wrongOnly, period, typeFilter, sourceFilter, conceptFilter],
  );
  const filteredCorrect = filtered.filter((a) => a.correct).length;
  const filteredRate = filtered.length
    ? Math.round((filteredCorrect / filtered.length) * 100)
    : 0;

  const attemptContext: GrammarAttemptContext | null = selected
    ? {
        correct: selected.correct,
        answer: selected.answer,
        hintUsed: selected.hintUsed,
        conceptPeeked: selected.conceptPeeked,
        timeMs: selected.timeMs,
        source: selected.source,
        createdAt: selected.createdAt,
      }
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setWrongOnly((v) => !v)}
          aria-pressed={wrongOnly}
          className={cn(
            "h-8 rounded-md border px-3 text-[12.5px] font-semibold transition-colors",
            wrongOnly
              ? "border-rose-500 bg-rose-50 text-rose-700 shadow-sm"
              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
          )}
        >
          오답만 보기
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
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-medium text-slate-600 outline-none focus:border-blue-400"
          aria-label="문항 유형 필터"
        >
          <option value="ALL">전체 유형</option>
          {Object.entries(GRAMMAR_TYPE_LABEL).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-medium text-slate-600 outline-none focus:border-blue-400"
          aria-label="학습 모드 필터"
        >
          <option value="ALL">전체 모드</option>
          {Object.entries(GRAMMAR_SOURCE_LABEL).map(([source, label]) => (
            <option key={source} value={source}>
              {label}
            </option>
          ))}
        </select>
        {conceptFilter ? (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-600 bg-blue-50/40 px-2.5 text-[12px] font-semibold text-blue-700 shadow-sm">
            개념 · {conceptFilter.title}
            <button
              type="button"
              onClick={() => setConceptFilter(null)}
              aria-label="개념 필터 해제"
              className="rounded p-0.5 text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-700"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ) : null}
        {/* 최근 60건 기준 — 서버가 최신 60건만 내려보낸다 */}
        <span className="ml-auto text-[11.5px] tabular-nums text-slate-400">
          최근 {attempts.length}건 중 {filtered.length}건 · 정답률 {filteredRate}%
          <span className="hidden text-slate-300 xl:inline"> · 행을 누르면 문항 상세</span>
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-[13px] text-slate-400">
          조건에 맞는 시도 기록이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[860px] border-collapse bg-white text-left">
            <thead>
              <tr className="bg-slate-50 text-[11.5px] text-slate-500">
                <th className="whitespace-nowrap px-3 py-2 font-medium">시각</th>
                <th className="px-3 py-2 font-medium">문항</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">개념</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">유형·난이도</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">모드</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">판정</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">보조</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">시간</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  tabIndex={0}
                  onClick={() => setSelected(a)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(a);
                    }
                  }}
                  className="cursor-pointer border-t border-slate-50 transition-colors hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-400">
                    {new Date(a.createdAt).toLocaleString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="max-w-[340px] px-3 py-2.5">
                    <p className="line-clamp-2 font-serif text-[12.5px] leading-snug text-slate-700">
                      {a.preview}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-300">{a.itemId}</p>
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] text-slate-600">{a.conceptTitle}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-slate-500">
                    {GRAMMAR_TYPE_LABEL[a.itemType] ?? a.itemType} · D{a.difficulty}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-slate-500">
                    {GRAMMAR_SOURCE_LABEL[a.source] ?? a.source}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {a.correct ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-600">
                        <Check className="size-3.5" aria-hidden /> 정답
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose-600">
                        <X className="size-3.5" aria-hidden /> 오답
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-slate-400">
                    {[
                      a.hintUsed > 0 ? `힌트 ${a.hintUsed}` : null,
                      a.conceptPeeked ? "개념 열람" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] tabular-nums text-slate-500">
                    {formatDurationMs(a.timeMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GrammarItemModal
        open={selected !== null}
        onClose={() => setSelected(null)}
        itemId={selected?.itemId ?? null}
        attempt={attemptContext}
      />
    </div>
  );
}
