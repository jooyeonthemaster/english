// ============================================================================
// POST /api/t/[token]/submit — 최종 제출 + 서버 결정론 채점 (무인증 공개)
//
// /t/[token] 응시면의 유일한 제출 경로. /api/answer/[token] 골격 미러.
// 흐름: 토큰 형식 → 행 실존 → 게이트 → 최종 병합 → LIVE Question 로드 →
//       gradeMergedSubmission(AI 0콜) → 미입력 검증(INCOMPLETE 400, 저장 없음)
//       → scoreSummary → status GRADED|SUBMITTED → version CAS(최대 3회) →
//       syncSubmissionToReport(실패해도 제출은 성공 — 로그만).
// 보안 1순위(§6-1): 응답은 {ok:true} 만 — 정오·점수·정답 절대 미포함.
//   INCOMPLETE 의 missing 은 학생 본인 제출에서 파생된 문항 번호뿐이라
//   화이트리스트를 침해하지 않는다(/api/answer 선례).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidShareToken } from "@/lib/exam-report/share-token";
import {
  findTakingSubmission,
  gradeMergedSubmission,
  mergeSubmissionResponses,
  parseOrderSnapshot,
  sanitizeStudentInput,
  takingWriteGate,
  type ScorableQuestionRecord,
} from "@/lib/exam-scoring/taking-payload";
import type { StudentInput } from "@/lib/exam-scoring/types";
// W2 계약(설계문서 §3.5) — 채점 완료 시 ExamReportStudent 브리지 동기화.
import { syncSubmissionToReport } from "@/lib/exam-scoring/report-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** version CAS 충돌(자동저장 잔여 요청·강사 조작) 시 재조회-재적용 상한. */
const CAS_MAX_ATTEMPTS = 3;

// 바디 상한 — save 라우트와 동일 코스 게이트(세부 정화는 sanitizeStudentInput).
const studentInputSchema = z
  .object({
    choice: z.string().max(24).optional(),
    choices: z.array(z.string().max(24)).max(20).optional(),
    texts: z.record(z.string().max(64), z.string().max(4000)).optional(),
  })
  .nullable();

const bodySchema = z
  .object({
    // 제출 직전 미저장분 최종 병합용 — 전부 자동저장됐다면 {} 로 제출만 해도 된다.
    responses: z.record(z.string().min(1).max(64), studentInputSchema).optional(),
    /** 미입력 문항이 있어도 제출 확정(응시면이 경고 확인 후 재호출) */
    confirmIncomplete: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b.responses ?? {}).length <= 300, {
    message: "responses 크기가 허용 범위를 벗어났습니다.",
  });

