import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildBuilderHwpxDocument } from "./_lib/builder";
import { packageHwpx } from "./_lib/package";
import type {
  BuilderItem,
  BuilderSettings,
} from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";
import type { BuilderItemResolved } from "./_lib/render/question";

function parseSettings(settings: string | null): BuilderSettings | null {
  if (!settings) return null;
  try {
    const parsed = JSON.parse(settings) as BuilderSettings;
    if (parsed?.source !== "exam-paper-builder-v1") return null;
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
      return {
        ...item,
        orderNum: item.orderNum ?? index + 1,
        points: item.points ?? original.points,
        sourceQuestion: original.question,
      } as BuilderItemResolved;
    })
    .filter((it): it is BuilderItemResolved => Boolean(it));
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

      const passage =
        item.includePassage === false
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
          questionText:
            item.questionText || original.question.questionText,
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

    const filename = encodeURIComponent(
      `${exam.title}${includeAnswers ? "_정답포함" : ""}.hwpx`,
    );

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.hancom.hwpx",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
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
