"use server";

// ============================================================================
// 시험지 배포 — 응시 학생 할당 서버액션 (26-07-09 시험지 배포·OMR 대개편, 설계 §4.1)
//
// ExamSubmission 1행 = 시험×학생의 전 수명주기(ASSIGNED→IN_PROGRESS→SUBMITTED→
// GRADED). 이 파일은 그 중 "할당" 국면(생성·모드변경·링크 토글·토큰 회전·해제·
// 초기화)만 담당한다. 채점/검토는 submission-review.ts(별도 유닛), 학생 응시는
// /api/t/[token](별도 유닛) 소관. 타입 계약·동기 헬퍼는 _assignments-shared.ts.
//
// 계약(설계 §6):
//  - 전 액션 requireStaffAuth + academyId 교차검증(exam.academyId===staff.academyId,
//    student.academyId 동일). submissionId 단건 액션은 exam 릴레이션 경유로 가드.
//  - KOREAN 시험지는 배포 차단(v1 범위 외) — 할당 생성 입구에서 봉쇄.
//  - orderSnapshot 은 할당 시점의 ExamQuestion(살아있는 문항, orderNum asc) 고정 —
//    빌더 재저장(deleteMany→createMany 전면 재작성)·셔플로부터 응시 순서를 보호.
//    IN_PROGRESS 행의 orderSnapshot 은 절대 갱신하지 않는다(응시 중 순서 변경 금지).
//  - 레거시 무회귀: answers(NOT NULL text)·startedAt(NOT NULL) 등 구 컬럼은
//    형식만 채운다. exam-taking.ts 경로가 읽는 값의 의미는 바꾸지 않는다.
//  - 이 액션이 반환하는 데이터는 강사(세션)면 전용 — 학생 공개면 페이로드 아님.
// ============================================================================

import { Prisma } from "@prisma/client";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateShareToken } from "@/lib/exam-report/share-token";
import {
  isAssignMode, isoOf, loadOwnedExam, loadOwnedSubmission,
  revalidateExamPaths, summarizeScore, toErrorMessage, tokenPathOf,
  type AssignmentActionResult, type AssignResultData, type AssignResultRow,
  type AssignableStudentsData, type ExamAssignMode, type ExamAssignmentItem,
  type OrderSnapshotEntry,
} from "./_assignments-shared";

// 타입 재export(컴파일 시 소거 — "use server" 검증과 무관). 외부 유닛은 이 경로
// 하나로 액션+타입을 임포트한다.
export type {
  AssignmentActionResult, AssignResultData, AssignResultRow,
  AssignableStudentItem, AssignableStudentsData, ExamAssignMode,
  ExamAssignmentItem, OrderSnapshotEntry, ScoreSummaryBrief,
} from "./_assignments-shared";

// ── 조회 액션 ────────────────────────────────────────────────────────────────

/**
 * 시험지의 할당 현황 목록 — 할당분(assignedAt 기록 또는 status ASSIGNED) 전부.
 * 레거시 exam-taking 행(assignedAt null·IN_PROGRESS)은 자연히 제외돼 무회귀.
 * 정렬은 학생 이름(orderNum 무관 — 명부 화면 관례).
 */
