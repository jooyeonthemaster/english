"use client";

// ============================================================================
// 과제 상세 — "학습 현황" 탭 (WORKSHEET 스터디 모드 한정)
//
// getWorksheetStudyOverview 소비: 학생×스테이지 진행 매트릭스(가로 스크롤
// 테이블)와 반 집계(단계별 평균 점수 바·최다 오답 문장/단어 칩·어법 코드
// 오답률)를 렌더한다. 15초 자동 폴링(비가시 시 중단, 재가시 시 즉시 갱신)
// + 마지막 갱신 시각 + 수동 갱신. 폴링은 백그라운드 갱신 — 이전 데이터를
// 유지하고 우상단 아이콘만 돈다. in-progress 셀은 "진행 n/m" 부분 진행,
// 마지막 활동 3분 이내 학생은 라이브 펄스 도트.
// 규범: docs/worksheet-study-spec.md §10 · docs/director-console-spec.md §3.3·§5.3.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { BookA, Loader2, RefreshCw } from "lucide-react";
import {
  getWorksheetStudyOverview,
  type StudyOverviewAggregates,
  type StudyOverviewStageCell,
  type StudyOverviewStudentRow,
} from "@/actions/study-assignments/study-stats";
import { GRAMMAR_POINT_CATALOG } from "@/lib/grammar-point-catalog";
import { STUDY_STAGE_META } from "@/lib/worksheet-study/types";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "./assignment-detail-parts";
import { StudyStudentVocabDrawer } from "./study-student-drawer";

interface OverviewData {
  students: StudyOverviewStudentRow[];
  aggregates: StudyOverviewAggregates;
}

/** 자동 폴링 주기 — spec §3.3 */
const POLL_MS = 15_000;
/** 라이브 도트 판정 창 — 마지막 활동 3분 이내 */
const LIVE_WINDOW_MS = 3 * 60_000;

/** 스테이지 표시 순서 — 스펙 §4 카탈로그 순(STUDY_STAGE_META 키 순서) */
const STAGE_ORDER = Object.keys(STUDY_STAGE_META);

function stageTitle(id: string): string {
  return (STUDY_STAGE_META as Record<string, { title: string }>)[id]?.title ?? id;
}

function grammarLabel(code: string): string {
  const info = (GRAMMAR_POINT_CATALOG as Record<string, { label: string }>)[code];
  return info ? info.label : code;
}

/** 점수 3단 톤 — <50 취약(rose) / <80 보통(blue) / 이상 안정(emerald) */
function scoreText(score: number): string {
  if (score < 50) return "text-rose-600";
  if (score < 80) return "text-blue-600";
  return "text-emerald-600";
}

function scoreBar(score: number): string {
  if (score < 50) return "bg-rose-500";
  if (score < 80) return "bg-blue-600";
  return "bg-emerald-500";
}

function fmtDuration(ms: number): string {
  if (ms <= 0) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "1분 미만";
  if (min >= 60) return `${Math.floor(min / 60)}시간 ${min % 60}분`;
  return `${min}분`;
}

