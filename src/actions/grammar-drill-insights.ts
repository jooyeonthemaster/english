"use server";

// ============================================================================
// 어법 드릴 — 학원 단위 인사이트 (/director/grammar-lab 취약 개념 랭킹)
//
// 학생별 집계(grammar-drill-admin)와 달리 개념 축으로 학원 전체를 본다.
// requireStaffAuth 후 staff.academyId 테넌트 교차검증. 드릴 엔진 무수정 —
// grammarDrillMastery 읽기 전용 집계다.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { CONCEPT_SKELETON_BY_ID } from "@/lib/grammar-drill/curriculum";

/** 신뢰 가능한 표본 하한 — 시도 3회 미만 학생의 숙달 점수는 집계에서 제외 */
const MIN_ATTEMPTS = 3;
/** 취약 판정선 — 숙달 60점 미만이면 보강 과제 프리셀렉트 대상 */
const WEAK_SCORE = 60;

export interface AcademyConceptRankingRow {
  conceptId: string;
  title: string;
  /** 평균 숙달 점수(0~100 반올림) — 시도 3회 이상 학생 기준 */
  avgMastery: number;
  /** 집계에 포함된 학습 학생 수 */
  studentCount: number;
  /** 숙달 60점 미만 재원(ACTIVE) 학생 — 보강 과제 defaultStudentIds */
  weakStudentIds: string[];
}

/** 학원 취약 개념 TOP 8 — 평균 숙달 낮은순 */
export async function getAcademyConceptRanking(): Promise<AcademyConceptRankingRow[]> {
  const staff = await requireStaffAuth();

  const grouped = await prisma.grammarDrillMastery.groupBy({
    by: ["conceptId"],
    where: { academyId: staff.academyId, attempts: { gte: MIN_ATTEMPTS } },
    _avg: { masteryScore: true },
    _count: { _all: true },
  });
  if (grouped.length === 0) return [];

  const top = [...grouped]
    .sort((a, b) => (a._avg.masteryScore ?? 0) - (b._avg.masteryScore ?? 0))
    .slice(0, 8);

  // 취약 학생 수집 — relation-free 이므로 ACTIVE 재원생만 남겨 프리셀렉트
  // (퇴원생 id 가 컴포저 선택에 섞이지 않게 한다)
  const weakRows = await prisma.grammarDrillMastery.findMany({
    where: {
      academyId: staff.academyId,
      conceptId: { in: top.map((t) => t.conceptId) },
      attempts: { gte: MIN_ATTEMPTS },
      masteryScore: { lt: WEAK_SCORE },
    },
    select: { conceptId: true, studentId: true },
  });
  const activeIds = new Set<string>();
  if (weakRows.length > 0) {
    const activeStudents = await prisma.student.findMany({
      where: {
        academyId: staff.academyId,
        status: "ACTIVE",
        id: { in: [...new Set(weakRows.map((w) => w.studentId))] },
      },
      select: { id: true },
    });
    for (const s of activeStudents) activeIds.add(s.id);
  }

  return top.map((t) => ({
    conceptId: t.conceptId,
    title: CONCEPT_SKELETON_BY_ID.get(t.conceptId)?.title ?? t.conceptId,
    avgMastery: Math.round(t._avg.masteryScore ?? 0),
    studentCount: t._count._all,
    weakStudentIds: weakRows
      .filter((w) => w.conceptId === t.conceptId && activeIds.has(w.studentId))
      .map((w) => w.studentId),
  }));
}
