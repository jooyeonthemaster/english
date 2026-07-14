"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 탭 · 응시 메타 + 점수 히어로 (analysis-step 에서 분리)
//
// 배포/시작/제출/소요/마감(+기한지남) 타임라인, 점수 대형 표기, 정답률 링 게이지,
// 정오 분포. 전부 이미 로드된 데이터의 순수 표시(AI 0콜).
// ============================================================================

import { useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Timer } from "lucide-react";

import { cn, formatDateTime } from "@/lib/utils";
import { computeScoreSummary, round2 } from "@/lib/exam-report/grading";
import type { ExamStudentDetail } from "../ui-contracts";
import { STATUS_STYLE } from "./grading-shared";

export function pctText(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

/** 응시 소요 시간(분) — 시작·제출이 모두 있을 때만. */
function durationMinutes(
  startedAt: string | null,
  submittedAt: string | null,
): number | null {
  if (!startedAt || !submittedAt) return null;
  const ms = new Date(submittedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(1, Math.round(ms / 60_000));
}

export function HeroCard({
  student,
  isInternal,
  summary,
  graded,
  gradingConfirmed,
  onGoVerdict,
}: {
  student: ExamStudentDetail;
  /** 분석 sourceType 기준 — submissionMeta 부재(수동 등록)와 외부 시험을 구분한다. */
  isInternal: boolean;
  summary: ReturnType<typeof computeScoreSummary>;
  graded: number;
  gradingConfirmed: boolean;
  onGoVerdict: () => void;
}) {
  const meta = student.submissionMeta;
  // 마운트 시 1회 고정 — 렌더 순수성(react-hooks/purity) 유지. "기한 지남" 판정은
  // 분 단위 정밀도면 충분해 라이브 틱이 필요 없다.
  const [now] = useState(() => Date.now());
  const dueAt = meta?.dueAt ? new Date(meta.dueAt).getTime() : null;
  const submittedAtMs = meta?.submittedAt ? new Date(meta.submittedAt).getTime() : null;
  const overdue =
    dueAt != null &&
    (submittedAtMs != null ? submittedAtMs > dueAt : now > dueAt);
  const durationMin = durationMinutes(meta?.startedAt ?? null, meta?.submittedAt ?? null);

  // 정답률(문항 기준). 점수 비율은 큰 숫자(점수/만점)로 병기.
  const accuracy = graded > 0 ? summary.correctCount / graded : null;
  const scoreText =
    summary.totalScore != null ? String(round2(summary.totalScore)) : "—";
  const maxText = summary.maxScore != null ? String(round2(summary.maxScore)) : null;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        {/* 좌: 응시 메타 */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-500">
              {isInternal
                ? meta
                  ? "자체 시험지 응시"
                  : "자체 시험지 · 수동 등록"
                : "외부 시험 분석"}
            </span>
            {meta?.mode && (
              <span className="inline-flex items-center whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                {meta.mode === "OMR" ? "OMR 입력" : "태블릿 응시"}
              </span>
            )}
            {meta?.assignmentTitle && (
              // truncate 는 flex 컨테이너에서 말줄임표가 렌더되지 않으므로(하드 클립)
              // 내부 텍스트 span 에 적용한다.
              <span
                className="inline-flex max-w-[16rem] items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700"
                title={meta.assignmentTitle}
              >
                <span className="truncate whitespace-nowrap">
                  과제 · {meta.assignmentTitle}
                </span>
              </span>
            )}
            {gradingConfirmed ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                채점 확정
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                <AlertTriangle className="h-3 w-3" />
                채점 미확정
              </span>
            )}
          </div>

          {/* 타임라인 스탯 — 있는 값만 노출(부재 허용) */}
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2.5">
            {meta?.assignedAt && <TimeStat label="배포" value={formatDateTime(meta.assignedAt)} />}
            {meta?.startedAt && <TimeStat label="응시 시작" value={formatDateTime(meta.startedAt)} />}
            {meta?.submittedAt && <TimeStat label="제출" value={formatDateTime(meta.submittedAt)} />}
            {!meta && student.answerSubmittedAt && (
              <TimeStat label="답안 제출" value={formatDateTime(student.answerSubmittedAt)} />
            )}
            {!meta && !student.answerSubmittedAt && (
              <TimeStat label="등록" value={formatDateTime(student.createdAt)} />
            )}
            {durationMin != null && (
              <TimeStat
                label="소요 시간"
                value={`${durationMin}분`}
                icon={<Timer className="h-3 w-3" />}
              />
            )}
            {meta?.dueAt ? (
              <TimeStat
                label="마감"
                value={formatDateTime(meta.dueAt)}
                icon={<CalendarClock className="h-3 w-3" />}
                tone={overdue ? "rose" : undefined}
                suffix={
                  overdue ? (
                    <span className="ml-1 inline-flex items-center whitespace-nowrap rounded border border-rose-200 bg-rose-50 px-1 py-px text-[9.5px] font-bold text-rose-600">
                      기한 지남
                    </span>
                  ) : null
                }
              />
            ) : meta ? (
              <TimeStat label="마감" value="없음" />
            ) : null}
          </div>

          {!gradingConfirmed && graded > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2">
              <p className="text-[12px] leading-relaxed text-blue-700 break-keep">
                아래 분석은 현재 입력된 정오 기준입니다. 채점을 확정하면 결과가 고정됩니다.
              </p>
              <button
                type="button"
                onClick={onGoVerdict}
                className="ml-auto shrink-0 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-blue-700 transition-colors hover:bg-blue-50"
              >
                채점으로
              </button>
            </div>
          )}
        </div>

        {/* 우: 점수 + 정답률 링 + 분포 */}
        <div className="flex shrink-0 items-center gap-5 lg:gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              점수
            </span>
            <p className="text-[32px] font-extrabold leading-tight tabular-nums text-slate-900">
              {scoreText}
              {maxText && (
                <span className="ml-1 text-[15px] font-semibold text-slate-400">
                  / {maxText}
                </span>
              )}
            </p>
            <div className="mt-1.5 flex items-center gap-2.5 text-[11.5px] font-semibold tabular-nums">
              <StatDot status="CORRECT" n={summary.correctCount} />
              <StatDot status="WRONG" n={summary.wrongCount} />
              <StatDot status="PARTIAL" n={summary.partialCount} />
              <StatDot status="UNKNOWN" n={summary.unknownCount} />
            </div>
          </div>
          <AccuracyRing accuracy={accuracy} />
        </div>
      </div>
    </section>
  );
}

function TimeStat({
  label,
  value,
  icon,
  tone,
  suffix,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "rose";
  suffix?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          "flex items-center whitespace-nowrap text-[12.5px] font-semibold tabular-nums",
          tone === "rose" ? "text-rose-600" : "text-slate-700",
        )}
      >
        {value}
        {suffix}
      </span>
    </div>
  );
}

function StatDot({ status, n }: { status: keyof typeof STATUS_STYLE; n: number }) {
  const style = STATUS_STYLE[status];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      <span className={cn("font-bold", style.text)}>{n}</span>
    </span>
  );
}

/** 정답률 링 게이지(SVG) — track slate-100 / progress blue-600. */
function AccuracyRing({ accuracy }: { accuracy: number | null }) {
  const size = 92;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = accuracy == null ? 0 : Math.max(0, Math.min(1, accuracy));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-slate-100"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-blue-600"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[17px] font-extrabold leading-none tabular-nums text-slate-900">
          {pctText(accuracy)}
        </span>
        <span className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
          정답률
        </span>
      </div>
    </div>
  );
}
