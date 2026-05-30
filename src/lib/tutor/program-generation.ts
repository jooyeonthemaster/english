import type { Prisma } from "@prisma/client";

import { buildQuestionAnnotationBlock } from "@/lib/annotation-prompt";
import { sha256Json } from "@/lib/tutor/crypto";
import {
  buildRuleBasedTutorDrafts,
  validateGroundedDrafts,
} from "@/lib/tutor/generate-activities";
import {
  buildExamAlignedTutorQuestionPlan,
  examQuestionToTutorActivityDraft,
} from "@/lib/tutor/exam-aligned-activities";
import { requiresAiGrade } from "@/lib/tutor/activity-types";
import { parsePassageAnalysis } from "@/lib/tutor/passage-analysis";
import type { TutorActivityDraft } from "@/lib/tutor/schemas";
import { prisma } from "@/lib/prisma";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import {
  buildAnalysisContext,
  extractTeacherAnnotations,
} from "@/app/api/ai/generate-questions-auto/_lib/build-analysis-context";
import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import { runQuestionGenerationWithEmptyRetry } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";

export const TUTOR_PROGRAM_GENERATION_DOMAIN = "TUTOR_PROGRAM_GENERATION";

export type TutorProgramPublishTargetType = "NONE" | "ALL_ACTIVE" | "CLASS" | "STUDENT" | "SCHOOL_GRADE" | "SCHOOL";

export interface TutorProgramGenerationConfig {
  title: string;
  description?: string;
  templateKey: string;
  passageIds: string[];
  publishTargetType?: TutorProgramPublishTargetType;
  publishTargetId?: string;
  dueAt?: string;
}

export interface TutorGeneratedActivityPreview {
  mode: string;
  type: string;
  title: string;
  instructions?: string | null;
  payload: Record<string, unknown>;
  itemCount: number;
  maxScore: number;
  estimatedSec: number;
  coverageRefs: TutorActivityDraft["coverageRefs"];
}

export interface TutorGeneratedLessonPreview {
  lessonId?: string;
  passageId: string;
  title: string;
  contentPreview: string;
  activityCount: number;
  ruleBasedCount: number;
  examAlignedCount: number;
  activities: TutorGeneratedActivityPreview[];
  warnings: string[];
}

export interface TutorProgramGenerationJobResult {
  programId?: string;
  assignmentId?: string;
  title: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  totalPassages: number;
  completedPassages: number;
  activityCount: number;
  estimatedMin: number;
  currentPassageTitle?: string;
  lessons: TutorGeneratedLessonPreview[];
  warnings: string[];
  debugTiming?: Record<string, number>;
}

type PassageForTutorGeneration = Prisma.PassageGetPayload<{
  include: {
    school: { select: { type: true; name: true } };
    analysis: true;
    notes: { orderBy: { order: "asc" } };
  };
}>;

type PreparedLesson = TutorGeneratedLessonPreview & {
  passage: PassageForTutorGeneration;
  analysis: PassageAnalysisData;
};

function asJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function lessonPreviewFromDraft(draft: TutorActivityDraft): TutorGeneratedActivityPreview {
  return {
    mode: draft.mode,
    type: draft.type,
    title: draft.title,
    instructions: draft.instructions ?? null,
    payload: JSON.parse(JSON.stringify(draft.payload ?? {})) as Record<string, unknown>,
    itemCount: draft.itemCount,
    maxScore: draft.maxScore,
    estimatedSec: draft.estimatedSec,
    coverageRefs: draft.coverageRefs,
  };
}

function dedupeDrafts(drafts: TutorActivityDraft[]) {
  const seen = new Set<string>();
  const result: TutorActivityDraft[] = [];
  for (const draft of drafts) {
    const payload = draft.payload && typeof draft.payload === "object" ? draft.payload : {};
    const prompt = cleanText((payload as Record<string, unknown>).prompt);
    const answer = cleanText(
      (payload as Record<string, unknown>).answerText ??
        (payload as Record<string, unknown>).correctAnswer,
    );
    const key = [
      draft.mode,
      draft.type,
      cleanText(draft.title),
      prompt.slice(0, 160),
      answer.slice(0, 120),
    ].join("\u001f");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(draft);
  }
  return result;
}

function orderDrafts(drafts: TutorActivityDraft[]) {
  const modeRank: Record<string, number> = {
    interpret: 0,
    memorize: 1,
    vocab: 2,
    grammar: 3,
    order: 4,
    transfer: 5,
    mastery: 6,
  };
  return drafts
    .map((draft, index) => ({ draft, index }))
    .sort((a, b) => {
      const modeDiff = (modeRank[a.draft.mode] ?? 99) - (modeRank[b.draft.mode] ?? 99);
      return modeDiff || a.index - b.index;
    })
    .map((item) => item.draft);
}

