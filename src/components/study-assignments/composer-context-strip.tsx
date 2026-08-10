"use client";

// ============================================================================
// 컴포저 컨텍스트 스트립 — 헤더 아래 전폭 1행 (v3 design §D2-3)
//
// 취약점 CTA(analysisSeed) 경유로 컴포저가 열릴 때만 렌더된다(시드 없는 기존
// 진입은 미렌더 — 무회귀). 패널 소속이 아니라 "배포 행위 전체의 전제"라서
// 3패널 그리드 위 전폭 40px 1행 + [자세히] 펼침(최대 120px 내부 스크롤 —
// 합계 160px 상한). 내용:
//  · ⓘ + spots 문장화(weakSpotExplain 재사용, 복수 spot 은 첫 건 + 「외 N개」)
//  · 「이미 나간 관련 과제 N건」 칩 — 클릭 시 부모(assignment-composer)가
//    리프트한 AssignmentDetailModal 을 연다(onOpenTask)
//  · 펼침: 개념별 점수 테이블 + 최근 오답 3건 (getAssignAnalysisContext)
// 문구는 전부 director-glossary(D6) — 리터럴 금지 계약.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import {
  getAssignAnalysisContext,
  type AssignAnalysisContext,
} from "@/actions/study-assignments/assign-context";
import { fmtAt, fmtDay, scoreText, VerdictIcon } from "@/components/students/hub/analytics/kit";
import type { AnalysisSeed } from "@/lib/study-assignments/types";
import {
  COMPOSER_CONTEXT_COPY,
  EMPTY_STATES,
  TASK_STATUS_LABELS,
  scoreExplain,
  weakSpotExplain,
} from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";

