import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { logAppEvent } from "@/lib/app-events";
import { Packer } from "docx";
import { buildExamDocument } from "./_lib/build-document";
import {
  buildBuilderExamDocument,
  type BuilderItem,
  type BuilderSettings,
} from "./_lib/build-builder-document";
import { shouldForceSourcePassage } from "@/components/exams/paper-builder/passage-policy";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { toEmbeddableImageDataUrl } from "@/lib/server-image";
import type { ExamQuestionData } from "./_lib/types";

// ---------------------------------------------------------------------------
// API Route
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const revalidate = 0;
// 대량 시험지(수백~1000+ 문항) DOCX 생성은 문항 로드 + 이미지 임베드 변환으로
// 기본 서버리스 타임아웃을 넘길 수 있어 상한을 명시한다(플랫폼이 자체 한도로 클램프).
export const maxDuration = 300;

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
) {
  const byQuestionId = new Map(
    questions.map((item) => [item.question.id, item]),
  );
  // 문항 단위 서식(크기·굵게·기울임·정렬)은 settings.blocks 에만 저장되므로 병합한다.
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
          questionText: repairGrammarCorrectionQuestionText({
            subType: original.question.subType,
            questionText: item.questionText || original.question.questionText,
            structuredData: (original.question as { structuredData?: unknown }).structuredData,
          }),
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

    const staff = await getStaffSession().catch(() => null);
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      include: {
        questions: {
          // 휴지통(soft delete) 가드 — 삭제된 문제는 DOCX 출력물에 절대 포함 금지.
          where: { question: { deletedAt: null } },
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
      // Word 가 임베드 못 하는 이미지 포맷(webp 등)을 PNG 로 변환해 다운로드에도 그림이 보이게 한다
      // (미리보기는 브라우저가 webp 를 그대로 렌더하므로 차이가 났던 부분).
      if (Array.isArray(settings.blocks)) {
        await Promise.all(
          settings.blocks.map(async (b) => {
            if (b.blockType === "image" && b.imageDataUrl) {
              b.imageDataUrl = await toEmbeddableImageDataUrl(b.imageDataUrl);
            }
          }),
        );
      }
      if (settings.header?.academyLogoDataUrl) {
        settings.header.academyLogoDataUrl = await toEmbeddableImageDataUrl(
          settings.header.academyLogoDataUrl,
        );
      }
      // 빌더 미리보기와 동일한 레이아웃의 DOCX (해설 포함 시 각 문항 아래에 정답·해설 추가)
      const resolved = resolveBuilderItems(examQuestions, settings.items, settings.blocks);
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
    // 파일 버퍼 생성은 이미 끝났으므로 카운트 갱신 실패가 다운로드를 깨뜨리면 안 된다.
    try {
      await prisma.exam.update({
        where: { id: examId },
        data: { printCount: { increment: 1 } },
      });
    } catch (err) {
      console.error("[export-docx] printCount 증가 실패(무시)", err);
    }

    // 관리자 활동 타임라인용 — printCount는 행위자/시각이 없어 별도 기록
    await logAppEvent({
      academyId: exam.academyId,
      actorType: "STAFF",
      actorId: staff.id ?? null,
      eventType: "EXAM_EXPORT",
      resourceType: "EXAM",
      resourceId: exam.id,
      metadata: { format: "docx", title: exam.title, includeAnswers },
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