export async function getExamAssignments(
  examId: string,
): Promise<AssignmentActionResult<ExamAssignmentItem[]>> {
  try {
    const staff = await requireStaffAuth();
    const exam = await loadOwnedExam(examId, staff.academyId);
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };

    const rows = await prisma.examSubmission.findMany({
      where: {
        examId,
        OR: [{ assignedAt: { not: null } }, { status: "ASSIGNED" }],
      },
      select: {
        id: true,
        studentId: true,
        status: true,
        mode: true,
        accessToken: true,
        accessEnabled: true,
        scoreSummary: true,
        assignedAt: true,
        startedAt: true,
        submittedAt: true,
        gradedAt: true,
        examReportStudentId: true,
        student: {
          select: {
            name: true,
            studentCode: true,
            grade: true,
            school: { select: { name: true } },
          },
        },
      },
      orderBy: { student: { name: "asc" } },
    });

    // 리포트 딥링크용 analysisId 해소 — examReportStudentId 는 soft-ref(FK 미설정)라
    // ExamReportStudent 를 별도 조회한다. 테넌트 스코프(academyId) + 미삭제만 —
    // 삭제된 리포트 학생은 링크가 깨지므로 analysisId 를 비워 허브 폴백으로 강등.
    const reportStudentIds = [
      ...new Set(rows.map((r) => r.examReportStudentId).filter((id): id is string => !!id)),
    ];
    const analysisByReportStudent = new Map<string, string>();
    if (reportStudentIds.length > 0) {
      const reportStudents = await prisma.examReportStudent.findMany({
        where: { id: { in: reportStudentIds }, academyId: staff.academyId, deletedAt: null },
        select: { id: true, examAnalysisId: true },
      });
      for (const rs of reportStudents) analysisByReportStudent.set(rs.id, rs.examAnalysisId);
    }

    const data: ExamAssignmentItem[] = rows.map((row) => ({
      submissionId: row.id,
      studentId: row.studentId,
      studentName: row.student.name,
      studentCode: row.student.studentCode,
      grade: row.student.grade,
      schoolName: row.student.school?.name ?? null,
      status: row.status,
      mode: row.mode,
      accessEnabled: row.accessEnabled,
      tokenPath: tokenPathOf(row.accessToken),
      scoreSummary: summarizeScore(row.scoreSummary),
      assignedAt: isoOf(row.assignedAt),
      // 스키마상 startedAt 은 NOT NULL(default now)이라 ASSIGNED 상태에선 의미 없음 —
      // 응시 시작 여부는 status 로 판정하고, 여기서는 IN_PROGRESS 이후에만 노출한다.
      startedAt: row.status === "ASSIGNED" ? null : isoOf(row.startedAt),
      submittedAt: isoOf(row.submittedAt),
      gradedAt: isoOf(row.gradedAt),
      reportStudentId: row.examReportStudentId ?? null,
      reportAnalysisId: row.examReportStudentId
        ? (analysisByReportStudent.get(row.examReportStudentId) ?? null)
        : null,
    }));

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "할당 현황 조회 중 오류가 발생했습니다."),
    };
  }
}

/**
 * 할당 대상 로스터 — ACTIVE 학생 + 반 필터 + 이름/학생코드 검색.
 * 이미 할당된 학생은 플래그로 표시(체크박스 비활성/상태칩용). 반 목록 동봉.
 */
