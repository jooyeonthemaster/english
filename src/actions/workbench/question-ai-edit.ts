"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { buildGeneratedQuestionText } from "@/lib/question-generation-persistence";
import {
  getQuestionGenerationPlanFromTags,
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";

import { requireAuth } from "./_helpers";
import type { ActionResult } from "./_types";

type Rec = Record<string, unknown>;

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return raw.split(",").map((t) => t.trim()).filter(Boolean);
  }
}

const AI_EDIT_TAG = "AI수정본";

function revalidateBank() {
  revalidatePath("/director/questions");
  revalidatePath("/director/workbench/questions");
  revalidatePath("/director/workbench");
}

/**
 * 수정 화면 진입용 — 현재 문제의 구조화 데이터(before) + 지문 + 컨텍스트를 반환한다.
 * structuredData 가 비면(수동 생성·구버전) 레거시 필드로 최소 구조 객체를 합성한다.
 */
export async function getQuestionForAiEdit(questionId: string): Promise<
  | {
      ok: true;
      subType: string;
      type: string;
      difficulty: string;
      generationPlan: QuestionGenerationPlan;
      passageContent: string;
      passageTitle: string | null;
      schoolType: string;
      before: Rec;
    }
  | { ok: false; error: string }
> {
  try {
    const staff = await requireAuth();
    const question = await prisma.question.findFirst({
      where: { id: questionId, academyId: staff.academyId, deletedAt: null },
      include: {
        passage: {
          select: {
            title: true,
            content: true,
            grade: true,
            school: { select: { type: true } },
          },
        },
        explanation: true,
      },
    });
    if (!question) return { ok: false, error: "문제를 찾을 수 없습니다." };

    const subType = question.subType || question.type;
    const tags = readTags(question.tags);
    const plan =
      (isRec(question.structuredData) &&
        normalizeQuestionGenerationPlan(question.structuredData._generationPlan)) ||
      getQuestionGenerationPlanFromTags(tags) ||
      "STANDARD";

    let before: Rec;
    if (isRec(question.structuredData) && question.structuredData._typeId) {
      before = { ...(question.structuredData as Rec) };
    } else {
      // 레거시/수동 문제 — 최소 구조 객체 합성.
      let options: unknown = undefined;
      try {
        options = question.options ? JSON.parse(question.options) : undefined;
      } catch {
        options = undefined;
      }
      let keyPoints: unknown = undefined;
      let wrongOptionExplanations: unknown = undefined;
      try {
        keyPoints = question.explanation?.keyPoints
          ? JSON.parse(question.explanation.keyPoints)
          : undefined;
      } catch {
        /* ignore */
      }
      try {
        wrongOptionExplanations = question.explanation?.wrongOptionExplanations
          ? JSON.parse(question.explanation.wrongOptionExplanations)
          : undefined;
      } catch {
        /* ignore */
      }
      before = {
        _typeId: subType,
        direction: question.questionText,
        ...(options ? { options } : {}),
        correctAnswer: question.correctAnswer,
        difficulty: question.difficulty,
        ...(question.explanation?.content ? { explanation: question.explanation.content } : {}),
        ...(keyPoints ? { keyPoints } : {}),
        ...(wrongOptionExplanations ? { wrongOptionExplanations } : {}),
        tags,
      };
    }
    // 항상 최신 메타로 보정.
    before.difficulty = before.difficulty ?? question.difficulty;
    before._generationPlan = plan;
    before.tags = before.tags ?? tags;

    return {
      ok: true,
      subType,
      type: question.type,
      difficulty: question.difficulty,
      generationPlan: plan,
      passageContent: question.passage?.content ?? "",
      passageTitle: question.passage?.title ?? null,
      schoolType: question.passage?.school?.type === "MIDDLE" ? "중학교" : "고등학교",
      before,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "문제를 불러오지 못했습니다.",
    };
  }
}

interface PersistEditedInput {
  /**
   * 진단/표시 참고용일 뿐 영속화에 쓰지 않는다. 학생 노출 questionText 는 항상 서버에서
   * buildGeneratedQuestionText(structuredData)로 재도출한다 — 그래야 SW-LEAK-1(정답 마스킹)
   * 중앙 가드를 거친다. (클라이언트가 정답이 박힌 questionText 를 보내도 무시됨.)
   */
  questionText?: string;
  edited: Rec; // run-edit 의 after (구조화 객체, _typeId 포함)
}

function buildExplanationFields(edited: Rec) {
  const explanation = edited.explanation;
  const keyPoints = edited.keyPoints;
  const woe = edited.wrongOptionExplanations;
  return {
    content: typeof explanation === "string" ? explanation : "",
    keyPoints:
      keyPoints === undefined || keyPoints === null
        ? null
        : typeof keyPoints === "string"
          ? keyPoints
          : JSON.stringify(keyPoints),
    wrongOptionExplanations:
      woe === undefined || woe === null
        ? null
        : typeof woe === "string"
          ? woe
          : JSON.stringify(woe),
  };
}

function deriveCorrectAnswer(edited: Rec): string {
  if (typeof edited.correctAnswer === "string") return edited.correctAnswer;
  if (Array.isArray(edited.correctAnswers))
    return edited.correctAnswers.map((v) => String(v)).join(", ");
  if (typeof edited.modelAnswer === "string") return edited.modelAnswer;
  return "";
}

/**
 * 수정본을 **새 문제로 저장**(원본 보존). passageId·type·subType 은 원본을 승계하고,
 * "AI수정본" 태그 + 원본 참조(_editedFrom)를 남긴다. 미검수(approved=false)로 생성.
 */
