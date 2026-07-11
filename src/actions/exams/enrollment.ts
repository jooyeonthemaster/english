"use server";

// ============================================================================
// 공유 QR 자기등록 — 스태프 설정 서버액션 (26-07-09 Wave-3, 설계 §6.9 / E1)
//
// 시험지 1개당 공유 등록 토큰(Exam.enrollToken, unique) 1개. 인쇄 시험지에 QR 를
// 실어 배포 → 학생이 스캔 → /t/e/[enrollToken] 랜딩에서 이름 선택 + 코드 확인 →
// ExamSubmission 자기등록. 개별 링크(assignStudentsToExam) 모델과 공존한다.
//
// 이 파일은 그 중 "스태프 설정" 국면만 담당한다: 자기등록 활성/비활성 토글 +
// 기본 응시 모드 지정 + 토큰 발급/조회. 실제 학생 자기등록(공개 POST)·이름 검색
// (공개 GET)은 무세션 공개면이라 /api/t/enroll/[enrollToken] 라우트 소관.
//
// 계약(설계 §6):
//  - 전 액션 requireStaffAuth + exam.academyId 교차검증(타 학원 시험지 접근 차단).
//  - KOREAN 시험지는 자기등록 차단(v1 범위 외) — 활성화 입구에서 봉쇄.
//  - enrollToken 은 활성화 시점에만 발급하고, 한 번 발급되면 비활성화해도 유지한다
//    (재활성 시 QR·링크가 안정적으로 되살아나도록 — 시험당 1개 unique 토큰).
//  - assignments.ts 관례(AssignmentActionResult 봉투·revalidateExamPaths) 승계.
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateShareToken } from "@/lib/exam-report/share-token";
import { getSiteUrl } from "@/lib/growth/constants";
import {
  isAssignMode,
  revalidateExamPaths,
  toErrorMessage,
  type AssignmentActionResult,
  type ExamAssignMode,
} from "./_assignments-shared";

// 자기등록 기본 응시 모드는 개별 배포 모드와 동일 집합("OMR" | "TABLET") — 계약 공유.
export type { ExamAssignMode } from "./_assignments-shared";
export type ExamEnrollMode = ExamAssignMode;

/** getExamEnrollment / setExamEnrollment 반환 — E3 배포모달 QR 섹션이 소비 */
export interface ExamEnrollmentInfo {
  /** 자기등록 활성 여부(Exam.enrollEnabled) */
  enabled: boolean;
  /** 자기등록 학생 기본 응시 모드(기본 "OMR") */
  mode: ExamAssignMode;
  /** 공유 등록 토큰 — 아직 발급 전이면 null */
  enrollToken: string | null;
  /** 랜딩 절대 URL(QR 인코딩 대상) — 토큰 없으면 null */
  enrollUrl: string | null;
}

/** 공유 자기등록 랜딩 절대 URL — QR 인코딩·링크 복사 대상 */
function buildEnrollUrl(token: string): string {
  return `${getSiteUrl()}/t/e/${token}`;
}

/**
 * 자기등록 설정 갱신 — 활성/비활성 토글 + 기본 모드 지정.
 * 활성화 시 토큰이 없으면 발급한다. 반환은 갱신 후 상태(enrollToken/enrollUrl 포함).
 */
export async function setExamEnrollment(input: {
  examId: string;
  enabled: boolean;
  mode?: ExamAssignMode;
}): Promise<AssignmentActionResult<ExamEnrollmentInfo>> {
  try {
    const staff = await requireStaffAuth();
    if (input.mode !== undefined && !isAssignMode(input.mode)) {
      return { success: false, error: "올바르지 않은 응시 모드입니다." };
    }

    const exam = await prisma.exam.findFirst({
      where: { id: input.examId, academyId: staff.academyId },
      select: {
        id: true,
        subject: true,
        enrollToken: true,
        enrollEnabled: true,
        enrollMode: true,
      },
    });
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };
    if (exam.subject === "KOREAN") {
      // KO 시험지는 v1 자기등록 범위 외 — 액션+UI 이중 차단의 액션 축.
      return {
        success: false,
        error: "국어 시험지는 공유 QR 배포를 지원하지 않습니다.",
      };
    }

    const enabled = input.enabled === true;
    // 모드 결정: 명시 입력 우선, 없으면 기존값 보존, 그것도 없으면 기본 "OMR".
    const resolvedMode: ExamAssignMode = isAssignMode(input.mode)
      ? input.mode
      : isAssignMode(exam.enrollMode)
        ? exam.enrollMode
        : "OMR";
    // 토큰은 활성화 시점에만 발급하고, 발급된 토큰은 비활성화해도 유지한다.
    const enrollToken = exam.enrollToken ?? (enabled ? generateShareToken() : null);

    await prisma.exam.update({
      where: { id: exam.id },
      data: {
        enrollEnabled: enabled,
        enrollMode: resolvedMode,
        // 새로 발급된 토큰만 기록(기존 토큰은 덮어쓰지 않음 — unique 안정성).
        ...(enrollToken && enrollToken !== exam.enrollToken ? { enrollToken } : {}),
      },
    });

    revalidateExamPaths(input.examId);
    return {
      success: true,
      data: {
        enabled,
        mode: resolvedMode,
        enrollToken,
        enrollUrl: enrollToken ? buildEnrollUrl(enrollToken) : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "공유 QR 설정 중 오류가 발생했습니다."),
    };
  }
}

/** 현재 자기등록 설정 조회 — E3 배포모달 초기 상태 로드용. */
export async function getExamEnrollment(
  examId: string,
): Promise<AssignmentActionResult<ExamEnrollmentInfo>> {
  try {
    const staff = await requireStaffAuth();
    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      select: {
        id: true,
        enrollToken: true,
        enrollEnabled: true,
        enrollMode: true,
      },
    });
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };

    const mode: ExamAssignMode = isAssignMode(exam.enrollMode) ? exam.enrollMode : "OMR";
    return {
      success: true,
      data: {
        enabled: exam.enrollEnabled,
        mode,
        enrollToken: exam.enrollToken,
        enrollUrl: exam.enrollToken ? buildEnrollUrl(exam.enrollToken) : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "공유 QR 설정 조회 중 오류가 발생했습니다."),
    };
  }
}