export async function getAssignableStudents(input: {
  examId: string;
  search?: string;
  classId?: string;
}): Promise<AssignmentActionResult<AssignableStudentsData>> {
  try {
    const staff = await requireStaffAuth();
    const exam = await loadOwnedExam(input.examId, staff.academyId);
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };

    const where: Record<string, unknown> = {
      academyId: staff.academyId,
      status: "ACTIVE",
    };
    const search = input.search?.trim();
    if (search) {
      // 로스터 검색 관례(students/queries.getStudents) 미러 — 이름 + 학생코드.
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { studentCode: { contains: search, mode: "insensitive" } },
      ];
    }
    if (input.classId) {
      // classId 는 학생의 academyId 스코프 안에서만 매칭되므로(등록은 자기 학원 반에만
      // 존재) 타 학원 classId 를 넘겨도 빈 결과가 될 뿐 교차 노출은 불가능하다.
      where.classEnrollments = {
        some: { classId: input.classId, status: "ENROLLED" },
      };
    }

    const [students, submissions, classes] = await Promise.all([
      prisma.student.findMany({
        where,
        select: {
          id: true,
          name: true,
          studentCode: true,
          grade: true,
          school: { select: { name: true } },
          classEnrollments: {
            where: { status: "ENROLLED" },
            select: { class: { select: { id: true, name: true } } },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.examSubmission.findMany({
        where: { examId: input.examId },
        select: { studentId: true, status: true },
      }),
      prisma.class.findMany({
        where: { academyId: staff.academyId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const statusByStudent = new Map(submissions.map((s) => [s.studentId, s.status]));
    const data: AssignableStudentsData = {
      students: students.map((s) => ({
        id: s.id,
        name: s.name,
        studentCode: s.studentCode,
        grade: s.grade,
        schoolName: s.school?.name ?? null,
        classes: s.classEnrollments.map((e) => e.class),
        alreadyAssigned: statusByStudent.has(s.id),
        assignmentStatus: statusByStudent.get(s.id) ?? null,
      })),
      classes,
    };
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "학생 목록 조회 중 오류가 발생했습니다."),
    };
  }
}

// ── 할당 생성/갱신 ────────────────────────────────────────────────────────────

/**
 * 학생 일괄 할당. 학생별 upsert 규칙:
 *  - 행 없음 → 신규 생성(ASSIGNED, 토큰 발급, accessEnabled true, orderSnapshot 고정).
 *  - ASSIGNED → mode·orderSnapshot·할당 메타 갱신(재할당 = 링크 재활성화).
 *  - IN_PROGRESS → mode 만 갱신. 진행 중 답안·orderSnapshot 은 절대 보존
 *    (응시 중 문항 순서 변경 금지 — 설계 §2 무결성 계약).
 *  - SUBMITTED/GRADED → 건너뛰고 skipped 로 보고(재응시는 resetSubmission 경유).
 */
export async function assignStudentsToExam(input: {
  examId: string;
  studentIds: string[];
  mode: ExamAssignMode;
}): Promise<AssignmentActionResult<AssignResultData>> {
  try {
    const staff = await requireStaffAuth();
    if (!isAssignMode(input.mode)) {
      return { success: false, error: "올바르지 않은 응시 모드입니다." };
    }
    const studentIds = [...new Set(input.studentIds)].filter(Boolean);
    if (studentIds.length === 0) {
      return { success: false, error: "할당할 학생을 선택해 주세요." };
    }

    const exam = await loadOwnedExam(input.examId, staff.academyId);
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };
    if (exam.subject === "KOREAN") {
      // KO 시험지는 v1 배포 범위 외(설계 §6-7) — 액션+UI 이중 차단의 액션 축.
      return {
        success: false,
        error: "국어 시험지는 아직 태블릿 배포를 지원하지 않습니다.",
      };
    }

    // 학생 테넌트 교차검증 — 하나라도 타 학원/미존재면 전체 거부(_helpers 관례).
    const ownedStudents = await prisma.student.findMany({
      where: { id: { in: studentIds }, academyId: staff.academyId },
      select: { id: true },
    });
    if (ownedStudents.length !== studentIds.length) {
      return { success: false, error: "일부 학생이 이 학원에 속하지 않습니다." };
    }

    // 할당 시점 문항 순서 고정 — 살아있는 문항만(휴지통 가드), orderNum asc.
    const snapshot: OrderSnapshotEntry[] = (
      await prisma.examQuestion.findMany({
        where: { examId: input.examId, question: { deletedAt: null } },
        select: { questionId: true, orderNum: true, points: true },
        orderBy: { orderNum: "asc" },
      })
    ).map((q) => ({ questionId: q.questionId, orderNum: q.orderNum, points: q.points }));
    if (snapshot.length === 0) {
      return { success: false, error: "문항이 없는 시험지는 배포할 수 없습니다." };
    }
    const snapshotJson = snapshot as unknown as Prisma.InputJsonValue;

    const existing = await prisma.examSubmission.findMany({
      where: { examId: input.examId, studentId: { in: studentIds } },
      select: {
        id: true,
        studentId: true,
        status: true,
        accessToken: true,
        assignedAt: true,
      },
    });
    const existingByStudent = new Map(existing.map((row) => [row.studentId, row]));

    const now = new Date();
    const resultSelect = {
      id: true,
      studentId: true,
      status: true,
      mode: true,
      accessToken: true,
    } as const;
    // 쓰기 계획. CREATE/IN_PROGRESS 는 행을 select 로 돌려받아 결과를 구성(kind:"row").
    // ASSIGNED 재할당은 상태 가드 CAS(kind:"cas", updateMany) — existing 를 트랜잭션
    // 밖에서 읽으므로(TOCTOU), 그 사이 학생이 응시를 시작(ASSIGNED→IN_PROGRESS, save
    // route 승격)했으면 where:{status:"ASSIGNED"} 가 0행 매칭돼 안전 스킵된다. update
    // (by-id)는 이미 IN_PROGRESS 가 된 행의 orderSnapshot 을 덮어써 §2 를 위반하므로 금지.
    type WriteEntry =
      | {
          kind: "row";
          action: AssignResultRow["action"];
          run: Prisma.PrismaPromise<{
            id: string;
            studentId: string;
            status: string;
            mode: string | null;
            accessToken: string | null;
          }>;
        }
      | {
          kind: "cas";
          studentId: string;
          /** CAS 성공(1행) 시 확정 결과 — 0행 매칭이면 skipped 로 강등 */
          row: AssignResultRow;
          run: Prisma.PrismaPromise<{ count: number }>;
        };
    const writes: WriteEntry[] = [];
    const skipped: AssignResultData["skipped"] = [];

    for (const studentId of studentIds) {
      const row = existingByStudent.get(studentId);

      if (!row) {
        writes.push({
          kind: "row",
          action: "CREATED",
          run: prisma.examSubmission.create({
            data: {
              examId: input.examId,
              studentId,
              status: "ASSIGNED",
              accessToken: generateShareToken(),
              accessEnabled: true,
              mode: input.mode,
              orderSnapshot: snapshotJson,
              assignedAt: now,
              assignedBy: staff.id,
              answers: "{}", // 레거시 NOT NULL text — 신규 경로는 responses 사용
            },
            select: resultSelect,
          }),
        });
        continue;
      }

      if (row.status === "ASSIGNED") {
        // 상태 가드 CAS — where 에 status:"ASSIGNED" 를 박아, findMany 이후 응시가
        // 시작돼 IN_PROGRESS 로 승격됐으면 0행 매칭(안전 스킵)된다. update(by-id)는
        // 이미 IN_PROGRESS 가 된 행의 orderSnapshot 을 덮어써 §2 를 위반하므로 금지.
        const token = row.accessToken ?? generateShareToken(); // 결손 보수(토큰 없으면 발급)
        writes.push({
          kind: "cas",
          studentId,
          row: {
            studentId,
            submissionId: row.id,
            action: "UPDATED",
            status: "ASSIGNED",
            mode: input.mode,
            tokenPath: tokenPathOf(token),
          },
          run: prisma.examSubmission.updateMany({
            where: { id: row.id, status: "ASSIGNED" },
            data: {
              mode: input.mode,
              orderSnapshot: snapshotJson, // 미응시 상태 — 최신 문항 구성으로 재고정
              assignedAt: now,
              assignedBy: staff.id,
              accessEnabled: true, // 재할당 = 링크 재활성 의사로 간주(회수 해제)
              accessToken: token,
            },
          }),
        });
        continue;
      }

      if (row.status === "IN_PROGRESS") {
        writes.push({
          kind: "row",
          action: "UPDATED",
          run: prisma.examSubmission.update({
            where: { id: row.id },
            data: {
              mode: input.mode,
              // orderSnapshot·responses·accessEnabled 불변 — 진행 중 답안 보존.
              // 레거시 행 결손만 보수(토큰 없으면 발급, 할당 메타 없으면 스탬프).
              accessToken: row.accessToken ?? generateShareToken(),
              assignedAt: row.assignedAt ?? now,
              assignedBy: staff.id,
            },
            select: resultSelect,
          }),
        });
        continue;
      }

      // SUBMITTED / GRADED — 답안·채점이 실린 행은 여기서 덮어쓰지 않는다.
      skipped.push({
        studentId,
        reason:
          row.status === "GRADED"
            ? "이미 채점이 완료된 응시입니다. 재응시는 초기화 후 진행해 주세요."
            : "이미 제출된 응시입니다. 재응시는 초기화 후 진행해 주세요.",
      });
    }

    const results = writes.length
      ? await prisma.$transaction(writes.map((w) => w.run))
      : [];

    const assigned: AssignResultRow[] = [];
    results.forEach((result, index) => {
      const write = writes[index];
      if (write.kind === "cas") {
        // 0행 = findMany 이후 응시 시작 등으로 상태가 바뀜 — 재할당을 건너뛴다
        // (진행 중 orderSnapshot 을 덮어쓰지 않음, 설계 §2 무결성 계약).
        if ((result as { count: number }).count === 0) {
          skipped.push({
            studentId: write.studentId,
            reason:
              "학생 응시 상태가 방금 변경되어 재할당을 건너뛰었습니다. 필요하면 새로고침 후 다시 시도해 주세요.",
          });
          return;
        }
        assigned.push(write.row);
        return;
      }
      const row = result as {
        id: string;
        studentId: string;
        status: string;
        mode: string | null;
        accessToken: string | null;
      };
      assigned.push({
        studentId: row.studentId,
        submissionId: row.id,
        action: write.action,
        status: row.status,
        mode: row.mode,
        tokenPath: tokenPathOf(row.accessToken),
      });
    });

    revalidateExamPaths(input.examId);
    return { success: true, data: { assigned, skipped } };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "학생 할당 중 오류가 발생했습니다."),
    };
  }
}

// ── 단건 갱신/해제 액션 ──────────────────────────────────────────────────────

/** 할당 해제 — 미응시(ASSIGNED)만 삭제 허용. 응시 흔적이 있는 행은 초기화 경유. */
export async function unassignStudent(
  submissionId: string,
): Promise<AssignmentActionResult> {
  try {
    const staff = await requireStaffAuth();
    const submission = await loadOwnedSubmission(submissionId, staff.academyId);
    if (!submission) return { success: false, error: "응시 정보를 찾을 수 없습니다." };
    if (submission.status !== "ASSIGNED") {
      return { success: false, error: "응시가 시작된 학생은 초기화만 가능합니다." };
    }

    await prisma.examSubmission.delete({ where: { id: submission.id } });
    // 통합 과제 브리지 해제 — StudyAssignmentTask 가 방금 삭제된 submission id 를
    // soft-ref 로 물고 있으면 라이브 상태 조인(loadTaskLiveMap)이 영구 실패하는 좀비
    // 태스크가 된다. 브리지를 끊고 ASSIGNED 로 되돌려 "미응시 배정"으로 정상 표시
    // (과제·태스크 자체는 보존 — 삭제는 deleteStudyAssignment 소관).
    await prisma.studyAssignmentTask.updateMany({
      where: { examSubmissionId: submission.id, academyId: staff.academyId },
      data: { examSubmissionId: null, status: "ASSIGNED" },
    });
    revalidateExamPaths(submission.examId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "할당 해제 중 오류가 발생했습니다."),
    };
  }
}

/**
 * 응시 초기화(재응시) — 어떤 상태든 답안·채점 산출물을 비우고 ASSIGNED 로 되돌린다.
 * 토큰은 rotate(구 링크 즉시 무효)·version+1(CAS — 떠 있는 구 세션의 저장/제출 차단).
 *
 * 리포트 이력 보존(설계 확정): examReportStudentId 링크와 그 ExamReportStudent 의
 * responses/scoreSummary/gradingConfirmed 는 건드리지 않는다 — 이미 발행된 리포트
 * 기록은 학습 이력 자산이며, 재응시 채점 완료 시 브리지(syncSubmissionToReport)가
 * 새 결과로 갱신한다.
 */
export async function resetSubmission(
  submissionId: string,
): Promise<AssignmentActionResult<{ submissionId: string; tokenPath: string }>> {
  try {
    const staff = await requireStaffAuth();
    const submission = await loadOwnedSubmission(submissionId, staff.academyId);
    if (!submission) return { success: false, error: "응시 정보를 찾을 수 없습니다." };

    const nextToken = generateShareToken();
    await prisma.examSubmission.update({
      where: { id: submission.id },
      data: {
        responses: Prisma.DbNull,
        scoreSummary: Prisma.DbNull,
        score: null,
        maxScore: null, // score/percent 와 한 벌인 채점 산출물 — 잔존 시 목록 오표시
        percent: null,
        answers: "{}", // 레거시 NOT NULL text
        status: "ASSIGNED",
        accessToken: nextToken,
        accessEnabled: true, // 초기화 목적 = 재응시 — 링크 재활성
        // startedAt 은 스키마 NOT NULL(default now) — null 불가라 재스탬프.
        // ASSIGNED 복귀로 의미는 무효화되고, 재응시 시작 시 /t 경로가 다시 갱신한다.
        startedAt: new Date(),
        submittedAt: null,
        gradedAt: null,
        gradedBy: null,
        version: { increment: 1 },
        // examReportStudentId 유지 — 리포트 이력 보존(위 doc 주석).
      },
    });

    revalidateExamPaths(submission.examId);
    return {
      success: true,
      data: { submissionId: submission.id, tokenPath: `/t/${nextToken}` },
    };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "응시 초기화 중 오류가 발생했습니다."),
    };
  }
}

