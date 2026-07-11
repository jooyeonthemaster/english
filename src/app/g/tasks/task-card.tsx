"use client";

// ============================================================================
// /g/tasks — 과제 카드·빈 상태·에러·스켈레톤 (tasks-client 에서 분리)
//
// TaskCard 의 D-day pill 은 home-client TodoCard 와 픽셀 동일 마크업 계약 —
// 한쪽을 바꾸면 반드시 다른 쪽도 함께 맞춘다. 카운트다운(dueCountdownText)은
// 마운트 후 60초 틱(useMinuteNow)으로만 렌더해 SSR 하이드레이션 미스매치를
// 피한다. "새 결과" pill 은 localStorage 기반 기기 로컬 표시 장치(오차 수용).
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpenCheck,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  FileText,
  ListChecks,
  Lock,
  SpellCheck,
} from "lucide-react";
import type {
  StudentTaskCard,
  StudyAssignmentKind,
  StudyTaskStatus,
} from "@/lib/study-assignments/types";
import { dDayLabel, dueCountdownText } from "@/lib/study-assignments/status";

// ── kind 칩 (gd 라이트 고정 팔레트 — 시험 파랑/학습지 slate/문제 indigo/어법 emerald) ──

export const KIND_ICON: Record<StudyAssignmentKind, typeof FileText> = {
  EXAM: FileText,
  WORKSHEET: BookOpenCheck,
  QUESTIONS: ListChecks,
  GRAMMAR: SpellCheck,
};

export const KIND_CHIP: Record<StudyAssignmentKind, { bg: string; fg: string }> = {
  EXAM: { bg: "var(--gd-blue-soft)", fg: "var(--gd-blue)" },
  // STUDY_KIND_META(types.ts)의 WORKSHEET tone=slate 와 정합 — slate-100/slate-600
  WORKSHEET: { bg: "#f1f5f9", fg: "#475569" },
  QUESTIONS: { bg: "#eef2ff", fg: "#4338ca" },
  GRAMMAR: { bg: "var(--gd-good-soft)", fg: "var(--gd-good)" },
};

const STATUS_CHIP: Record<StudyTaskStatus, { label: string; bg: string; fg: string }> = {
  ASSIGNED: { label: "대기", bg: "var(--gd-paper)", fg: "var(--gd-ink-2)" },
  IN_PROGRESS: { label: "진행 중", bg: "var(--gd-blue-soft)", fg: "var(--gd-blue)" },
  DONE: { label: "완료", bg: "var(--gd-good-soft)", fg: "var(--gd-good)" },
};

/** "7. 9." — 동일 제목 과제를 구분하는 배포일/완료일 보조 메타 */
export function formatAssigned(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });
}

