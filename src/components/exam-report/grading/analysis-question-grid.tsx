"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 탭 · 문항별 결과 그리드(AI 0콜)
//
// 전 문항을 정오색 타일로 펼치고, 채점 필터바(유형·정오·난이도·지문)를 그대로
// 재사용해 강박적 필터링을 건다. 타일 클릭 → 원본 문항 상세보기 모달.
//
// 타일은 필터 축을 전부 면에 드러낸다 — 난이도·지문으로 거를 수 있는데 타일에
// 그 정보가 없으면 사용자는 필터가 실제로 먹었는지 검증할 수 없다. 위계는
// (번호+정오기호) → 유형 → (난이도·배점) → 지문 순으로 눕히고, 지문 전문은
// title 속성에 넘겨 좁은 타일이 답답해지지 않게 한다.
//
// 난이도·지문 축은 원본 문항 재조회(reviewItems)에서 온다. 그 조회가 실패하면
// 지금까지는 필터 옵션만 조용히 줄어 "왜 지문 필터가 없지"를 알 수 없었다 —
// 자매 패널(analysis-breakdown)과 같은 문구·같은 모양으로 고지하고 재시도를 준다.
// ============================================================================

import { useMemo, useState } from "react";
import { LayoutGrid, Wand2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { VARIANT_COPY } from "@/lib/wording/director-glossary";
import type { ResponseStatus } from "@/lib/exam-report/types";
import { STATUS_STYLE } from "./grading-shared";
import { DIFFICULTY_LABEL, type AnalysisRowMeta } from "./grading-weakness";
import {
  EMPTY_VERDICT_FILTER,
  VerdictFilterBar,
  buildVerdictFilterOptions,
  isVerdictFilterActive,
  matchesVerdictFilter,
  type VerdictFilterState,
} from "./verdict-filter-bar";

interface AnalysisQuestionGridProps {
  metas: AnalysisRowMeta[];
  detailAvailable: boolean;
  /** 원본 문항 재조회 진행 중(난이도·지문 축이 아직 확정 전). */
  reviewLoading?: boolean;
  /** 원본 재조회 실패 — 정상 강등(사진 리포트 등)과 구분해 재시도를 안내한다. */
  reviewError?: boolean;
  onRetryReview?: () => void;
  onSelectQuestion: (number: string) => void;
  // ── 오답 일괄 변형 CTA(spec §8.3) — 전부 옵셔널 ────────────────────────────
  // 시드 조립·라우팅은 호출처(analysis-step)가 소유하고, 이 그리드는 헤더 자리와
  // 비활성 사유 표기만 책임진다. 안 넘기면 CTA 자체가 렌더되지 않아 다른 호출처는
  // 무영향이다.
  /** 누르면 변형 생성 딥링크로 이동. 없으면 CTA 미렌더. */
  onBulkVariant?: () => void;
  /** 실제로 넘길 수 있는 원본 문항 수 — 라벨의 (n). */
  bulkVariantCount?: number;
  /** 비활성 사유 한 문장. null 이면 활성. */
  bulkVariantDisabledReason?: string | null;
}

/** 타일 상태 스타일 — STATUS_STYLE 4색 계약의 면(面) 변주. */
const TILE_STYLE: Record<ResponseStatus, { box: string; symbol: string }> = {
  CORRECT: {
    box: "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300 hover:bg-emerald-50",
    symbol: "text-emerald-600",
  },
  WRONG: {
    box: "border-rose-200 bg-rose-50/50 hover:border-rose-300 hover:bg-rose-50",
    symbol: "text-rose-600",
  },
  PARTIAL: {
    box: "border-blue-200 bg-blue-50/50 hover:border-blue-300 hover:bg-blue-50",
    symbol: "text-blue-700",
  },
  UNKNOWN: {
    box: "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
    symbol: "text-slate-300",
  },
};

/** 타일 hover 툴팁 — 좁은 면에 다 못 담는 축(지문 전문 포함)을 한 줄로 합친다. */
function tileTitle(m: AnalysisRowMeta, statusLabel: string): string {
  const parts = [`${m.number}번`, m.typeLabel, statusLabel];
  const difficulty = m.difficultyKey
    ? DIFFICULTY_LABEL[m.difficultyKey] ?? m.difficultyKey
    : null;
  if (difficulty) parts.push(difficulty);
  if (m.points != null) parts.push(`${m.points}점`);
  if (m.passageLabel) parts.push(`지문 ${m.passageLabel}`);
  return parts.join(" · ");
}

export function AnalysisQuestionGrid({
  metas,
  detailAvailable,
  reviewLoading = false,
  reviewError = false,
  onRetryReview,
  onSelectQuestion,
  onBulkVariant,
  bulkVariantCount = 0,
  bulkVariantDisabledReason = null,
}: AnalysisQuestionGridProps) {
  const [filter, setFilter] = useState<VerdictFilterState>(EMPTY_VERDICT_FILTER);

  const options = useMemo(() => buildVerdictFilterOptions(metas), [metas]);

  // 재채점·원본 재조회 결과로 옵션 집합이 바뀌면(예: 유도 난이도 INTERMEDIATE →
  // 원본 확정 KILLER, 지문 조회 실패로 지문 축 소멸) 선택값이 유령으로 남아
  // "조건에 맞는 문항이 없습니다"에 갇힌다. 자매 패널(analysis-breakdown 의
  // effectiveSel)과 같은 방식으로 현재 유효 옵션과의 교집합만 사용한다.
  // 변화가 없으면 원본 참조를 그대로 돌려줘 하위 memo 가 헛돌지 않게 한다.
  const effectiveFilter = useMemo(() => {
    const validTypes = new Set(options.typeOptions.map((o) => o.value));
    const validDifficulties = new Set(options.difficultyOptions.map((o) => o.value));
    const validPassages = new Set(options.passageOptions.map((o) => o.value));
    const types = filter.types.filter((v) => validTypes.has(v));
    const difficulties = filter.difficulties.filter((v) => validDifficulties.has(v));
    const passageIds = filter.passageIds.filter((v) => validPassages.has(v));
    if (
      types.length === filter.types.length &&
      difficulties.length === filter.difficulties.length &&
      passageIds.length === filter.passageIds.length
    ) {
      return filter;
    }
    return { ...filter, types, difficulties, passageIds };
  }, [filter, options]);

  const filterActive = isVerdictFilterActive(effectiveFilter);
  const filtered = useMemo(
    () =>
      filterActive
        ? metas.filter((m) => matchesVerdictFilter(m, effectiveFilter))
        : metas,
    [metas, effectiveFilter, filterActive],
  );

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <LayoutGrid className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-[14px] font-bold text-slate-900">문항별 결과</h2>
            <p className="text-[12px] font-medium text-slate-400 break-keep">
              타일을 누르면 원본 문항·해설·학생답이 열립니다.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
          {/* 난이도·지문 축의 출처(원본 재조회) 상태 고지 — 취약점 분해와 동일 문구·모양. */}
          {reviewLoading ? (
            <span className="text-[11px] text-slate-400">불러오는 중…</span>
          ) : reviewError ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 break-keep">
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
          ) : null}
          {/* 총계 고정 표기 — 필터 결과(N/M)는 아래 필터바가 담당(이중 표기 방지). */}
          <span className="text-[12px] font-semibold tabular-nums text-slate-400">
            {metas.length}문항
          </span>
          {/* 오답 일괄 변형(spec §8.3) — 이 표면이 R8 진입점 4개 중 하나다.
              비활성일 때는 개수를 감춘다. 회색 버튼에 (3)이 적혀 있으면 "준비됐는데
              왜 안 눌리지"가 되므로, 사유를 title 과 함께 12px 한 줄로도 내보낸다
              (툴팁만으로는 터치·보조기술에서 도달 불가). */}
          {onBulkVariant && (
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={onBulkVariant}
                disabled={bulkVariantDisabledReason != null}
                title={bulkVariantDisabledReason ?? undefined}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                <Wand2 className="size-4" aria-hidden />
                {VARIANT_COPY.BULK}
                {bulkVariantDisabledReason == null && ` (${bulkVariantCount})`}
              </button>
              {/* 재조회 중에는 좌측에 이미 「불러오는 중…」이 떠 있다 — 같은 사실을
                  두 줄로 반복하지 않고 title 툴팁만 남긴다. */}
              {bulkVariantDisabledReason && !reviewLoading && (
                <span className="text-[12px] font-medium text-slate-400 break-keep">
                  {bulkVariantDisabledReason}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <VerdictFilterBar
        filter={effectiveFilter}
        onChange={setFilter}
        typeOptions={options.typeOptions}
        difficultyOptions={options.difficultyOptions}
        passageOptions={options.passageOptions}
        statusCounts={options.statusCounts}
        filteredCount={filtered.length}
        totalCount={metas.length}
        detailAvailable={detailAvailable}
      />

      <div className="p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-[13px] font-semibold text-slate-500">
              조건에 맞는 문항이 없습니다.
            </p>
            <button
              type="button"
              onClick={() => setFilter(EMPTY_VERDICT_FILTER)}
              className="mt-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
            >
              필터 초기화
            </button>
          </div>
        ) : (
          // 난이도·지문 줄이 붙어 타일이 세로로 자란다 — 최소폭을 8rem 으로 올려
          // "중급 3점"·유형명 한 줄이 깨지지 않게 한다(그 이상은 1fr 로 늘어난다).
          //
          // auto-fill 은 아이템이 없어도 빈 트랙을 만들어 둔다 — 5문항짜리 시험에서
          // 카드 우측 절반이 상시 공백이었다. auto-fit 으로 빈 트랙을 접고, 대신
          // 문항이 적을 때 타일이 화면 폭만큼 과대해지지 않도록 그리드 자체의
          // 최대폭을 묶는다(타일 하나가 300px 이 되면 위계가 무너진다).
          <ul className="grid max-w-[64rem] grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
            {filtered.map((m) => {
              const style = TILE_STYLE[m.status];
              const status = STATUS_STYLE[m.status];
              const difficulty = m.difficultyKey
                ? DIFFICULTY_LABEL[m.difficultyKey] ?? m.difficultyKey
                : null;
              return (
                <li key={m.number}>
                  <button
                    type="button"
                    onClick={() => onSelectQuestion(m.number)}
                    title={tileTitle(m, status.label)}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors",
                      style.box,
                    )}
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span className="text-[14px] font-extrabold tabular-nums text-slate-800">
                        {m.number}
                      </span>
                      <span className={cn("text-[13px] font-bold leading-none", style.symbol)}>
                        {status.symbol}
                      </span>
                    </span>
                    {/* 유형·배점·지문은 칩이 아니라 읽어야 하는 평문이다 —
                        스펙 §1.1 타이포 하한(보조 12px, 칩·배지만 10~11px)에 맞춘다. */}
                    <span className="truncate text-[12px] font-semibold text-slate-500">
                      {m.typeLabel}
                    </span>
                    <span className="flex items-center gap-1">
                      {/* 난이도 배지는 정오색과 경쟁하지 않게 중립(slate) 고정. */}
                      {difficulty && (
                        <span className="inline-flex h-4 shrink-0 items-center rounded border border-slate-200 bg-white px-1 text-[10px] font-bold text-slate-500">
                          {difficulty}
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
                        {m.points != null ? `${m.points}점` : "—"}
                      </span>
                    </span>
                    {m.passageLabel && (
                      <span className="truncate text-[11px] font-medium text-slate-400">
                        {m.passageLabel}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
