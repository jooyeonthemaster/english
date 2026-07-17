"use client";

// 학생 상세 허브 — 어법 "개념 학습" 서브뷰.
// 학생이 /g 개념 학습(레슨)에서 남긴 진행·확인문항·이해도·필기를 교사 시야로 편다.
// 핵심 가치: 학생이 자기 말로 쓴 필기(note) = 오개념을 잡는 창.
// 관리자 디자인 시스템(shadcn/tailwind) — grammar-analysis.tsx 의 관용구를 따른다.

import { useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  HelpCircle,
  NotebookPen,
  Target,
} from "lucide-react";
import type { GrammarLabStudentDetail } from "@/actions/grammar-drill-admin";
import { formatDurationMs } from "@/lib/grammar-drill/display";
import { cn } from "@/lib/utils";

type Lesson = GrammarLabStudentDetail["lessons"][number];

const PART_NAMES: Record<number, string> = {
  0: "기초 골격",
  1: "1부 골격기",
  2: "2부 연결기",
  3: "3부 정밀기",
};

const CONFIDENCE_LABEL: Record<number, string> = {
  1: "자신 없음",
  2: "알 것 같음",
  3: "설명할 수 있음",
};

function lessonDone(l: Lesson): boolean {
  return l.completedAt !== null || (l.blocksTotal > 0 && l.blocksSeen >= l.blocksTotal);
}

/** 이해도 1~3 아이콘 — 주황/앰버 금지 계약에 따라 rose→slate→emerald 3단. */
function ConfidenceMark({ value }: { value: number | null }) {
  if (value === 1) {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-rose-600">
        <HelpCircle className="size-3.5" strokeWidth={1.75} aria-hidden />
        자신 없음
      </span>
    );
  }
  if (value === 2) {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-slate-500">
        <CircleDot className="size-3.5" strokeWidth={1.75} aria-hidden />
        알 것 같음
      </span>
    );
  }
  if (value === 3) {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-600">
        <CheckCircle2 className="size-3.5" strokeWidth={1.75} aria-hidden />
        설명할 수 있음
      </span>
    );
  }
  return <span className="text-[11.5px] text-slate-300">미응답</span>;
}

