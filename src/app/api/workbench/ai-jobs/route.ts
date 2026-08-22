import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── 좀비 잡 자가 치유 ──
// stale-cleanup 은 원래 "새 생성 요청" 라우트에서만 돌아, 서버가 생성 도중 죽으면
// (dev 재시작·서버리스 함수 강제종료) PROCESSING 고아가 다음 생성 시도까지 UI
// 큐에서 영원히 돈다. 폴링이 고아 후보(10분 초과 활성 잡)를 목격하면 학원 스코프
// 청소(FAILED+환불, 검증된 규칙)를 발사해 폴링 자체가 치유 경로가 되게 한다.
// 인스턴스 메모리 스로틀은 베스트에포트 — 놓쳐도 다음 폴에서 다시 발사된다.
const STALE_CANDIDATE_MS = 10 * 60 * 1000;
const CLEANUP_THROTTLE_MS = 60 * 1000;
const lastCleanupByAcademy = new Map<string, number>();

function maybeCleanupStaleJobs(
  academyId: string,
  jobs: Array<{ status: string; createdAt: Date }>,
) {
  const cutoff = Date.now() - STALE_CANDIDATE_MS;
  const hasCandidate = jobs.some(
    (j) =>
      (j.status === "PENDING" || j.status === "PROCESSING") &&
      j.createdAt.getTime() < cutoff,
  );
  if (!hasCandidate) return;
  const last = lastCleanupByAcademy.get(academyId) ?? 0;
  if (Date.now() - last < CLEANUP_THROTTLE_MS) return;
  lastCleanupByAcademy.set(academyId, Date.now());
  // 응답을 막지 않는다 — 결과는 다음 폴에서 FAILED 카드로 반영된다.
  void cleanupStaleWorkbenchAiJobs({ academyId }).catch((error) => {
    console.error("[ai-jobs] stale cleanup failed", error);
  });
}

