import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  buildGeneratedQuestionText,
} from "@/lib/question-generation-persistence";
import {
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
} from "@/lib/question-generation-plans";

import type {
  ExamPatternProfile,
  GeneratedPatternGroup,
} from "./schemas";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return rawTags
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}

function clampColumns(value: number): 1 | 2 {
  return value === 1 ? 1 : 2;
}

// Builder items carry ONLY structural info (order/points/group/section). All
// content (questionText, passage box, options, includePassage) is left for the
// shared paper renderer to derive from the linked Question via its canonical
// path (savedItemToPaperItem → shouldIncludeSourcePassageByDefault). This keeps
// the generated paper rendering identical to a normally-built exam.
interface BuilderItem {
  questionId: string;
  orderNum: number;
  points: number;
  groupId: string | null;
  sectionTitle: string;
}

function readOptions(value: unknown): Array<{ label: string; text: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((option, index) => {
      if (!option || typeof option !== "object") return null;
      const row = option as Record<string, unknown>;
      const label =
        typeof row.label === "string" && row.label.trim()
          ? row.label.trim()
          : String(index + 1);
      const text = typeof row.text === "string" ? row.text : "";
      return { label, text };
    })
    .filter((option): option is { label: string; text: string } => option !== null);
}

function buildBuilderSettings(input: {
  profile: ExamPatternProfile;
  items: BuilderItem[];
}) {
  const { profile } = input;
  const header = profile.paperLayout.header;
  return JSON.stringify({
    source: "exam-paper-builder-v1",
    template: "mock",
    layout: {
      columns: clampColumns(profile.paperLayout.columns),
      density: profile.paperLayout.density,
      showAnswerSpace: true,
      showPassageTitle: false,
      showQuestionMeta: false,
      passageStyle: profile.paperLayout.passageBoxed ? "boxed" : "plain",
      pageNumberStyle: "center",
    },
    header: {
      title: header.examTitle || `${profile.sourceExam.title} 기반 생성 시험지`,
      subtitle: "패턴 기반 생성 시험지",
      schoolName: header.schoolName,
      subject: header.subject,
      grade: header.grade,
      examCategory: header.examCategory,
      durationMinutes: header.durationMinutes ?? profile.sourceExam.durationMinutes ?? null,
      totalPoints: header.totalPoints ?? profile.sourceExam.totalPoints ?? null,
      instructions:
        profile.paperLayout.globalDirections[0] || "다음 글을 읽고 물음에 답하시오.",
      notices: header.notices,
      studentNameLabel: "이름",
      academyLogoDataUrl: null,
    },
    items: input.items.map((item) => ({
      questionId: item.questionId,
      orderNum: item.orderNum,
      points: item.points,
      groupId: item.groupId,
      sectionTitle: item.sectionTitle,
      teacherNote: "",
      breakBefore: "auto",
      keepWithPrev: false,
    })),
    similarExam: {
      mode: "PATTERN_PROFILE_DRIVEN",
      sourceTitle: profile.sourceExam.title,
      patternProfile: profile,
      generatedAt: new Date().toISOString(),
    },
    savedAt: new Date().toISOString(),
  });
}

