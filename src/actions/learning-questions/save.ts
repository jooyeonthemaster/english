"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  requireAuth,
  resolveCategory,
  toJsonString,
  validateQuestionText,
  type ActionResult,
  type LearningQuestionData,
  type LearningSetData,
} from "./_helpers";

// ---------------------------------------------------------------------------
// 내신링고 문제 저장
// ---------------------------------------------------------------------------

export async function saveNaeshinQuestions(
  questions: LearningQuestionData[],
  setData?: LearningSetData,
): Promise<ActionResult & { setId?: string }> {
  try {
    const staff = await requireAuth();
    const academyId = staff.academyId;

    // 학습 세트 생성
    let learningSetId: string | null = null;
    if (setData) {
      const set = await prisma.learningSet.create({
        data: {
          academyId,
          passageId: setData.passageId,
          publisher: setData.publisher,
          textbook: setData.textbook || null,
          grade: setData.grade || null,
          unit: setData.unit || null,
          title: setData.title,
          questionCount: questions.length,
        },
      });
      learningSetId = set.id;
    }

    // 기본 검증 — 불량 문제 필터링
    const validQuestions = questions.filter((q) => validateQuestionText(q.subType, q.questionText));
    const skippedCount = questions.length - validQuestions.length;
    if (skippedCount > 0) {
      console.warn(`[saveNaeshinQuestions] 검증 실패로 ${skippedCount}개 문제 제외`);
    }

    // explanation이 없는 문제는 questionText JSON 내부에서 추출 시도
    for (const q of validQuestions) {
      if (!q.explanation && q.questionText) {
        try {
          const data = JSON.parse(q.questionText);
          if (typeof data.explanation === "string" && data.explanation) {
            q.explanation = data.explanation;
          } else if (typeof data.errorExplanation === "string" && data.errorExplanation) {
            q.explanation = data.errorExplanation;
          } else if (typeof data.grammarPoint === "string" && data.grammarPoint) {
            q.explanation = `문법 포인트: ${data.grammarPoint}`;
          }
        } catch {}
      }
    }

    // 벌크 INSERT — 문제 (속도 우선)
    await prisma.naeshinQuestion.createMany({
      data: validQuestions.map((q) => ({
        academyId,
        passageId: q.passageId,
        learningSetId,
        learningCategory: resolveCategory(q.subType),
        type: q.type,
        subType: q.subType || null,
        questionText: q.questionText || "",
        options: toJsonString(q.options),
        correctAnswer: q.correctAnswer || "",
        difficulty: q.difficulty || "INTERMEDIATE",
        tags: toJsonString(q.tags),
        aiGenerated: true,
        approved: false,
      })),
    });

    // 해설 매칭 — questionText 내용으로 매칭 (순서 의존 제거)
    const questionsWithExplanation = validQuestions.filter((q) => q.explanation);
    if (questionsWithExplanation.length > 0 && learningSetId) {
      const created = await prisma.naeshinQuestion.findMany({
        where: { learningSetId },
        select: { id: true, questionText: true },
      });

      // questionText → ID[] 맵 (동일 텍스트가 여러 문제일 수 있음)
      const createdByText = new Map<string, string[]>();
      for (const c of created) {
        const arr = createdByText.get(c.questionText) || [];
        arr.push(c.id);
        createdByText.set(c.questionText, arr);
      }

      const usedIds = new Set<string>();
      const explanationData: { questionId: string; content: string; keyPoints: string | null; wrongOptionExplanations: string | null }[] = [];
      for (const q of questionsWithExplanation) {
        const candidates = createdByText.get(q.questionText || "") || [];
        // 아직 사용 안 된 ID 찾기
        const questionId = candidates.find((id) => !usedIds.has(id));
        if (questionId) {
          usedIds.add(questionId);
          explanationData.push({
            questionId,
            content: q.explanation!,
            keyPoints: toJsonString(q.keyPoints),
            wrongOptionExplanations: toJsonString(q.wrongOptionExplanations),
          });
        }
      }

      if (explanationData.length > 0) {
        await prisma.naeshinQuestionExplanation.createMany({
          data: explanationData,
        });
      }
    }

    revalidatePath("/director/workbench");
    revalidatePath("/director/learning-questions");
    return { success: true, setId: learningSetId || undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "저장 실패";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// 수능링고 문제 저장
// ---------------------------------------------------------------------------

export async function saveSuneungQuestions(
  questions: LearningQuestionData[],
  grade: number
): Promise<ActionResult> {
  try {
    await requireAuth();

    for (const q of questions) {
      const question = await prisma.suneungQuestion.create({
        data: {
          passageId: q.passageId,
          learningCategory: resolveCategory(q.subType),
          type: q.type,
          subType: q.subType || null,
          questionText: q.questionText || "",
          options: toJsonString(q.options),
          correctAnswer: q.correctAnswer || "",
          difficulty: q.difficulty || "INTERMEDIATE",
          grade,
          tags: toJsonString(q.tags),
          aiGenerated: true,
          approved: false,
        },
      });

      if (q.explanation) {
        await prisma.suneungQuestionExplanation.create({
          data: {
            questionId: question.id,
            content: q.explanation,
            keyPoints: toJsonString(q.keyPoints),
            wrongOptionExplanations: toJsonString(q.wrongOptionExplanations),
          },
        });
      }
    }

    revalidatePath("/director/workbench");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "저장 실패";
    return { success: false, error: message };
  }
}