function parseJobConfig(value: unknown): TutorProgramGenerationConfig {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const passageIds = Array.isArray(raw.passageIds)
    ? raw.passageIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  return {
    title: cleanText(raw.title) || "모바일 내신 프로그램",
    description: cleanText(raw.description),
    templateKey: cleanText(raw.templateKey) || "basic_interpret",
    passageIds,
    publishTargetType: (raw.publishTargetType as TutorProgramPublishTargetType | undefined) ?? "NONE",
    publishTargetId: cleanText(raw.publishTargetId) || undefined,
    dueAt: cleanText(raw.dueAt) || undefined,
  };
}

async function updateJobResult(jobId: string, result: TutorProgramGenerationJobResult) {
  await prisma.workbenchAiJob.update({
    where: { id: jobId },
    data: { result: asJsonInput(result) },
  });
}

async function buildExamAlignedDrafts(
  passage: PassageForTutorGeneration,
  analysis: PassageAnalysisData,
) {
  const schoolType = passage.school?.type === "MIDDLE" ? "중학교" : "고등학교";
  const gradeInfo = passage.grade ? `${passage.grade}학년` : "";
  const teacherAnnotations = extractTeacherAnnotations(passage);
  const teacherIntentBlock = buildQuestionAnnotationBlock(teacherAnnotations);
  const analysisContext = buildAnalysisContext(passage);
  const diffLabel = "INTERMEDIATE";
  const diffInstruction = DIFF_DESCRIPTION[diffLabel] || DIFF_DESCRIPTION.INTERMEDIATE;
  const plan = buildExamAlignedTutorQuestionPlan(analysis);
  const startedAt = Date.now();

  const generationResult = await runQuestionGenerationWithEmptyRetry(
    {
      plan,
      schoolType,
      gradeInfo,
      passageContent: passage.content,
      teacherIntentBlock,
      analysisContext,
      diffLabel,
      diffInstruction,
      generationPlan: "STANDARD",
      customPrompt: [
        "이 결과물은 모바일 학생용 4주 내신대비 프로그램의 핵심 활동으로 변환된다.",
        "단순 확인 문제가 아니라 지문 암기, 빈칸, 어법, 어휘, 순서, 삽입, 서술형 대비가 가능해야 한다.",
        "특히 WORD_ORDER는 반드시 원문 문장 복원에 가깝게 만들고, 어법과 빈칸은 기존 workbench 품질 기준을 엄격히 따른다.",
      ].join("\n"),
    },
    {
      logPrefix: "TUTOR-PROGRAM-EXAM-Q-GEN",
    },
  );

  const converted = generationResult.questions
    .map((question) => examQuestionToTutorActivityDraft(question, analysis))
    .filter((draft): draft is TutorActivityDraft => Boolean(draft));
  const valid = validateGroundedDrafts(converted, analysis);
  const warnings = [
    generationResult.rejectionSummary.total > 0
      ? generationResult.rejectionSummary.message
      : "",
    converted.length > valid.length
      ? `${converted.length - valid.length}개 활동이 학생용 payload 검증에서 제외됨`
      : "",
  ].filter(Boolean);

  return {
    drafts: valid,
    rawQuestionCount: generationResult.questions.length,
    attempts: generationResult.attempts,
    latencyMs: Date.now() - startedAt,
    warnings,
  };
}

async function prepareLesson(passage: PassageForTutorGeneration): Promise<PreparedLesson | null> {
  const analysis = parsePassageAnalysis(passage.analysis?.analysisData);
  if (!analysis) return null;

  const ruleBasedDrafts = validateGroundedDrafts(buildRuleBasedTutorDrafts(analysis), analysis);
  const examResult = await buildExamAlignedDrafts(passage, analysis);
  const drafts = orderDrafts(dedupeDrafts([...ruleBasedDrafts, ...examResult.drafts]));

  return {
    passage,
    analysis,
    passageId: passage.id,
    title: passage.title,
    contentPreview: passage.content.slice(0, 260),
    activityCount: drafts.length,
    ruleBasedCount: ruleBasedDrafts.length,
    examAlignedCount: examResult.drafts.length,
    activities: drafts.map(lessonPreviewFromDraft),
    warnings: examResult.warnings,
  };
}

