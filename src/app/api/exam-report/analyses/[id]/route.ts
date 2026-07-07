// ============================================================================
// GET /api/exam-report/analyses/[id]
//   분석 워크스페이스 로드용 상세. structure/analysis/reviewState/aiMeta/version/
//   sourceFiles + 학생 스칼라 목록을 내려보낸다. 진입 시 reconcileExamAnalysis 로
//   ANALYZING 좀비 상태를 자기치유한다. 타테넌트는 404 통일(존재 비노출).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
import { reconcileExamAnalysis, reconcileStudentRead } from "@/lib/exam-report/reconcile";
import type { ReadStatus } from "@/lib/exam-report/types";
import {
  parseExamAiMeta,
  parseExamAnalysisResult,
  parseExamMap,
  parseExamReviewState,
  parseReadState,
  parseScoreSummary,
} from "@/lib/exam-report/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const analysis = await prisma.examAnalysis.findFirst({
    // academyId 를 where 에 포함 — 타테넌트 리소스는 존재 자체를 비노출(404 통일).
    where: { id, academyId: auth.academyId, deletedAt: null },
    select: {
      id: true,
      academyId: true,
      title: true,
      schoolName: true,
      grade: true,
      subject: true,
      examType: true,
      examYear: true,
      semester: true,
      status: true,
      sourceType: true,
      sourceFiles: true,
      structure: true,
      analysis: true,
      reviewState: true,
      aiMeta: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      students: {
        where: { deletedAt: null },
        select: {
          id: true,
          studentName: true,
          gradingConfirmed: true,
          reportStatus: true,
          shareEnabled: true,
          answerToken: true,
          answerEnabled: true,
          answerSubmittedAt: true,
          scoreSummary: true,
          readState: true,
          sourceFiles: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!analysis) {
    return NextResponse.json(
      { error: "시험 분석을 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // 진입 시 리컨실 — 내부에서 stale 아니면 즉시 현 status 반환(무 DB).
  // ANALYZING → DRAFT 좀비 자기치유(체크포인트=examMap/analysis JSON 보존).
  const status = await reconcileExamAnalysis(analysis);

  // READING 좀비 자기치유 — 각 학생 readState 가 READING 이면 reconcileStudentRead 로
  // stale(readStartedAt 기준) 판정, 초과 시 FAILED 로 전환한다(동시 진행 중인 실제
  // 판독은 status 경로 CAS 로 침범 안 함). 이걸 안 하면 죽은 판독 프로세스가 남긴
  // READING 이 워크스페이스 폴링/뱃지를 영구 구동한다. 치유된 status 를 응답에 반영해
  // 클라의 live(폴링/뱃지)가 자연 종료되게 한다(reconcileExamAnalysis 패턴 미러).
  const healedReadStatus = new Map<string, ReadStatus>();
  await Promise.all(
    analysis.students.map(async (s) => {
      if (parseReadState(s.readState).status !== "READING") return;
      const healed = await reconcileStudentRead({
        id: s.id,
        academyId: analysis.academyId,
        readState: s.readState,
        updatedAt: s.updatedAt,
      });
      healedReadStatus.set(s.id, healed);
    }),
  );

  // ExamAnalysisDetail 직렬화 — Json 컬럼은 파서 경유(손상 시 null/기본값).
  // structure 는 v3 ExamMap 로 파스, academyId 는 응답에서 제외.
  const {
    academyId: _academyId,
    students,
    structure: _structure,
    analysis: _analysisJson,
    reviewState: _reviewJson,
    aiMeta: _aiMetaJson,
    ...scalars
  } = analysis;
  return NextResponse.json({
    analysis: {
      ...scalars,
      status,
      examMap: parseExamMap(analysis.structure),
      analysis: parseExamAnalysisResult(analysis.analysis),
      reviewState: parseExamReviewState(analysis.reviewState),
      aiMeta: parseExamAiMeta(analysis.aiMeta),
      students: students.map(({ readState, sourceFiles, answerSubmittedAt, ...s }) => {
        const parsedRead = parseReadState(readState);
        const healed = healedReadStatus.get(s.id);
        return {
          ...s,
          scoreSummary: parseScoreSummary(s.scoreSummary),
          // 치유된 학생은 READING→FAILED 로 반영(폴링/뱃지 자연 종료).
          readState: healed ? { ...parsedRead, status: healed } : parsedRead,
          sourceFileCount: Array.isArray(sourceFiles) ? sourceFiles.length : 0,
          // 학생 답안입력 링크 상태(ui-contracts ExamAnalysisStudentRow) — ISO|null.
          answerSubmittedAt: answerSubmittedAt ? answerSubmittedAt.toISOString() : null,
        };
      }),
    },
  });
}
