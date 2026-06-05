import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // `?view=summary` — scalar-only projection for poll-only consumers (the global
  // task-queue badge/list adapters) that read counts + status and never touch
  // the passage, questions, result, or config. Skips the passage include AND the
  // result JSON entirely → a few KB instead of multiple MB per poll.
  if (req.nextUrl.searchParams.get("view") === "summary") {
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
        errorMessage: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
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
    },
    include: { passage: { include: passageInclude } },
    orderBy: { createdAt: "desc" },
    take: limit,
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
      where: { id: { in: [...referencedIds] }, academyId: staff.academyId },
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

  return NextResponse.json({ jobs: sanitizedJobs });
}
