import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildBuilderHwpxDocument } from "./_lib/builder";
import { packageHwpx } from "./_lib/package";
import { MIMETYPE } from "./_lib/static-files";
import { shouldForceSourcePassage } from "@/components/exams/paper-builder/passage-policy";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import type {
  BuilderItem,
  BuilderSettings,
} from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";
import type { BuilderItemResolved } from "./_lib/render/question";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseSettings(settings: string | null): BuilderSettings | null {
  if (!settings) return null;
  try {
    const parsed = JSON.parse(settings) as BuilderSettings;
    if (
      parsed?.source !== "exam-paper-builder-v1" &&
      parsed?.source !== "exam-paper-builder-v2"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function resolveBuilderItems(
  questions: ExamQuestionData[],
  items: BuilderItem[],
): BuilderItemResolved[] {
  const byQuestionId = new Map(
    questions.map((item) => [item.question.id, item]),
  );

  return items
    .map((item, index) => {
      const original = byQuestionId.get(item.questionId);
      if (!original) return null;
      const forceSourcePassage = shouldForceBuilderSourcePassage(original, item);
      const questionText = repairGrammarCorrectionQuestionText({
        subType: original.question.subType,
        questionText: item.questionText || original.question.questionText,
        structuredData: (original.question as { structuredData?: unknown }).structuredData,
      });
      return {
        ...item,
        questionText,
        includePassage: item.includePassage !== false || forceSourcePassage,
        orderNum: item.orderNum ?? index + 1,
        points: item.points ?? original.points,
        sourceQuestion: original.question,
      } as BuilderItemResolved;
    })
    .filter((it): it is BuilderItemResolved => Boolean(it));
}

function shouldForceBuilderSourcePassage(
  original: ExamQuestionData,
  item: Pick<BuilderItem, "questionText" | "passageContent">,
) {
  const passageContent = item.passageContent || original.question.passage?.content || "";
  return shouldForceSourcePassage({
    subType: original.question.subType,
    questionText: item.questionText || original.question.questionText,
    structuredData: (original.question as { structuredData?: unknown }).structuredData,
    passage: { content: passageContent },
  });
}

function applyBuilderSettings(
  questions: ExamQuestionData[],
  settings: BuilderSettings | null,
): ExamQuestionData[] {
  if (!settings?.items?.length) return questions;

  const byQuestionId = new Map(
    questions.map((item) => [item.question.id, item]),
  );

  return settings.items
    .map((item, index) => {
      const original = byQuestionId.get(item.questionId);
      if (!original) return null;

      const includePassage =
        item.includePassage !== false || shouldForceBuilderSourcePassage(original, item);
      const passage =
        !includePassage
          ? null
          : {
              title:
                item.passageTitle || original.question.passage?.title || "",
              content:
                item.passageContent ||
                original.question.passage?.content ||
                "",
            };

      return {
        ...original,
        orderNum: index + 1,
        points: item.points || original.points,
        question: {
          ...original.question,
          questionText: repairGrammarCorrectionQuestionText({
            subType: original.question.subType,
            questionText: item.questionText || original.question.questionText,
            structuredData: (original.question as { structuredData?: unknown }).structuredData,
          }),
          options: item.options
            ? JSON.stringify(item.options)
            : original.question.options,
          correctAnswer:
            item.correctAnswer ?? original.question.correctAnswer,
          passage,
        },
      } satisfies ExamQuestionData;
    })
    .filter((item): item is ExamQuestionData => Boolean(item));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const { examId } = await params;
    const url = new URL(request.url);
    const includeAnswers = url.searchParams.get("answers") === "true";

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: {
          include: {
            question: {
              include: {
                passage: { select: { title: true, content: true } },
                explanation: {
                  select: {
                    content: true,
                    keyPoints: true,
                    wrongOptionExplanations: true,
                  },
                },
              },
            },
          },
          orderBy: { orderNum: "asc" },
        },
      },
    });

    if (!exam) {
      return NextResponse.json(
        { error: "시험을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const settings = parseSettings(exam.settings);
    const examQuestions = exam.questions as unknown as ExamQuestionData[];

    const resolvedItems = settings
      ? resolveBuilderItems(examQuestions, settings.items)
      : examQuestions.map<BuilderItemResolved>((eq) => ({
          questionId: eq.question.id,
          orderNum: eq.orderNum,
          points: eq.points,
          sourceQuestion: eq.question,
        }));
    const fullExamQuestions = settings
      ? applyBuilderSettings(examQuestions, settings)
      : examQuestions;

    const doc = buildBuilderHwpxDocument({
      title: exam.title,
      settings,
      resolvedItems,
      includeAnswers,
      fullExamQuestions,
    });

    const buffer = await packageHwpx(doc);

    // 출력(HWPX/HWPX해설) 1회 → 인쇄 횟수 +1
    await prisma.exam.update({
      where: { id: examId },
      data: { printCount: { increment: 1 } },
    });

    const filename = encodeURIComponent(
      `${exam.title}${includeAnswers ? "_정답포함" : ""}.hwpx`,
    );

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": MIMETYPE,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
      },
    });
  } catch (error) {
    console.error("HWPX export error:", error);
    return NextResponse.json(
      { error: "HWPX 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
