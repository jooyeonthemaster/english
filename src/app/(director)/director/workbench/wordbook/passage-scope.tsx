"use client";

// ============================================================================
// 단어장 생성 스튜디오 — 기출 범위 선택 바 (「기출 회차로 찾기」 렌즈 전용)
//
// 표 위 전폭 바. 레일(216px)에 넣지 않는 이유: 축이 6개(기간·시험·회차·유형·
// 문항·시험지)라 좁은 열에서는 칩이 세로로 흘러 "범위를 한눈에 본다"는 요점이
// 사라진다.
//
// 접기/펼치기는 **grid-template-rows 0fr↔1fr** 로 한다. max-height 임의값은
// 내용이 늘면 잘리거나(작게 잡으면) 접힘이 늦어지고(크게 잡으면), JS 높이 측정은
// 리사이즈·폰트 로드마다 다시 재야 한다. 0fr↔1fr 은 실제 내용 높이를 CSS 가
// 알아서 보간한다. 접힘 상태는 localStorage 로 남긴다.
//
// 선택지 카운트는 서버 실측이며 **자기 축을 제외한** 나머지 조건 기준이다
// (켜 놓은 값을 끄는 길이 항상 열려 있다 — wordbook-passages.getPassageFacetsData).
// ============================================================================

import { useMemo, useState } from "react";
import {
  CalendarRange,
  ChevronDown,
  FileText,
  Loader2,
  RotateCcw,
} from "lucide-react";
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
/** 유형 15종을 다 펴면 두 줄이 된다 — 기본은 상위 8개만. */
const TYPE_VISIBLE = 8;
const OPEN_KEY = "wordbook-scope-open";

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
  /** 시험지 목록은 열 때만 가져온다(매 조작마다 나가던 질의 1개를 뺐다) */
  papersLoading: boolean;
  onPapersOpen: () => void;
}

function toggle<T>(list: T[] | undefined, v: T): T[] | undefined {
  const cur = list ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  return next.length ? next : undefined;
}

// ── 부품 ─────────────────────────────────────────────────────────────────────

