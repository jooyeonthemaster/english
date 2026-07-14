"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 탭 · 다차원 취약점 분해(AI 0콜)
//
// 유형별/난이도별/지문별/개념별 정답률을 스택바+문항 칩으로 그린다. 정렬 토글
// (취약순/오답순/문항순) + 차원 내 상세 필터(항목 선택·정오 표시·오답만)로
// 다변화. 버킷 행은 펼침식(analysis-bucket-row) — 모든 칩/행이 상세 모달 점프.
// 색은 STATUS_STYLE 4색 계약(정답 emerald·오답 rose·부분 blue·미상 slate).
// ============================================================================

import { useMemo, useState } from "react";
import { Layers, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ResponseStatus } from "@/lib/exam-report/types";
import { STATUS_STYLE, VERDICT_ORDER } from "./grading-shared";
import { FilterMultiSelect } from "./verdict-filter-bar";
import { BucketRow, type BucketQuestionInfo } from "./analysis-bucket-row";
import type {
  WeaknessBreakdown,
  WeaknessBucket,
  WeaknessDimension,
} from "./grading-weakness";

export type { BucketQuestionInfo } from "./analysis-bucket-row";

interface AnalysisBreakdownProps {
  breakdown: WeaknessBreakdown;
  /** number → 정오 상태(문항 칩 색). */
  statusByNumber: Map<string, ResponseStatus>;
  /** number → 펼침 행 재료(학생답→정답·획득점). */
  questionInfo: Map<string, BucketQuestionInfo>;
  /** passageId → 지문 전문(지문별 버킷 펼침 발췌용). */
  passageExcerptById: Map<string, string>;
  /** 지문 차원 가능 여부(원본 문항 재조회 성공). */
  detailAvailable: boolean;
  reviewLoading: boolean;
  /** 원본 재조회 실패(정상 강등과 구분해 재시도 안내). */
  reviewError?: boolean;
  onRetryReview?: () => void;
  onSelectQuestion: (number: string) => void;
}

type SortKey = "weak" | "wrong" | "count";

// 지문 차원만 원본 재조회(detailAvailable)에 묶인다. 개념 차원은 perQuestion.
// keyConcepts 만으로도 집계되므로(사진 분석 리포트 포함) 데이터 유무로만 판정한다.
const DIMENSIONS: { key: WeaknessDimension; label: string; needsDetail: boolean }[] = [
  { key: "type", label: "유형별", needsDetail: false },
  { key: "difficulty", label: "난이도별", needsDetail: false },
  { key: "passage", label: "지문별", needsDetail: true },
  { key: "concept", label: "개념별", needsDetail: false },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "weak", label: "취약순" },
  { key: "wrong", label: "오답순" },
  { key: "count", label: "문항순" },
];

/** 차원별 항목 명사 — 멀티셀렉트 라벨("유형 선택" 등). */
const DIM_NOUN: Record<WeaknessDimension, string> = {
  type: "유형",
  difficulty: "난이도",
  passage: "지문",
  concept: "개념",
};

/** 차원별 항목 선택 상태(탭 전환에도 각 차원의 선택 보존). */
type BucketSelection = Record<WeaknessDimension, string[]>;

const EMPTY_BUCKET_SELECTION: BucketSelection = {
  type: [],
  difficulty: [],
  passage: [],
  concept: [],
};

function toggleValue<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}


