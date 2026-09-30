"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "./_helpers";

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function getWorkbenchStats(academyIdArg: string) {
  // 학원 범위는 세션이 정한다 — 인자는 호환용(호출부는 staff.academyId 를 넘긴다, IDOR 수리 26-09-30).
  const staff = await requireAuth();
  void academyIdArg;
  const academyId = staff.academyId;

  const [
    totalPassages,
    totalQuestions,
    aiGeneratedCount,
    approvedCount,
    pendingAnalysisCount,
    analyzedPassageCount,
    recentPassages,
    recentQuestions,
    pendingPassages,
  ] = await Promise.all([
    prisma.passage.count({ where: { academyId } }),
    prisma.question.count({ where: { academyId, deletedAt: null } }),
    prisma.question.count({ where: { academyId, aiGenerated: true, deletedAt: null } }),
    prisma.question.count({ where: { academyId, approved: true, deletedAt: null } }),
    // Passages without analysis
    prisma.passage.count({
      where: { academyId, analysis: null },
    }),
    // Passages with analysis
    prisma.passage.count({
      where: { academyId, analysis: { isNot: null } },
    }),
    prisma.passage.findMany({
      where: { academyId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        grade: true,
        createdAt: true,
        analysis: { select: { id: true } },
        _count: { select: { questions: { where: { deletedAt: null } } } },
      },
    }),
    prisma.question.findMany({
      where: { academyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        type: true,
        subType: true,
        difficulty: true,
        questionText: true,
        aiGenerated: true,
        approved: true,
        createdAt: true,
      },
    }),
    // Passages awaiting analysis (for action items)
    prisma.passage.findMany({
      where: { academyId, analysis: null },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        grade: true,
        createdAt: true,
      },
    }),
  ]);

  // Learning question counts (내신링고 + 수능링고)
  const [naeshinCount, suneungCount] = await Promise.all([
    prisma.naeshinQuestion.count({ where: { academyId } }),
    prisma.suneungQuestion.count(),
  ]);

  return {
    totalPassages,
    totalQuestions,
    aiGeneratedCount,
    approvedCount,
    pendingAnalysisCount,
    analyzedPassageCount,
    recentPassages,
    recentQuestions,
    pendingPassages,
    unapprovedCount: totalQuestions - approvedCount,
    totalLearningQuestions: naeshinCount + suneungCount,
  };
}

// ---------------------------------------------------------------------------
// School list helper (for filters)
// ---------------------------------------------------------------------------

export async function getAcademySchools(academyId: string) {
  // 학원 범위는 세션이 정한다(getWorkbenchStats 와 같은 이유).
  const staff = await requireAuth();
  void academyId;

  return prisma.school.findMany({
    where: { academyId: staff.academyId },
    select: { id: true, name: true, type: true, publisher: true },
    orderBy: { name: "asc" },
  });
}