export async function savePatternGeneratedExam(input: {
  academyId: string;
  createdById: string;
  jobId: string;
  profile: ExamPatternProfile;
  groups: GeneratedPatternGroup[];
}) {
  const { academyId, jobId, profile, groups } = input;
  const title = `${profile.sourceExam.title} 기반 생성 시험지`;
  const sectionById = new Map(profile.sections.map((section) => [section.id, section]));

  return prisma.$transaction(
    async (tx) => {
      const builderItems: BuilderItem[] = [];
      const questionIds: string[] = [];
      const mapping: Array<{
        sourceQuestionNumber: number;
        generatedQuestionNumber: number;
        questionId: string;
        passageId: string;
        stimulusGroupId: string | null;
      }> = [];

      for (const group of groups) {
        const ownedPassage = await tx.passage.findFirst({
          where: { id: group.passage.id, academyId },
          select: { id: true, title: true, content: true },
        });
        if (!ownedPassage) {
          throw new Error("Selected passage not found while saving generated exam.");
        }

        for (const { slot, question } of group.questions) {
          const plan = normalizeQuestionGenerationPlan(
            question._generationPlan ?? "STANDARD",
          );
          const tags = mergeQuestionGenerationPlanTag(readQuestionTags(question.tags), plan);
          const options = readOptions(question.options);
          const subType =
            typeof question._typeId === "string"
              ? question._typeId
              : typeof question.subType === "string"
                ? question.subType
                : slot.generationSubType;
          const correctAnswer =
            typeof question.correctAnswer === "string"
              ? question.correctAnswer
              : typeof question.modelAnswer === "string"
                ? question.modelAnswer
                : "";
          const explanation = question.explanation;
          const keyPoints = question.keyPoints;
          const wrongOptionExplanations = question.wrongOptionExplanations;
          const questionText = buildGeneratedQuestionText(question);

          const structuredData = {
            ...question,
            _generationPlan: plan,
            tags,
            _typeId: subType,
            _patternSlot: slot,
            _similarExamJobId: jobId,
            _sourceExamTitle: profile.sourceExam.title,
          };

          const created = await tx.question.create({
            data: {
              academyId,
              passageId: ownedPassage.id,
              type: options.length > 0 ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
              subType,
              questionText,
              structuredData: toJson(structuredData),
              options: options.length > 0 ? JSON.stringify(options) : null,
              correctAnswer,
              points: slot.points ?? 1,
              difficulty:
                typeof question.difficulty === "string"
                  ? question.difficulty
                  : slot.difficulty,
              tags: JSON.stringify(tags),
              aiGenerated: true,
              approved: false,
              questionNumber: slot.number,
              explanation:
                typeof explanation === "string" && explanation.trim()
                  ? {
                      create: {
                        content: explanation,
                        keyPoints:
                          keyPoints == null
                            ? null
                            : typeof keyPoints === "string"
                              ? keyPoints
                              : JSON.stringify(keyPoints),
                        wrongOptionExplanations:
                          wrongOptionExplanations == null
                            ? null
                            : typeof wrongOptionExplanations === "string"
                              ? wrongOptionExplanations
                              : JSON.stringify(wrongOptionExplanations),
                        aiGenerated: true,
                      },
                    }
                  : undefined,
            },
            select: { id: true },
          });

          questionIds.push(created.id);
          const section = slot.sectionId ? sectionById.get(slot.sectionId) : null;

          builderItems.push({
            questionId: created.id,
            orderNum: slot.number,
            points: slot.points ?? 1,
            groupId: group.groupId
              ? `pattern:${group.groupId}:passage:${ownedPassage.id}`
              : `single:${created.id}`,
            sectionTitle: section?.label ?? "",
          });
          mapping.push({
            sourceQuestionNumber: slot.number,
            generatedQuestionNumber: slot.number,
            questionId: created.id,
            passageId: ownedPassage.id,
            stimulusGroupId: group.groupId,
          });
        }
      }

      builderItems.sort((a, b) => a.orderNum - b.orderNum);
      const totalPoints = builderItems.reduce((sum, item) => sum + item.points, 0);
      const exam = await tx.exam.create({
        data: {
          academyId,
          title,
          type: "MOCK",
          status: "DRAFT",
          duration: profile.sourceExam.durationMinutes ?? null,
          totalPoints: profile.sourceExam.totalPoints ?? (totalPoints || 100),
          shuffleQuestions: false,
          shuffleOptions: false,
          showResults: true,
          settings: buildBuilderSettings({ profile, items: builderItems }),
        },
        select: { id: true },
      });

      await tx.examQuestion.createMany({
        data: builderItems.map((item, index) => ({
          examId: exam.id,
          questionId: item.questionId,
          orderNum: index + 1,
          points: item.points,
        })),
      });

      return {
        examId: exam.id,
        questionIds,
        mapping,
        questionCount: builderItems.length,
      };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