/** 선택지 칩 — 라벨 + 실측 지문 수. 카운트 0 은 서버가 내려주지 않는다. */
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
      className={`group inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap transition-colors ${
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
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

/**
 * 라벨 거터 — 고정 폭 + **줄바꿈 금지**.
 * ⚠️ w-9(36px)이던 시절 「시험지」가 "시험/지" 두 줄로 깨졌다. 3글자 라벨이
 *    들어가는 폭(w-12)과 whitespace-nowrap 을 함께 건다.
 */
function Row({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-start gap-2.5 ${className}`}>
      <span className="mt-[3px] w-12 shrink-0 whitespace-nowrap text-right text-[10.5px] font-bold tracking-wide text-slate-400">
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
      className="h-[22px] rounded-md border border-slate-200 bg-white pl-1.5 pr-0.5 text-[11px] tabular-nums text-slate-700 outline-none transition-colors focus:border-blue-400"
    >
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** 접힘 상태에서 보여줄 "지금 걸린 조건" 요약 문구. */
function activeSummary(s: WordbookPassageScope): string {
  const parts: string[] = [];
  if (s.yearFrom || s.yearTo) {
    parts.push(`${s.yearFrom ?? YEAR_MIN}–${s.yearTo ?? YEAR_MAX}`);
  }
  if (s.boards?.length) parts.push(s.boards.join("·"));
  if (s.grades?.length) parts.push(s.grades.join("·"));
  if (s.exams?.length) parts.push(s.exams.join("·"));
  if (s.typeGroups?.length) {
    parts.push(
      s.typeGroups.length > 2
        ? `${s.typeGroups.slice(0, 2).join("·")} 외 ${s.typeGroups.length - 2}`
        : s.typeGroups.join("·"),
    );
  }
  if (typeof s.qFrom === "number" || typeof s.qTo === "number") {
    parts.push(`${s.qFrom ?? Q_MIN}–${s.qTo ?? Q_MAX}번`);
  }
  if (s.examIds?.length) parts.push(`시험지 ${s.examIds.length}장 지정`);
  if (s.passageIds?.length) parts.push(`지문 ${s.passageIds.length}개 지정`);
  return parts.join(" · ") || "제한 없음";
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

export function PassageScopeBar({
  scope,
  onScope,
  summary,
  facets,
  papers,
  loading,
  papersLoading,
  onPapersOpen,
}: PassageScopeBarProps) {
  // 접힘 상태는 **지연 초기화**로 읽는다(effect 안 setState 금지 규칙).
  // 이 바는 「기출 회차로 찾기」 렌즈를 누른 뒤에만 마운트되므로 SSR 을 타지
  // 않아 하이드레이션 불일치가 생길 수 없다.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [papersOpen, setPapersOpen] = useState(false);
  const [typeAll, setTypeAll] = useState(false);

  const setOpenPersist = (v: boolean) => {
    setOpen(v);
    try {
      window.localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {
      /* 사파리 프라이빗 모드 등 — 접힘은 부가 기능이라 조용히 넘어간다 */
    }
  };

  const yearFrom = scope.yearFrom ?? YEAR_MIN;
  const yearTo = scope.yearTo ?? YEAR_MAX;
  const qFrom = scope.qFrom ?? Q_MIN;
  const qTo = scope.qTo ?? Q_MAX;
  const qActive = typeof scope.qFrom === "number" || typeof scope.qTo === "number";
  const pickedPapers = scope.examIds?.length ?? 0;
  const pickedPassages = scope.passageIds?.length ?? 0;

  const opt = (list: PassageFacetOption[] | undefined) => list ?? [];
  const types = opt(facets?.typeGroups);
  const shownTypes = typeAll ? types : types.slice(0, TYPE_VISIBLE);
  const hiddenTypeCount = Math.max(0, types.length - TYPE_VISIBLE);

  const reset = () =>
    onScope({
      yearFrom: undefined, yearTo: undefined, boards: undefined,
      exams: undefined, grades: undefined, typeGroups: undefined,
      qFrom: undefined, qTo: undefined, examIds: undefined, passageIds: undefined,
    });

  return (
    <section
      aria-label="기출 범위"
      className="shrink-0 border-b border-slate-200 bg-gradient-to-b from-slate-50/80 to-white"
    >
      {/* ── 헤더 — 접혀도 항상 보인다 ── */}
      <div className="flex h-11 items-center gap-2.5 px-3">
        <button
          type="button"
          onClick={() => setOpenPersist(!open)}
          aria-expanded={open}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-md py-1 pr-1 text-[11.5px] font-bold text-slate-700"
        >
          <CalendarRange className="size-[15px] text-blue-600" />
          기출 범위
          {/* 접기 토글 — 무표식 chevron 은 컨트롤로 안 읽힌다(유저 피드백).
              라벨+테두리 필로 승격해 누를 수 있는 것임을 드러낸다 */}
          <span className="flex h-[19px] shrink-0 items-center gap-0.5 rounded-md border border-blue-200 bg-blue-50/70 pl-1.5 pr-1 text-[10px] font-semibold text-blue-700 transition-colors group-hover:border-blue-300 group-hover:bg-blue-100">
            {open ? "접기" : "펼치기"}
            <ChevronDown
              className={`size-3 transition-transform duration-300 motion-reduce:transition-none ${open ? "" : "-rotate-90"}`}
            />
          </span>
        </button>

        {/* 요약 — 펼침이면 규모, 접힘이면 걸린 조건 */}
        <div className="min-w-0 flex-1 truncate text-[11.5px] tabular-nums text-slate-500">
          {open ? (
            summary ? (
              <span title="좌측 조건(품사·수준 등)을 적용하기 전, 이 범위에 나온 전체 수입니다. 조건까지 반영한 수는 아래 표의 「단어 N」입니다.">
                시험지 <b className="text-slate-800">{fmt(summary.papers)}</b>장
                <span className="mx-1 text-slate-300">·</span>
                지문 <b className="text-slate-800">{fmt(summary.passages)}</b>개
                <span className="mx-1 text-slate-300">·</span>
                단어 <b className="text-blue-700">{fmt(summary.senses)}</b>개
                {summary.yearMin && summary.yearMax ? (
                  <span className="ml-1.5 text-slate-400">
                    ({summary.yearMin}–{summary.yearMax})
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-slate-400">범위 계산 중…</span>
            )
          ) : (
            <span className="truncate text-slate-500">
              {activeSummary(scope)}
              {summary ? (
                <span className="ml-1.5 text-slate-400">
                  · 단어 {fmt(summary.senses)}개
                </span>
              ) : null}
            </span>
          )}
        </div>

        {loading ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-500" />
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50"
        >
          <RotateCcw className="size-3" />
          초기화
        </button>
      </div>

      {/* ── 본문 — 0fr↔1fr 로 실제 높이를 CSS 가 보간한다 ── */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div
            aria-hidden={!open}
            className={`flex flex-col gap-2 px-3 pb-2.5 transition-opacity duration-200 motion-reduce:transition-none ${
              open ? "opacity-100" : "opacity-0"
            }`}
          >
            {/* 기간 */}
            <Row label="기간">
              <NumSelect value={yearFrom} min={YEAR_MIN} max={YEAR_MAX} title="시작 연도"
                onChange={(v) => onScope({ yearFrom: v, yearTo: Math.max(v, yearTo) })} />
              <span className="text-[11px] text-slate-300">~</span>
              <NumSelect value={yearTo} min={YEAR_MIN} max={YEAR_MAX} title="끝 연도"
                onChange={(v) => onScope({ yearTo: v, yearFrom: Math.min(v, yearFrom) })} />
              <span className="mx-1 h-3 w-px bg-slate-200" />
              {YEAR_PRESETS.map((p) => {
                const on = yearFrom === p.from && yearTo === p.to;
                return (
                  <button key={p.label} type="button" aria-pressed={on}
                    onClick={() => onScope({ yearFrom: p.from, yearTo: p.to })}
                    className={`h-[22px] shrink-0 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap transition-colors ${
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

            {/* 시험 = 시행처 + 학년(다른 축이라 구분선으로 갈라 둔다) */}
            <Row label="시험">
              {opt(facets?.boards).map((o) => (
                <OptionChip key={o.key} label={o.label} count={o.passages}
                  active={!!scope.boards?.includes(o.key)}
                  onClick={() => onScope({ boards: toggle(scope.boards, o.key) })} />
              ))}
              {opt(facets?.grades).length ? (
                <span className="mx-1 h-3 w-px bg-slate-200" />
              ) : null}
              {opt(facets?.grades).map((o) => (
                <OptionChip key={o.key} label={o.label} count={o.passages}
                  active={!!scope.grades?.includes(o.key)}
                  onClick={() => onScope({ grades: toggle(scope.grades, o.key) })} />
              ))}
            </Row>

            {/* 회차 */}
            <Row label="회차">
              {opt(facets?.exams).map((o) => (
                <OptionChip key={o.key} label={o.label} count={o.passages}
                  active={!!scope.exams?.includes(o.key)}
                  onClick={() => onScope({ exams: toggle(scope.exams, o.key) })} />
              ))}
            </Row>

            {/* 유형 — 15종을 다 펴면 두 줄이 된다. 기본 8개 + 더보기 */}
            <Row label="유형">
              {shownTypes.map((o) => (
                <OptionChip key={o.key} label={o.label} count={o.passages}
                  active={!!scope.typeGroups?.includes(o.key)}
                  onClick={() => onScope({ typeGroups: toggle(scope.typeGroups, o.key) })} />
              ))}
              {hiddenTypeCount > 0 ? (
                <button type="button" onClick={() => setTypeAll((v) => !v)}
                  className="h-[22px] shrink-0 rounded-full border border-dashed border-slate-300 px-2 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50"
                >
                  {typeAll ? "접기" : `＋${hiddenTypeCount}개 더`}
                </button>
              ) : null}
            </Row>

            {/* 문항 + 시험지 — 한 줄에 둘을 얹어 세로 높이를 아낀다 */}
            <div className="flex min-w-0 flex-wrap items-start gap-x-5 gap-y-2">
              <Row label="문항" className="shrink-0">
                <NumSelect value={qFrom} min={Q_MIN} max={Q_MAX} title="시작 문항번호"
                  onChange={(v) => onScope({ qFrom: v, qTo: Math.max(v, qTo) })} />
                <span className="text-[11px] text-slate-300">~</span>
                <NumSelect value={qTo} min={Q_MIN} max={Q_MAX} title="끝 문항번호"
                  onChange={(v) => onScope({ qTo: v, qFrom: Math.min(v, qFrom) })} />
                {qActive ? (
                  <button type="button" onClick={() => onScope({ qFrom: undefined, qTo: undefined })}
                    className="h-[22px] rounded-full border border-slate-200 bg-white px-2 text-[11px] text-slate-500 hover:bg-slate-50"
                  >
                    해제
                  </button>
                ) : (
                  <span className="text-[10.5px] text-slate-400">
                    장문(41-42)은 걸치기만 해도 포함
                  </span>
                )}
              </Row>

              <Row label="시험지" className="min-w-[280px] flex-1">
                <button
                  type="button"
                  onClick={() => {
                    const next = !papersOpen;
                    setPapersOpen(next);
                    if (next) onPapersOpen();
                  }}
                  aria-expanded={papersOpen}
                  className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <FileText className="size-3" />
                  {pickedPapers > 0
                    ? `${fmt(pickedPapers)}장 지정됨`
                    : summary
                      ? `범위 안 ${fmt(summary.papers)}장`
                      : "시험지 고르기"}
                  <ChevronDown className={`size-3 transition-transform duration-200 ${papersOpen ? "rotate-180" : ""}`} />
                </button>
                {pickedPapers > 0 ? (
                  <button type="button" onClick={() => onScope({ examIds: undefined })}
                    className="h-[22px] rounded-full border border-slate-200 bg-white px-2 text-[11px] text-slate-500 hover:bg-slate-50"
                  >
                    지정 해제
                  </button>
                ) : null}
                {pickedPassages > 0 ? (
                  <span className="text-[10.5px] text-amber-600">
                    지문 {fmt(pickedPassages)}개 직접 지정 — 위 조건보다 우선
                  </span>
                ) : null}
              </Row>
            </div>

            {/* 시험지 목록 — 열었을 때만 */}
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                papersOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div className="ml-[58px] max-h-44 overflow-auto rounded-lg border border-slate-200 bg-white">
                  {papersLoading ? (
                    <p className="flex items-center gap-1.5 px-2.5 py-3 text-[11px] text-slate-400">
                      <Loader2 className="size-3 animate-spin" /> 시험지 불러오는 중…
                    </p>
                  ) : papers.length === 0 ? (
                    <p className="px-2.5 py-3 text-[11px] text-slate-400">
                      이 범위에 드는 시험지가 없습니다.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {papers.map((p) => {
                        const on = !!scope.examIds?.includes(p.examId);
                        return (
                          <li key={p.examId}>
                            <button type="button" aria-pressed={on}
                              onClick={() => onScope({ examIds: toggle(scope.examIds, p.examId) })}
                              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
                                on ? "bg-blue-50" : "hover:bg-slate-50"
                              }`}
                            >
                              <span className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border ${
                                on ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"
                              }`}>
                                {on ? <span className="size-1.5 rounded-[1px] bg-white" /> : null}
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