/** 응시 모드 단건 변경 — 제출/채점 완료 후에는 무의미하므로 차단(초기화 경유). */
export async function setAssignmentMode(
  submissionId: string,
  mode: ExamAssignMode,
): Promise<AssignmentActionResult> {
  try {
    const staff = await requireStaffAuth();
    if (!isAssignMode(mode)) {
      return { success: false, error: "올바르지 않은 응시 모드입니다." };
    }
    const submission = await loadOwnedSubmission(submissionId, staff.academyId);
    if (!submission) return { success: false, error: "응시 정보를 찾을 수 없습니다." };
    if (submission.status !== "ASSIGNED" && submission.status !== "IN_PROGRESS") {
      return {
        success: false,
        error: "제출된 응시는 모드를 변경할 수 없습니다. 초기화 후 변경해 주세요.",
      };
    }

    await prisma.examSubmission.update({
      where: { id: submission.id },
      data: { mode },
    });
    revalidateExamPaths(submission.examId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "응시 모드 변경 중 오류가 발생했습니다."),
    };
  }
}

/** 응시 링크 활성/회수 토글 — 어떤 상태든 허용(제출 후 링크 봉쇄 용도 포함). */
export async function toggleAccess(
  submissionId: string,
  enabled: boolean,
): Promise<AssignmentActionResult> {
  try {
    const staff = await requireStaffAuth();
    const submission = await loadOwnedSubmission(submissionId, staff.academyId);
    if (!submission) return { success: false, error: "응시 정보를 찾을 수 없습니다." };

    await prisma.examSubmission.update({
      where: { id: submission.id },
      data: { accessEnabled: enabled === true },
    });
    revalidateExamPaths(submission.examId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "응시 링크 설정 중 오류가 발생했습니다."),
    };
  }
}

/** 응시 링크 토큰 재발급 — 구 링크 즉시 무효(유출 대응). 새 상대경로 반환. */
export async function rotateToken(
  submissionId: string,
): Promise<AssignmentActionResult<{ tokenPath: string }>> {
  try {
    const staff = await requireStaffAuth();
    const submission = await loadOwnedSubmission(submissionId, staff.academyId);
    if (!submission) return { success: false, error: "응시 정보를 찾을 수 없습니다." };

    const nextToken = generateShareToken();
    await prisma.examSubmission.update({
      where: { id: submission.id },
      data: { accessToken: nextToken },
    });
    revalidateExamPaths(submission.examId);
    return { success: true, data: { tokenPath: `/t/${nextToken}` } };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "토큰 재발급 중 오류가 발생했습니다."),
    };
  }
}
