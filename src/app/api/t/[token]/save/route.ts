// ============================================================================
// POST /api/t/[token]/save — 응시 중 자동저장 (무인증 공개, 토큰 = 접근권한)
//
// /t/[token] 응시면(태블릿/OMR)의 부분 병합 저장 경로. /api/answer/[token]
// 골격을 미러한다: 토큰 형식 → 행 실존 → 게이트 → 바디 파싱 → version CAS.
// 흐름: sanitizeStudentInput(화이트리스트 정화) → mergeSubmissionResponses
//       (orderSnapshot 밖 questionId 폐기, 문항 단위 교체) →
//       ASSIGNED→IN_PROGRESS 승격(+실제 startedAt) → updateMany CAS(최대 3회).
// 저장 단계에서는 채점하지 않는다 — 채점은 submit 에서만(§6-3).
// 보안 1순위: 응답에 정오/점수/정답 절대 미포함 — {ok, version} 만.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidShareToken } from "@/lib/exam-report/share-token";
import {
  findTakingSubmission,
  mergeSubmissionResponses,
  parseOrderSnapshot,
  sanitizeStudentInput,
  takingWriteGate,
} from "@/lib/exam-scoring/taking-payload";
import type { StudentInput } from "@/lib/exam-scoring/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** version CAS 충돌(자동저장 경합·강사 조작) 시 재조회-재적용 상한. */
const CAS_MAX_ATTEMPTS = 3;

// 바디 상한 — 무인증 쓰기 경로의 저장 비대화·파싱 원가 방어. 세부 정화(트림·
// 빈값 null 수렴)는 sanitizeStudentInput 이 담당하므로 여기서는 코스 게이트만.
const studentInputSchema = z
  .object({
    choice: z.string().max(24).optional(),
    choices: z.array(z.string().max(24)).max(20).optional(),
    texts: z.record(z.string().max(64), z.string().max(4000)).optional(),
  })
  .nullable();

const bodySchema = z
  .object({
    responses: z.record(z.string().min(1).max(64), studentInputSchema),
    /** 클라가 아는 세션 버전(진단 힌트) — 병합이 문항 단위 교체라 강제하지 않는다 */
    clientVersion: z.number().int().nonnegative().optional(),
  })
  .refine(
    (b) => {
      const n = Object.keys(b.responses).length;
      return n >= 1 && n <= 300;
    },
    { message: "responses 크기가 허용 범위를 벗어났습니다." },
  );

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

  // 행 실존 확인을 바디 파싱보다 먼저 — 형식만 맞는 가짜 토큰으로 거대 JSON 을
  // 파싱하게 만드는 원가 공격 차단(/api/answer 미러). 미존재 토큰은 즉시 404.
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
      { error: "저장 형식이 올바르지 않습니다.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  // 화이트리스트 정화 — 빈 입력({}·공백뿐)은 null(답 지움)로 수렴.
  const incoming: Record<string, StudentInput | null> = {};
  for (const [questionId, value] of Object.entries(body.data.responses)) {
    incoming[questionId] = sanitizeStudentInput(value);
  }

  // CAS 루프 — 병렬 쓰기(자동저장 경합·강사 링크 회수)와 충돌하면 최신 행을 다시
  // 읽어 병합을 재적용한다. 게이트는 재조회 경로에서도 매번 재확인.
  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
    const gate = takingWriteGate(submission);
    if (gate) {
      return NextResponse.json(
        { error: gate.error, code: gate.code },
        { status: gate.httpStatus },
      );
    }

    const snapshot = parseOrderSnapshot(submission.orderSnapshot);
    if (snapshot.length === 0) {
      // orderSnapshot 없는 행 = 할당 파손(정상 경로에선 불가) — 저장 불가 안내.
      return NextResponse.json(
        { error: "시험 문항 정보가 준비되지 않았습니다.", code: "NOT_READY" },
        { status: 409 },
      );
    }

    const { responses, applied } = mergeSubmissionResponses({
      snapshot,
      existing: submission.responses,
      incoming,
    });
    // 전 entry 폐기(스냅샷 밖 questionId 뿐)면 DB 무변경 — 쓰기 자체를 생략해
    // 무의미 POST 반복의 version 스팸(제출·강사 CAS 방해 DoS)을 차단.
    if (applied === 0) {
      return NextResponse.json({ ok: true, version: submission.version });
    }

    // 첫 저장 = 응시 시작. startedAt 은 default(now()) 행 생성 잔재를 실제
    // 시작 시각으로 교정한다(ASSIGNED 일 때만).
    const wasAssigned = submission.status === "ASSIGNED";
    const updated = await prisma.examSubmission.updateMany({
      where: { id: submission.id, version: submission.version },
      data: {
        responses: toJson(responses),
        version: { increment: 1 },
        ...(wasAssigned ? { status: "IN_PROGRESS", startedAt: new Date() } : {}),
      },
    });
    if (updated.count === 1) {
      // 응답 화이트리스트 — 정오/점수/정답 계열 절대 미포함(§6-1).
      return NextResponse.json({ ok: true, version: submission.version + 1 });
    }

    // version 충돌 — 행 재조회(그 사이 회수/삭제됐으면 404 강등).
    submission = await findTakingSubmission(token);
    if (!submission) {
      return NextResponse.json(
        { error: "응시 링크가 만료되었거나 존재하지 않습니다.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
  }

  return NextResponse.json(
    { error: "저장이 겹쳤습니다. 잠시 후 다시 시도해 주세요.", code: "CONFLICT" },
    { status: 409 },
  );
}
