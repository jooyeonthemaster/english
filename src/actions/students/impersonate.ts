"use server";

// ============================================================================
// 학생 앱 대리 접속 — 원장/강사가 학생 상세에서 그 학생의 /g 세션을 발급
//
// 학생 세션(grammar-drill-session)은 기기 한도 없는 경량 JWT 쿠키라
// 발급해도 학생 본인 기기의 세션·기기 슬롯에 영향이 없다(파괴 권한 없음,
// 자기 학습 데이터 기록만). 같은 브라우저의 기존 학생 세션은 교체된다 —
// 원장 브라우저에서 "이 학생으로 보기"가 의도된 동작.
// ============================================================================

import { cookies } from "next/headers";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  GRAMMAR_DRILL_COOKIE,
  sessionCookieOptions,
  signGrammarSession,
} from "@/lib/grammar-drill/auth";

export interface OpenStudentAppResult {
  success: boolean;
  error?: string;
}

export interface StudentAppAccessInfo {
  academyCode: string;
  studentName: string;
}

/**
 * 학생 앱 로그인 링크 조립 재료 — 학원코드(Academy.code)와 학생 이름.
 * 학생 코드는 상세 페이지가 이미 들고 있으므로 여기선 나머지만 준다.
 */
export async function getStudentAppAccessInfo(
  studentId: string,
): Promise<{ success: boolean; data?: StudentAppAccessInfo; error?: string }> {
  try {
    const staff = await requireStaffAuth();
    const [academy, student] = await Promise.all([
      prisma.academy.findUnique({
        where: { id: staff.academyId },
        select: { code: true },
      }),
      prisma.student.findFirst({
        where: { id: studentId, academyId: staff.academyId },
        select: { name: true },
      }),
    ]);
    if (!academy?.code || !student) {
      return { success: false, error: "학원 코드를 불러오지 못했습니다." };
    }
    return {
      success: true,
      data: { academyCode: academy.code, studentName: student.name },
    };
  } catch {
    return { success: false, error: "학원 코드를 불러오지 못했습니다." };
  }
}

/**
 * 해당 학생의 학생 앱 세션 쿠키를 이 브라우저에 발급한다.
 * 성공 후 클라이언트가 /g/home 을 새 탭으로 연다(쿠키는 도메인 공유).
 */
export async function openStudentAppSession(
  studentId: string,
): Promise<OpenStudentAppResult> {
  try {
    const staff = await requireStaffAuth();
    const student = await prisma.student.findFirst({
      where: { id: studentId, academyId: staff.academyId },
      select: {
        id: true,
        name: true,
        grade: true,
        status: true,
        academy: { select: { id: true, name: true } },
      },
    });
    if (!student) {
      return { success: false, error: "학생을 찾을 수 없습니다." };
    }
    // 학생 로그인(verifyGrammarLogin)과 동일 정책 — ACTIVE 만 발급
    if (student.status !== "ACTIVE") {
      return { success: false, error: "재원 중인 학생만 학생 앱에 접속할 수 있습니다." };
    }
    const token = await signGrammarSession({
      studentId: student.id,
      academyId: student.academy.id,
      studentName: student.name,
      academyName: student.academy.name,
      grade: student.grade,
    });
    (await cookies()).set(GRAMMAR_DRILL_COOKIE, token, sessionCookieOptions());
    return { success: true };
  } catch {
    return { success: false, error: "학생 앱 세션 발급에 실패했습니다." };
  }
}
