"use server";

// ============================================================================
// 단어장 생성 스튜디오 — 배포 현황 조회
//
// "누구에게 어떤 단어장을 보냈고 얼마나 풀었나"의 정본은 vocab_drill_assignments
// (학생 1명 = 1행, 큐가 소비하는 브리지)다. 부모 study_assignments 로 배포 단위를
// 묶고, 브리지 status 로 진행을 센다. 전부 최근 50건 창 — 원장 화면 규약.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";

export interface VocabDeploymentRow {
  assignmentId: string;
  title: string;
  createdAt: string;
  availableFrom: string;
  dueAt: string | null;
  status: string; // ACTIVE | CLOSED | ARCHIVED
  targetSummary: string | null;
  /** 문항 수(payload.count) */
  count: number;
  /** 출제 유형 라벨 원료 — 미지정(자동 믹스)이면 빈 배열 */
  itemTypes: string[];
  /** 배포에 실린 단어장 제목들 — 직접 선택 배포면 "직접 선택 N단어" 1개 */
  deckLabels: string[];
  /** 받은 학생 수 / 끝낸 학생 수 */
  studentTotal: number;
  studentDone: number;
}

const WINDOW = 50;

function toStrArr(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").slice(0, cap);
}

export async function listVocabDeployments(): Promise<VocabDeploymentRow[]> {
  const staff = await requireStaffAuth();

  const parents = await prisma.studyAssignment.findMany({
    where: { academyId: staff.academyId, kind: "VOCAB" },
    orderBy: { createdAt: "desc" },
    take: WINDOW,
    select: {
      id: true,
      title: true,
      createdAt: true,
      availableFrom: true,
      dueAt: true,
      status: true,
      targetSummary: true,
      payload: true,
    },
  });
  if (!parents.length) return [];
  const ids = parents.map((p) => p.id);

  // 진행 집계 — 브리지가 정본(태스크 status 는 표시 캐시일 수 있다).
  const bridgeAgg = await prisma.vocabDrillAssignment.groupBy({
    by: ["assignmentId", "status"],
    where: { academyId: staff.academyId, assignmentId: { in: ids } },
    _count: { _all: true },
    orderBy: { assignmentId: "asc" },
    take: WINDOW * 4,
  });
  const totalBy = new Map<string, number>();
  const doneBy = new Map<string, number>();
  for (const row of bridgeAgg) {
    if (!row.assignmentId) continue;
    totalBy.set(
      row.assignmentId,
      (totalBy.get(row.assignmentId) ?? 0) + row._count._all,
    );
    if (row.status === "DONE") {
      doneBy.set(
        row.assignmentId,
        (doneBy.get(row.assignmentId) ?? 0) + row._count._all,
      );
    }
  }

  // 덱 제목 해소 — 배포 payload 의 deckIds 합집합 1회 조회.
  const deckIds = [
    ...new Set(
      parents.flatMap((p) =>
        toStrArr((p.payload as Record<string, unknown>)?.deckIds, 5),
      ),
    ),
  ];
  const decks = deckIds.length
    ? await prisma.vocabDrillDeck.findMany({
        where: { id: { in: deckIds }, academyId: staff.academyId },
        select: { id: true, title: true },
        // 구성상 최대 50건 × 덱 5개 = 250 — 100 으로 자르면 살아 있는 단어장이
        // "(삭제된 단어장)"으로 오표기된다(적대검수 2026-08-04 2차).
        take: 250,
      })
    : [];
  const deckTitleBy = new Map(decks.map((d) => [d.id, d.title]));

  return parents.map((p) => {
    const payload = (p.payload ?? {}) as Record<string, unknown>;
    const pDeckIds = toStrArr(payload.deckIds, 5);
    const senseIds = toStrArr(payload.senseIds, 500);
    const deckLabels = pDeckIds.length
      ? pDeckIds.map((id) => deckTitleBy.get(id) ?? "(삭제된 단어장)")
      : senseIds.length
        ? [`직접 선택 ${senseIds.length}단어`]
        : ["조건 배포"];
    return {
      assignmentId: p.id,
      title: p.title,
      createdAt: p.createdAt.toISOString(),
      availableFrom: p.availableFrom.toISOString(),
      dueAt: p.dueAt?.toISOString() ?? null,
      status: p.status,
      targetSummary: p.targetSummary,
      count: Math.max(0, Math.round(Number(payload.count ?? 0))),
      itemTypes: toStrArr(payload.itemTypes, 6),
      deckLabels,
      studentTotal: totalBy.get(p.id) ?? 0,
      studentDone: doneBy.get(p.id) ?? 0,
    };
  });
}

// ── 단어장별 수신 학생 (전송 모달 "이미 받음" 배지) ──────────────────────────

export interface DeckRecipientInfo {
  /** studentId → 아직 진행 중(미완료) 과제가 있는가 */
  activeByStudent: Record<string, boolean>;
}

/**
 * 이 단어장이 실린 배포를 받은 학생들 — 전송 모달이 "이미 받은 학생"을 표시해
 * 이중 배포를 예방한다(차단은 아니다 — 재시험은 정당한 사용례라 표시만 한다).
 */
export async function listDeckRecipients(
  deckId: string,
): Promise<DeckRecipientInfo> {
  const staff = await requireStaffAuth();
  const id = String(deckId ?? "").slice(0, 40);
  if (!id) return { activeByStudent: {} };

  const rows = await prisma.vocabDrillAssignment.findMany({
    where: {
      academyId: staff.academyId,
      spec: { path: ["deckIds"], array_contains: id },
    },
    select: { studentId: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  const activeByStudent: Record<string, boolean> = {};
  for (const r of rows) {
    // 같은 학생에게 여러 번 보냈으면 "하나라도 미완료"를 진행 중으로 본다.
    activeByStudent[r.studentId] =
      (activeByStudent[r.studentId] ?? false) || r.status !== "DONE";
  }
  return { activeByStudent };
}
