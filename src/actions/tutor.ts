"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { requireTutorStudentSession } from "@/lib/auth-tutor-student";
import { gradeTutorActivity } from "@/lib/tutor/activity-engine";
import {
  buildRuleBasedTutorDrafts,
  generateTutorDraftsWithModel,
  validateGroundedDrafts,
} from "@/lib/tutor/generate-activities";
import { parsePassageAnalysis } from "@/lib/tutor/passage-analysis";
import { CreateTutorProgramSchema, PublishTutorProgramSchema } from "@/lib/tutor/schemas";
import { sha256Json } from "@/lib/tutor/crypto";
import { openTutorAssignmentWhere } from "@/lib/tutor/access";

type TutorSubmitFeedback = {
  isCorrect: boolean;
  scoreEarned: number;
  scoreMax: number;
  explanation: string;
};

type ActionResult = { ok: true; id?: string; feedback?: TutorSubmitFeedback } | { ok: false; error: string };

function asJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function readTokenUsage(usage: unknown) {
  const record = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : {};
  return {
    input: Number(record.inputTokens ?? record.promptTokens ?? 0),
    output: Number(record.outputTokens ?? record.completionTokens ?? 0),
  };
}

type CoverageDimension = "interpret" | "memorize" | "order" | "vocab" | "grammar" | "transfer";

const coverageDimensions = new Set<CoverageDimension>(["interpret", "memorize", "order", "vocab", "grammar", "transfer"]);
const UNMEASURED_DIMENSION_SCORE = 70;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fallbackDimension(mode: string, type: string): CoverageDimension {
  if (coverageDimensions.has(mode as CoverageDimension)) return mode as CoverageDimension;
  if (type.includes("vocab")) return "vocab";
  if (type.includes("grammar")) return "grammar";
  if (type.includes("order") || type.includes("insertion") || type.includes("irrelevant")) return "order";
  if (type.includes("rebuild") || type.includes("recall") || type.includes("cloze")) return "memorize";
  if (type.includes("transform")) return "transfer";
  return "interpret";
}

