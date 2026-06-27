import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { logAppEvent } from "@/lib/app-events";
import { buildBuilderHwpxDocument } from "./_lib/builder";
import { packageHwpx } from "./_lib/package";
import { MIMETYPE } from "./_lib/static-files";
import { shouldForceSourcePassage } from "@/components/exams/paper-builder/passage-policy";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { toEmbeddableImageDataUrl } from "@/lib/server-image";
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
  blocks?: BuilderSettings["blocks"],
): BuilderItemResolved[] {
  const byQuestionId = new Map(
    questions.map((item) => [item.question.id, item]),
  );
  // 문항 단위 서식(글자 크기·굵게·기울임·정렬)은 settings.blocks 에만 저장되므로
  // (settings.items 는 레거시 문항 목록) localId·questionId 로 블록을 찾아 병합한다.
  const blockByLocalId = new Map<string, NonNullable<typeof blocks>[number]>();
  const blockByQuestionId = new Map<string, NonNullable<typeof blocks>[number]>();
  for (const b of blocks ?? []) {
    if (b.localId) blockByLocalId.set(b.localId, b);
    if (b.questionId) blockByQuestionId.set(b.questionId, b);
  }

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
      const fmtBlock =
        (item.localId ? blockByLocalId.get(item.localId) : undefined) ??
        blockByQuestionId.get(item.questionId);
      return {
        ...item,
        questionText,
        includePassage: item.includePassage !== false || forceSourcePassage,
        orderNum: item.orderNum ?? index + 1,
        points: item.points ?? original.points,
        blockFontPt: fmtBlock?.blockFontPt ?? null,
        blockBold: fmtBlock?.blockBold ?? false,
        blockItalic: fmtBlock?.blockItalic ?? false,
        blockAlign: fmtBlock?.blockAlign ?? "left",
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

    // 한컴이 임베드 못 하는 이미지 포맷(webp 등)을 PNG 로 변환 — hp:pic 임베드에 png/jpg/gif/bmp 만.
    if (Array.isArray(settings?.blocks)) {
      await Promise.all(
        settings.blocks.map(async (b) => {
          if (b.blockType === "image" && b.imageDataUrl) {
            b.imageDataUrl = await toEmbeddableImageDataUrl(b.imageDataUrl);
          }
        }),
      );
    }

    const resolvedItems = settings
      ? resolveBuilderItems(examQuestions, settings.items, settings.blocks)
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
    // 파일 버퍼 생성은 이미 끝났으므로 카운트 갱신 실패가 다운로드를 깨뜨리면 안 된다.
    try {
      await prisma.exam.update({
        where: { id: examId },
        data: { printCount: { increment: 1 } },
      });
    } catch (err) {
      console.error("[export-hwpx] printCount 증가 실패(무시)", err);
    }

    // 관리자 활동 타임라인용 — printCount는 행위자/시각이 없어 별도 기록
    const staff = await getStaffSession().catch(() => null);
    await logAppEvent({
      academyId: exam.academyId,
      actorType: "STAFF",
      actorId: staff?.id ?? null,
      eventType: "EXAM_EXPORT",
      resourceType: "EXAM",
      resourceId: exam.id,
      metadata: { format: "hwpx", title: exam.title, includeAnswers },
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
