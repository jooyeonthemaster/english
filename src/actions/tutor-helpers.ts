import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildRuleBasedTutorDrafts, generateTutorDraftsWithModel, validateGroundedDrafts } from "@/lib/tutor/generate-activities";
import { requiresAiGrade } from "@/lib/tutor/activity-types";
import { parsePassageAnalysis } from "@/lib/tutor/passage-analysis";
import { sha256Json } from "@/lib/tutor/crypto";
import type { CoverageDimension } from "./tutor-types";
export function asJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

export function readTokenUsage(usage: unknown) {
  const record = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : {};
  return {
    input: Number(record.inputTokens ?? record.promptTokens ?? 0),
    output: Number(record.outputTokens ?? record.completionTokens ?? 0),
  };
}

export const coverageDimensions = new Set<CoverageDimension>(["interpret", "memorize", "order", "vocab", "grammar", "transfer"]);

export const UNMEASURED_DIMENSION_SCORE = 70;

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function fallbackDimension(mode: string, type: string): CoverageDimension {
  if (coverageDimensions.has(mode as CoverageDimension)) return mode as CoverageDimension;
  if (type.includes("vocab")) return "vocab";
  if (type.includes("grammar")) return "grammar";
  if (type.includes("order") || type.includes("insertion") || type.includes("irrelevant")) return "order";
  if (type.includes("rebuild") || type.includes("recall") || type.includes("cloze")) return "memorize";
  if (type.includes("transform")) return "transfer";
  return "interpret";
}

export function parseCoverageRefsForSnapshot(raw: unknown, mode: string, type: string) {
  if (!Array.isArray(raw)) {
    return [{ sentenceIndex: -1, dimension: fallbackDimension(mode, type), weight: 1 }];
  }
  const refs = raw
    .map((item) => asRecord(item))
    .filter((item) => coverageDimensions.has(String(item.dimension) as CoverageDimension))
    .map((item) => ({
      sentenceIndex: Number.isInteger(Number(item.sentenceIndex)) ? Number(item.sentenceIndex) : -1,
      dimension: String(item.dimension) as CoverageDimension,
      weight: Math.max(0.1, Math.min(1, Number(item.weight ?? 0.7))),
    }));
  return refs.length > 0 ? refs : [{ sentenceIndex: -1, dimension: fallbackDimension(mode, type), weight: 1 }];
}

export function addWeakCount(map: Map<string, number>, key: string) {
  const cleanKey = cleanText(key);
  if (!cleanKey) return;
  map.set(cleanKey, (map.get(cleanKey) ?? 0) + 1);
}

export function extractWeakVocabLabel(type: string, payload: Record<string, unknown>) {
  if (!type.includes("vocab") && !["contextual_meaning", "collocation_select"].includes(type)) return "";
  return cleanText(payload.stem ?? payload.word ?? payload.answerText ?? payload.meaning);
}

export function extractWeakGrammarLabel(type: string, title: string, payload: Record<string, unknown>) {
  if (!type.includes("grammar")) return "";
  return cleanText(payload.pattern ?? payload.statement ?? payload.prompt ?? title);
}

