// ============================================================================
// 시험 응시 — /t/[token] (무인증 · force-dynamic · noindex)
//
// /a/[token] 공개면 골격을 미러한다: 토큰 소지 = 접근 권한, 어떤 세션도 요구하지
// 않는다. 서버 조립 정본은 loadTakingSession(W4) — 화이트리스트 페이로드만
// 클라이언트로 내려간다(정답·정오·점수 구조적 미포함, 계약 §6-1).
//
// 분기: null → 만료 화면(단, 행이 실존하고 accessEnabled=false 면 "응시 중단"
// 으로 구분 응대) / SUBMITTED·GRADED → 완료 화면(학생명·시험명·제출시각만) /
// mode OMR → OmrEntryClient(V3) / 그 외 → TabletTakingClient(V2).
// 신규 표면 전체가 FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT 게이트(계약 §5).
// ============================================================================

import type { Metadata } from "next";
import { CheckCircle2, Link2Off, PauseCircle } from "lucide-react";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { isValidShareToken } from "@/lib/exam-report/share-token";
import {
  findTakingSubmission,
  loadTakingSession,
} from "@/lib/exam-scoring/taking-payload";
import { getTakingAssignmentContext } from "@/lib/study-assignments/taking-bridge";
import { OmrEntryClient } from "./omr-entry-client";
import { TabletTakingClient } from "./tablet-taking-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  // 학생명·시험명·점수는 절대 포함하지 않는다(정적 메타 — 조회 자체가 불필요).
  return {
    title: "시험 응시 | SMOAT",
    description: "선생님이 배정한 시험에 응시하는 페이지입니다.",
    robots: { index: false, follow: false },
  };
}

export default async function TakingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  // 과제(/g) 출처 진입 표식 — 저장 후 나가기·완료 화면 복귀 버튼의 목적지.
  // student-cards 가 ASSIGNMENT 출처 응시 링크에만 ?return=g 를 붙인다.
  const { return: returnTo } = await searchParams;
  const exitHref = returnTo === "g" ? "/g/tasks" : null;

  // 기능 플래그 off — 존재를 구분하지 않고 만료 화면으로(레거시 무영향).
  if (!FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT) return <ExpiredNotice />;

  let session = await loadTakingSession(token);
  if (!session) {
    // 로더는 비활성 링크를 null 로 수렴시킨다 — "강사가 응시를 중단한 링크"는
    // 만료와 구분해 안내한다(KOREAN 이중 방어 행은 존재 은닉 유지 — 만료 화면).
    if (isValidShareToken(token)) {
      const row = await findTakingSubmission(token);
      if (row && !row.accessEnabled && row.exam.subject !== "KOREAN") {
        return <SuspendedNotice />;
      }
    }
    return <ExpiredNotice />;
  }

  // 제출/채점 완료 — 점수·정오 절대 미노출(§6-1): 학생명·시험명·제출시각만.
  if (session.status === "SUBMITTED" || session.status === "GRADED") {
    return (
      <CompletedNotice
        studentName={session.studentName}
        examTitle={session.examTitle}
        submittedAt={session.submittedAt}
        exitHref={exitHref}
      />
    );
  }

  // 통합 과제 브리지 컨텍스트 — 제한시간 오버라이드(payload.durationMin)를
  // 페이지 레벨에서 패치한다(exam-scoring 로더 무수정). 인트로 '제한 N분'·
  // 타이머·만료 자동제출이 패치된 duration 으로 자동 반영된다.
  // 브리지가 없는 DIRECT 배포는 null — 기존 동작 그대로.
  const assignment = await getTakingAssignmentContext(session.submissionId);
  if (assignment?.durationMin != null) {
    session = { ...session, duration: assignment.durationMin };
  }
  const dueLabel = assignment?.dueAt ? formatSeoulDateTime(assignment.dueAt) : null;

  if (session.mode === "OMR") {
    return <OmrEntryClient token={token} session={session} exitHref={exitHref} />;
  }
  return (
    <TabletTakingClient
      token={token}
      session={session}
      exitHref={exitHref}
      assignmentInstructions={assignment?.instructions ?? null}
      assignmentDueLabel={dueLabel}
    />
  );
}

/** 서버 1회 렌더용 Asia/Seoul 고정 표기 — "7월 14일 23:59" (CompletedNotice 미러) */
function formatSeoulDateTime(at: Date): string {
  return at.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ── 서버 안내 화면(무상태) ────────────────────────────────────────────────────

function NoticeShell({
  icon,
  iconClass,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <div className="w-full max-w-sm">
        <div
          className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${iconClass}`}
        >
          {icon}
        </div>
        <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
        {children}
        <p className="mt-6 text-[11px] text-slate-400">SMOAT 시험 응시</p>
      </div>
    </div>
  );
}

function ExpiredNotice() {
  return (
    <NoticeShell
      icon={<Link2Off className="h-6 w-6" />}
      iconClass="bg-slate-100 text-slate-400"
      title="만료되었거나 잘못된 링크입니다"
      description="응시 링크가 더 이상 유효하지 않습니다. 링크를 보내 준 선생님께 새 링크를 요청해 주세요."
    />
  );
}

function SuspendedNotice() {
  return (
    <NoticeShell
      icon={<PauseCircle className="h-6 w-6" />}
      iconClass="bg-slate-100 text-slate-400"
      title="응시가 중단된 링크입니다"
      description="선생님이 이 링크의 응시를 중단했습니다. 선생님께 문의해 주세요."
    />
  );
}

function CompletedNotice({
  studentName,
  examTitle,
  submittedAt,
  exitHref,
}: {
  studentName: string;
  examTitle: string;
  submittedAt: string | null;
  /** 과제(?return=g) 출처 재진입 — 학습 앱 복귀 버튼 목적지 */
  exitHref?: string | null;
}) {
  // 서버 1회 렌더 — 타임존을 고정(Asia/Seoul)해 배포 환경과 무관하게 동일 표기.
  let submittedLabel: string | null = null;
  if (submittedAt) {
    const at = new Date(submittedAt);
    if (!Number.isNaN(at.getTime())) {
      submittedLabel = at.toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }

  return (
    <NoticeShell
      icon={<CheckCircle2 className="h-7 w-7" />}
      iconClass="bg-emerald-50 text-emerald-600"
      title="제출이 완료되었습니다"
      description="수고했습니다. 선생님이 확인한 뒤 결과를 안내합니다."
    >
      <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left">
        <p className="truncate text-sm font-semibold text-slate-800">{examTitle}</p>
        <p className="mt-0.5 text-xs text-slate-500">{studentName}</p>
        {submittedLabel && (
          <p className="mt-1.5 text-xs text-slate-400">제출 {submittedLabel}</p>
        )}
      </div>
      {exitHref && (
        <a
          href={exitHref}
          className="mt-5 flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          학습 앱으로 돌아가기
        </a>
      )}
    </NoticeShell>
  );
}
