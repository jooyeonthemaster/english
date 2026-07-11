// ============================================================================
// /g/x/[taskId] — 학생 앱 시험 결과 화면 (서버 조립)
//
// 채점 완료된 EXAM 과제의 dead-end 해소: 세션 가드 → 태스크 해석
// (ASSIGNMENT: 소유 태스크 → examSubmissionId 브리지 / DIRECT: "sub:" 합성 id
// 직해석 — submissionId 직조회, studentId 스코프 필수) → 결과 공개 게이트
// (exam.showResults && submission.status === "GRADED") → /g/q 결과와 동일한
// 문항별 판정 그리드·아코디언(QResultScreen 재사용, heading만 "시험 결과").
//
// 학생 공개면 철칙(§6-1): 문항 본문은 buildStudentSafeQuestion + orderSnapshot
// 화이트리스트 조립, 내 답 에코는 input 만 — 정답 텍스트·해설은 어떤 경로로도
// 내려가지 않는다. 판정(정답/오답)은 showResults 게이트 통과 시에만 노출.
// 로드 실패는 친절한 안내로 종결(합니다체) — 스택/기술 문구 미노출.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, FileX } from "lucide-react";
import { summarizeScore } from "@/actions/exams/_assignments-shared";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { buildAnswerSpec } from "@/lib/exam-scoring/answer-spec";
import {
  buildAnswerUiSpec,
  buildStudentSafeQuestion,
} from "@/lib/exam-scoring/student-safe";
import {
  parseOrderSnapshot,
  parseSubmissionResponses,
} from "@/lib/exam-scoring/taking-payload";
import type { StudentInput } from "@/lib/exam-scoring/types";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { prisma } from "@/lib/prisma";
import { loadOwnedStudentTask } from "@/lib/study-assignments/student-runtime";
import { QResultScreen } from "@/app/g/q/[taskId]/q-result-screen";
import {
  normalizeGradeStatus,
  type QPerQuestionResult,
  type QPlayerItem,
  type QResultSummary,
} from "@/app/g/q/[taskId]/q-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "시험 결과 | SMOAT",
  robots: { index: false, follow: false },
};

const DIRECT_PREFIX = "sub:";