export async function refreshTutorWeaknessSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    academyId: string;
    assignmentId: string;
    studentId: string;
    programId: string;
    lessonId: string;
  },
) {
  const items = await tx.tutorAttemptItem.findMany({
    where: {
      academyId: input.academyId,
      attempt: {
        assignmentId: input.assignmentId,
        studentId: input.studentId,
        deletedAt: null,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 160,
    include: {
      activity: {
        select: {
          mode: true,
          type: true,
          title: true,
          payload: true,
          coverageRefs: true,
        },
      },
    },
  });

  if (items.length === 0) return null;

  const totals = new Map<CoverageDimension, { earned: number; max: number }>(
    Array.from(coverageDimensions).map((dimension) => [dimension, { earned: 0, max: 0 }]),
  );
  const weakSentenceCounts = new Map<string, number>();
  const weakVocabCounts = new Map<string, number>();
  const weakGrammarCounts = new Map<string, number>();
  let earnedTotal = 0;
  let maxTotal = 0;

  for (const item of items) {
    const scoreMax = Math.max(1, item.scoreMax || 1);
    const scoreEarned = Math.max(0, Math.min(scoreMax, item.scoreEarned || 0));
    earnedTotal += scoreEarned;
    maxTotal += scoreMax;

    const refs = parseCoverageRefsForSnapshot(item.activity.coverageRefs, item.activity.mode, item.activity.type);
    for (const ref of refs) {
      const bucket = totals.get(ref.dimension);
      if (!bucket) continue;
      bucket.earned += scoreEarned * ref.weight;
      bucket.max += scoreMax * ref.weight;
      if (item.isCorrect === false && ref.sentenceIndex >= 0 && ref.weight >= 0.5) {
        addWeakCount(weakSentenceCounts, String(ref.sentenceIndex));
      }
    }

    if (item.isCorrect === false) {
      const payload = asRecord(item.activity.payload);
      addWeakCount(weakVocabCounts, extractWeakVocabLabel(item.activity.type, payload));
      addWeakCount(weakGrammarCounts, extractWeakGrammarLabel(item.activity.type, item.activity.title, payload));
    }
  }

  const overallScore = clampScore(maxTotal ? (earnedTotal / maxTotal) * 100 : 0);
  const scoreFor = (dimension: CoverageDimension) => {
    const bucket = totals.get(dimension);
    return bucket?.max ? clampScore((bucket.earned / bucket.max) * 100) : UNMEASURED_DIMENSION_SCORE;
  };
  const rankedEntries = (map: Map<string, number>, limit = 6) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

  const weakSentenceIndices = rankedEntries(weakSentenceCounts).map(([sentenceIndex, count]) => ({
    sentenceIndex: Number(sentenceIndex),
    label: `문장 ${Number(sentenceIndex) + 1}`,
    count,
  }));
  const weakVocab = rankedEntries(weakVocabCounts).map(([word, count]) => ({ word, count }));
  const weakGrammarPoints = rankedEntries(weakGrammarCounts).map(([point, count]) => ({ point, count }));

  const snapshot = await tx.tutorWeaknessSnapshot.create({
    data: {
      academyId: input.academyId,
      studentId: input.studentId,
      programId: input.programId,
      lessonId: input.lessonId,
      scoreInterpret: scoreFor("interpret"),
      scoreMemorize: scoreFor("memorize"),
      scoreOrder: scoreFor("order"),
      scoreVocabDepth: scoreFor("vocab"),
      scoreGrammar: scoreFor("grammar"),
      scoreTransfer: scoreFor("transfer"),
      scoreRetention: overallScore,
      weakSentenceIndices: asJsonInput(weakSentenceIndices),
      weakVocab: asJsonInput(weakVocab),
      weakGrammarPoints: asJsonInput(weakGrammarPoints),
    },
  });

  await tx.tutorProgress.updateMany({
    where: {
      academyId: input.academyId,
      assignmentId: input.assignmentId,
      programId: input.programId,
      studentId: input.studentId,
      OR: [{ lessonId: input.lessonId }, { lessonId: null }],
    },
    data: { weaknessSnapshotId: snapshot.id },
  });

  return snapshot.id;
}

// Per-passage draft preparation: rule-based drafts + best-effort AI drafts
// (deduped). Shared verbatim by createTutorProgramAction / addTutorProgramPassagesAction.
export async function prepareTutorLessonDraft<
  P extends { analysis?: { analysisData?: string | null } | null },
>(passage: P) {
  const analysis = parsePassageAnalysis(passage.analysis?.analysisData);
  if (!analysis) return null;

  let drafts = buildRuleBasedTutorDrafts(analysis);
  let aiLogData: {
    model: string;
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    status: "ok" | "parse_fail";
  } = {
    model: "fallback",
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 0,
    status: "parse_fail",
  };

  try {
    const generated = await generateTutorDraftsWithModel(analysis);
    const valid = validateGroundedDrafts(generated.activities, analysis);
    if (valid.length >= 8) {
      const seen = new Set<string>();
      drafts = [...drafts, ...valid].filter((draft) => {
        const key = `${draft.type}:${draft.title}:${JSON.stringify(draft.coverageRefs)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    const tokenUsage = readTokenUsage(generated.usage);
    aiLogData = {
      model: generated.model,
      tokensIn: tokenUsage.input,
      tokensOut: tokenUsage.output,
      latencyMs: generated.latencyMs,
      status: "ok",
    };
  } catch {}

  return { passage, analysis, drafts, aiLogData };
}

// tutorActivity.createMany rows for one lesson's drafts. Shared by create/add
// so the draft→row schema mapping lives in exactly one place.
export function buildTutorActivityRows(params: {
  academyId: string;
  lessonId: string;
  drafts: ReturnType<typeof buildRuleBasedTutorDrafts>;
  analysis: NonNullable<ReturnType<typeof parsePassageAnalysis>>;
  sourceAnalysisVersion: number | null | undefined;
}): Prisma.TutorActivityCreateManyInput[] {
  const { academyId, lessonId, drafts, analysis, sourceAnalysisVersion } = params;
  return drafts.map((draft, orderNum) => ({
    academyId,
    lessonId,
    mode: draft.mode,
    type: draft.type,
    orderNum,
    title: draft.title,
    instructions: draft.instructions ?? null,
    payload: asJsonInput(draft.payload),
    payloadHash: sha256Json(draft.payload),
    payloadSchemaVersion: 2,
    analysisSnapshotHash: sha256Json(analysis),
    itemCount: draft.itemCount,
    maxScore: draft.maxScore,
    estimatedSec: draft.estimatedSec,
    requiresAiGrade: requiresAiGrade(draft.type),
    coverageRefs: asJsonInput(draft.coverageRefs),
    sourceAnalysisVersion,
    createdBy: "system",
    status: "APPROVED",
  }));
}

export async function resolveRecipients(academyId: string, targetType: string, targetId?: string) {
  if (targetType === "ALL_ACTIVE") {
    return prisma.student.findMany({ where: { academyId, status: "ACTIVE" }, select: { id: true } });
  }
  if (targetType === "CLASS" && targetId) {
    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId: targetId, status: "ENROLLED", student: { academyId, status: "ACTIVE" } },
      select: { studentId: true },
    });
    return enrollments.map((item) => ({ id: item.studentId }));
  }
  if (targetType === "STUDENT" && targetId) {
    return prisma.student.findMany({ where: { id: targetId, academyId, status: "ACTIVE" }, select: { id: true } });
  }
  if (targetType === "SCHOOL" && targetId) {
    return prisma.student.findMany({ where: { academyId, schoolId: targetId, status: "ACTIVE" }, select: { id: true } });
  }
  if (targetType === "SCHOOL_GRADE" && targetId) {
    const [schoolId, grade] = targetId.split(":");
    return prisma.student.findMany({
      where: { academyId, schoolId, grade: Number(grade), status: "ACTIVE" },
      select: { id: true },
    });
  }
  return [];
}
