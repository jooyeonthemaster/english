import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Packer } from "docx";
import { buildExamDocument } from "./_lib/build-document";
import {
  buildBuilderExamDocument,
  type BuilderItem,
  type BuilderSettings,
} from "./_lib/build-builder-document";
import { shouldForceSourcePassage } from "@/components/exams/paper-builder/passage-policy";
import type { ExamQuestionData } from "./_lib/types";

// ---------------------------------------------------------------------------
// API Route
// ---------------------------------------------------------------------------

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
) {
  const byQuestionId = new Map(
    questions.map((item) => [item.question.id, item]),
  );

  return items
    .map((item, index) => {
      const original = byQuestionId.get(item.questionId);
      if (!original) return null;
      const forceSourcePassage = shouldForceBuilderSourcePassage(original, item);
      return {
        ...item,
        includePassage: item.includePassage !== false || forceSourcePassage,
        orderNum: item.orderNum ?? index + 1,
        points: item.points ?? original.points,
        sourceQuestion: original.question,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
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

    const settings = parseSettings(exam.settings);
    const examQuestions = exam.questions as unknown as ExamQuestionData[];

    let doc;
    if (settings) {
      // 빌더 미리보기와 동일한 레이아웃의 DOCX (해설 포함 시 각 문항 아래에 정답·해설 추가)
      const resolved = resolveBuilderItems(examQuestions, settings.items);
      const fullExamQuestions = applyBuilderSettings(examQuestions, settings);
      doc = buildBuilderExamDocument({
        title: exam.title,
        settings,
        resolvedItems: resolved,
        includeAnswers,
        fullExamQuestions,
      });
    } else {
      // 빌더 메타가 없는 레거시 시험지
      doc = buildExamDocument(exam.title, examQuestions, includeAnswers);
    }

    const buffer = await Packer.toBuffer(doc);

    // 출력(DOCX 내보내기) 1회 → 인쇄 횟수 +1
    await prisma.exam.update({
      where: { id: examId },
      data: { printCount: { increment: 1 } },
    });

    const filename = encodeURIComponent(
      `${exam.title}${includeAnswers ? "_정답포함" : ""}.docx`
    );

    return new NextResponse(Buffer.from(buffer) as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
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