export function formatDue(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  const time = d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} ${time}`;
}

/** 마운트 후에만 시각 제공(SSR 하이드레이션 미스매치 회피) + 60초 틱 */
export function useMinuteNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

// ── "새 결과" 로컬 발견성(localStorage — 기기 로컬 표시 장치, 오차 수용) ──────
// /g 는 공용 태블릿 학생앱 — 키를 studentId 로 스코프한다(U10 smoat.taking.{token}
// 선례). 스코프가 없으면 학생이 바뀔 때 이전 학생의 시드가 남아 새 학생의 기존
// 결과가 전량 "새 결과"로 오점등되므로, 반드시 학생별로 분리한다.

function seenResultsKey(studentId: string): string {
  return `gd-seen-results:${studentId}`;
}

function readSeenResults(studentId: string): Set<string> | null {
  const raw = window.localStorage.getItem(seenResultsKey(studentId));
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
}

/**
 * 공개된 시험 결과 중 이 기기에서 아직 확인하지 않은 taskId 집합.
 * 키 부재(첫 방문)면 현재 목록을 시드하고 빈 집합 반환 — 과거 결과 전량이
 * "새 결과"로 점등되는 소음을 방지한다.
 */
export function diffUnseenResults(studentId: string, resultIds: string[]): Set<string> {
  try {
    const seen = readSeenResults(studentId);
    if (seen === null) {
      window.localStorage.setItem(seenResultsKey(studentId), JSON.stringify(resultIds));
      return new Set();
    }
    return new Set(resultIds.filter((id) => !seen.has(id)));
  } catch {
    return new Set();
  }
}

export function markResultsSeen(studentId: string, resultIds: string[]): void {
  try {
    const seen = readSeenResults(studentId) ?? new Set<string>();
    for (const id of resultIds) seen.add(id);
    window.localStorage.setItem(seenResultsKey(studentId), JSON.stringify([...seen]));
  } catch {
    // localStorage 불가 환경 — 표시 장치라 조용히 무시
  }
}

// ── 기한지남/오늘마감 배너 (rose 는 overdue 만 — 오늘 마감은 blue) ────────────

export function DueAlertBanner({
  overdueCount,
  todayCount,
  sticky,
  href,
}: {
  overdueCount: number;
  todayCount: number;
  /** /g/tasks — 셸 헤더 아래 sticky(.gd-pin-banner). 홈은 일반 배치 */
  sticky?: boolean;
  href?: string;
}) {
  if (overdueCount === 0 && todayCount === 0) return null;
  const rose = overdueCount > 0;
  const label = rose
    ? `기한이 지난 과제가 ${overdueCount}건 있습니다`
    : `오늘 마감 과제가 ${todayCount}건 있습니다`;
  const tone = rose
    ? { background: "var(--gd-bad-soft)", borderColor: "#fecdd3", color: "var(--gd-bad)" }
    : { background: "var(--gd-blue-soft)", borderColor: "var(--gd-blue-line)", color: "var(--gd-blue)" };
  const inner = (
    <div
      className={
        sticky
          ? "gd-pin-banner flex items-center gap-2 rounded-xl border px-3.5 py-2.5"
          : "flex items-center gap-2 rounded-xl border px-3.5 py-2.5"
      }
      style={tone}
      role="status"
    >
      <CalendarClock className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <p className="gd-t-xs min-w-0 flex-1 font-semibold">{label}</p>
      {href ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : null}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

// ── 과제 카드 ────────────────────────────────────────────────────────────────

export function TaskCard({
  card,
  hideNoDueLabel,
  now,
  isNewResult,
}: {
  card: StudentTaskCard;
  hideNoDueLabel?: boolean;
  /** useMinuteNow 결과 — null(마운트 전)이면 카운트다운 미렌더 */
  now?: Date | null;
  isNewResult?: boolean;
}) {
  const clickable = Boolean(card.actionHref);
  const kindChip = KIND_CHIP[card.kind];
  const KindIcon = KIND_ICON[card.kind];
  const statusChip = STATUS_CHIP[card.status];
  // overdue 카드는 그룹 헤더("기한 지남")가 의미를 전달하므로 D+N 라벨은 억제
  const dday =
    card.status === "DONE" || card.overdue ? null : dDayLabel(card.dDay);
  const examDoneNoScore =
    card.kind === "EXAM" && card.status === "DONE" && !card.scoreText;

  const metaItems: React.ReactNode[] = [];
  if (card.progressText) {
    metaItems.push(
      <span key="progress" className="gd-t-2xs gd-mono" style={{ color: "var(--gd-ink-2)" }}>
        {card.progressText}
      </span>,
    );
  }
  if (card.scoreText) {
    metaItems.push(
      <span key="score" className="gd-t-2xs gd-mono font-bold" style={{ color: "var(--gd-ink)" }}>
        {card.scoreText}
      </span>,
    );
  }
  if (examDoneNoScore) {
    metaItems.push(
      <span key="pending-score" className="gd-t-2xs" style={{ color: "var(--gd-ink-2)" }}>
        제출 완료 — 결과는 선생님 확인 후 공개됩니다
      </span>,
    );
  }
  if (card.locked) {
    // 예약 잠금(availableFrom 미래)은 해제 시각을 구체적으로 안내하고,
    // availableFrom 없는/지난 잠금(CLOSED 재열람 차단)은 기존 문구 유지.
    const opensAt =
      card.availableFrom && Date.parse(card.availableFrom) > Date.now()
        ? card.availableFrom
        : null;
    metaItems.push(
      <span
        key="locked"
        className="gd-t-2xs inline-flex items-center gap-1"
        style={{ color: "var(--gd-ink-3)" }}
      >
        <Lock className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
        {opensAt
          ? `${formatDue(opensAt)}에 열립니다`
          : "아직 열리지 않은 과제입니다. 시작일이 되면 풀 수 있습니다."}
      </span>,
    );
  }
  if (card.dueAt && card.status !== "DONE") {
    metaItems.push(
      <span key="due" className="gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
        마감 {formatDue(card.dueAt)}
      </span>,
    );
    // 정밀 카운트다운 — D-0·기한 지남에서만(24시간 창은 dueCountdownText 가 판정)
    const countdown =
      now && (card.overdue || card.dDay === 0)
        ? dueCountdownText(card.dueAt, now)
        : null;
    if (countdown) {
      metaItems.push(
        <span
          key="countdown"
          className="gd-t-2xs font-bold"
          style={{ color: card.overdue ? "var(--gd-bad)" : "var(--gd-blue)" }}
        >
          {countdown}
        </span>,
      );
    }
  }
  // TODO 는 배포일, 완료 탭은 완료일이 구분·정렬 기준(U1 completedAt 직렬화 소비)
  metaItems.push(
    <span key="assigned" className="gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
      {card.status === "DONE" && card.completedAt
        ? `${formatAssigned(card.completedAt)} 완료`
        : `${formatAssigned(card.assignedAt)} 배포`}
    </span>,
  );

  const inner = (
    <div
      className="gd-card px-4 py-3.5"
      style={card.locked ? { opacity: 0.6 } : undefined}
    >
      {/* 상단: kind 칩 + 상태 칩 / 우측 D-day */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className="gd-t-3xs inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold"
            style={{ background: kindChip.bg, color: kindChip.fg }}
          >
            <KindIcon className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            {card.kindLabel}
          </span>
          <span
            className="gd-t-3xs inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold"
            style={{ background: statusChip.bg, color: statusChip.fg }}
          >
            {statusChip.label}
          </span>
          {isNewResult ? (
            <span
              className="gd-t-3xs inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold"
              style={{ background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }}
            >
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: "var(--gd-blue)" }}
                aria-hidden
              />
              새 결과
            </span>
          ) : null}
        </div>
        {dday ? (
          // home-client TodoCard 의 D-day pill 과 픽셀 동일 마크업 계약
          <span
            className="gd-t-2xs gd-mono inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-bold"
            style={
              card.dDay === 0
                ? { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
                : { color: "var(--gd-ink-2)" }
            }
          >
            <CalendarClock className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
            {dday}
          </span>
        ) : card.status !== "DONE" && !card.overdue && !card.dueAt && !hideNoDueLabel ? (
          <span className="gd-t-3xs shrink-0" style={{ color: "var(--gd-ink-3)" }}>
            마감 없음
          </span>
        ) : null}
      </div>

      {/* 제목 + 안내문 + 진입 표식 */}
      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="gd-t-md font-bold leading-snug">{card.title}</p>
          {card.instructions ? (
            <p
              className="gd-t-xs mt-1 line-clamp-2"
              style={{ color: "var(--gd-ink-2)" }}
            >
              {card.instructions}
            </p>
          ) : null}
        </div>
        {clickable ? (
          <ChevronRight
            className="h-4 w-4 shrink-0"
            style={{ color: "var(--gd-ink-3)" }}
            aria-hidden
          />
        ) : null}
      </div>

      {/* 메타(진행·점수·잠금·마감) */}
      {metaItems.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {metaItems}
        </div>
      ) : null}
    </div>
  );

  if (!clickable || !card.actionHref) return inner;

  // EXAM(/t/…)은 앱 셸 밖 독립 응시 표면 — 같은 탭 전체 로드로 진입
  if (card.actionHref.startsWith("/t/")) {
    return (
      <a href={card.actionHref} className="block">
        {inner}
      </a>
    );
  }
  return (
    <Link href={card.actionHref} className="block">
      {inner}
    </Link>
  );
}

// ── 빈 상태 · 에러 · 스켈레톤 ────────────────────────────────────────────────

export function EmptyState({
  message,
  showTrainLink,
  celebrate,
}: {
  message: string;
  showTrainLink?: boolean;
  /** 전 과제 완료 축하 변형 — CircleCheck(gd-good) 아이콘 */
  celebrate?: boolean;
}) {
  const Icon = celebrate ? CircleCheck : ClipboardCheck;
  return (
    <div className="gd-card flex flex-col items-center gap-3 px-5 py-10 text-center">
      <Icon
        className="h-8 w-8"
        style={{ color: celebrate ? "var(--gd-good)" : "var(--gd-ink-3)" }}
        strokeWidth={1.5}
        aria-hidden
      />
      <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
        {message}
      </p>
      {showTrainLink ? (
        <Link href="/g/train" className="gd-btn gd-btn-ghost">
          훈련 탭으로 가기
        </Link>
      ) : null}
    </div>
  );
}

export function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="gd-card flex flex-col items-center gap-3 px-5 py-10 text-center">
      <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
        과제를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.
      </p>
      <button type="button" onClick={onRetry} className="gd-btn gd-btn-ghost">
        다시 불러오기
      </button>
    </div>
  );
}

export function Skeleton() {
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <span className="sr-only">과제를 불러오는 중입니다</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="gd-card animate-pulse px-4 py-3.5" aria-hidden>
          <div
            className="h-4 w-20 rounded"
            style={{ background: "var(--gd-line)" }}
          />
          <div
            className="mt-2.5 h-5 w-3/4 rounded"
            style={{ background: "var(--gd-line)" }}
          />
          <div
            className="mt-2 h-3.5 w-1/2 rounded"
            style={{ background: "var(--gd-line)", opacity: 0.7 }}
          />
        </div>
      ))}
    </div>
  );
}