async function resolveRecipients(academyId: string, targetType: TutorProgramPublishTargetType, targetId?: string) {
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

export async function runTutorProgramGenerationJob(jobId: string): Promise<TutorProgramGenerationJobResult> {
  const startedAt = Date.now();
  const job = await prisma.workbenchAiJob.findUnique({
    where: { id: jobId },
    include: { createdBy: true },
  });
  if (!job || job.domain !== TUTOR_PROGRAM_GENERATION_DOMAIN) {
    throw new Error("Tutor program generation job not found.");
  }
  if (["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(job.status)) {
    return (job.result as unknown as TutorProgramGenerationJobResult) ?? {
      title: job.title,
      status: job.status === "COMPLETED" ? "COMPLETED" : "FAILED",
      totalPassages: job.requestedCount,
      completedPassages: job.successCount,
      activityCount: job.resultCount,
      estimatedMin: 0,
      lessons: [],
      warnings: [],
    };
  }

  const config = parseJobConfig(job.config);
  if (config.passageIds.length === 0) {
    throw new Error("No passages selected.");
  }

  await prisma.workbenchAiJob.update({
    where: { id: job.id },
    data: {
      status: "PROCESSING",
      startedAt: job.startedAt ?? new Date(),
    },
  });

  const passages = await prisma.passage.findMany({
    where: { id: { in: config.passageIds }, academyId: job.academyId },
    include: {
      school: { select: { type: true, name: true } },
      analysis: true,
      notes: { orderBy: { order: "asc" } },
    },
  });
  const passageById = new Map(passages.map((passage) => [passage.id, passage]));
  const orderedPassages = config.passageIds.map((id) => passageById.get(id)).filter(Boolean) as PassageForTutorGeneration[];
  if (orderedPassages.length !== config.passageIds.length) {
    throw new Error("Some selected passages could not be found.");
  }
  if (orderedPassages.some((passage) => !passage.analysis?.analysisData)) {
    throw new Error("Only analyzed passages can be used for tutor program generation.");
  }

  const progress: TutorProgramGenerationJobResult = {
    title: config.title,
    status: "PROCESSING",
    totalPassages: orderedPassages.length,
    completedPassages: 0,
    activityCount: 0,
    estimatedMin: 0,
    lessons: [],
    warnings: [],
  };
  await updateJobResult(job.id, progress);

  const prepared: PreparedLesson[] = [];
  for (const passage of orderedPassages) {
    progress.currentPassageTitle = passage.title;
    await updateJobResult(job.id, progress);

    const lesson = await prepareLesson(passage);
    if (!lesson) {
      progress.warnings.push(`${passage.title}: 분석 데이터를 학생용 학습 구조로 변환하지 못함`);
      progress.completedPassages += 1;
      await updateJobResult(job.id, progress);
      continue;
    }

    prepared.push(lesson);
    progress.completedPassages += 1;
    progress.activityCount += lesson.activityCount;
    progress.estimatedMin = Math.max(10, Math.ceil(progress.activityCount * 0.9));
    progress.lessons = prepared.map((item) => ({
      passageId: item.passageId,
      title: item.title,
      contentPreview: item.contentPreview,
      activityCount: item.activityCount,
      ruleBasedCount: item.ruleBasedCount,
      examAlignedCount: item.examAlignedCount,
      activities: item.activities,
      warnings: item.warnings,
    }));
    progress.warnings = prepared.flatMap((item) => item.warnings);
    await updateJobResult(job.id, progress);
  }

  if (prepared.length === 0) {
    throw new Error("No valid tutor activities were generated.");
  }

  const activityCount = prepared.reduce((sum, lesson) => sum + lesson.activityCount, 0);
  const estimatedMin = Math.max(10, Math.ceil(prepared.reduce((sum, lesson) => {
    return sum + lesson.activities.reduce((activitySum, activity) => activitySum + activity.estimatedSec, 0);
  }, 0) / 60));

  const publishTargetType = config.publishTargetType ?? "NONE";
  const students =
    publishTargetType !== "NONE"
      ? await resolveRecipients(job.academyId, publishTargetType, config.publishTargetId)
      : [];
  if (publishTargetType !== "NONE" && students.length === 0) {
    throw new Error("No students found for the selected distribution target.");
  }

  const created = await prisma.$transaction(
    async (tx) => {
      const program = await tx.tutorProgram.create({
        data: {
          academyId: job.academyId,
          authorId: job.createdById,
          title: config.title,
          description: config.description,
          templateKey: config.templateKey,
          targetSummary: `${prepared.length}개 지문 · ${activityCount}개 활동`,
          estimatedMin,
          difficulty: "INTERMEDIATE",
        },
      });

      const lessonIds: string[] = [];
      for (const [index, entry] of prepared.entries()) {
        const lesson = await tx.tutorLesson.create({
          data: {
            academyId: job.academyId,
            passageId: entry.passage.id,
            authorId: job.createdById,
            title: entry.passage.title,
            description: entry.passage.unit ?? null,
            estimatedMin: Math.max(5, Math.ceil(entry.activities.reduce((sum, activity) => sum + activity.estimatedSec, 0) / 60)),
            aiContext: {
              passageContentHash: entry.passage.contentHash,
              analysisVersion: entry.passage.analysis?.version,
              generationSource: "tutor_program_background_exam_aligned",
            },
          },
        });
        lessonIds.push(lesson.id);

        await tx.tutorProgramLesson.create({
          data: {
            academyId: job.academyId,
            programId: program.id,
            lessonId: lesson.id,
            orderNum: index,
          },
        });

        const aiLog = await tx.tutorAiLog.create({
          data: {
            academyId: job.academyId,
            kind: "activity_draft",
            passageId: entry.passage.id,
            programId: program.id,
            lessonId: lesson.id,
            staffId: job.createdById,
            model: "workbench-exam-pipeline",
            promptHash: sha256Json({
              passageId: entry.passage.id,
              version: entry.passage.analysis?.version,
              source: "tutor_program_generation",
            }),
            tokensIn: 0,
            tokensOut: 0,
            costUsd: 0,
            latencyMs: 0,
            status: "ok",
          },
        });

        await tx.tutorActivity.createMany({
          data: entry.activities.map((activity, orderNum) => ({
            academyId: job.academyId,
            lessonId: lesson.id,
            mode: activity.mode,
            type: activity.type,
            orderNum,
            title: activity.title,
            instructions: activity.instructions ?? null,
            payload: asJsonInput(activity.payload),
            payloadHash: sha256Json(activity.payload),
            payloadSchemaVersion: 2,
            analysisSnapshotHash: sha256Json(entry.analysis),
            itemCount: activity.itemCount,
            maxScore: activity.maxScore,
            estimatedSec: activity.estimatedSec,
            requiresAiGrade: requiresAiGrade(activity.type),
            coverageRefs: asJsonInput(activity.coverageRefs),
            sourceAnalysisVersion: entry.passage.analysis?.version,
            aiLogId: aiLog.id,
            createdBy: "system",
            status: "APPROVED",
          })),
        });

        await tx.tutorLesson.update({
          where: { id: lesson.id },
          data: {
            activityCount: entry.activityCount,
            totalMaxScore: entry.activities.reduce((sum, activity) => sum + activity.maxScore, 0),
          },
        });
      }

      let assignmentId: string | undefined;
      if (publishTargetType !== "NONE") {
        const assignment = await tx.tutorAssignment.create({
          data: {
            academyId: job.academyId,
            programId: program.id,
            assignedById: job.createdById,
            availableFrom: new Date(),
            dueAt: config.dueAt ? new Date(config.dueAt) : null,
            status: "OPEN",
            titleSnapshot: program.title,
            programVersionAtAssign: program.version,
          },
        });
        assignmentId = assignment.id;
        const target = await tx.tutorAssignmentTarget.create({
          data: {
            academyId: job.academyId,
            assignmentId: assignment.id,
            targetType: publishTargetType,
            targetId: config.publishTargetId ?? null,
            targetSnapshot: asJsonInput({
              resolvedStudentIds: students.map((student) => student.id),
              resolvedAt: new Date().toISOString(),
            }),
          },
        });
        await tx.tutorAssignmentRecipient.createMany({
          data: students.map((student) => ({
            academyId: job.academyId,
            assignmentId: assignment.id,
            studentId: student.id,
            sourceTargetId: target.id,
            targetSnapshot: asJsonInput({
              targetType: publishTargetType,
              targetId: config.publishTargetId ?? null,
            }),
          })),
          skipDuplicates: true,
        });
        await tx.tutorProgress.createMany({
          data: students.map((student) => ({
            academyId: job.academyId,
            assignmentId: assignment.id,
            programId: program.id,
            studentId: student.id,
            status: "NOT_STARTED",
          })),
          skipDuplicates: true,
        });
        for (const lessonId of lessonIds) {
          await tx.tutorProgress.createMany({
            data: students.map((student) => ({
              academyId: job.academyId,
              assignmentId: assignment.id,
              programId: program.id,
              lessonId,
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
      }

      return { programId: program.id, assignmentId, lessonIds };
    },
    { timeout: 45_000, maxWait: 10_000 },
  );

  const completed: TutorProgramGenerationJobResult = {
    ...progress,
    status: "COMPLETED",
    programId: created.programId,
    assignmentId: created.assignmentId,
    currentPassageTitle: undefined,
    activityCount,
    estimatedMin,
    lessons: progress.lessons.map((lesson, index) => ({
      ...lesson,
      lessonId: created.lessonIds[index],
      activityCount: prepared[index]?.activityCount ?? lesson.activityCount,
    })),
    warnings: progress.warnings,
    debugTiming: {
      totalRunMs: Date.now() - startedAt,
    },
  };

  await prisma.workbenchAiJob.update({
    where: { id: job.id },
    data: {
      status: "COMPLETED",
      successCount: prepared.length,
      failedCount: Math.max(0, orderedPassages.length - prepared.length),
      resultCount: activityCount,
      result: asJsonInput(completed),
      completedAt: new Date(),
    },
  });

  return completed;
}
