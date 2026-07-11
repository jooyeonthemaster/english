// ============================================================================
// POST /api/t/enroll/[enrollToken] — 공유 QR 자기등록 (무세션 공개)
//
// 공유 QR 랜딩(/t/e/[enrollToken])에서 학생이 이름 선택 + 코드 확인 후 호출하는
// 유일한 등록 경로. proxy.ts 매처에 /api 최상위가 없어 미들웨어가 돌지 않는다 —
// enrollToken = 접근권한, 스태프 인증 없음. body { studentId, code }.
//
// 흐름: 토큰 형식 → exam(enrollToken) 실존(404) → enrollEnabled(403)/KOREAN(404)
//   가드 → 바디 파싱 → 학생 검증(academyId 스코프 + ACTIVE + 반 스코프) →
//   코드 검증(auth-tutor-student.ts:149-172 미러: bcrypt 우선 + legacy 평문 폴백
//   +백필) → orderSnapshot(live) → ExamSubmission upsert(examId+studentId unique)
//   → { ok, accessToken, redirectPath }.
//
// 보안 계약(설계 §6.9): 코드 검증은 tutor/crypto 재사용(평문 비교는 legacy 폴백
//   +즉시 백필로만). exam.academyId 로 이미 학원 스코프됨(auth 의 academyCode 확인
//   단계는 토큰이 대신한다). 응답에 정오·점수·정답 계열 절대 미포함.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidShareToken, generateShareToken } from "@/lib/exam-report/share-token";
import {
  createStudentCodeLookupHmac,
  hashStudentCode,
  normalizeTutorCode,
  verifyStudentCodeHash,
} from "@/lib/tutor/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  studentId: z.string().min(1).max(64),
  code: z.string().min(1).max(64),
});

// 도메인 배열은 Prisma InputJsonValue 에 직접 대입되지 않는다 — 저장 직전 경계 단언.
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/** examId+studentId 로 기존 자기등록 행 조회(upsert 분기용). */
async function loadSelfEnrollSubmission(examId: string, studentId: string) {
  return prisma.examSubmission.findUnique({
    where: { examId_studentId: { examId, studentId } },
    select: { id: true, status: true, accessToken: true },
  });
}

/**
 * 기존 제출행 존재 시의 응답 조립.
 *  - SUBMITTED/GRADED → 재응시 불가 안내(409 ALREADY_SUBMITTED, accessToken 동봉).
 *  - ASSIGNED/IN_PROGRESS → 기존 응시 재사용(토큰 유지·링크 재활성·모드 갱신).
 *    IN_PROGRESS 의 orderSnapshot 은 응시 무결성상 불변(§2), ASSIGNED 는 최신 문항
 *    구성으로 재고정.
 */