function normalizeDomain(raw: string | null): string | undefined {
  if (!raw || raw === "all") return undefined;
  if (raw === "passage-analysis") return "PASSAGE_ANALYSIS";
  if (raw === "question-generation") return "QUESTION_GENERATION";
  return raw;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function GET(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const domain = normalizeDomain(req.nextUrl.searchParams.get("domain"));
  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.floor(limitParam), 1), 100)
    : 50;
  const view = req.nextUrl.searchParams.get("view");
  // `?ids=a,b,c` — targeted projection for the session queue's completion
  // reconciliation (generation-session-store): when the cheap summary poll says
  // "this job finished" the client needs exactly those rows in full, not the
  // newest N. Academy scoping still comes from the `where` below, so this can
  // only narrow the result set, never widen it. Capped so it stays a cheap read.
  const idFilter = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 20);
  const idWhere = idFilter.length > 0 ? { id: { in: idFilter } } : {};

  // `?view=passage-list` — the 학습지 생성 지문 목록 poll (usePassageQueue). It needs
  // each passage's CONTENT (for word count, preview, and the inline 지문 토글) plus
  // light metadata, but deliberately OMITS the heavy parts that made the summary
  // poll necessary in the first place:
  //   • passage.questions (+ explanations) — 86–89% of the payload, unused here.
  //   • passage.notes — read by no consumer.
  //   • analysis.analysisData (the 5-layer JSON, multiple KB each) — the card's
  //     mini-summary comes from the server-seeded items / detail modal, not the poll.
  // So this view carries only content + scalar metadata + analysis {id,updatedAt}:
  // a few KB/passage, no question fan-out → egress stays bounded.
  if (view === "passage-list") {
    const passageJobs = await prisma.workbenchAiJob.findMany({
      where: {
        academyId: staff.academyId,
        deletedAt: null,
        ...(domain ? { domain } : {}),
      },
      select: {
        id: true,
        status: true,
        title: true,
        passageId: true,
        errorMessage: true,
        config: true,
        createdAt: true,
        passage: {
          select: {
            id: true,
            title: true,
            content: true,
            grade: true,
            semester: true,
            unit: true,
            publisher: true,
            difficulty: true,
            tags: true,
            source: true,
            createdAt: true,
            school: { select: { id: true, name: true, type: true } },
            analysis: { select: { id: true, updatedAt: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    maybeCleanupStaleJobs(staff.academyId, passageJobs);
    return NextResponse.json({ jobs: passageJobs });
  }

  // `?view=summary` — scalar-only projection for poll-only consumers (the global
  // task-queue badge/list adapters) that read counts + status and never touch
  // the passage, questions, result, or config. Skips the passage include AND the
  // result JSON entirely → a few KB instead of multiple MB per poll.
  if (view !== "full") {
    const summaryJobs = await prisma.workbenchAiJob.findMany({
      where: {
        academyId: staff.academyId,
        deletedAt: null,
        ...(domain ? { domain } : {}),
      },
      select: {
        id: true,
        domain: true,
        status: true,
        title: true,
        passageId: true,
        mode: true,
        questionType: true,
        requestedCount: true,
        successCount: true,
        failedCount: true,
        resultCount: true,
        config: true,
        errorMessage: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    maybeCleanupStaleJobs(staff.academyId, summaryJobs);
    return NextResponse.json({ jobs: summaryJobs });
  }

  // Passage sub-includes are domain-aware to avoid shipping data that no
  // consumer of THIS endpoint reads — the response is polled every few seconds,
  // so over-fetching here directly inflates Vercel origin transfer cost.
  //   • passage.questions (with explanations) is ~86–89% of the payload and is
  //     ONLY consumed by the PASSAGE_ANALYSIS queue. The QUESTION_GENERATION
  //     surfaces render from job.result.questions, never passage.questions.
  //   • passage.notes is read by no consumer here → dropped entirely.
  const includePassageQuestions = domain === "PASSAGE_ANALYSIS";
  const passageInclude: Prisma.PassageInclude = {
    school: { select: { id: true, name: true, type: true } },
    analysis: { select: { id: true, analysisData: true, contentHash: true, updatedAt: true } },
    ...(includePassageQuestions
      ? {
          questions: {
            where: { deletedAt: null },
            include: { explanation: true, _count: { select: { examLinks: true } } },
            orderBy: { createdAt: "desc" as const },
            take: 50,
          },
        }
      : {}),
  };

  const jobs = await prisma.workbenchAiJob.findMany({
    where: {
      academyId: staff.academyId,
      deletedAt: null,
      ...(domain ? { domain } : {}),
      ...idWhere,
    },
    include: { passage: { include: passageInclude } },
    orderBy: { createdAt: "desc" },
    take: idFilter.length > 0 ? idFilter.length : limit,
  });

  // ── 좀비 카드 방지: 삭제된 문제(dangling questionId)를 result에서 정리 ──
  // 문제를 삭제해도 이 job 행은 남으므로, `result.questionIds`가 이미 사라진
  // 문제를 가리킬 수 있다. 그대로 내려보내면 문제 생성 페이지의 세션 큐가
  // "삭제된 문제 카드"를 되살리고, 거기서 검수하면 approve가 실제 행을 못 찾아
  // "문제를 찾을 수 없습니다"로 실패한다. → 반환 시점에 실제로 존재하는
  // questionId만 남기고, 같은 인덱스의 questions 항목도 함께 정리한다.
  const referencedIds = new Set<string>();
  for (const job of jobs) {
    if (job.domain !== "QUESTION_GENERATION") continue;
    const result = asRecord(job.result);
    const ids = result && Array.isArray(result.questionIds) ? result.questionIds : [];
    for (const id of ids) if (typeof id === "string") referencedIds.add(id);
  }

  let liveIds: Set<string> = new Set();
  if (referencedIds.size > 0) {
    const rows = await prisma.question.findMany({
      where: { id: { in: [...referencedIds] }, academyId: staff.academyId, deletedAt: null },
      select: { id: true },
    });
    liveIds = new Set(rows.map((r) => r.id));
  }

  const sanitizedJobs =
    referencedIds.size === 0
      ? jobs
      : jobs.map((job) => {
          if (job.domain !== "QUESTION_GENERATION") return job;
          const result = asRecord(job.result);
          if (!result) return job;
          const ids = Array.isArray(result.questionIds) ? result.questionIds : null;
          if (!ids || ids.length === 0) return job;
          const questions = Array.isArray(result.questions) ? result.questions : [];
          // questions 배열이 questionIds와 1:1로 정렬돼 있을 때만 동기화한다.
          // 길이가 다른 비정상/레거시 result는 questions를 건드리지 않아 회귀를 막는다.
          const aligned = questions.length === ids.length;

          const keptIds: unknown[] = [];
          const keptQuestions: unknown[] = [];
          let removed = 0;
          ids.forEach((id, i) => {
            if (typeof id === "string" && liveIds.has(id)) {
              keptIds.push(id);
              if (aligned) keptQuestions.push(questions[i]);
            } else {
              removed += 1;
            }
          });
          if (removed === 0) return job; // 전부 살아있으면 원본 그대로

          return {
            ...job,
            result: {
              ...result,
              questionIds: keptIds,
              ...(aligned ? { questions: keptQuestions } : {}),
            },
          };
        });

  maybeCleanupStaleJobs(staff.academyId, jobs);
  return NextResponse.json({ jobs: sanitizedJobs });
}
