"use server";

// ============================================================================
// 통합 학습 과제 — 배포 콘텐츠 피커 조회 (과제 컴포저 전용)
//
// 컴포저에서 "무엇을 배포할지" 고르는 목록. KOREAN 시험지는 배포 범위 외라
// 제외한다(mutations.createStudyAssignment 의 차단과 이중 방어).
//
// 폴더 계약: 시험지=ExamCollection, 학습지=지문(PassageCollection) 경유,
// 문제=QuestionCollection. 행마다 folderIds(직접 멤버십)를 실어 보내고
// 폴더 목록을 함께 반환 — 클라이언트가 폴더 브라우저를 조립한다.
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toErrorMessage, type StudyActionResult } from "./_shared";

/** 영어 경로 과목 스코프 — null=영어(무회귀 계약), KOREAN 제외 */
function englishSubjectScope() {
  return { OR: [{ subject: null }, { subject: { not: "KOREAN" } }] };
}

export interface AssignableFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface AssignableExamRow {
  id: string;
  title: string;
  examDate: string | null;
  questionCount: number;
  totalPoints: number;
  status: string;
  updatedAt: string;
  /** ExamCollection 직접 멤버십 */
  folderIds: string[];
}

export interface AssignableExamPickerData {
  rows: AssignableExamRow[];
  folders: AssignableFolder[];
}

export async function listAssignableExams(): Promise<
  StudyActionResult<AssignableExamPickerData>
> {
  try {
    const staff = await requireStaffAuth();
    const [exams, folders] = await Promise.all([
      prisma.exam.findMany({
        where: { academyId: staff.academyId, ...englishSubjectScope() },
        select: {
          id: true,
          title: true,
          examDate: true,
          totalPoints: true,
          status: true,
          updatedAt: true,
          _count: { select: { questions: true } },
          collectionItems: { select: { collectionId: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 300,
      }),
      prisma.examCollection.findMany({
        where: { academyId: staff.academyId, ...englishSubjectScope() },
        select: { id: true, name: true, parentId: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      success: true,
      data: {
        rows: exams.map((e) => ({
          id: e.id,
          title: e.title,
          examDate: e.examDate ? e.examDate.toISOString() : null,
          questionCount: e._count.questions,
          totalPoints: e.totalPoints,
          status: e.status,
          updatedAt: e.updatedAt.toISOString(),
          folderIds: e.collectionItems.map((i) => i.collectionId),
        })),
        folders,
      },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "시험지 목록 조회 중 오류가 발생했습니다.") };
  }
}

export interface AssignableWorksheetRow {
  id: string;
  title: string;
  passageTitle: string;
  status: string;
  updatedAt: string;
  /** 원본 지문의 PassageCollection 직접 멤버십 — 학습지는 지문 폴더로 조직 */
  folderIds: string[];
}

export interface AssignableWorksheetPickerData {
  rows: AssignableWorksheetRow[];
  folders: AssignableFolder[];
}

export async function listAssignableWorksheets(): Promise<
  StudyActionResult<AssignableWorksheetPickerData>
> {
  try {
    const staff = await requireStaffAuth();
    const [reports, folders] = await Promise.all([
      prisma.passageReport.findMany({
        where: { academyId: staff.academyId, deletedAt: null },
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
          passage: {
            select: {
              title: true,
              collectionItems: { select: { collectionId: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 300,
      }),
      prisma.passageCollection.findMany({
        where: { academyId: staff.academyId, ...englishSubjectScope() },
        select: { id: true, name: true, parentId: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      success: true,
      data: {
        rows: reports.map((r) => ({
          id: r.id,
          title: r.title,
          passageTitle: r.passage.title,
          status: r.status,
          updatedAt: r.updatedAt.toISOString(),
          folderIds: r.passage.collectionItems.map((i) => i.collectionId),
        })),
        folders,
      },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "학습지 목록 조회 중 오류가 발생했습니다.") };
  }
}

export interface AssignableQuestionRow {
  id: string;
  /** 문두 스니펫(리스트 표시용, 원문은 미리보기 패널이 렌더) */
  snippet: string;
  type: string;
  subType: string | null;
  difficulty: string;
  passageTitle: string | null;
  setId: string | null;
  updatedAt: string;
  /** QuestionCollection 직접 멤버십 */
  folderIds: string[];
}

export interface AssignableQuestionPickerData {
  rows: AssignableQuestionRow[];
  folders: AssignableFolder[];
}

/**
 * 문제 피커 — 컴포저 안에서 폴더 단위로 문제를 골라 배포하기 위한 목록.
 * 휴지통(deletedAt) 제외, KOREAN 지문 소속 제외. 최신순 400개 스냅샷 —
 * 폴더/검색 필터는 클라이언트에서 folderIds/snippet 기준으로 거른다.
 */
export async function listAssignableQuestions(): Promise<
  StudyActionResult<AssignableQuestionPickerData>
> {
  try {
    const staff = await requireStaffAuth();
    const [questions, folders] = await Promise.all([
      prisma.question.findMany({
        where: {
          academyId: staff.academyId,
          deletedAt: null,
          OR: [
            { passageId: null },
            { passage: { OR: [{ subject: null }, { subject: { not: "KOREAN" } }] } },
          ],
        },
        select: {
          id: true,
          questionText: true,
          type: true,
          subType: true,
          difficulty: true,
          setId: true,
          updatedAt: true,
          passage: { select: { title: true } },
          collectionItems: { select: { collectionId: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 400,
      }),
      prisma.questionCollection.findMany({
        where: { academyId: staff.academyId, ...englishSubjectScope() },
        select: { id: true, name: true, parentId: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      success: true,
      data: {
        rows: questions.map((q) => ({
          id: q.id,
          snippet: q.questionText.replace(/\s+/g, " ").trim().slice(0, 120),
          type: q.type,
          subType: q.subType,
          difficulty: q.difficulty,
          passageTitle: q.passage?.title ?? null,
          setId: q.setId,
          updatedAt: q.updatedAt.toISOString(),
          folderIds: q.collectionItems.map((i) => i.collectionId),
        })),
        folders,
      },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "문제 목록 조회 중 오류가 발생했습니다.") };
  }
}
