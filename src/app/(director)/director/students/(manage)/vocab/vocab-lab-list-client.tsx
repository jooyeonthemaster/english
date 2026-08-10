"use client";

// ============================================================================
// 단어 훈련 현황 — 학생별 진행·취약 표제어 모니터링 (어법 grammar-lab-list-client
// 의 구조·클래스 미러 — 디렉터 디자인 시스템, gd.css 아님)
//
// KPI 스트립 + 학생 테이블(정렬 헤더) + 학원 취약 표제어 TOP 20 +
// 표제어 검색(vocab-lemma-search) + 단어장 관리(vocab-deck-manage) —
// 500줄 계약으로 검색·덱 섹션은 형제 파일 분리(grammar-lab 분할 선례).
//
// embedded 계약(어법 C-1 동형): true 면 자체 PageShell·SectionCard 타이틀 계층
// 없이 내용부만 렌더 — 공통 셸은 (manage) layout 담당.
// ============================================================================

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BookA, ChevronDown, ChevronUp, Search, Target } from "lucide-react";

import type {
  AcademyWeakLemmaRow,
  VocabLabStudentRow,
} from "@/actions/vocab-drill-admin/queries";
import type { VocabDeckRow } from "@/actions/vocab-drill-admin/decks";
import { VOCAB_POS_LABELS } from "@/lib/vocab-drill/display";
import {
  PageShell,
  SectionCard,
  StatStrip,
  StatTile,
} from "@/components/layout/page-frame";
import { METRIC_LABELS } from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";
import { VocabLemmaSearchCard } from "./vocab-lemma-search";
import { VocabDeckManageCard } from "./vocab-deck-manage";

// ── 로컬 포매터 ──────────────────────────────────────────────────────────────

const KST = 9 * 3_600_000;
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const d = new Date(t + KST);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// ── 정렬 ─────────────────────────────────────────────────────────────────────

type SortKey =
  | "name"
  | "grade"
  | "attempts"
  | "accuracy"
  | "seen"
  | "mastered"
  | "weak"
  | "recent";
type SortDir = "asc" | "desc";

const SORT_DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  grade: "asc",
  attempts: "desc",
  accuracy: "desc",
  seen: "desc",
  mastered: "desc",
  weak: "desc",
  recent: "desc",
};