export function GrammarLessons({
  detail,
  onOpenWeakComposer,
}: {
  detail: GrammarLabStudentDetail;
  onOpenWeakComposer: (weak: { conceptId: string; title: string; score: number }[]) => void;
}) {
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const toggleNote = (conceptId: string) =>
    setOpenNotes((prev) => {
      const next = new Set(prev);
      if (next.has(conceptId)) next.delete(conceptId);
      else next.add(conceptId);
      return next;
    });

  const byConcept = useMemo(() => {
    const map = new Map<string, Lesson>();
    for (const l of detail.lessons) map.set(l.conceptId, l);
    return map;
  }, [detail.lessons]);

  const conceptTotal = useMemo(
    () => detail.grid.reduce((sum, u) => sum + u.concepts.length, 0),
    [detail.grid],
  );

  const stats = useMemo(() => {
    const ls = detail.lessons;
    const done = ls.filter(lessonDone).length;
    const checkTotal = ls.reduce((s, l) => s + l.checkTotal, 0);
    const checkCorrect = ls.reduce((s, l) => s + l.checkCorrect, 0);
    const unsure = ls.filter((l) => l.confidence === 1).length;
    const withTime = ls.filter((l) => l.secondsSpent > 0);
    const avgSec = withTime.length
      ? Math.round(withTime.reduce((s, l) => s + l.secondsSpent, 0) / withTime.length)
      : 0;
    const notes = ls.filter((l) => (l.note ?? "").trim().length > 0).length;
    return { done, checkTotal, checkCorrect, unsure, avgSec, notes };
  }, [detail.lessons]);

  // 교사가 가장 먼저 봐야 할 정보 — "자신 없음"으로 표시한 개념
  const unsureLessons = useMemo(() => {
    const titleOf = new Map<string, { title: string; unitTitle: string }>();
    for (const u of detail.grid) {
      for (const c of u.concepts) {
        titleOf.set(c.conceptId, { title: c.title, unitTitle: u.title });
      }
    }
    return detail.lessons
      .filter((l) => l.confidence === 1)
      .map((l) => ({
        lesson: l,
        title: titleOf.get(l.conceptId)?.title ?? l.conceptTitle,
        unitTitle: titleOf.get(l.conceptId)?.unitTitle ?? l.unitId,
      }));
  }, [detail.grid, detail.lessons]);

  if (detail.lessons.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-14">
        <BookOpen className="size-6 text-slate-300" strokeWidth={1.75} aria-hidden />
        <p className="text-[13.5px] font-medium text-slate-500">
          아직 개념 학습 기록이 없습니다.
        </p>
        <p className="max-w-md break-keep text-center text-[12px] text-slate-400">
          학생이 학습 앱(/g)에서 개념 카드를 읽고 확인 문항을 풀면, 개념별 이해도와 학생이
          직접 쓴 필기가 여기에 쌓입니다.
        </p>
        <button
          type="button"
          onClick={() => onOpenWeakComposer([])}
          className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <Target className="size-4" strokeWidth={1.75} aria-hidden />
          어법 훈련 과제 만들기
        </button>
        <p className="text-[11.5px] text-slate-400">
          과제를 배정하면 학생이 해당 유닛의 개념 학습부터 시작합니다.
        </p>
      </div>
    );
  }

  const checkRate =
    stats.checkTotal > 0 ? Math.round((stats.checkCorrect / stats.checkTotal) * 100) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LessonKpi
          label="개념 학습 완료"
          value={`${stats.done}/${conceptTotal}`}
          sub={`진행 중 ${Math.max(0, detail.lessons.length - stats.done)}개`}
        />
        <LessonKpi
          label="확인 문항 정답률"
          value={checkRate === null ? "—" : `${checkRate}%`}
          sub={stats.checkTotal > 0 ? `${stats.checkCorrect}/${stats.checkTotal}문항` : "기록 없음"}
          tone={
            checkRate === null ? "slate" : checkRate >= 70 ? "emerald" : checkRate < 50 ? "rose" : "slate"
          }
        />
        <LessonKpi
          label="자신 없음 표시"
          value={`${stats.unsure}개`}
          sub={stats.unsure > 0 ? "아래에서 먼저 확인" : "없음"}
          tone={stats.unsure > 0 ? "rose" : "slate"}
        />
        <LessonKpi
          label="평균 학습 시간"
          value={stats.avgSec > 0 ? formatDurationMs(stats.avgSec * 1000) : "—"}
          sub={`필기 ${stats.notes}개 작성`}
        />
      </div>

      {/* 자신 없음 우선 노출 */}
      {unsureLessons.length > 0 ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3.5">
          <div className="mb-2 flex items-center gap-1.5">
            <HelpCircle className="size-4 text-rose-600" strokeWidth={1.75} aria-hidden />
            <p className="text-[12.5px] font-bold text-rose-700">
              학생이 &ldquo;자신 없음&rdquo;으로 표시한 개념
            </p>
            <span className="text-[11px] font-semibold tabular-nums text-rose-400">
              {unsureLessons.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {unsureLessons.map(({ lesson, title, unitTitle }) => (
              <div
                key={lesson.conceptId}
                className="rounded-md border border-rose-100 bg-white p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="break-keep text-[12.5px] font-semibold text-slate-800">
                    {title}
                    <span className="ml-1.5 text-[11px] font-medium text-slate-400">
                      {unitTitle}
                    </span>
                  </p>
                  <p className="shrink-0 text-[11px] tabular-nums text-slate-400">
                    확인 문항 {lesson.checkTotal > 0
                      ? `${lesson.checkCorrect}/${lesson.checkTotal}`
                      : "—"}
                  </p>
                </div>
                <NoteBody note={lesson.note} />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenWeakComposer(
                unsureLessons.slice(0, 3).map(({ lesson, title }) => ({
                  conceptId: lesson.conceptId,
                  title,
                  score:
                    lesson.checkTotal > 0
                      ? Math.round((lesson.checkCorrect / lesson.checkTotal) * 100)
                      : 0,
                })),
              )
            }
            className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 text-[12.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-100"
          >
            <Target className="size-3.5" strokeWidth={1.75} aria-hidden />이 개념으로 과제 만들기
          </button>
        </div>
      ) : null}

      {/* 파트 → 유닛 → 개념 매트릭스 */}
      <div className="flex flex-col gap-4">
        {[0, 1, 2, 3].map((part) => {
          const units = detail.grid.filter((u) => u.part === part);
          if (units.length === 0) return null;
          const partConcepts = units.flatMap((u) => u.concepts);
          const partDone = partConcepts.filter((c) => {
            const l = byConcept.get(c.conceptId);
            return l ? lessonDone(l) : false;
          }).length;
          return (
            <section key={part}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-[12.5px] font-bold text-slate-600">{PART_NAMES[part]}</p>
                <p className="text-[11px] font-semibold tabular-nums text-slate-400">
                  개념 학습 {partDone}/{partConcepts.length}
                </p>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {units.map((u, ui) => (
                  <div
                    key={u.unitId}
                    className={cn(ui > 0 ? "border-t border-slate-100" : null)}
                  >
                    <div className="bg-slate-50/70 px-3.5 py-1.5">
                      <p className="break-keep text-[11.5px] font-semibold text-slate-500">
                        {u.title}
                      </p>
                    </div>
                    <ul>
                      {u.concepts.map((c) => {
                        const l = byConcept.get(c.conceptId);
                        const open = openNotes.has(c.conceptId);
                        const hasNote = (l?.note ?? "").trim().length > 0;
                        return (
                          <li
                            key={c.conceptId}
                            className="border-t border-slate-50 first:border-t-0"
                          >
                            <button
                              type="button"
                              onClick={() => toggleNote(c.conceptId)}
                              aria-expanded={open}
                              className="flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400"
                            >
                              <ChevronDown
                                className={cn(
                                  "size-3.5 shrink-0 text-slate-300 transition-transform",
                                  open ? "rotate-0" : "-rotate-90",
                                )}
                                strokeWidth={1.75}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 break-keep text-[12.5px] text-slate-700">
                                {c.title}
                              </span>
                              <span className="w-[92px] shrink-0 text-right">
                                <LessonStatus lesson={l} />
                              </span>
                              <span className="w-[68px] shrink-0 text-right text-[11.5px] tabular-nums text-slate-500">
                                {l && l.checkTotal > 0 ? (
                                  <span
                                    className={cn(
                                      "font-semibold",
                                      l.checkCorrect / l.checkTotal >= 0.7
                                        ? "text-emerald-600"
                                        : l.checkCorrect / l.checkTotal < 0.5
                                          ? "text-rose-600"
                                          : "text-slate-600",
                                    )}
                                  >
                                    {Math.round((l.checkCorrect / l.checkTotal) * 100)}%
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </span>
                              <span className="hidden w-[112px] shrink-0 text-right sm:block">
                                <ConfidenceMark value={l?.confidence ?? null} />
                              </span>
                              <span className="w-[52px] shrink-0 text-right">
                                {hasNote ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600">
                                    <NotebookPen
                                      className="size-3.5"
                                      strokeWidth={1.75}
                                      aria-hidden
                                    />
                                    필기
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-300">미작성</span>
                                )}
                              </span>
                            </button>
                            {open ? (
                              <div className="border-t border-slate-50 bg-slate-50/50 px-3.5 py-3 pl-[30px]">
                                <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                                  <span className="sm:hidden">
                                    <ConfidenceMark value={l?.confidence ?? null} />
                                  </span>
                                  <span className="tabular-nums">
                                    학습 카드 {l ? `${l.blocksSeen}/${l.blocksTotal || "?"}` : "0/—"}
                                  </span>
                                  <span className="tabular-nums">
                                    학습 시간{" "}
                                    {l && l.secondsSpent > 0
                                      ? formatDurationMs(l.secondsSpent * 1000)
                                      : "—"}
                                  </span>
                                  {l?.completedAt ? (
                                    <span className="tabular-nums">
                                      완료{" "}
                                      {new Date(l.completedAt).toLocaleDateString("ko-KR", {
                                        timeZone: "Asia/Seoul",
                                        month: "long",
                                        day: "numeric",
                                      })}
                                    </span>
                                  ) : null}
                                </div>
                                <NoteBody note={l?.note ?? null} />
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** 학생 필기 원문 — 교사가 오개념을 잡는 창. 가공하지 않고 그대로 보여 준다. */
function NoteBody({ note }: { note: string | null }) {
  const text = (note ?? "").trim();
  if (!text) {
    return (
      <p className="mt-1.5 text-[11.5px] text-slate-400">
        학생 필기 미작성 — 개념 학습 화면에서 학생이 자기 말로 설명을 쓰면 여기에 표시됩니다.
      </p>
    );
  }
  return (
    <div className="mt-1.5 rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold text-slate-400">
        <NotebookPen className="size-3" strokeWidth={1.75} aria-hidden />
        학생 필기
      </p>
      <p className="whitespace-pre-wrap break-keep text-[12.5px] leading-relaxed text-slate-700">
        {text}
      </p>
    </div>
  );
}

function LessonStatus({ lesson }: { lesson: Lesson | undefined }) {
  if (!lesson) {
    return <span className="text-[11.5px] text-slate-300">미시작</span>;
  }
  if (lessonDone(lesson)) {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-600">
        <CheckCircle2 className="size-3.5" strokeWidth={1.75} aria-hidden />
        완료
      </span>
    );
  }
  return (
    <span className="text-[11.5px] font-semibold tabular-nums text-blue-600">
      진행 {lesson.blocksSeen}/{lesson.blocksTotal || "?"}
    </span>
  );
}

/** 서브뷰 KPI 카드 — grammar-tab.tsx 의 Kpi 와 동일 톤(로컬 사본, 결합 회피) */
function LessonKpi({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "slate" | "emerald" | "rose";
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
      <span
        className={cn(
          "text-[15px] font-bold tabular-nums",
          tone === "emerald"
            ? "text-emerald-600"
            : tone === "rose"
              ? "text-rose-600"
              : "text-slate-900",
        )}
      >
        {value}
      </span>
      {sub ? <span className="text-[10.5px] tabular-nums text-slate-400">{sub}</span> : null}
    </div>
  );
}
