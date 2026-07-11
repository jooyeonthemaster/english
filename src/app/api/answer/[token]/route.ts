// ============================================================================
// POST /api/answer/[token] — 학생 답안 제출 (무인증 공개, 토큰 = 접근권한)
//
// /a/[token] 답안입력 페이지의 유일한 쓰기 경로. proxy.ts 매처(화이트리스트)에
// /api 최상위가 없어 미들웨어 자체가 돌지 않는다 — requireStaff 금지, 토큰 검증만.
// 흐름: 토큰 형식 → answerToken+answerEnabled 행 조회 → gradingConfirmed 잠금 →
//       examMap 파스 → applyAnswerSubmission(순수) → 전 문항 기입 검증(missing
//       있으면 400 INCOMPLETE, 저장 없음) → clamp+scoreSummary 재계산 →
//       version CAS(충돌 시 재조회 후 재적용, 최대 3회).
// 보안 1순위: 응답에 정오/점수/정답(correctAnswer·status·scoreSummary) 절대 미포함.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidShareToken } from "@/lib/exam-report/share-token";
import {
  parseExamMap,
  parseScoreSummary,
  parseStudentResponses,
} from "@/lib/exam-report/schemas";
import { applyAnswerSubmission } from "@/lib/exam-report/answer-entry";
import { clampEarnedPoints, computeScoreSummary } from "@/lib/exam-report/grading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** version CAS 충돌(병렬 강사 편집 등) 시 재조회-재적용 상한. */
const CAS_MAX_ATTEMPTS = 3;

const bodySchema = z.object({
  entries: z
    .array(
      z.object({
        number: z.string().min(1).max(40),
        choice: z.string().regex(/^[1-5]$/).optional(),
        text: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(200),
});

// 도메인 타입(optional 필드)은 Prisma InputJsonValue 에 직접 대입되지 않는다 —
// 저장 직전 경계 단언(actions/_helpers.toJson 관례, 클라 번들 오염 방지를 위해 로컬).
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** 토큰으로 제출 대상 학생 행을 조회한다(활성 링크 + soft-delete 제외). */
async function findAnswerTarget(token: string) {
  return prisma.examReportStudent.findFirst({
    where: {
      answerToken: token,
      answerEnabled: true,
      deletedAt: null,
      examAnalysis: { deletedAt: null },
    },
    select: {
      id: true,
      gradingConfirmed: true,
      responses: true,
      scoreSummary: true,
      version: true,
      examAnalysis: { select: { structure: true, status: true } },
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  // 형식 불일치 토큰은 존재 여부를 구분하지 않고 404 로 통일(무차별 탐색 억제).
  if (!isValidShareToken(token)) {
    return NextResponse.json(
      { error: "답안 링크를 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // 토큰 실존 확인을 바디 파싱보다 먼저 — 형식만 맞는 가짜 토큰으로 거대 JSON 을
  // 서버가 통째로 파싱하게 만드는 원가(메모리/CPU) 공격 차단. 미존재 토큰은 즉시 404.
  let student = await findAnswerTarget(token);
  if (!student) {
    return NextResponse.json(
      { error: "답안 링크가 만료되었거나 존재하지 않습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }
  const body = bodySchema.safeParse(rawBody);
  if (!body.success) {
    return NextResponse.json(
      { error: "제출 형식이 올바르지 않습니다.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  // CAS 루프 — 병렬 쓰기(강사 채점 저장·재판독 커밋)와 충돌하면 최신 행을 다시 읽어
  // 순수 병합을 재적용한다. reviewed:true 보존은 applyAnswerSubmission 이 보장.
  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
    // 채점 확정 후에는 학생 수정 잠금(재조회 경로에서도 매번 재확인).
    if (student.gradingConfirmed) {
      return NextResponse.json(
        { error: "채점이 확정되어 답안을 수정할 수 없습니다.", code: "LOCKED" },
        { status: 409 },
      );
    }
    const examMap = parseExamMap(student.examAnalysis.structure);
    if (!examMap) {
      return NextResponse.json(
        { error: "시험 문항 정보가 아직 준비되지 않았습니다.", code: "NOT_READY" },
        { status: 409 },
      );
    }

    const { responses, applied, skippedReviewed, missing } = applyAnswerSubmission({
      examMap,
      existing: parseStudentResponses(student.responses),
      entries: body.data.entries,
    });
    // 전 문항 기입 강제(유저 결정 2) — 유효 entry 가 없는 문항이 하나라도 있으면
    // 저장 없이 400(클라 우회 방지). missing 은 학생 본인 제출에서 파생된 문항
    // 번호뿐이라 정오/점수/정답 화이트리스트를 침해하지 않는다.
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "모든 문항의 답을 입력해야 제출할 수 있습니다.",
          code: "INCOMPLETE",
          missing,
        },
        { status: 400 },
      );
    }
    // 전 entry 스킵(examMap 미존재 번호·전부 reviewed)이면 DB 무변경 — 쓰기 자체를 생략.
    // 안 그러면 무의미 POST 반복만으로 answerSubmittedAt 스팸 갱신 + version 증가가
    // 일어나 강사의 updateStudentGrading CAS 가 매번 VERSION_CONFLICT(무인증 쓰기 DoS).
    if (applied === 0) {
      return NextResponse.json({ ok: true, applied, skippedReviewed });
    }
    const clamped = clampEarnedPoints(examMap, responses);
    // 반평균/등급은 강사 입력 — 기존 scoreSummary 값을 승계해 재계산한다.
    const prior = parseScoreSummary(student.scoreSummary);
    const scoreSummary = computeScoreSummary(examMap, clamped, {
      classAverage: prior?.classAverage ?? null,
      gradeBand: prior?.gradeBand ?? null,
    });

    const updated = await prisma.examReportStudent.updateMany({
      where: { id: student.id, version: student.version },
      data: {
        responses: toJson(clamped),
        scoreSummary: toJson(scoreSummary),
        answerSubmittedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      // 응답 화이트리스트 — 정오/점수/정답 계열 절대 미포함(학생 공개면 보안 계약).
      return NextResponse.json({ ok: true, applied, skippedReviewed });
    }

    // version 충돌 — 행 재조회(링크 비활성화/삭제됐으면 404 로 강등).
    student = await findAnswerTarget(token);
    if (!student) {
      return NextResponse.json(
        { error: "답안 링크가 만료되었거나 존재하지 않습니다.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
  }

  return NextResponse.json(
    { error: "저장이 겹쳤습니다. 잠시 후 다시 제출해 주세요.", code: "CONFLICT" },
    { status: 409 },
  );
}
