import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { logAppEvent } from "@/lib/app-events";
import { incrementExamPrintCountRow } from "@/lib/exams/exam-print-count";
import { Packer } from "docx";
import { buildExamDocxDocument } from "./_lib/build-builder-document/assemble";
import { parseSavedPaperSettings } from "@/components/exams/paper-builder/saved-paper-items";
import { toEmbeddableImageDataUrl } from "@/lib/server-image";

// ---------------------------------------------------------------------------
// API Route
//
// 「무엇을 찍을지」는 공용 정본만 소비한다(docs/EXAM-PAPER-MODEL.md §1~§4):
//   parseSavedPaperSettings → buildPaperItemsFromExam → buildGroups / toPaperExportItem /
//   resolvePaperLayout / answerKeyEntries  (buildExamDocxDocument 안에서).
// settings 가 없는 시험지(NULL)·similar-v1 도 같은 빌더 문서 경로를 탄다 — 레거시 렌더러
// (build-document.ts·build-question.ts·render-*.ts)는 이 라우트에서 더 이상 쓰지 않는다.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const revalidate = 0;
// 대량 시험지(수백~1000+ 문항) DOCX 생성은 문항 로드 + 이미지 임베드 변환으로
// 기본 서버리스 타임아웃을 넘길 수 있어 상한을 명시한다(플랫폼이 자체 한도로 클램프).
export const maxDuration = 300;

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

    // 저장 설정(빌더 v1/v2·similar-v1·NULL). 레이아웃·머리글은 source 와 무관하게 읽고,
    // 문항은 buildPaperItemsFromExam 이 형식별로(blocks → items → 기본 규칙) 고른다.
    const settings = parseSavedPaperSettings(exam.settings);

    // Word 가 임베드 못 하는 이미지 포맷(webp 등)을 PNG 로 변환해 다운로드에도 그림이 보이게 한다
    // (미리보기는 브라우저가 webp 를 그대로 렌더하므로 차이가 났던 부분). 제자리 변환 후 조립한다.
    if (settings && Array.isArray(settings.blocks)) {
      await Promise.all(
        settings.blocks.map(async (b) => {
          if (b.blockType === "image" && b.imageDataUrl) {
            b.imageDataUrl = await toEmbeddableImageDataUrl(b.imageDataUrl);
          }
        }),
      );
    }
    if (settings?.header?.academyLogoDataUrl) {
      settings.header.academyLogoDataUrl = await toEmbeddableImageDataUrl(
        settings.header.academyLogoDataUrl,
      );
    }

    // 빌더 미리보기·웹 상세와 같은 문항 모델의 DOCX (해설 포함 시 각 문항 아래에 정답·해설 추가).
    const doc = buildExamDocxDocument({
      title: exam.title,
      examQuestions: exam.questions,
      settings,
      includeAnswers,
    });

    const buffer = await Packer.toBuffer(doc);

    // 출력(DOCX 내보내기) 1회 → 인쇄 횟수 +1 (updatedAt 은 그대로 — 내보내기는 수정이 아니다, COH-15)
    // 파일 버퍼 생성은 이미 끝났으므로 카운트 갱신 실패가 다운로드를 깨뜨리면 안 된다.
    try {
      await incrementExamPrintCountRow(exam.id, staff.academyId);
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
