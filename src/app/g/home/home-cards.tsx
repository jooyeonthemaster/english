"use client";

// ============================================================================
// /g/home — 홈 카드 프리미티브 (home-client 전용 분할)
//
//  TrackCard : 학습 트랙 4장(LIVE·PREPARING 동일 규격 — docs/study-os-spec.md §1)
//  Gauge     : 오늘 계기판 한 칸
//  TodoCard  : 오늘 할 일(통합 과제) 한 행 — 과제 탭 TaskCard 와 같은 마크업 규약
// ============================================================================

import Link from "next/link";
import {
  BookA,
  BookOpenCheck,
  CalendarClock,
  ChevronRight,
  FileText,
  Headphones,
  ListChecks,
  School,
  SpellCheck,
} from "lucide-react";
import type { HomePayload } from "@/lib/grammar-drill/payload";
import type {
  StudentTaskCard,
  StudyAssignmentKind,
} from "@/lib/study-assignments/types";
import type { StudyTrack } from "@/lib/study-os/tracks";
import { dDayLabel, dueCountdownText } from "@/lib/study-assignments/status";

const KIND_ICON: Record<StudyAssignmentKind, typeof FileText> = {
  EXAM: FileText,
  WORKSHEET: BookOpenCheck,
  QUESTIONS: ListChecks,
  GRAMMAR: SpellCheck,
};

const TRACK_ICON: Record<StudyTrack["icon"], typeof FileText> = {
  SpellCheck,
  Headphones,
  BookA,
  School,
};

/** 트랙 카드 — 4장 전부 정식 카드. PREPARING 도 죽은 링크가 아니라 안내 화면으로 간다. */
export function TrackCard({
  track,
  grammar,
}: {
  track: StudyTrack;
  grammar: HomePayload["grammar"];
}) {
  const Icon = TRACK_ICON[track.icon];
  const live = track.status === "LIVE";
  return (
    <Link
      href={track.href}
      className="gd-card flex flex-col p-3.5"
      style={{ minHeight: "8.5rem" }}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={
            live
              ? { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
              : {
                  background: "var(--gd-paper)",
                  color: "var(--gd-ink-3)",
                  border: "1px solid var(--gd-line)",
                }
          }
        >
          <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
        </span>
        <span
          className="gd-t-3xs shrink-0 rounded-md px-1.5 py-0.5 font-bold"
          style={
            live
              ? { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
              : { background: "var(--gd-paper)", color: "var(--gd-ink-3)" }
          }
        >
          {live ? "학습 중" : "준비 중"}
        </span>
      </div>

      <p className="gd-t-base mt-2 font-bold">{track.name}</p>
      <p
        className="gd-t-2xs mt-0.5 leading-snug"
        style={{
          color: "var(--gd-ink-3)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {track.tagline}
      </p>

      <div className="mt-auto pt-2.5">
        {live ? (
          <>
            <div className="gd-meter">
              <span style={{ width: `${grammar.progressPct}%` }} />
            </div>
            <p className="gd-t-3xs mt-1 truncate" style={{ color: "var(--gd-ink-2)" }}>
              <span className="gd-mono font-bold">
                {grammar.lessonsDone}/{grammar.lessonsTotal}
              </span>{" "}
              개념 ·{" "}
              {grammar.currentUnitTitle
                ? `다음 ${grammar.currentUnitTitle}`
                : "전 유닛 마스터"}
            </p>
          </>
        ) : (
          <p
            className="gd-t-2xs flex items-center gap-1 font-semibold"
            style={{ color: "var(--gd-blue)" }}
          >
            준비 중인 내용 보기
            <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          </p>
        )}
      </div>
    </Link>
  );
}

/** 계기판 한 칸 */
export function Gauge({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center py-3.5"
      style={{ borderColor: "var(--gd-line)" }}
    >
      <div className="flex items-center gap-1">
        {icon}
        <p className="gd-mono gd-t-lg font-bold">{value}</p>
      </div>
      <p className="gd-t-3xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
        {label}
      </p>
    </div>
  );
}

/** 오늘 할 일 한 행 — 과제 탭 TaskCard 의 D-day pill 마크업과 픽셀 동일 */
export function TodoCard({ task, now }: { task: StudentTaskCard; now: Date | null }) {
  const Icon = KIND_ICON[task.kind];
  const dday = dDayLabel(task.dDay);
  // 정밀 카운트다운 — D-0·기한 지남에서만(24시간 창은 dueCountdownText 가 판정)
  const countdown =
    now && (task.overdue || task.dDay === 0)
      ? dueCountdownText(task.dueAt, now)
      : null;
  return (
    <Link
      href={task.actionHref ?? "/g/tasks"}
      className="gd-card flex items-center gap-3 p-3.5"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={
          task.overdue
            ? { background: "var(--gd-bad-soft)", color: "var(--gd-bad)" }
            : task.kind === "GRAMMAR"
              ? { background: "var(--gd-good-soft)", color: "var(--gd-good)" }
              : { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
        }
      >
        <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="gd-t-sm truncate font-semibold">{task.title}</p>
        <p className="gd-t-2xs mt-0.5 truncate" style={{ color: "var(--gd-ink-3)" }}>
          {task.kindLabel}
          {task.progressText ? ` · ${task.progressText}` : ""}
          {task.status === "IN_PROGRESS" ? " · 진행 중" : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {dday ? (
          <span className="flex flex-col items-end gap-0.5">
            <span
              className="gd-t-2xs gd-mono inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-bold"
              style={
                task.overdue
                  ? { color: "var(--gd-bad)" }
                  : task.dDay === 0
                    ? { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
                    : { color: "var(--gd-ink-2)" }
              }
            >
              <CalendarClock className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
              {dday}
            </span>
            {countdown ? (
              <span
                className="gd-t-3xs font-bold"
                style={{ color: task.overdue ? "var(--gd-bad)" : "var(--gd-blue)" }}
              >
                {countdown}
              </span>
            ) : null}
          </span>
        ) : null}
        <ChevronRight className="h-4 w-4" style={{ color: "var(--gd-ink-3)" }} />
      </div>
    </Link>
  );
}