function parseCoverageRefsForSnapshot(raw: unknown, mode: string, type: string) {
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

function addWeakCount(map: Map<string, number>, key: string) {
  const cleanKey = cleanText(key);
  if (!cleanKey) return;
  map.set(cleanKey, (map.get(cleanKey) ?? 0) + 1);
}

function extractWeakVocabLabel(type: string, payload: Record<string, unknown>) {
  if (!type.includes("vocab") && !["contextual_meaning", "collocation_select"].includes(type)) return "";
  return cleanText(payload.stem ?? payload.word ?? payload.answerText ?? payload.meaning);
}

function extractWeakGrammarLabel(type: string, title: string, payload: Record<string, unknown>) {
  if (!type.includes("grammar")) return "";
  return cleanText(payload.pattern ?? payload.statement ?? payload.prompt ?? title);
}

async function refreshTutorWeaknessSnapshot(
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

export async function getTutorDashboardData() {
  const staff = await requireStaffAuth("DIRECTOR");
  const [programCount, openAssignments, activeStudents, recentPrograms] = await Promise.all([
    prisma.tutorProgram.count({ where: { academyId: staff.academyId, deletedAt: null } }),
    prisma.tutorAssignment.count({
      where: { academyId: staff.academyId, status: { in: ["SCHEDULED", "OPEN"] } },
    }),
    prisma.student.count({ where: { academyId: staff.academyId, status: "ACTIVE" } }),
    prisma.tutorProgram.findMany({
      where: { academyId: staff.academyId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        lessons: {
          include: {
            lesson: {
              include: {
                passage: true,
                activities: { where: { status: { in: ["APPROVED", "PUBLISHED"] } }, orderBy: { orderNum: "asc" } },
              },
            },
          },
        },
      },
    }),
  ]);

  const progress = await prisma.tutorProgress.groupBy({
    by: ["status"],
    where: { academyId: staff.academyId, lessonId: null },
    _count: true,
  });

  return { programCount, openAssignments, activeStudents, recentPrograms, progress };
}

export async function getTutorProgramList() {
  const staff = await requireStaffAuth("DIRECTOR");
  return prisma.tutorProgram.findMany({
    where: { academyId: staff.academyId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      lessons: {
        include: {
          lesson: {
            include: {
              passage: true,
              activities: { where: { status: { in: ["APPROVED", "PUBLISHED"] } }, orderBy: { orderNum: "asc" } },
            },
          },
        },
      },
      assignments: { include: { recipients: true } },
    },
  });
}

export async function getTutorPassageCandidates() {
  const staff = await requireStaffAuth();
  return prisma.passage.findMany({
    where: { academyId: staff.academyId, analysis: { isNot: null } },
    orderBy: [{ updatedAt: "desc" }],
    take: 80,
    include: { school: true, analysis: true },
  });
}

export async function createTutorProgramAction(formData: FormData): Promise<ActionResult> {
  const staff = await requireStaffAuth("DIRECTOR");
  const rawPassageIds = String(formData.get("passageIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const parsed = CreateTutorProgramSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    templateKey: String(formData.get("templateKey") ?? "basic_interpret"),
    passageIds: rawPassageIds,
  });
  if (!parsed.success) return { ok: false, error: "프로그램 정보를 확인해주세요." };

  const passages = await prisma.passage.findMany({
    where: { id: { in: parsed.data.passageIds }, academyId: staff.academyId },
    include: { analysis: true },
  });
  if (passages.length !== parsed.data.passageIds.length) {
    return { ok: false, error: "선택한 지문을 확인해주세요." };
  }
  if (passages.some((passage) => !passage.analysis?.analysisData)) {
    return { ok: false, error: "분석 완료된 지문만 프로그램에 넣을 수 있어요." };
  }

  const prepared = await Promise.all(
    passages.map(async (passage) => {
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
    })
  );

  const result = await prisma.$transaction(
    async (tx) => {
      const program = await tx.tutorProgram.create({
        data: {
          academyId: staff.academyId,
          authorId: staff.id,
          title: parsed.data.title,
          description: parsed.data.description,
          templateKey: parsed.data.templateKey,
          targetSummary: `${passages.length}개 지문`,
        },
      });

      for (const [index, entry] of prepared.entries()) {
        if (!entry) continue;
        const { passage, analysis, drafts, aiLogData } = entry;

        const lesson = await tx.tutorLesson.create({
          data: {
            academyId: staff.academyId,
            passageId: passage.id,
            authorId: staff.id,
            title: passage.title,
            description: passage.unit ?? null,
            aiContext: {
              passageContentHash: passage.contentHash,
              analysisVersion: passage.analysis?.version,
            },
          },
        });
        await tx.tutorProgramLesson.create({
          data: { academyId: staff.academyId, programId: program.id, lessonId: lesson.id, orderNum: index },
        });

        await tx.tutorAiLog.create({
          data: {
            academyId: staff.academyId,
            kind: "activity_draft",
            passageId: passage.id,
            programId: program.id,
            lessonId: lesson.id,
            staffId: staff.id,
            model: aiLogData.model,
            promptHash: sha256Json({ passageId: passage.id, version: passage.analysis?.version }),
            tokensIn: aiLogData.tokensIn,
            tokensOut: aiLogData.tokensOut,
            costUsd: 0,
            latencyMs: aiLogData.latencyMs,
            status: aiLogData.status,
          },
        });

        await tx.tutorActivity.createMany({
          data: drafts.map((draft, orderNum) => ({
            academyId: staff.academyId,
            lessonId: lesson.id,
            mode: draft.mode,
            type: draft.type,
            orderNum,
            title: draft.title,
            instructions: draft.instructions ?? null,
            payload: asJsonInput(draft.payload),
            payloadHash: sha256Json(draft.payload),
            analysisSnapshotHash: sha256Json(analysis),
            itemCount: draft.itemCount,
            maxScore: draft.maxScore,
            estimatedSec: draft.estimatedSec,
            requiresAiGrade: ["back_translation", "dictogloss", "transfer_mini_passage"].includes(draft.type),
            coverageRefs: asJsonInput(draft.coverageRefs),
            sourceAnalysisVersion: passage.analysis?.version,
            createdBy: "system",
            status: "APPROVED",
          })),
        });
        await tx.tutorLesson.update({
          where: { id: lesson.id },
          data: {
            activityCount: drafts.length,
            totalMaxScore: drafts.reduce((sum, draft) => sum + draft.maxScore, 0),
          },
        });
      }

      return program;
    },
    { timeout: 20_000, maxWait: 5_000 }
  );

  revalidatePath("/director/tutor");
  revalidatePath("/director/tutor/programs");
  return { ok: true, id: result.id };
}

export async function addTutorProgramPassagesAction(
  programId: string,
  passageIds: string[],
): Promise<ActionResult & { added?: number; skipped?: number }> {
  const staff = await requireStaffAuth("DIRECTOR");
  const cleanIds = Array.from(
    new Set(
      passageIds
        .map((id) => String(id ?? "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 80);

  if (!programId || cleanIds.length === 0) {
    return { ok: false, error: "추가할 지문을 선택해주세요." };
  }

  const program = await prisma.tutorProgram.findFirst({
    where: {
      id: programId,
      academyId: staff.academyId,
      deletedAt: null,
      status: { not: "ARCHIVED" },
    },
    include: {
      lessons: {
        select: {
          orderNum: true,
          lesson: { select: { passageId: true } },
        },
      },
    },
  });
  if (!program) return { ok: false, error: "프로그램을 찾을 수 없어요." };

  const existingPassageIds = new Set(program.lessons.map((link) => link.lesson.passageId));
  const requestedNewIds = cleanIds.filter((id) => !existingPassageIds.has(id));
  if (requestedNewIds.length === 0) {
    return { ok: false, error: "선택한 지문이 이미 이 프로그램에 들어있어요.", skipped: cleanIds.length };
  }

  const passages = await prisma.passage.findMany({
    where: { id: { in: requestedNewIds }, academyId: staff.academyId },
    include: { analysis: true },
  });
  const passageById = new Map(passages.map((passage) => [passage.id, passage]));
  const orderedPassages = requestedNewIds
    .map((id) => passageById.get(id))
    .filter((passage): passage is NonNullable<typeof passage> => Boolean(passage));

  if (orderedPassages.length === 0) {
    return { ok: false, error: "추가할 수 있는 지문을 찾지 못했어요." };
  }
  if (orderedPassages.some((passage) => !passage.analysis?.analysisData)) {
    return { ok: false, error: "모바일 학습 생성은 분석 완료된 지문만 가능합니다." };
  }

  const prepared = await Promise.all(
    orderedPassages.map(async (passage) => {
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
    }),
  );

  const validPrepared = prepared.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  if (validPrepared.length === 0) {
    return { ok: false, error: "지문 분석 데이터를 학습 활동으로 변환하지 못했어요." };
  }

  await prisma.$transaction(
    async (tx) => {
      const maxOrder = program.lessons.reduce((max, link) => Math.max(max, link.orderNum), -1);

      for (const [index, entry] of validPrepared.entries()) {
        const { passage, analysis, drafts, aiLogData } = entry;

        const lesson = await tx.tutorLesson.create({
          data: {
            academyId: staff.academyId,
            passageId: passage.id,
            authorId: staff.id,
            title: passage.title,
            description: passage.unit ?? null,
            aiContext: {
              passageContentHash: passage.contentHash,
              analysisVersion: passage.analysis?.version,
              builderAddedAt: new Date().toISOString(),
            },
          },
        });

        await tx.tutorProgramLesson.create({
          data: {
            academyId: staff.academyId,
            programId: program.id,
            lessonId: lesson.id,
            orderNum: maxOrder + index + 1,
          },
        });

        await tx.tutorAiLog.create({
          data: {
            academyId: staff.academyId,
            kind: "activity_draft",
            passageId: passage.id,
            programId: program.id,
            lessonId: lesson.id,
            staffId: staff.id,
            model: aiLogData.model,
            promptHash: sha256Json({ passageId: passage.id, version: passage.analysis?.version, source: "builder_add" }),
            tokensIn: aiLogData.tokensIn,
            tokensOut: aiLogData.tokensOut,
            costUsd: 0,
            latencyMs: aiLogData.latencyMs,
            status: aiLogData.status,
          },
        });

        await tx.tutorActivity.createMany({
          data: drafts.map((draft, orderNum) => ({
            academyId: staff.academyId,
            lessonId: lesson.id,
            mode: draft.mode,
            type: draft.type,
            orderNum,
            title: draft.title,
            instructions: draft.instructions ?? null,
            payload: asJsonInput(draft.payload),
            payloadHash: sha256Json(draft.payload),
            analysisSnapshotHash: sha256Json(analysis),
            itemCount: draft.itemCount,
            maxScore: draft.maxScore,
            estimatedSec: draft.estimatedSec,
            requiresAiGrade: ["back_translation", "dictogloss", "transfer_mini_passage"].includes(draft.type),
            coverageRefs: asJsonInput(draft.coverageRefs),
            sourceAnalysisVersion: passage.analysis?.version,
            createdBy: "system",
            status: "APPROVED",
          })),
        });

        await tx.tutorLesson.update({
          where: { id: lesson.id },
          data: {
            activityCount: drafts.length,
            totalMaxScore: drafts.reduce((sum, draft) => sum + draft.maxScore, 0),
          },
        });
      }

      await tx.tutorProgram.update({
        where: { id: program.id },
        data: {
          targetSummary: `${program.lessons.length + validPrepared.length}개 지문`,
          estimatedMin: Math.max(10, program.estimatedMin + validPrepared.length * 15),
        },
      });
    },
    { timeout: 30_000, maxWait: 5_000 },
  );

  revalidatePath("/director/tutor");
  revalidatePath("/director/tutor/programs");
  revalidatePath(`/director/tutor/programs/${program.id}/builder`);
  return {
    ok: true,
    id: program.id,
    added: validPrepared.length,
    skipped: cleanIds.length - validPrepared.length,
  };
}

async function resolveRecipients(academyId: string, targetType: string, targetId?: string) {
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

export async function publishTutorProgramAction(formData: FormData): Promise<ActionResult> {
  const staff = await requireStaffAuth("DIRECTOR");
  const parsed = PublishTutorProgramSchema.safeParse({
    programId: String(formData.get("programId") ?? ""),
    targetType: String(formData.get("targetType") ?? "ALL_ACTIVE"),
    targetId: String(formData.get("targetId") ?? "") || undefined,
    dueAt: String(formData.get("dueAt") ?? "") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "배포 정보를 확인해주세요." };
  const confirmedAll = String(formData.get("confirmedAll") ?? "") === "true";
  if (parsed.data.targetType === "ALL_ACTIVE" && !confirmedAll) {
    return { ok: false, error: "전체 학생 배포 확인이 필요합니다." };
  }

  const program = await prisma.tutorProgram.findFirst({
    where: { id: parsed.data.programId, academyId: staff.academyId, deletedAt: null, status: { not: "ARCHIVED" } },
    include: {
      lessons: {
        include: {
          lesson: {
            include: { activities: { where: { status: { in: ["APPROVED", "PUBLISHED"] } } } },
          },
        },
      },
    },
  });
  if (!program) return { ok: false, error: "프로그램을 찾을 수 없어요." };
  if (program.lessons.length === 0 || program.lessons.some((link) => link.lesson.activities.length === 0)) {
    return { ok: false, error: "배포할 학습 활동이 없습니다." };
  }

  const students = await resolveRecipients(staff.academyId, parsed.data.targetType, parsed.data.targetId);
  if (students.length === 0) return { ok: false, error: "배포할 학생이 없어요." };

  const assignment = await prisma.$transaction(async (tx) => {
    const created = await tx.tutorAssignment.create({
      data: {
        academyId: staff.academyId,
        programId: program.id,
        assignedById: staff.id,
        availableFrom: new Date(),
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
        status: "OPEN",
        titleSnapshot: program.title,
        programVersionAtAssign: program.version,
      },
    });
    const target = await tx.tutorAssignmentTarget.create({
      data: {
        academyId: staff.academyId,
        assignmentId: created.id,
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId ?? null,
        targetSnapshot: asJsonInput({ resolvedStudentIds: students.map((student) => student.id), resolvedAt: new Date().toISOString() }),
      },
    });
    await tx.tutorAssignmentRecipient.createMany({
      data: students.map((student) => ({
        academyId: staff.academyId,
        assignmentId: created.id,
        studentId: student.id,
        sourceTargetId: target.id,
        targetSnapshot: asJsonInput({ targetType: parsed.data.targetType, targetId: parsed.data.targetId ?? null }),
      })),
      skipDuplicates: true,
    });
    await tx.tutorProgress.createMany({
      data: students.map((student) => ({
        academyId: staff.academyId,
        assignmentId: created.id,
        programId: program.id,
        studentId: student.id,
        status: "NOT_STARTED",
      })),
      skipDuplicates: true,
    });
    for (const link of program.lessons) {
      await tx.tutorProgress.createMany({
        data: students.map((student) => ({
          academyId: staff.academyId,
          assignmentId: created.id,
          programId: program.id,
          lessonId: link.lessonId,
          studentId: student.id,
          status: "LOCKED",
        })),
        skipDuplicates: true,
      });
    }
    await tx.tutorProgram.update({
      where: { id: program.id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    return created;
  });

  revalidatePath("/director/tutor");
  revalidatePath(`/director/tutor/programs/${program.id}/monitor`);
  return { ok: true, id: assignment.id };
}

export async function getTutorStudentHome() {
  const session = await requireTutorStudentSession();
  const now = new Date();
  const recipients = await prisma.tutorAssignmentRecipient.findMany({
    where: {
      academyId: session.academyId,
      studentId: session.studentId,
      assignment: openTutorAssignmentWhere({ academyId: session.academyId, studentId: session.studentId, now }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      assignment: {
        include: {
          program: {
            include: {
              lessons: {
                include: {
                  lesson: {
                    include: {
                      passage: true,
                      activities: { where: { status: { in: ["APPROVED", "PUBLISHED"] } }, orderBy: { orderNum: "asc" } },
                    },
                  },
                },
                orderBy: { orderNum: "asc" },
              },
            },
          },
          progress: { where: { studentId: session.studentId } },
        },
      },
    },
  });
  return { session, recipients };
}

export async function getTutorStudentProgram(programId: string) {
  const session = await requireTutorStudentSession();
  const now = new Date();
  const openAssignment = openTutorAssignmentWhere({
    academyId: session.academyId,
    studentId: session.studentId,
    now,
  });
  return prisma.tutorProgram.findFirst({
    where: { id: programId, academyId: session.academyId, assignments: { some: openAssignment } },
    include: {
      lessons: {
        orderBy: { orderNum: "asc" },
        include: {
          lesson: {
            include: {
              passage: true,
              activities: {
                where: { status: { in: ["APPROVED", "PUBLISHED"] } },
                orderBy: { orderNum: "asc" },
              },
            },
          },
        },
      },
      assignments: {
        where: openAssignment,
        include: { progress: { where: { studentId: session.studentId } } },
      },
    },
  });
}

export async function submitTutorActivityAction(activityId: string, response: unknown, programId: string): Promise<ActionResult> {
  const session = await requireTutorStudentSession();
  const now = new Date();
  const activity = await prisma.tutorActivity.findFirst({
    where: {
      id: activityId,
      academyId: session.academyId,
      lesson: {
        programLinks: {
          some: {
            programId,
            program: {
              assignments: {
                some: openTutorAssignmentWhere({ academyId: session.academyId, studentId: session.studentId, now }),
              },
            },
          },
        },
      },
    },
    include: { lesson: { include: { programLinks: true } } },
  });
  if (!activity) return { ok: false, error: "활동을 찾을 수 없어요." };

  const assignment = await prisma.tutorAssignment.findFirst({
    where: {
      ...openTutorAssignmentWhere({ academyId: session.academyId, studentId: session.studentId, now }),
      programId,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!assignment) return { ok: false, error: "배포된 학습을 찾을 수 없어요." };

  const grade = gradeTutorActivity(activity, response);
  try {
    await prisma.$transaction(async (tx) => {
    const existing = await tx.tutorAttempt.findFirst({
      where: {
        academyId: session.academyId,
        assignmentId: assignment.id,
        lessonId: activity.lessonId,
        studentId: session.studentId,
        status: "IN_PROGRESS",
        deletedAt: null,
      },
      orderBy: { startedAt: "desc" },
    });
    const latestAttempt = await tx.tutorAttempt.findFirst({
      where: {
        academyId: session.academyId,
        assignmentId: assignment.id,
        lessonId: activity.lessonId,
        studentId: session.studentId,
        deletedAt: null,
      },
      orderBy: { attemptNum: "desc" },
    });
    if (!existing && latestAttempt && !assignment.allowRetake) {
      throw new Error("RETAKE_NOT_ALLOWED");
    }
    if (!existing && latestAttempt && latestAttempt.attemptNum >= assignment.maxAttempts) {
      throw new Error("MAX_ATTEMPTS_REACHED");
    }
    const attempt =
      existing ??
      (await tx.tutorAttempt.create({
        data: {
          academyId: session.academyId,
          assignmentId: assignment.id,
          lessonId: activity.lessonId,
          studentId: session.studentId,
          lessonVersionSnapshot: activity.lesson.version,
          attemptNum: (latestAttempt?.attemptNum ?? 0) + 1,
          maxScore: activity.lesson.totalMaxScore,
        },
      }));

    await tx.tutorAttemptItem.upsert({
      where: {
        attemptId_activityId_itemIndex: {
          attemptId: attempt.id,
          activityId: activity.id,
          itemIndex: 0,
        },
      },
      create: {
        academyId: session.academyId,
        attemptId: attempt.id,
        activityId: activity.id,
        itemIndex: 0,
        itemRef: activity.type,
        responseText: typeof response === "string" ? response : null,
        responseJson: typeof response === "string" ? undefined : asJsonInput(response),
        isCorrect: grade.isCorrect,
        scoreEarned: grade.scoreEarned,
        scoreMax: grade.scoreMax,
      },
      update: {
        responseText: typeof response === "string" ? response : null,
        responseJson: typeof response === "string" ? undefined : asJsonInput(response),
        isCorrect: grade.isCorrect,
        scoreEarned: grade.scoreEarned,
        scoreMax: grade.scoreMax,
      },
    });

    const totals = await tx.tutorAttemptItem.aggregate({
      where: { attemptId: attempt.id },
      _sum: { scoreEarned: true, scoreMax: true },
    });
    const answeredActivityCount = await tx.tutorAttemptItem.count({
      where: { attemptId: attempt.id },
    });
    const requiredActivityCount = Math.max(1, activity.lesson.activityCount);
    const isLessonComplete = answeredActivityCount >= requiredActivityCount;
    const rawScore = totals._sum.scoreEarned ?? 0;
    const maxScore = totals._sum.scoreMax ?? 0;
    await tx.tutorAttempt.update({
      where: { id: attempt.id },
      data: {
        rawScore,
        maxScore,
        percentScore: maxScore ? Math.round((rawScore / maxScore) * 100) : 0,
        status: isLessonComplete ? "SUBMITTED" : "IN_PROGRESS",
        submittedAt: isLessonComplete ? new Date() : null,
      },
    });
    await tx.tutorProgress.updateMany({
      where: {
        academyId: session.academyId,
        assignmentId: assignment.id,
        lessonId: activity.lessonId,
        studentId: session.studentId,
      },
      data: {
        status: isLessonComplete ? "GRADED" : "PRACTICING",
        startedAt: new Date(),
        lastSeenAt: new Date(),
        submittedAt: isLessonComplete ? new Date() : null,
        masteryPassedAt: isLessonComplete ? new Date() : null,
        bestScore: rawScore,
        bestAttemptId: attempt.id,
        attemptCount: isLessonComplete ? { increment: 1 } : undefined,
      },
    });
    const incompleteLessonProgress = await tx.tutorProgress.count({
      where: {
        academyId: session.academyId,
        assignmentId: assignment.id,
        programId,
        studentId: session.studentId,
        lessonId: { not: null },
        status: { notIn: ["SUBMITTED", "GRADED"] },
      },
    });
    await tx.tutorProgress.updateMany({
      where: {
        academyId: session.academyId,
        assignmentId: assignment.id,
        programId,
        lessonId: null,
        studentId: session.studentId,
      },
      data: {
        status: isLessonComplete && incompleteLessonProgress === 0 ? "GRADED" : "PRACTICING",
        startedAt: new Date(),
        lastSeenAt: new Date(),
        submittedAt: isLessonComplete && incompleteLessonProgress === 0 ? new Date() : null,
        masteryPassedAt: isLessonComplete && incompleteLessonProgress === 0 ? new Date() : null,
        bestScore: rawScore,
      },
    });
    await tx.tutorLearningEvent.create({
      data: {
        academyId: session.academyId,
        studentId: session.studentId,
        programId,
        lessonId: activity.lessonId,
        activityId: activity.id,
        eventType: grade.isCorrect ? "SUBMIT_ANSWER" : "WRONG_ANSWER",
        payload: asJsonInput({ isCorrect: grade.isCorrect, scoreEarned: grade.scoreEarned }),
      },
    });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "RETAKE_NOT_ALLOWED") return { ok: false, error: "이 학습은 재응시가 허용되지 않았어요." };
    if (message === "MAX_ATTEMPTS_REACHED") return { ok: false, error: "허용된 재응시 횟수를 모두 사용했어요." };
    throw error;
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        await refreshTutorWeaknessSnapshot(tx, {
          academyId: session.academyId,
          assignmentId: assignment.id,
          studentId: session.studentId,
          programId,
          lessonId: activity.lessonId,
        });
      },
      { timeout: 20_000, maxWait: 5_000 },
    );
  } catch (error) {
    console.error("Tutor weakness snapshot refresh failed", error);
  }

  revalidatePath(`/tutor/${session.academySlug}/study/${programId}`);
  revalidatePath(`/tutor/${session.academySlug}/study/${programId}/units/${activity.lessonId}`);
  revalidatePath(`/tutor/${session.academySlug}/review`);
  revalidatePath(`/tutor/${session.academySlug}/weakness`);
  return { ok: true, id: grade.isCorrect ? "correct" : "wrong", feedback: grade };
}
