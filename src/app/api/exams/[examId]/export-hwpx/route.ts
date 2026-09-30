import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { logAppEvent } from "@/lib/app-events";
import { incrementExamPrintCountRow } from "@/lib/exams/exam-print-count";
import { buildExamHwpxDocument } from "./_lib/exam-document";
import { packageHwpx } from "./_lib/package";
import { MIMETYPE } from "./_lib/static-files";
import type { HwpxDocument } from "./_lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// 대량 시험지(수백~1000+ 문항) HWPX 생성은 문항 로드 + 이미지 임베드 변환으로
// 기본 서버리스 타임아웃을 넘길 수 있어 상한을 명시한다(플랫폼이 자체 한도로 클램프).
export const maxDuration = 300;

/**
 * 표지(HWPX section0) 정보 박스의 시험일 표기 — "YYYY-MM-DD".
 *
 * exams.examDate 는 DB 에 UTC 로 들어있다. 런타임 로컬 타임존(배포 서버는 UTC)으로
 * 포매팅하면 KST 기준 하루가 어긋나므로, 리포의 다른 서울 날짜 키(vocab-drill
 * seoulDayKey / study-assignments seoulDay)와 같이 Intl 에 timeZone 을 못 박아 뽑는다.
 * ("en-CA" 로케일이 정확히 YYYY-MM-DD 를 준다.)
 * 빌더 미리보기의 formatExamDate 도 같은 형식이지만 그쪽은 Date 로컬 getter 를 쓰는
 * 클라이언트 컴포넌트라 서버에서 재사용할 수 없다.
 */
const EXAM_DATE_LABEL_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatExamDateLabel(value: Date | string | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : EXAM_DATE_LABEL_FORMAT.format(date);
}

/** 묶음 유지(keep-policy) 진단 한 줄 — 흐름형 본문이 아니면(구형 표 경로) 정책을 부르지 않는다. */
function keepDiagnosticsLine(doc: HwpxDocument, examId: string): string {
  const keep = doc.diagnostics?.keep;
  if (!keep) return `[export-hwpx] keep chains=- capped=- conflicts=- (not applied) exam=${examId}`;
  return (
    `[export-hwpx] keep chains=${keep.chains} capped=${keep.cappedChains} conflicts=${keep.breakConflicts}` +
    ` flagged=${keep.flagged} droppedKeepLines=${keep.droppedKeepLines} enabled=${keep.enabled} exam=${examId}`
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
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
          // 휴지통(soft delete) 가드 — 삭제된 문제는 HWPX 출력물에 절대 포함 금지.
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
      return NextResponse.json(
        { error: "시험을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 「무엇을 찍을지」(문항·지문·답란·배지·정답표)는 웹 상세·인쇄와 같은 공용 정본이 정한다
    // (saved-paper-items.buildPaperItemsFromExam — docs/EXAM-PAPER-MODEL.md §1~§4). 여기서 재해석하지 않는다.
    const { doc } = await buildExamHwpxDocument({
      title: exam.title,
      settings: exam.settings,
      questions: exam.questions,
      includeAnswers,
      examDateLabel: formatExamDateLabel(exam.examDate),
    });
    console.info(keepDiagnosticsLine(doc, exam.id));

    const buffer = await packageHwpx(doc);

    // 출력(HWPX/HWPX해설) 1회 → 인쇄 횟수 +1 (updatedAt 은 그대로 — 내보내기는 수정이 아니다, COH-15)
    // 파일 버퍼 생성은 이미 끝났으므로 카운트 갱신 실패가 다운로드를 깨뜨리면 안 된다.
    try {
      await incrementExamPrintCountRow(exam.id, staff.academyId);
    } catch (err) {
      console.error("[export-hwpx] printCount 증가 실패(무시)", err);
    }

    // 관리자 활동 타임라인용 — printCount는 행위자/시각이 없어 별도 기록
    await logAppEvent({
      academyId: exam.academyId,
      actorType: "STAFF",
      actorId: staff.id ?? null,
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