// 도메인 타입(optional 필드)은 Prisma InputJsonValue 에 직접 대입되지 않는다 —
// 저장 직전 경계 단언(/api/answer/[token] 관례 미러, 로컬 유지).
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  // 형식 불일치 토큰은 존재 여부를 구분하지 않고 404 통일(무차별 탐색 억제).
  if (!isValidShareToken(token)) {
    return NextResponse.json(
      { error: "응시 링크를 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // 행 실존 확인을 바디 파싱보다 먼저(파싱 원가 공격 차단 — /api/answer 미러).
  let submission = await findTakingSubmission(token);
  if (!submission) {
    return NextResponse.json(
      { error: "응시 링크가 만료되었거나 존재하지 않습니다.", code: "NOT_FOUND" },
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

  // 화이트리스트 정화 — 빈 입력은 null(답 지움) 수렴.
  const incoming: Record<string, StudentInput | null> = {};
  for (const [questionId, value] of Object.entries(body.data.responses ?? {})) {
    incoming[questionId] = sanitizeStudentInput(value);
  }

  // orderSnapshot 은 할당 시점 고정(재응시 reset 은 토큰 rotate → 이 토큰 소멸)
  // 이라 CAS 재시도 간 불변 — 스냅샷 파스·LIVE 문항 로드는 루프 밖에서 1회.
  const snapshot = parseOrderSnapshot(submission.orderSnapshot);
  if (snapshot.length === 0) {
    return NextResponse.json(
      { error: "시험 문항 정보가 준비되지 않았습니다.", code: "NOT_READY" },
      { status: 409 },
    );
  }

  // 채점 정답 소스 = LIVE Question(설계문서 §1). 삭제·타학원 문항은 자연 제외되고
  // gradeMergedSubmission 이 dropped 로 배점에서도 빼 정합을 지킨다.
  const questionRows = await prisma.question.findMany({
    where: {
      id: { in: snapshot.map((e) => e.questionId) },
      academyId: submission.exam.academyId,
      deletedAt: null,
    },
    select: {
      id: true,
      type: true,
      subType: true,
      options: true,
      correctAnswer: true,
      structuredData: true,
      passage: { select: { content: true } },
    },
  });
  const questions = new Map<string, ScorableQuestionRecord>(
    questionRows.map((q) => [q.id, q]),
  );

  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
    const gate = takingWriteGate(submission);
    if (gate) {
      return NextResponse.json(
        { error: gate.error, code: gate.code },
        { status: gate.httpStatus },
      );
    }

    // 최종 병합(문항 단위 교체·스냅샷 밖 폐기) → 전 문항 서버 채점(AI 0콜).
    const merged = mergeSubmissionResponses({
      snapshot,
      existing: submission.responses,
      incoming,
    });
    const grading = gradeMergedSubmission({
      snapshot,
      merged: merged.responses,
      questions,
    });

    // 미입력(비 MANUAL_ONLY) 문항은 명시 확인 없이는 제출 불가 — 저장 없이 400.
    // missing 은 orderNum 목록뿐(정오·정답 비침해) — 응시면이 해당 문항으로 이동.
    if (grading.missingOrderNums.length > 0 && !body.data.confirmIncomplete) {
      return NextResponse.json(
        {
          error: "답을 입력하지 않은 문항이 있습니다.",
          code: "INCOMPLETE",
          missing: grading.missingOrderNums,
        },
        { status: 400 },
      );
    }
    if (grading.droppedQuestionIds.length > 0) {
      // 할당 후 삭제된 문항 — 채점·배점 제외 사실을 서버 로그로만 남긴다.
      console.warn(
        `[exam-taking] submit ${submission.id}: 삭제된 문항 ${grading.droppedQuestionIds.length}건 채점 제외 (${grading.droppedQuestionIds.join(", ")})`,
      );
    }

    // 상태 확정 — NEEDS_REVIEW·미입력 0 이면 SUBMITTED 를 건너뛰고 즉시 GRADED(§2).
    const now = new Date();
    const graded = grading.allConfirmed;
    const totalScore = grading.scoreSummary.totalScore ?? 0;
    const maxScore = grading.scoreSummary.maxScore ?? 0;

    const updated = await prisma.examSubmission.updateMany({
      where: { id: submission.id, version: submission.version },
      data: {
        responses: toJson(grading.responses),
        scoreSummary: toJson(grading.scoreSummary),
        status: graded ? "GRADED" : "SUBMITTED",
        submittedAt: now,
        version: { increment: 1 },
        // 저장 없이 바로 제출한 경우(ASSIGNED) — 시작 시각도 지금으로 교정.
        ...(submission.status === "ASSIGNED" ? { startedAt: now } : {}),
        // 레거시 점수 컬럼(Int/Int/Float)은 확정 채점(GRADED)일 때만 채운다 —
        // NEEDS_REVIEW 잔존분의 부분합을 확정 점수처럼 보이게 하지 않는다.
        ...(graded
          ? {
              gradedAt: now,
              score: Math.round(totalScore),
              maxScore: Math.round(maxScore),
              percent: maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : null,
            }
          : {}),
      },
    });

    if (updated.count === 1) {
      // 리포트 브리지(W2) — 실패해도 제출 자체는 성공(수동 재동기화 가능). §4.2.
      try {
        await syncSubmissionToReport(submission.id);
      } catch (error) {
        console.error(
          `[exam-taking] submit ${submission.id}: 리포트 브리지 동기화 실패 —`,
          error,
        );
      }
      // 응답 화이트리스트 — 정오·점수·정답 절대 미포함(§6-1). {ok:true} 만.
      return NextResponse.json({ ok: true });
    }

    // version 충돌(마지막 자동저장 경합 등) — 행 재조회 후 재병합·재채점.
    submission = await findTakingSubmission(token);
    if (!submission) {
      return NextResponse.json(
        { error: "응시 링크가 만료되었거나 존재하지 않습니다.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
  }

  return NextResponse.json(
    { error: "제출이 겹쳤습니다. 잠시 후 다시 시도해 주세요.", code: "CONFLICT" },
    { status: 409 },
  );
}
