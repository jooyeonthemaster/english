"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth, getAcademyId } from "./_helpers";

// ---------------------------------------------------------------------------
// SourceMaterial lookup — lightweight read used to render filter badges when
// /workbench/passages is entered from /import with ?sourceMaterialId=...
// ---------------------------------------------------------------------------
export async function getSourceMaterialSummary(sourceMaterialId: string) {
  const session = await requireAuth();
  const academyId = getAcademyId(session);

  const material = await prisma.sourceMaterial.findFirst({
    where: { id: sourceMaterialId, academyId },
    select: {
      id: true,
      title: true,
      subtitle: true,
      type: true,
      year: true,
      round: true,
      grade: true,
      examType: true,
      publisher: true,
    },
  });

  return material;
}

// ---------------------------------------------------------------------------
// PassageCollection lookup — mirror of getSourceMaterialSummary so the
// /workbench/passages page can verify that a `?collectionId=` deep-link
// actually belongs to the current academy before wiring it into the filter.
// Returns null for cross-academy / deleted ids so the caller can silently
// drop the filter instead of leaking other tenants' data.
// ---------------------------------------------------------------------------
export async function getPassageCollectionSummary(collectionId: string) {
  const session = await requireAuth();
  const academyId = getAcademyId(session);

  return prisma.passageCollection.findFirst({
    where: { id: collectionId, academyId },
    select: { id: true, name: true, color: true },
  });
}

// ---------------------------------------------------------------------------
// Passage → Collection membership map for the current academy.
// Replaces the raw `prisma.passageCollectionItem.findMany` that the page
// component was issuing directly, so all DB access stays inside the action
// layer and we get a single guarded entry point for future scoping tweaks.
// ---------------------------------------------------------------------------
export async function getAcademyPassageCollectionMembership(
  academyId: string
): Promise<Record<string, string[]>> {
  const session = await requireAuth();
  if (session.academyId !== academyId) {
    // Silent isolation — never leak another academy's membership graph.
    return {};
  }
  const items = await prisma.passageCollectionItem.findMany({
    where: { collection: { academyId } },
    select: { collectionId: true, passageId: true },
  });
  const membership: Record<string, string[]> = {};
  for (const item of items) {
    if (!membership[item.collectionId]) membership[item.collectionId] = [];
    membership[item.collectionId].push(item.passageId);
  }
  return membership;
}

// ---------------------------------------------------------------------------
// Passage → question id list. Used by the "시험에 추가" dialog to convert
// a passage context into the actual question rows that will be linked to
// an Exam (since Exam rows reference Question, not Passage).
// Academy-scoped: only returns ids of questions on a passage this academy
// owns, so a manipulated passageId can't exfiltrate another tenant's bank.
// ---------------------------------------------------------------------------
export async function getPassageQuestionIds(
  passageId: string
): Promise<{ passageId: string; title: string; questionIds: string[] } | null> {
  const session = await requireAuth();
  const academyId = getAcademyId(session);

  const passage = await prisma.passage.findFirst({
    where: { id: passageId, academyId },
    select: {
      id: true,
      title: true,
      questions: { select: { id: true } },
    },
  });
  if (!passage) return null;

  return {
    passageId: passage.id,
    title: passage.title,
    questionIds: passage.questions.map((q) => q.id),
  };
}

// ---------------------------------------------------------------------------
// DRAFT exams list — powers the "기존 시험에 추가" dropdown in the passage
// detail dialog. Only DRAFT status is returned so we never accidentally
// mutate a PUBLISHED exam's question set from a quick-add flow.
// ---------------------------------------------------------------------------
export async function getDraftExamsForPicker(academyId: string) {
  const session = await requireAuth();
  if (session.academyId !== academyId) return [];

  return prisma.exam.findMany({
    where: { academyId, status: "DRAFT" },
    select: {
      id: true,
      title: true,
      type: true,
      examDate: true,
      _count: { select: { questions: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