function sortValue(row: VocabLabStudentRow, key: SortKey): number | string {
  switch (key) {
    case "name":
      return row.name;
    case "grade":
      return row.grade;
    case "attempts":
      return row.attempts;
    case "accuracy":
      return row.accuracy ?? -1;
    case "seen":
      return row.sensesSeen;
    case "mastered":
      return row.sensesMastered;
    case "weak":
      return row.weakCount;
    case "recent":
      return row.lastStudiedAt ?? "";
  }
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

export function VocabLabListClient({
  students,
  weakLemmas,
  decks,
  embedded = false,
}: {
  students: VocabLabStudentRow[];
  weakLemmas: AcademyWeakLemmaRow[];
  decks: VocabDeckRow[];
  embedded?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const stats = useMemo(() => {
    const active = students.filter((s) => s.attempts > 0);
    const accuracies = active
      .map((s) => s.accuracy)
      .filter((a): a is number => a !== null);
    return {
      activeCount: active.length,
      totalCount: students.length,
      totalAttempts: students.reduce((sum, s) => sum + s.attempts, 0),
      avgAccuracy:
        accuracies.length > 0
          ? Math.round(accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length)
          : null,
      masteredSum: students.reduce((sum, s) => sum + s.sensesMastered, 0),
    };
  }, [students]);

  const filtered = useMemo(() => {
    let rows = students;
    const q = query.trim().toLowerCase();
    if (q) rows = rows.filter((s) => s.name.toLowerCase().includes(q));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "ko") * dir;
      }
      return (va - vb) * dir;
    });
  }, [students, query, sortKey, sortDir]);

  const changeSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(SORT_DEFAULT_DIR[key]);
    }
  };

  // 축 표기 규약: 집계 창이 다른 지표를 한 표에 놓을 때는 라벨에 창을 박는다.
  // 시도·정답률·최근 학습은 최근 90일, 본/완성/취약 단어는 누적이다.
  const headers: { key: SortKey; label: string; numeric?: boolean }[] = [
    { key: "name", label: "학생" },
    { key: "grade", label: "학년", numeric: true },
    { key: "attempts", label: "시도(90일)", numeric: true },
    { key: "accuracy", label: "정답률(90일)", numeric: true },
    { key: "seen", label: "본 단어", numeric: true },
    { key: "mastered", label: "완성 단어", numeric: true },
    { key: "weak", label: METRIC_LABELS.WEAK, numeric: true },
    { key: "recent", label: "최근 학습(90일)" },
  ];

  return (
    <LabShell embedded={embedded}>
      <LabCard embedded={embedded}>
        {/* KPI 스트립 — 어법 현황과 동일 배치(카드 헤더 아래 내부) */}
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3">
          <StatStrip className="lg:grid-cols-4 xl:grid-cols-4">
            <StatTile
              label="학습 학생"
              value={`${stats.activeCount}명`}
              sub={`전체 ${stats.totalCount}명`}
            />
            <StatTile
              label="풀이"
              value={stats.totalAttempts.toLocaleString()}
              sub="문항 · 최근 90일"
            />
            <StatTile
              label="평균 정답률"
              value={stats.avgAccuracy === null ? "—" : `${stats.avgAccuracy}%`}
              sub="학습 학생 · 최근 90일"
              tone={
                stats.avgAccuracy === null
                  ? "slate"
                  : stats.avgAccuracy >= 70
                    ? "emerald"
                    : stats.avgAccuracy < 50
                      ? "rose"
                      : "slate"
              }
            />
            <StatTile
              label="완성 단어 합"
              value={stats.masteredSum.toLocaleString()}
              sub="숙달도 80점 도달 누적"
              tone={stats.masteredSum > 0 ? "blue" : "slate"}
            />
          </StatStrip>
        </div>

        {/* 검색 툴바 */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          <Search className="size-4 shrink-0 text-slate-300" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 검색"
            className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-300"
          />
          <span className="shrink-0 text-[12px] tabular-nums text-slate-400">
            {filtered.length}명
          </span>
        </div>

        {/* 학생 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {headers.map((h) => (
                  <th key={h.key} className={cn("px-3 py-2", h.numeric && "text-right")}>
                    <button
                      type="button"
                      onClick={() => changeSort(h.key)}
                      className={cn(
                        "inline-flex items-center gap-0.5 text-[11.5px] font-semibold transition-colors",
                        sortKey === h.key
                          ? "text-blue-700"
                          : "text-slate-500 hover:text-slate-700",
                      )}
                    >
                      {h.label}
                      {sortKey === h.key ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="size-3" aria-hidden />
                        ) : (
                          <ChevronDown className="size-3" aria-hidden />
                        )
                      ) : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={headers.length}
                    className="px-4 py-10 text-center text-[13px] text-slate-400"
                  >
                    {query.trim() ? "조건에 맞는 학생이 없습니다." : "표시할 학생이 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr
                    key={s.studentId}
                    onClick={() => router.push(`/director/students/${s.studentId}?tab=vocab`)}
                    className="cursor-pointer border-b border-slate-50 transition-colors hover:bg-slate-50/60"
                  >
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-slate-800">
                      {s.name}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12.5px] tabular-nums text-slate-500">
                      {s.grade}학년
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12.5px] tabular-nums text-slate-600">
                      {s.attempts.toLocaleString()}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right text-[12.5px] font-semibold tabular-nums",
                        s.accuracy === null
                          ? "text-slate-300"
                          : s.accuracy < 50
                            ? "text-rose-600"
                            : s.accuracy >= 80
                              ? "text-emerald-600"
                              : "text-slate-700",
                      )}
                    >
                      {s.accuracy === null ? "—" : `${s.accuracy}%`}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12.5px] tabular-nums text-slate-600">
                      {s.sensesSeen.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12.5px] tabular-nums text-slate-600">
                      {s.sensesMastered.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {s.weakCount > 0 ? (
                        <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-rose-600">
                          {s.weakCount}
                        </span>
                      ) : (
                        <span className="text-[12px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] tabular-nums text-slate-500">
                      {fmtDate(s.lastStudiedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </LabCard>

      <WeakLemmaRanking rows={weakLemmas} />
      <VocabLemmaSearchCard />
      <VocabDeckManageCard decks={decks} />
    </LabShell>
  );
}

// ── 학원 취약 표제어 TOP 20 ──────────────────────────────────────────────────

function WeakLemmaRanking({ rows }: { rows: AcademyWeakLemmaRow[] }) {
  return (
    <SectionCard
      icon={Target}
      title={`학원 ${METRIC_LABELS.WEAK} 단어 TOP 20`}
      description={`${METRIC_LABELS.MASTERY} 60점 미만 기록(학생×뜻)이 많은 표제어를 순서대로 보여줍니다.`}
      bodyClassName="p-0"
    >
      {rows.length === 0 ? (
        <p className="break-keep px-4 py-8 text-center text-[13px] text-slate-500">
          아직 {METRIC_LABELS.WEAK} 단어가 없습니다. 학생들의 훈련 기록이 쌓이면 여기에 나타납니다.
        </p>
      ) : (
        <ul className="grid grid-cols-1 divide-y divide-slate-50 md:grid-cols-2 md:divide-y-0">
          {rows.map((row, idx) => (
            <li key={row.lemmaId} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums",
                  idx < 3 ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500",
                )}
              >
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-1.5">
                  <span className="truncate text-[13.5px] font-semibold text-slate-800">
                    {row.lemma}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {VOCAB_POS_LABELS[row.pos] ?? row.pos}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">
                  {METRIC_LABELS.WEAK} {row.weakCount}건 · 평균 {METRIC_LABELS.MASTERY}{" "}
                  <span
                    className={cn(
                      "font-bold",
                      row.avgScore < 50 ? "text-rose-600" : "text-slate-600",
                    )}
                  >
                    {row.avgScore}점
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ── embedded 셸 분기 — 어법 C-1 계약 미러 ────────────────────────────────────

function LabShell({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  if (!embedded) return <PageShell>{children}</PageShell>;
  return <div className="flex w-full min-w-0 flex-col gap-4">{children}</div>;
}

function LabCard({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  if (!embedded) {
    return (
      <SectionCard
        icon={BookA}
        title="단어 훈련 현황"
        description={`학생별 단어 훈련 진행과 ${METRIC_LABELS.WEAK} 단어를 모니터링합니다. 상세 분석은 학생 카드에서 이어집니다.`}
        bodyClassName="p-0"
      >
        {children}
      </SectionCard>
    );
  }
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="min-w-0 p-0">{children}</div>
    </section>
  );
}
