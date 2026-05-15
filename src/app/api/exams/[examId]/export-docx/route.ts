import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Packer } from "docx";
import { buildExamDocument } from "./_lib/build-document";
import type { ExamQuestionData } from "./_lib/types";

// ---------------------------------------------------------------------------
// API Route
// ---------------------------------------------------------------------------

type BuilderSettings = {
  source?: string;
  template?: string;
  layout?: {
    columns?: 1 | 2;
    density?: "comfortable" | "compact";
    passageStyle?: string;
  };
  items?: Array<{
    questionId: string;
    orderNum?: number;
    points?: number;
    includePassage?: boolean;
    passageTitle?: string;
    passageContent?: string;
    questionText?: string;
    options?: Array<{ label: string; text: string }>;
    correctAnswer?: string;
  }>;
};

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
              title: item.passageTitle || original.question.passage?.title || "",
              content: item.passageContent || original.question.passage?.content || "",
            };

      return {
        ...original,
        orderNum: index + 1,
        points: item.points || original.points,
        question: {
          ...original.question,
          questionText: item.questionText || original.question.questionText,
          options: item.options ? JSON.stringify(item.options) : original.question.options,
          correctAnswer: item.correctAnswer ?? original.question.correctAnswer,
          passage,
        },
      } satisfies ExamQuestionData;
    })
    .filter((item): item is ExamQuestionData => Boolean(item));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
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
      return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    }

    const doc = buildExamDocument(
      exam.title,
      applyBuilderSettings(
        exam.questions as unknown as ExamQuestionData[],
        parseSettings(exam.settings),
      ),
      includeAnswers,
      {
        columns: parseSettings(exam.settings)?.layout?.columns,
        density: parseSettings(exam.settings)?.layout?.density,
        template: parseSettings(exam.settings)?.template,
      },
    );

    const buffer = await Packer.toBuffer(doc);

    const filename = encodeURIComponent(
      `${exam.title}${includeAnswers ? "_정답포함" : ""}.docx`
    );

    return new NextResponse(Buffer.from(buffer) as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (error) {
    console.error("DOCX export error:", error);
    return NextResponse.json(
      { error: "DOCX 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