export default async function ExamResultPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const { taskId } = await params;

  // ── 태스크 해석 — ASSIGNMENT(실 태스크 id) 또는 DIRECT("sub:" 합성 id) ──
  let submissionId: string | null = null;
  let cardTitle: string | null = null;
  if (taskId.startsWith(DIRECT_PREFIX)) {
    submissionId = taskId.slice(DIRECT_PREFIX.length) || null;
  } else {
    const task = await loadOwnedStudentTask(taskId, session.studentId, session.academyId);
    if (task && task.kind === "EXAM") {
      cardTitle = task.title;
      const row = await prisma.studyAssignmentTask.findFirst({
        where: { id: taskId, studentId: session.studentId, academyId: session.academyId },
        select: { examSubmissionId: true },
      });
      submissionId = row?.examSubmissionId ?? null;
    }
  }
  if (!submissionId) {
    return <ResultFallback title="시험 결과를 열 수 없습니다" />;
  }

  // 소유 검증 — 세션 학생 + 학원 스코프 교차검증(타 학생/타 학원 열람 차단)
  const sub = await prisma.examSubmission.findFirst({
    where: {
      id: submissionId,
      studentId: session.studentId,
      exam: { academyId: session.academyId },
    },
    select: {
      id: true,
      status: true,
      responses: true,
      orderSnapshot: true,
      scoreSummary: true,
      exam: { select: { id: true, title: true, showResults: true, subject: true } },
    },
  });
  if (!sub || sub.exam.subject === "KOREAN") {
    return <ResultFallback title="시험 결과를 열 수 없습니다" />;
  }

  // 결과 공개 게이트 — 채점 확정(GRADED) + 결과 공개(showResults) 둘 다 필요.
  if (!(sub.exam.showResults && sub.status === "GRADED")) {
    return (
      <ResultFallback
        title="아직 공개되지 않은 결과입니다"
        message="선생님이 채점을 마치고 결과를 공개하면 여기에서 확인할 수 있습니다."
      />
    );
  }

  // ── 표시 페이로드 조립(서버 내부 파스 → 화이트리스트만 직렬화) ──
  const snapshot = parseOrderSnapshot(sub.orderSnapshot);
  const parsed = parseSubmissionResponses(sub.responses);
  const responseByQid = new Map(parsed.map((r) => [r.questionId, r]));

  // 문항별 판정 — orderSnapshot 이 정본(전 문항 커버), 판정은 수동확정 우선.
  // 판정 status 문자열만 직렬화 — result/manualStatus 원본 객체는 내려가지 않는다.
  const perQuestion: QPerQuestionResult[] =
    snapshot.length > 0
      ? snapshot.map((entry) => {
          const res = responseByQid.get(entry.questionId);
          return {
            questionId: entry.questionId,
            orderNum: entry.orderNum,
            status: normalizeGradeStatus(res?.manualStatus ?? res?.result?.status),
          };
        })
      : parsed
          .map((r) => ({
            questionId: r.questionId,
            orderNum: r.orderNum,
            status: normalizeGradeStatus(r.manualStatus ?? r.result?.status),
          }))
          .sort((a, b) => a.orderNum - b.orderNum);

  // 요약 — scoreSummary 방어 파스(summarizeScore). 형태 파손 시 null(추정 금지).
  const brief = summarizeScore(sub.scoreSummary);
  const summary: QResultSummary | null = brief
    ? {
        score: brief.totalScore ?? 0,
        maxScore: brief.maxScore ?? 0,
        percent:
          brief.maxScore && brief.totalScore !== null
            ? Math.round((brief.totalScore / brief.maxScore) * 1000) / 10
            : null,
        correct: brief.correctCount,
        wrong: brief.wrongCount,
        partial: brief.partialCount,
        needsReview: brief.unknownCount,
        total:
          brief.correctCount + brief.wrongCount + brief.partialCount + brief.unknownCount,
      }
    : null;

  // 드릴다운 문항 — LIVE Question 을 orderSnapshot 순서로 student-safe 조립.
  // 삭제(deletedAt)·타학원 문항 제외(타일은 남고 "열람 불가" 안내로 강등).
  const records = snapshot.length
    ? await prisma.question.findMany({
        where: {
          id: { in: snapshot.map((e) => e.questionId) },
          academyId: session.academyId,
          deletedAt: null,
        },
        include: { passage: { select: { content: true } } },
      })
    : [];
  const questionById = new Map(records.map((q) => [q.id, q]));
  const items: QPlayerItem[] = [];
  for (const entry of snapshot) {
    const question = questionById.get(entry.questionId);
    if (!question) continue;
    // AnswerSpec(정답 포함)은 서버에서만 소비 — 클라로는 buildAnswerUiSpec 결과만.
    const spec = buildAnswerSpec({
      id: question.id,
      type: question.type,
      subType: question.subType,
      options: question.options,
      correctAnswer: question.correctAnswer,
      structuredData: question.structuredData,
      points: entry.points,
    });
    items.push({
      question: buildStudentSafeQuestion(question),
      answerUi: buildAnswerUiSpec(spec),
      orderNum: entry.orderNum,
      points: entry.points,
    });
  }

  // 내 답 에코 — parseSubmissionResponses 가 input 을 화이트리스트 정화(sanitize)
  // 해서 보존하므로 input 만 재추출한다(판정·점수 필드 구조적 미포함).
  const inputs: Record<string, StudentInput | null> = {};
  for (const r of parsed) inputs[r.questionId] = r.input ?? null;

  const title = cardTitle ?? sub.exam.title;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="shrink-0 px-4 pt-3">
        <div className="flex h-10 items-center gap-2">
          <Link
            href="/g/tasks"
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full"
            style={{ color: "var(--gd-ink-2)" }}
            aria-label="과제 목록으로 나가기"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} />
          </Link>
          <p className="gd-t-sm min-w-0 flex-1 truncate font-semibold">{title}</p>
        </div>
      </header>
      <QResultScreen
        heading="시험 결과"
        title={title}
        result={{ summary, perQuestion }}
        items={items}
        inputs={inputs}
        embedded
      />
    </div>
  );
}

/** 로드 실패/미공개 안내 — 학생 친화 문구(합니다체) + 과제 목록 복귀 */
function ResultFallback({
  title,
  message = "시험 결과를 불러올 수 없습니다. 선생님께 문의해 주세요.",
}: {
  title: string;
  message?: string;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }}
      >
        <FileX className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </span>
      <h1 className="gd-t-lg font-bold tracking-tight">{title}</h1>
      <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
        {message}
      </p>
      <Link href="/g/tasks" className="gd-btn gd-btn-ghost mt-2 px-5">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        과제 목록으로 돌아가기
      </Link>
    </div>
  );
}
