"use client";

// ============================================================================
// 단어장 생성 스튜디오 — 기출 범위 선택 바 (「기출 회차로 찾기」 렌즈 전용)
//
// 테이블 위 전폭 바로 앉는다. 레일(216px)에 넣지 않는 이유: 축이 6개(연도·시험·
// 회차·학년·문항·유형)라 좁은 열에서는 칩이 세로로 길게 흘러 "범위를 한눈에
// 본다"는 이 기능의 요점이 사라진다.
//
// 모든 선택지는 **서버 실측 카운트**를 달고 온다(wordbook-passages.getPassageFacetsData).
// 축별 카운트는 "자기 축을 제외한" 나머지 조건 기준이라, 켜 놓은 값을 끄는 길이
// 항상 열려 있다(되돌릴 수 없는 필터 방지).
// ============================================================================

import { useMemo, useState } from "react";
import { CalendarRange, ChevronDown, FileText, RotateCcw } from "lucide-react";
import type {
  PassageFacetOption,
  PassageFacets,
  PassagePaper,
  PassageScopeSummary,
  WordbookPassageScope,
} from "./wordbook-types";
import { fmt } from "./wordbook-ui";

const YEAR_MIN = 2003;
const YEAR_MAX = 2027;
const Q_MIN = 18;
const Q_MAX = 55;

/** 자주 쓰는 연도 구간 — 디렉터가 매번 두 셀렉트를 돌리지 않게 한다. */
const YEAR_PRESETS: { label: string; from: number; to: number }[] = [
  { label: "최근 3년", from: YEAR_MAX - 2, to: YEAR_MAX },
  { label: "최근 5년", from: YEAR_MAX - 4, to: YEAR_MAX },
  { label: "최근 10년", from: YEAR_MAX - 9, to: YEAR_MAX },
  { label: "전체", from: YEAR_MIN, to: YEAR_MAX },
];

interface PassageScopeBarProps {
  scope: WordbookPassageScope;
  onScope: (patch: Partial<WordbookPassageScope>) => void;
  summary: PassageScopeSummary | null;
  facets: PassageFacets | null;
  papers: PassagePaper[];
  loading: boolean;
}

function toggle<T>(list: T[] | undefined, v: T): T[] | undefined {
  const cur = list ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  return next.length ? next : undefined;
}

/** 선택지 칩 — 라벨 + 실측 지문 수. 카운트 0 은 서버가 애초에 안 내려준다. */
function OptionChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded border px-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      {label}
      <span
        className={`tabular-nums text-[9.5px] ${active ? "text-blue-100" : "text-slate-400"}`}
      >
        {fmt(count)}
      </span>
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="mt-1 w-9 shrink-0 text-[10.5px] font-bold tracking-wide text-slate-400">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {children}
      </div>
    </div>
  );
}