/** "21:48" — 헤더 갱신 시각 표기(디렉터 로컬 시각) */
function fmtClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function StageCell({ state }: { state?: StudyOverviewStageCell }) {
  if (!state || state.status === "todo") {
    return <span className="text-slate-300">—</span>;
  }
  if (state.status === "in-progress") {
    // 파이프 v2 부분 진행 — 푼 문항/전체. 첫 시도 정답 수는 툴팁으로.
    if (typeof state.answered === "number" && typeof state.total === "number" && state.total > 0) {
      const tip =
        typeof state.firstCorrect === "number"
          ? typeof state.firstTotal === "number"
            ? `첫 시도 정답 ${state.firstCorrect}/${state.firstTotal}`
            : `첫 시도 정답 ${state.firstCorrect}개`
          : undefined;
      return (
        <span
          title={tip}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700"
        >
          진행
          <span className="tabular-nums">
            {state.answered}/{state.total}
          </span>
        </span>
      );
    }
    return (
      <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
        진행
      </span>
    );
  }
  if (typeof state.score === "number") {
    return (
      <span className={cn("text-[13px] font-bold tabular-nums", scoreText(state.score))}>
        {state.score}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
      완료
    </span>
  );
}

export function WorksheetStudyReportTab({ assignmentId }: { assignmentId: string }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedLabel, setUpdatedLabel] = useState<string | null>(null);
  /** 마지막 성공 갱신 시각(ms) — 라이브 도트 판정 기준(렌더 중 Date.now 금지) */
  const [fetchedAtMs, setFetchedAtMs] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  // 학생별 취약 단어 드릴다운 드로어
  const [drillStudent, setDrillStudent] = useState<{ id: string; name: string } | null>(null);

  // 과제가 바뀌면 이전 과제 데이터가 잠깐이라도 보이지 않게 렌더 중 초기화
  // (React 공식 "props 변경 시 상태 조정" 패턴 — 이펙트보다 한 렌더 빠르다)
  const [prevAssignmentId, setPrevAssignmentId] = useState(assignmentId);
  if (prevAssignmentId !== assignmentId) {
    setPrevAssignmentId(assignmentId);
    setData(null);
    setError(null);
    setUpdatedLabel(null);
    setFetchedAtMs(0);
  }

  // 15초 자동 폴링 — 백그라운드 갱신(이전 데이터 유지). 탭 비가시 시 중단,
  // 재가시 시 즉시 1회 갱신. 수동 갱신(reloadTick)은 이펙트 재실행으로 즉시 로드.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const load = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      setRefreshing(true);
      const res = await getWorksheetStudyOverview(assignmentId);
      if (cancelled) return;
      if (res.success && res.data) {
        const fetchedAt = new Date();
        setData(res.data);
        setError(null);
        setUpdatedLabel(fmtClock(fetchedAt));
        setFetchedAtMs(fetchedAt.getTime());
      } else {
        // 데이터가 이미 있으면 유지하고 헤더에만 실패를 알린다
        setError(res.error ?? "학습 현황을 불러오지 못했습니다.");
      }
      setRefreshing(false);
      inFlight = false;
    };

    void load();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [assignmentId, reloadTick]);

  // 매트릭스 열 — 학생 상태·평균 점수에 등장하는 스테이지만, 카탈로그 순서로
  const stageIds = useMemo(() => {
    if (!data) return [];
    const present = new Set<string>();
    for (const s of data.students) {
      for (const id of Object.keys(s.stages)) present.add(id);
    }
    for (const id of Object.keys(data.aggregates.stageAvgScore)) present.add(id);
    const ordered = STAGE_ORDER.filter((id) => present.has(id));
    const extras = [...present].filter((id) => !STAGE_ORDER.includes(id)).sort();
    return [...ordered, ...extras];
  }, [data]);

  const stageAvgRows = useMemo(
    () =>
      data
        ? stageIds
            .filter((id) => typeof data.aggregates.stageAvgScore[id] === "number")
            .map((id) => ({ id, score: data.aggregates.stageAvgScore[id] }))
        : [],
    [data, stageIds],
  );

  // 최초 로드(이전 데이터 없음)에만 전면 스피너 — 이후엔 백그라운드 갱신
  if (!data && !error) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-16 text-[13px] text-slate-400">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        학습 현황을 불러오는 중입니다
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white py-12">
        <p className="text-[13px] text-slate-500">{error}</p>
        <button
          type="button"
          onClick={() => setReloadTick((t) => t + 1)}
          className="h-8 rounded-md border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const { students, aggregates } = data;

  return (
    <div className="flex flex-col gap-4">
      {/* 갱신 헤더 — 마지막 갱신 시각 + 수동 갱신(항상 노출) + 백그라운드 갱신 표시 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-slate-700">
          실시간 학습 현황
          <span className="ml-2 text-[12px] font-normal text-slate-400">15초마다 자동 갱신</span>
        </p>
        <div className="flex items-center gap-2.5">
          {error ? (
            <span className="text-[12px] font-medium text-rose-600">
              갱신 실패 — 이전 데이터 표시 중
            </span>
          ) : null}
          {updatedLabel ? (
            <span className="text-[12px] tabular-nums text-slate-400">{updatedLabel} 갱신</span>
          ) : null}
          <button
            type="button"
            onClick={() => setReloadTick((t) => t + 1)}
            disabled={refreshing}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} aria-hidden />
            갱신
          </button>
        </div>
      </div>

      {students.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-16 text-center text-[13px] text-slate-400">
          아직 학습을 시작한 학생이 없습니다. 학생이 시작하면 단계별 진행과
          취약점이 집계됩니다.
        </p>
      ) : (
        <>
          {/* 학생×스테이지 진행 매트릭스 */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-400">
              학습 시작 <span className="tabular-nums">{students.length}</span>명 · 완료
              단계의 숫자는 첫 시도 정답률(%) · 진행 n/m 은 푼 문항/전체 · 학생
              이름을 누르면 취약 단어를 볼 수 있습니다
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[12px] text-slate-500">
                    <th className="whitespace-nowrap px-3 py-2 font-medium">학생</th>
                    {stageIds.map((id) => (
                      <th key={id} className="whitespace-nowrap px-2 py-2 text-center font-medium">
                        {stageTitle(id)}
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-3 py-2 text-right font-medium">숙달도</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-medium">총 학습</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">완료</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const lastMs = Date.parse(s.lastActivityAt);
                    const isLive =
                      !Number.isNaN(lastMs) &&
                      fetchedAtMs > 0 &&
                      fetchedAtMs - lastMs <= LIVE_WINDOW_MS;
                    return (
                      <tr
                        key={s.taskId}
                        className="border-b border-slate-50 text-[13px] text-slate-700 transition-colors last:border-0 hover:bg-blue-50/40"
                      >
                        <td className="whitespace-nowrap px-3 py-2">
                          <span className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setDrillStudent({ id: s.studentId, name: s.studentName })
                              }
                              className="group inline-flex items-center gap-1.5 font-semibold text-slate-800 transition-colors hover:text-blue-700"
                              title={`${s.studentName} 취약 단어 보기`}
                            >
                              <span className="underline decoration-slate-300 decoration-dotted underline-offset-4 group-hover:decoration-blue-400">
                                {s.studentName}
                              </span>
                              <BookA
                                className="size-3.5 text-slate-300 transition-colors group-hover:text-blue-500"
                                strokeWidth={2}
                                aria-hidden
                              />
                            </button>
                            {isLive ? (
                              <span
                                role="status"
                                title="최근 3분 내 활동"
                                className="relative inline-flex size-2 shrink-0"
                              >
                                <span className="sr-only">학습 중</span>
                                <span
                                  aria-hidden
                                  className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"
                                />
                                <span
                                  aria-hidden
                                  className="relative inline-flex size-2 rounded-full bg-blue-500"
                                />
                              </span>
                            ) : null}
                          </span>
                        </td>
                        {stageIds.map((id) => (
                          <td key={id} className="px-2 py-2 text-center">
                            <StageCell state={s.stages[id]} />
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right">
                          {s.masteryPct != null ? (
                            <span
                              className={cn(
                                "text-[13px] font-bold tabular-nums",
                                scoreText(s.masteryPct),
                              )}
                            >
                              {s.masteryPct}%
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-[12.5px] tabular-nums text-slate-500">
                          {fmtDuration(s.totalTimeMs)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-[12.5px] tabular-nums text-slate-500">
                          {fmtDateTime(s.completedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 반 집계 카드 */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* 단계별 평균 점수 */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-3 text-[13px] font-semibold text-slate-500">
                단계별 평균 점수
                <span className="ml-1.5 font-normal text-slate-400">— 완주 학생 기준</span>
              </p>
              {stageAvgRows.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-slate-400">
                  아직 완료한 단계가 없습니다.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {stageAvgRows.map(({ id, score }) => (
                    <div key={id} className="flex items-center gap-2.5">
                      <span className="w-24 shrink-0 truncate text-[13px] text-slate-600">
                        {stageTitle(id)}
                      </span>
                      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className={cn("block h-full rounded-full", scoreBar(score))}
                          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                        />
                      </span>
                      <span
                        className={cn(
                          "w-11 shrink-0 text-right text-[13px] font-bold tabular-nums",
                          scoreText(score),
                        )}
                      >
                        {score}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 최다 오답 문장 top5 */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-3 text-[13px] font-semibold text-slate-500">
                최다 오답 문장
                <span className="ml-1.5 font-normal text-slate-400">— 첫 시도 기준 상위 5</span>
              </p>
              {aggregates.worstSentences.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-slate-400">
                  아직 집계된 오답이 없습니다.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {aggregates.worstSentences.map((s) => (
                    <span
                      key={s.sentenceNo}
                      className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[12px] font-medium text-rose-700"
                    >
                      <span className="font-bold">문장 {s.sentenceNo}</span>
                      <span className="tabular-nums">
                        오답률 {s.wrongRate}% · {s.attempts}회
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 최다 오답 단어 top10 */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-3 text-[13px] font-semibold text-slate-500">
                최다 오답 단어
                <span className="ml-1.5 font-normal text-slate-400">— 상위 10</span>
              </p>
              {aggregates.worstWords.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-slate-400">
                  아직 집계된 오답이 없습니다.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {aggregates.worstWords.map((w) => (
                    <span
                      key={w.word}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] font-medium text-slate-600"
                    >
                      <span className="font-semibold text-slate-800">{w.word}</span>
                      <span className="tabular-nums text-rose-600">{w.wrongCount}회</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 어법 코드 오답률 */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-3 text-[13px] font-semibold text-slate-500">
                어법 포인트 오답률
                <span className="ml-1.5 font-normal text-slate-400">— 출제 코드 전체</span>
              </p>
              {aggregates.grammarWrongRates.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-slate-400">
                  어법 문항 기록이 없습니다.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {aggregates.grammarWrongRates.map((g) => (
                    <div key={g.code} className="flex items-center gap-2.5">
                      <span className="w-44 shrink-0 truncate text-[13px] text-slate-600">
                        <span className="font-bold text-slate-400">({g.code})</span>{" "}
                        {grammarLabel(g.code)}
                      </span>
                      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            g.wrongRate >= 50 ? "bg-rose-500" : "bg-blue-600",
                          )}
                          style={{ width: `${Math.min(100, Math.max(0, g.wrongRate))}%` }}
                        />
                      </span>
                      <span className="w-20 shrink-0 text-right text-[12px] tabular-nums text-slate-500">
                        <span
                          className={cn(
                            "font-bold",
                            g.wrongRate >= 50 ? "text-rose-600" : "text-slate-700",
                          )}
                        >
                          {g.wrongRate}%
                        </span>{" "}
                        · {g.attempts}회
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 학생별 취약 단어 드릴다운 — 학생 바뀌면 key 로 리마운트(스코프 초기화) */}
      <StudyStudentVocabDrawer
        key={drillStudent?.id ?? "none"}
        open={drillStudent != null}
        onClose={() => setDrillStudent(null)}
        studentId={drillStudent?.id ?? null}
        studentName={drillStudent?.name ?? ""}
        assignmentId={assignmentId}
      />
    </div>
  );
}
