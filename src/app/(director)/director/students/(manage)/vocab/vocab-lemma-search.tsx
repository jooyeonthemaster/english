"use client";

// ============================================================================
// 표제어 검색 카드 — vocab-lab-list-client 의 섹션 분리(500줄 계약).
// 접두 검색(디바운스 300ms) → 행 클릭 시 상세(senses 목록 + 연도 시계열
// 순수 CSS 미니 바 — 데이터 없으면 "시계열 없음").
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { BookA, ChevronDown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import {
  getVocabLemmaDetail,
  searchVocabLemmas,
  type VocabLemmaDetail,
  type VocabLemmaSearchRow,
} from "@/actions/vocab-drill-admin/queries";
import {
  VOCAB_POS_LABELS,
  VOCAB_TIER_LABELS,
} from "@/lib/vocab-drill/display";
import { SectionCard } from "@/components/layout/page-frame";
import { cn } from "@/lib/utils";

function posLabel(pos: string): string {
  return VOCAB_POS_LABELS[pos] ?? pos;
}

export function VocabLemmaSearchCard() {
  const [term, setTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<VocabLemmaSearchRow[] | null>(null);
  const [detail, setDetail] = useState<VocabLemmaDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const q = term.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      return;
    }
    const seq = ++seqRef.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchVocabLemmas(q);
        if (seqRef.current === seq) setResults(rows);
      } catch {
        if (seqRef.current === seq) setResults([]);
      } finally {
        if (seqRef.current === seq) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [term]);

  const openDetail = async (lemmaId: string) => {
    if (detail?.lemma.id === lemmaId) {
      setDetail(null);
      return;
    }
    setDetailLoading(lemmaId);
    try {
      setDetail(await getVocabLemmaDetail(lemmaId));
    } catch {
      setDetail(null);
      toast.error("표제어 상세를 불러오지 못했습니다.");
    } finally {
      setDetailLoading(null);
    }
  };

  return (
    <SectionCard
      icon={BookA}
      title="표제어 검색"
      description="기출 코퍼스 표제어를 접두로 검색합니다. 행을 누르면 뜻 목록과 연도별 출현 시계열을 보여줍니다."
      bodyClassName="p-0"
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <Search className="size-4 shrink-0 text-slate-300" aria-hidden />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="영어 표제어 입력 (예: address)"
          className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-300"
        />
        {searching ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-slate-300" aria-hidden />
        ) : null}
      </div>

      {results === null ? (
        <p className="px-4 py-6 text-center text-[13px] text-slate-400">
          검색어를 입력하면 결과가 나타납니다.
        </p>
      ) : results.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-slate-400">검색 결과가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {results.map((r) => (
            <li key={r.lemmaId}>
              <button
                type="button"
                onClick={() => void openDetail(r.lemmaId)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50/60",
                  detail?.lemma.id === r.lemmaId && "bg-blue-50/40",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="truncate text-[13.5px] font-semibold text-slate-800">
                      {r.lemma}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">{posLabel(r.pos)}</span>
                    {r.trendLabel ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-semibold text-slate-500">
                        {r.trendLabel}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] tabular-nums text-slate-400">
                    뜻 {r.senseCount}개
                    {r.per10k != null ? ` · 빈도 ${r.per10k.toFixed(1)}/1만` : ""}
                    {r.gradeTop ? ` · 최다 ${r.gradeTop}` : ""}
                  </span>
                </span>
                {detailLoading === r.lemmaId ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-slate-300" aria-hidden />
                ) : (
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-slate-300 transition-transform",
                      detail?.lemma.id === r.lemmaId && "rotate-180",
                    )}
                    aria-hidden
                  />
                )}
              </button>
              {detail?.lemma.id === r.lemmaId ? <LemmaDetailPanel detail={detail} /> : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function LemmaDetailPanel({ detail }: { detail: VocabLemmaDetail }) {
  return (
    <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3">
      {/* senses 목록 */}
      <ul className="space-y-1.5">
        {detail.senses.map((s, idx) => (
          <li key={s.id} className="flex items-baseline gap-2">
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-400">
              {idx + 1}.
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-[13px] font-medium text-slate-800">{s.senseKo}</span>
              <span className="ml-1.5 break-keep text-[12px] text-slate-400">{s.senseEn}</span>
            </span>
            <span className="shrink-0 text-[10.5px] tabular-nums text-slate-400">
              {VOCAB_TIER_LABELS[s.tier] ?? s.tier} · 난이도 {s.difficulty} · 예문 {s.exampleCount}
            </span>
          </li>
        ))}
      </ul>

      {detail.lemma.collocations.length > 0 ? (
        <p className="mt-2 break-keep text-[11.5px] text-slate-500">
          <span className="font-semibold text-slate-600">연어</span>{" "}
          {detail.lemma.collocations.join(", ")}
        </p>
      ) : null}
      {detail.lemma.confusable.length > 0 ? (
        <p className="mt-1 break-keep text-[11.5px] text-slate-500">
          <span className="font-semibold text-slate-600">혼동어</span>{" "}
          {detail.lemma.confusable.join(", ")}
        </p>
      ) : null}

      {/* 연도 시계열 미니 바 — 순수 CSS */}
      <div className="mt-3">
        <p className="text-[11px] font-semibold text-slate-500">연도별 출현</p>
        {detail.yearStats && Object.keys(detail.yearStats.byYear).length > 0 ? (
          <YearBars byYear={detail.yearStats.byYear} />
        ) : (
          <p className="mt-1 text-[12px] text-slate-400">시계열 없음</p>
        )}
      </div>
    </div>
  );
}

function YearBars({ byYear }: { byYear: Record<string, number> }) {
  const years = Object.keys(byYear).sort();
  const max = Math.max(1, ...years.map((y) => byYear[y] ?? 0));
  const first = years[0];
  const last = years[years.length - 1];
  return (
    <div className="mt-1.5">
      <div className="flex h-14 items-end gap-px">
        {years.map((y) => {
          const v = byYear[y] ?? 0;
          return (
            <div
              key={y}
              title={`${y}년 ${v}회`}
              className={cn(
                "min-w-0 flex-1 rounded-t-sm",
                v > 0 ? "bg-blue-500/80" : "bg-slate-200/70",
              )}
              style={{ height: `${Math.max(3, Math.round((v / max) * 100))}%` }}
            />
          );
        })}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-slate-400">
        <span>{first}</span>
        <span>{last}</span>
      </div>
    </div>
  );
}
