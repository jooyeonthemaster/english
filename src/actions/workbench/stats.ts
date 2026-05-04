"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "./_helpers";

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function getWorkbenchStats(academyId: string) {
  await requireAuth();

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
    prisma.question.count({ where: { academyId } }),
    prisma.question.count({ where: { academyId, aiGenerated: true } }),
    prisma.question.count({ where: { academyId, approved: true } }),
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
        _count: { select: { questions: true } },
      },
    }),
    prisma.question.findMany({
      where: { academyId },
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
  await requireAuth();

  return prisma.school.findMany({
    where: { academyId },
    select: { id: true, name: true, type: true, publisher: true },
    orderBy: { name: "asc" },
  });
}