export function AnalysisBreakdown({
  breakdown,
  statusByNumber,
  questionInfo,
  passageExcerptById,
  detailAvailable,
  reviewLoading,
  reviewError = false,
  onRetryReview,
  onSelectQuestion,
}: AnalysisBreakdownProps) {
  const [dim, setDim] = useState<WeaknessDimension>("type");
  const [sort, setSort] = useState<SortKey>("weak");
  // ── 차원 내 상세 필터 ──
  // 항목 선택(차원별 보존) · 문항 칩 정오 표시 · 오답 있는 항목만.
  const [bucketSel, setBucketSel] = useState<BucketSelection>(EMPTY_BUCKET_SELECTION);
  const [chipStatuses, setChipStatuses] = useState<ResponseStatus[]>([]);
  const [wrongOnly, setWrongOnly] = useState(false);

  const buckets: Record<WeaknessDimension, WeaknessBucket[]> = {
    type: breakdown.byType,
    difficulty: breakdown.byDifficulty,
    passage: breakdown.byPassage,
    concept: breakdown.byConcept,
  };

  // 난이도 차원은 기본→중급→킬러 고정 순서(정렬 토글 미적용)가 읽기 자연스럽다.
  const sorted = useMemo(() => {
    const list = buckets[dim];
    if (dim === "difficulty" || sort === "weak") return list; // weak = 집계 기본 정렬
    const copy = [...list];
    if (sort === "wrong") copy.sort((a, b) => b.wrong - a.wrong || (a.accuracy ?? 1) - (b.accuracy ?? 1));
    else copy.sort((a, b) => b.total - a.total || (a.accuracy ?? 1) - (b.accuracy ?? 1));
    return copy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dim, sort, breakdown]);

  // 현 차원의 항목 선택 옵션(집계 기본 정렬 순서·문항수 카운트).
  // 재채점/리뷰 도착으로 breakdown 이 재산출되면 선택했던 키가 소멸할 수 있다
  // (예: 유도 난이도 INTERMEDIATE → 원본 확정 KILLER). 표시·판정은 항상 현재
  // 유효 키와의 교집합(effectiveSel)만 쓴다 — 유령 키가 배지 카운트를 부풀리거나
  // 해제 불가로 남지 않게.
  const bucketOptions = useMemo(
    () =>
      buckets[dim].map((b) => ({
        value: b.key,
        label: b.label,
        count: b.total,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dim, breakdown],
  );
  const effectiveSel = useMemo(() => {
    const valid = new Set(bucketOptions.map((o) => o.value));
    return bucketSel[dim].filter((k) => valid.has(k));
  }, [bucketOptions, bucketSel, dim]);

  // 항목 필터 적용본 — 선택된 항목만 + (오답만 토글 시) 오답 보유 항목만.
  const visible = useMemo(
    () =>
      sorted.filter(
        (b) =>
          (effectiveSel.length === 0 || effectiveSel.includes(b.key)) &&
          (!wrongOnly || b.wrong > 0),
      ),
    [sorted, effectiveSel, wrongOnly],
  );

  const filterActive =
    effectiveSel.length > 0 || wrongOnly || chipStatuses.length > 0;
  // 초기화는 노출 스코프와 동일하게 '현 차원 선택 + 전역 토글'만 소거한다 —
  // 다른 차원에 보존된 선택을 몰래 파괴하지 않는다(BucketSelection 보존 계약).
  const resetFilters = () => {
    setBucketSel((prev) => ({ ...prev, [dim]: [] }));
    setChipStatuses([]);
    setWrongOnly(false);
  };

  // 지문/개념 데이터가 리뷰 재조회에 걸려 있는 동안 목록이 로딩 문구로 대체된다 —
  // 같은 술어로 필터바도 함께 감춰 컨트롤·결과 괴리를 없앤다.
  const listLoading = reviewLoading && (dim === "passage" || dim === "concept");

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Layers className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-[14px] font-bold text-slate-900">취약점 분해</h2>
            <p className="text-[12px] font-medium text-slate-400 break-keep">
              차원별 정답률 — 문항 번호를 누르면 원본 문항이 열립니다.
            </p>
          </div>
        </div>

        {/* 정렬 토글 */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
          {SORTS.map((s) => {
            // 난이도 차원은 고정 순서(정렬 미적용) — 눌림 상태·활성 스타일을 함께
            // 해제해 "적용 중인 정렬"로 오인되지 않게 한다.
            const sortApplies = dim !== "difficulty";
            const on = sortApplies && sort === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                disabled={!sortApplies}
                aria-pressed={on}
                className={cn(
                  "h-6 rounded-md px-2.5 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  on
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-4 pt-3">
        {/* 차원 탭 — 지문은 원본 재조회, 나머지는 데이터 유무로만 판정. */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {DIMENSIONS.map((d) => {
            const disabled =
              (d.needsDetail && !detailAvailable) ||
              (d.key !== "type" && buckets[d.key].length === 0);
            return (
              <button
                key={d.key}
                type="button"
                disabled={disabled}
                aria-pressed={dim === d.key}
                onClick={() => setDim(d.key)}
                title={
                  disabled
                    ? d.needsDetail && !detailAvailable
                      ? "원본 문항이 있는 시험지에서만 제공됩니다."
                      : "집계할 데이터가 없습니다."
                    : undefined
                }
                className={cn(
                  "inline-flex h-7 items-center rounded-md border px-2.5 text-[12px] font-semibold transition-colors",
                  dim === d.key
                    ? "border-blue-600 bg-blue-50/50 text-blue-700"
                    : disabled
                      ? "cursor-not-allowed border-transparent text-slate-300"
                      : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                )}
              >
                {d.label}
              </button>
            );
          })}
          {reviewError ? (
            <span className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-slate-400 break-keep">
              원본 문항을 불러오지 못했습니다.
              {onRetryReview && (
                <button
                  type="button"
                  onClick={onRetryReview}
                  className="font-semibold text-blue-600 transition-colors hover:text-blue-700"
                >
                  다시 시도
                </button>
              )}
            </span>
          ) : !detailAvailable && !reviewLoading ? (
            <span className="ml-1 text-[11px] text-slate-400 break-keep">
              지문 분석은 원본 문항이 있는 시험지에서만 제공됩니다.
            </span>
          ) : null}
        </div>

        {/* 차원 내 상세 필터 — 항목 멀티셀렉트 · 문항 정오 표시 · 오답 항목만.
            wrap 시 라벨·칩이 함께 내려가도록 그룹 단위로 묶고, 고아로 남는 세로
            구분선 대신 그룹 간격(gap)으로 구분한다. 컨트롤 높이·타이포는 자매
            필터바(h-7·12px)와 통일. */}
        {!listLoading && sorted.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-100 bg-slate-50/40 px-2.5 py-2">
            <FilterMultiSelect
              label={`${DIM_NOUN[dim]} 선택`}
              selected={effectiveSel}
              options={bucketOptions}
              onToggle={(v) =>
                setBucketSel((prev) => ({
                  ...prev,
                  [dim]: toggleValue(prev[dim], v),
                }))
              }
              onClear={() => setBucketSel((prev) => ({ ...prev, [dim]: [] }))}
              wide={dim === "passage"}
            />

            {/* 문항 칩 정오 표시 필터 — 버킷 통계는 불변, 칩 노출만 거른다. */}
            <div className="flex items-center gap-1.5">
              <span className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                문항 표시
              </span>
              <div className="flex items-center gap-1">
                {VERDICT_ORDER.map((s) => {
                  const on = chipStatuses.includes(s);
                  const style = STATUS_STYLE[s];
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setChipStatuses((prev) => toggleValue(prev, s))}
                      className={cn(
                        "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[12px] font-semibold transition-colors",
                        on
                          ? s === "UNKNOWN"
                            ? // 미상 on 은 STATUS_STYLE(bg-white·slate-300 링)로는 off 와
                              // 구분되지 않아 전용 강조를 쓴다.
                              "border-transparent bg-slate-200 text-slate-600 ring-1 ring-inset ring-slate-400"
                            : cn(style.bg, style.text, style.ring, "ring-1 ring-inset border-transparent")
                          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                      )}
                    >
                      <span>{style.symbol}</span>
                      {style.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              aria-pressed={wrongOnly}
              onClick={() => setWrongOnly((v) => !v)}
              className={cn(
                "inline-flex h-7 items-center whitespace-nowrap rounded-md border px-2 text-[12px] font-semibold transition-colors",
                wrongOnly
                  ? "border-transparent bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-500"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
              )}
            >
              오답 있는 {DIM_NOUN[dim]}만
            </button>

            {/* 우측: 결과 카운트 + 초기화 */}
            <div className="ml-auto flex items-center gap-2">
              {filterActive && (
                <span className="whitespace-nowrap text-[11.5px] font-semibold tabular-nums text-slate-500">
                  {visible.length}
                  <span className="font-medium text-slate-400"> / {sorted.length}</span>
                </span>
              )}
              {filterActive && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                >
                  <X className="h-3 w-3" />
                  초기화
                </button>
              )}
            </div>
          </div>
        )}

        {listLoading ? (
          <p className="py-8 text-center text-[12.5px] text-slate-400">불러오는 중…</p>
        ) : sorted.length === 0 ? (
          <p className="py-8 text-center text-[12.5px] text-slate-400">
            집계할 데이터가 없습니다.
          </p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
            <p className="text-[12.5px] font-semibold text-slate-500 break-keep">
              조건에 맞는 항목이 없습니다.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-0.5 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
            >
              필터 초기화
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((b) => (
              <BucketRow
                key={b.key}
                bucket={b}
                statusByNumber={statusByNumber}
                questionInfo={questionInfo}
                passageExcerpt={
                  dim === "passage" ? passageExcerptById.get(b.key) ?? null : null
                }
                chipStatuses={chipStatuses}
                onSelectQuestion={onSelectQuestion}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