export function ComposerContextStrip({
  seed,
  studentId,
  studentName,
  reloadTick = 0,
  onOpenTask,
}: {
  seed: AnalysisSeed;
  /** 시드 학생(defaultStudentIds 첫 건) — 없으면 서버 컨텍스트 미조회 */
  studentId: string | null;
  /** 대상 로스터에서 해석한 이름 — 미해석 시 문장에서 생략 */
  studentName: string | null;
  /** 관련 과제 상세에서 변경(onChanged) 발생 시 부모가 올린다 — 재조회 */
  reloadTick?: number;
  /** 관련 과제 칩 클릭 — 컴포저가 리프트한 과제 상세 모달 열기 */
  onOpenTask: (assignmentId: string) => void;
}) {
  const [context, setContext] = useState<AssignAnalysisContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // 호출부가 preset 을 렌더마다 재생성해도 재조회는 내용 서명 기준으로만 —
  // 최신 spots 는 ref 로 읽는다(객체 동일성 의존 제거).
  const seedKey = useMemo(
    () => seed.spots.map((s) => `${s.domain}|${s.axis}|${s.key}`).join("‖"),
    [seed],
  );
  const spotsRef = useRef(seed.spots);
  spotsRef.current = seed.spots;

  useEffect(() => {
    if (!studentId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    getAssignAnalysisContext(studentId, spotsRef.current)
      .then((res) => {
        if (!alive) return;
        if (res.success && res.data) setContext(res.data);
        else setError(res.error ?? COMPOSER_CONTEXT_COPY.LOAD_ERROR);
      })
      .catch(() => {
        if (alive) setError(COMPOSER_CONTEXT_COPY.LOAD_ERROR);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [studentId, seedKey, reloadTick]);

  const first = seed.spots[0];
  if (!first) return null;

  // ── ⓘ 문장 — 「김민준 · 관계대명사 숙달도 27점 · 12회 시도 중 8회 오답 · 최근 오답 7/19 외 2개」
  const explain = weakSpotExplain({
    kind: first.metric.kind,
    value: first.metric.value,
    attempts: first.evidence.attempts,
    wrong: first.evidence.wrong,
  });
  const lastWrongDay = first.evidence.lastWrongAt ? fmtDay(first.evidence.lastWrongAt) : null;
  const restCount = seed.spots.length - 1;
  const sentencePlain = [
    studentName,
    `${first.label} ${explain}`,
    lastWrongDay ? `${COMPOSER_CONTEXT_COPY.LAST_WRONG_PREFIX} ${lastWrongDay}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
    .concat(restCount > 0 ? ` ${COMPOSER_CONTEXT_COPY.MORE_SPOTS(restCount)}` : "");

  const canExpand =
    context !== null && context.mastery.length + context.recentWrong.length > 0;

  return (
    <div className="shrink-0 border-b border-slate-100 bg-blue-50/30">
      <div className="flex h-10 min-w-0 items-center gap-2.5 px-4">
        <Info className="size-3.5 shrink-0 text-blue-500" aria-hidden />
        <p
          title={sentencePlain}
          className="min-w-0 shrink-[2] truncate text-[12.5px] text-slate-600"
        >
          {studentName ? (
            <>
              <span className="font-semibold text-slate-800">{studentName}</span>
              <span className="text-slate-400"> · </span>
            </>
          ) : null}
          <span className="font-semibold text-slate-800">{first.label}</span> {explain}
          {lastWrongDay ? (
            <span className="text-slate-500">
              {" "}· {COMPOSER_CONTEXT_COPY.LAST_WRONG_PREFIX} {lastWrongDay}
            </span>
          ) : null}
          {restCount > 0 ? (
            <span className="text-slate-400"> {COMPOSER_CONTEXT_COPY.MORE_SPOTS(restCount)}</span>
          ) : null}
        </p>

        {/* 관련 과제 영역 — studentId 없으면 조회 자체가 없어 미렌더 */}
        {studentId ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            {loading ? (
              <span className="shrink-0 text-[12px] text-slate-400">
                {COMPOSER_CONTEXT_COPY.LOADING}
              </span>
            ) : error ? (
              <span className="shrink-0 text-[12px] text-rose-500">
                {COMPOSER_CONTEXT_COPY.LOAD_ERROR}
              </span>
            ) : context ? (
              context.relatedTasks.length === 0 ? (
                <span className="truncate text-[12px] text-slate-400">
                  {EMPTY_STATES.CONTEXT_NO_RELATED_TASK.message}
                </span>
              ) : (
                <>
                  <span className="shrink-0 text-[12px] font-semibold text-slate-500">
                    {COMPOSER_CONTEXT_COPY.RELATED_TASKS(context.relatedTasks.length)}:
                  </span>
                  {context.relatedTasks.map((task) => {
                    const assignmentId = task.assignmentId;
                    const statusLabel = task.overdue
                      ? TASK_STATUS_LABELS.OVERDUE
                      : TASK_STATUS_LABELS[task.liveStatus];
                    return (
                      <button
                        key={task.taskId}
                        type="button"
                        disabled={!assignmentId}
                        title={
                          assignmentId
                            ? task.title
                            : COMPOSER_CONTEXT_COPY.DIRECT_TASK_HINT
                        }
                        onClick={
                          assignmentId ? () => onOpenTask(assignmentId) : undefined
                        }
                        className={cn(
                          "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-[11.5px] transition-colors",
                          assignmentId
                            ? "text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                            : "cursor-not-allowed text-slate-400 opacity-60",
                        )}
                      >
                        <span className="max-w-[160px] truncate font-medium">
                          「{task.title}」
                        </span>
                        <span className="text-slate-400">
                          {task.dueAt && fmtDay(task.dueAt)
                            ? `${fmtDay(task.dueAt)} ${COMPOSER_CONTEXT_COPY.DUE_SUFFIX}`
                            : COMPOSER_CONTEXT_COPY.NO_DUE}{" "}
                          · {statusLabel}
                        </span>
                      </button>
                    );
                  })}
                </>
              )
            ) : null}
          </div>
        ) : (
          <span className="min-w-0 flex-1" aria-hidden />
        )}

        {canExpand ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[12px] font-semibold text-slate-500 transition-colors hover:bg-blue-100/60 hover:text-slate-700"
          >
            {expanded ? COMPOSER_CONTEXT_COPY.DETAIL_CLOSE : COMPOSER_CONTEXT_COPY.DETAIL_OPEN}
            <ChevronDown
              className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      {/* 펼침 — 개념별 점수 테이블 + 최근 오답 3건(합계 160px 상한, 내부 스크롤) */}
      {expanded && context ? (
        <div className="grid max-h-[120px] grid-cols-1 gap-x-8 gap-y-2 overflow-y-auto border-t border-blue-100/50 px-4 py-2.5 lg:grid-cols-2">
          <section aria-label={COMPOSER_CONTEXT_COPY.MASTERY_TABLE}>
            <p className="mb-1 text-[11.5px] font-semibold text-slate-400">
              {COMPOSER_CONTEXT_COPY.MASTERY_TABLE}
            </p>
            {context.mastery.length === 0 ? (
              <p className="text-[12px] text-slate-400">
                {COMPOSER_CONTEXT_COPY.MASTERY_EMPTY}
              </p>
            ) : (
              context.mastery.map((row) => (
                <div key={row.conceptId} className="flex items-center gap-2 py-0.5">
                  <span
                    title={row.title}
                    className="min-w-0 flex-1 truncate text-[12px] text-slate-600"
                  >
                    {row.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[12px] font-medium tabular-nums",
                      scoreText(row.score),
                    )}
                  >
                    {scoreExplain({
                      score: row.score,
                      attempts: row.attempts,
                      wrong: row.wrong,
                    })}
                  </span>
                </div>
              ))
            )}
          </section>
          <section aria-label={COMPOSER_CONTEXT_COPY.RECENT_WRONG}>
            <p className="mb-1 text-[11.5px] font-semibold text-slate-400">
              {COMPOSER_CONTEXT_COPY.RECENT_WRONG}
            </p>
            {context.recentWrong.length === 0 ? (
              <p className="text-[12px] text-slate-400">
                {COMPOSER_CONTEXT_COPY.RECENT_WRONG_EMPTY}
              </p>
            ) : (
              context.recentWrong.map((attempt, index) => (
                <div
                  key={`${attempt.createdAt}-${index}`}
                  className="flex items-center gap-2 py-0.5 text-[12px]"
                >
                  <VerdictIcon correct={false} className="size-3.5" />
                  <span className="shrink-0 tabular-nums text-slate-400">
                    {fmtAt(attempt.createdAt)}
                  </span>
                  <span
                    title={`${attempt.conceptTitle}${
                      attempt.answer
                        ? ` · ${COMPOSER_CONTEXT_COPY.ANSWER_PREFIX} “${attempt.answer}”`
                        : ""
                    }`}
                    className="min-w-0 flex-1 truncate text-slate-600"
                  >
                    {attempt.conceptTitle}
                    {attempt.answer ? (
                      <span className="text-slate-400">
                        {" "}· {COMPOSER_CONTEXT_COPY.ANSWER_PREFIX} “{attempt.answer}”
                      </span>
                    ) : null}
                  </span>
                </div>
              ))
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