export async function saveAiEditedAsNew(
  sourceQuestionId: string,
  input: PersistEditedInput,
): Promise<ActionResult & { questionId?: string }> {
  try {
    const staff = await requireAuth();
    const source = await prisma.question.findFirst({
      where: { id: sourceQuestionId, academyId: staff.academyId, deletedAt: null },
      select: {
        type: true,
        subType: true,
        passageId: true,
        tags: true,
        structuredData: true,
        points: true,
      },
    });
    if (!source) return { success: false, error: "원본 문제를 찾을 수 없습니다." };

    const edited = { ...input.edited };
    const plan =
      (isRec(edited) && normalizeQuestionGenerationPlan(edited._generationPlan)) ||
      (isRec(source.structuredData) &&
        normalizeQuestionGenerationPlan(source.structuredData._generationPlan)) ||
      getQuestionGenerationPlanFromTags(readTags(source.tags)) ||
      "STANDARD";

    const baseTags = readTags(edited.tags ?? source.tags);
    const withPlan = mergeQuestionGenerationPlanTag(baseTags, plan);
    const tags = withPlan.includes(AI_EDIT_TAG) ? withPlan : [...withPlan, AI_EDIT_TAG];

    const structuredData = {
      ...edited,
      _generationPlan: plan,
      _editedFrom: sourceQuestionId,
      tags,
    };

    const optionsArr = Array.isArray(edited.options) ? edited.options : null;
    // SW-LEAK-1: 학생 노출 questionText 는 항상 서버에서 구조화 데이터로 재도출(마스킹 보장).
    const questionText = buildGeneratedQuestionText(structuredData);

    const explanationFields = buildExplanationFields(edited);
    const hasExplanation = explanationFields.content.trim().length > 0;

    const created = await prisma.question.create({
      data: {
        academyId: staff.academyId,
        passageId: source.passageId,
        type: source.type,
        subType: source.subType,
        questionText,
        structuredData: toPrismaJson(structuredData),
        options: optionsArr ? JSON.stringify(optionsArr) : null,
        correctAnswer: deriveCorrectAnswer(edited),
        points: source.points ?? 1,
        difficulty: typeof edited.difficulty === "string" ? edited.difficulty : "INTERMEDIATE",
        tags: JSON.stringify(tags),
        aiGenerated: true,
        approved: false,
        ...(hasExplanation
          ? {
              explanation: {
                create: {
                  content: explanationFields.content,
                  keyPoints: explanationFields.keyPoints,
                  wrongOptionExplanations: explanationFields.wrongOptionExplanations,
                  aiGenerated: true,
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });

    revalidateBank();
    return { success: true, questionId: created.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.",
    };
  }
}

/**
 * 수정본을 **현재 문제에 적용(덮어쓰기)**. 구조화 데이터·questionText·선지·정답·난이도·
 * 해설을 한 트랜잭션으로 갱신한다. 생성플랜 태그는 보존.
 */
export async function applyAiEditToQuestion(
  questionId: string,
  input: PersistEditedInput,
): Promise<ActionResult> {
  try {
    const staff = await requireAuth();
    const existing = await prisma.question.findFirst({
      where: { id: questionId, academyId: staff.academyId, deletedAt: null },
      select: { tags: true, structuredData: true },
    });
    if (!existing) return { success: false, error: "문제를 찾을 수 없습니다." };

    const edited = { ...input.edited };
    const plan =
      (isRec(edited) && normalizeQuestionGenerationPlan(edited._generationPlan)) ||
      (isRec(existing.structuredData) &&
        normalizeQuestionGenerationPlan(existing.structuredData._generationPlan)) ||
      getQuestionGenerationPlanFromTags(readTags(existing.tags)) ||
      "STANDARD";

    const tags = mergeQuestionGenerationPlanTag(
      readTags(edited.tags ?? existing.tags),
      plan,
    );
    const structuredData = { ...edited, _generationPlan: plan, tags };
    const optionsArr = Array.isArray(edited.options) ? edited.options : null;
    // SW-LEAK-1: 학생 노출 questionText 는 항상 서버에서 구조화 데이터로 재도출(마스킹 보장).
    const questionText = buildGeneratedQuestionText(structuredData);
    const explanationFields = buildExplanationFields(edited);
    const hasExplanation = explanationFields.content.trim().length > 0;

    await prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: questionId },
        data: {
          questionText,
          structuredData: toPrismaJson(structuredData),
          options: optionsArr ? JSON.stringify(optionsArr) : null,
          correctAnswer: deriveCorrectAnswer(edited),
          difficulty: typeof edited.difficulty === "string" ? edited.difficulty : undefined,
          tags: JSON.stringify(tags),
          // 내용이 통째로 바뀌므로 재검수 필요 상태로 내리고, AI 산출물임을 표시한다.
          approved: false,
          aiGenerated: true,
        },
      });

      const existingExplanation = await tx.questionExplanation.findUnique({
        where: { questionId },
      });
      if (existingExplanation) {
        await tx.questionExplanation.update({
          where: { questionId },
          data: {
            content: explanationFields.content,
            keyPoints: explanationFields.keyPoints,
            wrongOptionExplanations: explanationFields.wrongOptionExplanations,
          },
        });
      } else if (hasExplanation) {
        await tx.questionExplanation.create({
          data: {
            questionId,
            content: explanationFields.content,
            keyPoints: explanationFields.keyPoints,
            wrongOptionExplanations: explanationFields.wrongOptionExplanations,
            aiGenerated: true,
          },
        });
      }
    });

    revalidateBank();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "적용 중 오류가 발생했습니다.",
    };
  }
}