function NumSelect({
  value,
  min,
  max,
  onChange,
  title,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  title: string;
}) {
  const opts = useMemo(() => {
    const out: number[] = [];
    for (let i = max; i >= min; i--) out.push(i);
    return out;
  }, [min, max]);
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={title}
      className="h-6 rounded border border-slate-200 bg-white px-1 text-[11px] tabular-nums text-slate-700 outline-none focus:border-blue-400"
    >
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function PassageScopeBar({
  scope,
  onScope,
  summary,
  facets,
  papers,
  loading,
}: PassageScopeBarProps) {
  const [papersOpen, setPapersOpen] = useState(false);

  const yearFrom = scope.yearFrom ?? YEAR_MIN;
  const yearTo = scope.yearTo ?? YEAR_MAX;
  const qFrom = scope.qFrom ?? Q_MIN;
  const qTo = scope.qTo ?? Q_MAX;
  const qActive = typeof scope.qFrom === "number" || typeof scope.qTo === "number";

  const pickedPapers = scope.examIds?.length ?? 0;
  const pickedPassages = scope.passageIds?.length ?? 0;

  const opt = (list: PassageFacetOption[] | undefined) => list ?? [];

  return (
    <div className="shrink-0 border-b border-slate-200 bg-slate-50/70">
      <div className="flex flex-col gap-1.5 px-3 py-2">
        {/* ── 요약 줄 ── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-slate-700">
            <CalendarRange className="size-3.5 text-blue-600" />
            기출 범위
          </span>
          {summary ? (
            // ⚠️ 이 수치는 **범위 자체의 크기**다. 아래 표의 「단어 N」은 여기에
            //    좌측 조건(품사·수준·기능어 제외 등)까지 적용한 결과라 더 작다.
            //    둘이 다른 게 정상이지만, 설명이 없으면 버그로 읽힌다.
            <span
              className="text-[11.5px] tabular-nums text-slate-500"
              title="좌측 조건(품사·수준 등)을 적용하기 전, 이 범위에 나온 전체 수입니다. 조건까지 반영한 수는 아래 표의 「단어 N」입니다."
            >
              시험지 <b className="text-slate-800">{fmt(summary.papers)}</b>장 · 지문{" "}
              <b className="text-slate-800">{fmt(summary.passages)}</b>개 · 범위 안 단어{" "}
              <b className="text-blue-700">{fmt(summary.senses)}</b>개
              {summary.yearMin && summary.yearMax ? (
                <span className="ml-1.5 text-slate-400">
                  ({summary.yearMin}–{summary.yearMax})
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-[11.5px] text-slate-400">범위 계산 중…</span>
          )}
          {loading ? (
            <span className="size-3 animate-spin rounded-full border-[1.5px] border-slate-300 border-t-blue-600" />
          ) : null}

          <button
            type="button"
            onClick={() =>
              onScope({
                yearFrom: undefined, yearTo: undefined, boards: undefined,
                exams: undefined, grades: undefined, typeGroups: undefined,
                qFrom: undefined, qTo: undefined, examIds: undefined,
                passageIds: undefined,
              })
            }
            className="ml-auto inline-flex h-6 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
          >
            <RotateCcw className="size-3" />
            범위 초기화
          </button>
        </div>

        {/* ── 연도 ── */}
        <Row label="연도">
          <NumSelect value={yearFrom} min={YEAR_MIN} max={YEAR_MAX} title="시작 연도"
            onChange={(v) => onScope({ yearFrom: v, yearTo: Math.max(v, yearTo) })} />
          <span className="text-[11px] text-slate-400">~</span>
          <NumSelect value={yearTo} min={YEAR_MIN} max={YEAR_MAX} title="끝 연도"
            onChange={(v) => onScope({ yearTo: v, yearFrom: Math.min(v, yearFrom) })} />
          <span className="mx-0.5 h-3.5 w-px bg-slate-200" />
          {YEAR_PRESETS.map((p) => {
            const on = yearFrom === p.from && yearTo === p.to;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onScope({ yearFrom: p.from, yearTo: p.to })}
                aria-pressed={on}
                className={`h-6 shrink-0 rounded border px-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                  on
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </Row>

        {/* ── 시험(시행처) · 학년 ── */}
        <Row label="시험">
          {opt(facets?.boards).map((o) => (
            <OptionChip
              key={o.key}
              label={o.label}
              count={o.passages}
              active={!!scope.boards?.includes(o.key)}
              onClick={() => onScope({ boards: toggle(scope.boards, o.key) })}
            />
          ))}
          <span className="mx-0.5 h-3.5 w-px bg-slate-200" />
          {opt(facets?.grades).map((o) => (
            <OptionChip
              key={o.key}
              label={o.label}
              count={o.passages}
              active={!!scope.grades?.includes(o.key)}
              onClick={() => onScope({ grades: toggle(scope.grades, o.key) })}
            />
          ))}
        </Row>

        {/* ── 회차 ── */}
        <Row label="회차">
          {opt(facets?.exams).map((o) => (
            <OptionChip
              key={o.key}
              label={o.label}
              count={o.passages}
              active={!!scope.exams?.includes(o.key)}
              onClick={() => onScope({ exams: toggle(scope.exams, o.key) })}
            />
          ))}
        </Row>

        {/* ── 유형 · 문항번호 ── */}
        <Row label="유형">
          {opt(facets?.typeGroups).map((o) => (
            <OptionChip
              key={o.key}
              label={o.label}
              count={o.passages}
              active={!!scope.typeGroups?.includes(o.key)}
              onClick={() => onScope({ typeGroups: toggle(scope.typeGroups, o.key) })}
            />
          ))}
        </Row>

        <Row label="문항">
          <NumSelect value={qFrom} min={Q_MIN} max={Q_MAX} title="시작 문항번호"
            onChange={(v) => onScope({ qFrom: v, qTo: Math.max(v, qTo) })} />
          <span className="text-[11px] text-slate-400">~</span>
          <NumSelect value={qTo} min={Q_MIN} max={Q_MAX} title="끝 문항번호"
            onChange={(v) => onScope({ qTo: v, qFrom: Math.min(v, qFrom) })} />
          {qActive ? (
            <button
              type="button"
              onClick={() => onScope({ qFrom: undefined, qTo: undefined })}
              className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-500 hover:bg-slate-50"
            >
              문항 제한 해제
            </button>
          ) : (
            <span className="text-[10.5px] text-slate-400">
              번호를 바꾸면 그 구간 문항만 봅니다 (41-42 같은 장문은 걸치기만 해도 포함)
            </span>
          )}
        </Row>

        {/* ── 시험지 골라담기 ── */}
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-1 w-9 shrink-0 text-[10.5px] font-bold tracking-wide text-slate-400">
            시험지
          </span>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setPapersOpen((v) => !v)}
              className="inline-flex h-6 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              <FileText className="size-3" />
              {pickedPapers > 0
                ? `${fmt(pickedPapers)}장 콕 집어 선택됨`
                : `범위 안 시험지 ${fmt(papers.length)}장`}
              <ChevronDown className={`size-3 transition-transform ${papersOpen ? "rotate-180" : ""}`} />
            </button>
            {pickedPapers > 0 ? (
              <button
                type="button"
                onClick={() => onScope({ examIds: undefined })}
                className="ml-1 h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-500 hover:bg-slate-50"
              >
                시험지 선택 해제
              </button>
            ) : null}
            {pickedPassages > 0 ? (
              <span className="ml-1.5 text-[10.5px] text-amber-600">
                지문 {fmt(pickedPassages)}개 직접 지정됨 — 위 조건보다 우선합니다
              </span>
            ) : null}

            {papersOpen ? (
              <div className="mt-1.5 max-h-44 overflow-auto rounded-md border border-slate-200 bg-white">
                {papers.length === 0 ? (
                  <p className="px-2 py-3 text-[11px] text-slate-400">
                    이 범위에 드는 시험지가 없습니다.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {papers.map((p) => {
                      const on = !!scope.examIds?.includes(p.examId);
                      return (
                        <li key={p.examId}>
                          <button
                            type="button"
                            onClick={() => onScope({ examIds: toggle(scope.examIds, p.examId) })}
                            aria-pressed={on}
                            className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors ${
                              on ? "bg-blue-50" : "hover:bg-slate-50"
                            }`}
                          >
                            <span
                              className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border ${
                                on ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"
                              }`}
                            >
                              {on ? (
                                <span className="size-1.5 rounded-[1px] bg-white" />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-slate-700">
                              {p.title}
                            </span>
                            <span className="shrink-0 text-[10.5px] tabular-nums text-slate-400">
                              {p.qFrom}–{p.qTo}번 · 지문 {fmt(p.passages)} · 단어{" "}
                              <b className="text-slate-600">{fmt(p.senses)}</b>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