async function respondForExisting(
  row: { id: string; status: string; accessToken: string | null },
  mode: string,
  snapshotJson: Prisma.InputJsonValue,
): Promise<NextResponse> {
  if (row.status === "SUBMITTED" || row.status === "GRADED") {
    return NextResponse.json(
      {
        error: "이미 제출한 시험입니다. 재응시는 담당 선생님께 문의해 주세요.",
        code: "ALREADY_SUBMITTED",
        accessToken: row.accessToken ?? null,
      },
      { status: 409 },
    );
  }

  const token = row.accessToken ?? generateShareToken();
  await prisma.examSubmission.update({
    where: { id: row.id },
    data: {
      mode,
      accessEnabled: true,
      accessToken: token,
      ...(row.status === "IN_PROGRESS" ? {} : { orderSnapshot: snapshotJson }),
    },
  });
  return NextResponse.json({ ok: true, accessToken: token, redirectPath: `/t/${token}` });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ enrollToken: string }> },
) {
  try {
    const { enrollToken } = await params;
    // 형식 불일치 토큰은 존재 여부를 구분하지 않고 404 통일(무차별 탐색 억제).
    if (!isValidShareToken(enrollToken)) {
      return NextResponse.json(
        { error: "등록 링크를 찾을 수 없습니다.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    // 시험 실존 확인을 바디 파싱보다 먼저(형식만 맞는 가짜 토큰으로 거대 JSON 을
    // 통째로 파싱시키는 원가 공격 차단 — /api/answer 관례).
    const exam = await prisma.exam.findFirst({
      where: { enrollToken },
      select: {
        id: true,
        academyId: true,
        classId: true,
        subject: true,
        enrollEnabled: true,
        enrollMode: true,
      },
    });
    // 미존재·국어(자기등록 차단 이중 방어)는 존재를 구분하지 않고 404.
    if (!exam || exam.subject === "KOREAN") {
      return NextResponse.json(
        { error: "등록 링크가 만료되었거나 존재하지 않습니다.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    if (!exam.enrollEnabled) {
      return NextResponse.json(
        {
          error: "지금은 자기등록이 비활성화되어 있습니다. 담당 선생님께 문의해 주세요.",
          code: "DISABLED",
        },
        { status: 403 },
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
        { error: "요청 형식이 올바르지 않습니다.", code: "BAD_REQUEST" },
        { status: 400 },
      );
    }
    const { studentId, code } = body.data;

    // 학생 검증 — exam.academyId 스코프 + ACTIVE. 반 스코프 시험지는 그 반 등록만.
    const studentWhere: Prisma.StudentWhereInput = {
      id: studentId,
      academyId: exam.academyId,
      status: "ACTIVE",
    };
    if (exam.classId) {
      studentWhere.classEnrollments = {
        some: { classId: exam.classId, status: "ENROLLED" },
      };
    }
    const student = await prisma.student.findFirst({
      where: studentWhere,
      select: { id: true, studentCode: true, studentCodeHash: true },
    });
    if (!student) {
      return NextResponse.json(
        { error: "학생을 찾을 수 없습니다. 이름을 다시 선택해 주세요.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    // 코드 검증 — auth-tutor-student.ts:149-172 패턴 미러. academyId 는 exam 스코프.
    const normalizedCode = normalizeTutorCode(code);
    let authed = false;
    if (student.studentCodeHash) {
      authed = await verifyStudentCodeHash(
        exam.academyId,
        normalizedCode,
        student.studentCodeHash,
      );
    }
    if (
      !authed &&
      student.studentCode &&
      normalizeTutorCode(student.studentCode) === normalizedCode
    ) {
      // legacy 평문 일치 → hash/lookup 백필(다음부터 bcrypt 경로로 검증).
      authed = true;
      const lookup = createStudentCodeLookupHmac(exam.academyId, normalizedCode);
      const studentCodeHash = await hashStudentCode(exam.academyId, normalizedCode);
      await prisma.student.update({
        where: { id: student.id },
        data: { studentCodeLookupHmac: lookup, studentCodeHash },
      });
    }
    if (!authed) {
      return NextResponse.json(
        { error: "학생 코드가 일치하지 않습니다.", code: "CODE_MISMATCH" },
        { status: 401 },
      );
    }

    // 할당 시점 문항 순서 고정 — 살아있는 문항만(휴지통 가드), orderNum asc.
    // (assignStudentsToExam 의 orderSnapshot 관례와 동일 — 빌더 재저장/셔플로부터
    //  응시 순서 보호.)
    const snapshot = (
      await prisma.examQuestion.findMany({
        where: { examId: exam.id, question: { deletedAt: null } },
        select: { questionId: true, orderNum: true, points: true },
        orderBy: { orderNum: "asc" },
      })
    ).map((q) => ({ questionId: q.questionId, orderNum: q.orderNum, points: q.points }));
    if (snapshot.length === 0) {
      return NextResponse.json(
        { error: "문항이 없는 시험지는 응시할 수 없습니다.", code: "NO_QUESTIONS" },
        { status: 409 },
      );
    }
    const snapshotJson = toJson(snapshot);
    const mode = exam.enrollMode === "TABLET" ? "TABLET" : "OMR";

    // 자기등록 upsert — examId+studentId unique. 기존 행이면 상태별 분기.
    const existing = await loadSelfEnrollSubmission(exam.id, student.id);
    if (existing) {
      return await respondForExisting(existing, mode, snapshotJson);
    }

    try {
      const accessToken = generateShareToken();
      await prisma.examSubmission.create({
        data: {
          examId: exam.id,
          studentId: student.id,
          status: "ASSIGNED",
          accessToken,
          accessEnabled: true,
          mode,
          orderSnapshot: snapshotJson,
          answers: "{}", // 레거시 NOT NULL text — 신규 경로는 responses 사용
          assignedAt: new Date(),
          assignedBy: "self-enroll",
        },
      });
      return NextResponse.json({
        ok: true,
        accessToken,
        redirectPath: `/t/${accessToken}`,
      });
    } catch (error) {
      // 동시 자기등록 경합 — 다른 요청이 방금 같은 (examId,studentId) 행을 만든 경우
      // 그 행을 재조회해 재사용 경로로 응대(중복 생성 방지).
      if (isUniqueConflict(error)) {
        const raced = await loadSelfEnrollSubmission(exam.id, student.id);
        if (raced) return await respondForExisting(raced, mode, snapshotJson);
      }
      throw error;
    }
  } catch (error) {
    console.error("[exam-enroll] POST 실패 —", error);
    return NextResponse.json(
      { error: "자기등록 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
