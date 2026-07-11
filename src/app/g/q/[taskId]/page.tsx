// ============================================================================
// /g/q/[taskId] — 문제 세트 과제 플레이어 (서버 조립)
//
// 통합 과제(QUESTIONS)의 학생 풀이 진입점. 세션 검증 → 소유 태스크 로드
// (kind QUESTIONS 아니면 /g/tasks) → 진행 마킹 → student-safe 문항 페이로드
// (buildQuestionsPlayerItems — 화이트리스트 조립, 정답성 0) → 클라이언트 플레이어.
// 이미 DONE 이면 캐시 결과(task.result + responses 의 문항별 판정)에 더해
// student-safe 문항과 내 답 에코(responses 각 원소의 input 만 화이트리스트
// 추출 — result·manualStatus 등 채점 필드 구조적 배제)를 내려 결과 드릴다운
// 화면을 띄운다 — 정답 텍스트·해설은 서버가 어떤 경로로도 내보내지 않는다(§6-1).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { StudentInput } from "@/lib/exam-scoring/types";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { buildQuestionsPlayerItems } from "@/lib/study-assignments/questions-runtime";
import { isTaskLocked } from "@/lib/study-assignments/status";
import {
  loadOwnedStudentTask,
  markTaskInProgress,
  questionIdsOf,
  type OwnedStudentTask,
} from "@/lib/study-assignments/student-runtime";
import { QPlayerClient } from "./q-player-client";
import { QResultScreen } from "./q-result-screen";
import {
  normalizeGradeStatus,
  type QPerQuestionResult,
  type QResultSummary,
  type QTaskResultPayload,
} from "./q-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "문제 세트 풀이 | SMOAT",
};

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** DONE 태스크의 캐시 결과 → 결과 화면 페이로드(문항별 판정 status 만, 정답 미포함) */
function toResultPayload(task: OwnedStudentTask): QTaskResultPayload {
  let summary: QResultSummary | null = null;
  const raw = task.result;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    summary = {
      score: toNum(r.score),
      maxScore: toNum(r.maxScore),
      percent: typeof r.percent === "number" ? r.percent : null,
      correct: toNum(r.correct),
      wrong: toNum(r.wrong),
      partial: toNum(r.partial),
      needsReview: toNum(r.needsReview),
      total: toNum(r.total),
    };
  }

  const list = Array.isArray(task.responses) ? task.responses : [];
  const perQuestion: QPerQuestionResult[] = list.map((entry, idx) => {
    const r = (entry && typeof entry === "object" ? entry : {}) as {
      questionId?: unknown;
      orderNum?: unknown;
      manualStatus?: unknown;
      result?: { status?: unknown } | null;
    };
    return {
      questionId: typeof r.questionId === "string" ? r.questionId : `q-${idx + 1}`,
      orderNum: toNum(r.orderNum) || idx + 1,
      // 강사 수동확정(manualStatus)이 있으면 그것이 정본 — SubmissionResponse 계약 미러
      status: normalizeGradeStatus(r.manualStatus ?? r.result?.status),
    };
  });

  return { summary, perQuestion };
}

/** SubmissionResponse.input → choice/choices/texts 만 화이트리스트 재조립.
 *  스프레드 금지 — 미지 필드·정답성 필드는 구조적으로 통과할 수 없다(§6-1). */
function sanitizeStudentInput(raw: unknown): StudentInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: StudentInput = {};
  if (typeof r.choice === "string" && r.choice) out.choice = r.choice;
  if (Array.isArray(r.choices)) {
    const choices = r.choices.filter((v): v is string => typeof v === "string" && v.length > 0);
    if (choices.length > 0) out.choices = choices;
  }
  if (r.texts && typeof r.texts === "object" && !Array.isArray(r.texts)) {
    const texts: Record<string, string> = {};
    for (const [key, value] of Object.entries(r.texts as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim().length > 0) texts[key] = value;
    }
    if (Object.keys(texts).length > 0) out.texts = texts;
  }
  return out.choice !== undefined || out.choices !== undefined || out.texts !== undefined
    ? out
    : null;
}

/** DONE 태스크 responses → questionId별 내 답 에코 맵(input 화이트리스트만).
 *  result(판정·점수)·manualStatus 등 채점 필드는 어떤 형태로도 포함하지 않는다. */
function extractStudentInputs(task: OwnedStudentTask): Record<string, StudentInput | null> {
  const list = Array.isArray(task.responses) ? task.responses : [];
  const map: Record<string, StudentInput | null> = {};
  for (const entry of list) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const r = entry as { questionId?: unknown; input?: unknown };
    if (typeof r.questionId !== "string" || !r.questionId) continue;
    map[r.questionId] = sanitizeStudentInput(r.input);
  }
  return map;
}

export default async function QuestionsPlayerPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const { taskId } = await params;
  const task = await loadOwnedStudentTask(taskId, session.studentId, session.academyId);
  if (!task || task.kind !== "QUESTIONS") redirect("/g/tasks");

  // 이미 완료 — 캐시 결과 + student-safe 문항(정답성 0) + 내 답 에코(input 만)로
  // 결과 드릴다운 화면. 정답 텍스트·해설은 어떤 경로로도 내려가지 않는다(§6-1).
  if (task.taskStatus === "DONE") {
    const items = await buildQuestionsPlayerItems(session.academyId, questionIdsOf(task));
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
            <p className="gd-t-sm min-w-0 flex-1 truncate font-semibold">{task.title}</p>
          </div>
        </header>
        <QResultScreen
          title={task.title}
          result={toResultPayload(task)}
          items={items}
          inputs={extractStudentInputs(task)}
          embedded
          purgeDraftTaskId={task.taskId}
        />
      </div>
    );
  }

  // 진입 잠금 — 공개 예정(availableFrom 미래)·마감 처리(CLOSED)는 목록 카드와
  // 동일 규칙으로 차단(마감일 dueAt 지남은 잠그지 않는다 — 늦은 제출 허용).
  if (isTaskLocked(task.availableFrom, new Date()) || task.assignmentStatus === "CLOSED") {
    redirect("/g/tasks");
  }

  await markTaskInProgress(task.taskId, session.studentId);
  const items = await buildQuestionsPlayerItems(session.academyId, questionIdsOf(task));

  return (
    <QPlayerClient
      taskId={task.taskId}
      title={task.title}
      instructions={task.instructions}
      items={items}
      initialResult={null}
    />
  );
}
