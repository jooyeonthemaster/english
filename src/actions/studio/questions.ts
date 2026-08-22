"use server";

// ============================================================================
// 클래스 스튜디오 — 생성 문제 평면 전체보기 서버 액션 (docs/class-studio-spec.md §3.10.16-b)
//
// 클래스에 등록된 지문 전체의 문항을 지문 축 없이 평면으로 내린다. 필터·검색은
// 전부 클라이언트(클래스 스코프라 소량) — 서버는 정본 3단 질의만:
// ①클래스 소유 검증 ②StudioClassPassage(relation-free soft-ref — 2단 질의 필수,
// take 300) ③question.findMany(take 1000, deletedAt:null 게이트).
// 프리미엄 판정·stem 절단은 dossier.ts(§3.9.4)와 동일 구현이어야 한다 —
// 어긋나면 도시에 행과 평면 행의 배지가 서로 다르게 보인다. 유형 라벨은 행이
// 원시 type/subType 을 싣고 클라이언트가 도시에 패널과 같은 상수로 환산한다
// (passage-dossier-pane.tsx:149-158 선례 — 행 타입에 라벨 필드가 없다).
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getQuestionGenerationPlanFromTags,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import type { StudioClassQuestionRow } from "@/lib/studio/dossier-types";
import type { StudioActionResult } from "./classes";

/** 문항 방어 상한 — 도달 시 truncated 로 알려 클라이언트가 각주를 단다. */
const QUESTION_TAKE = 1000;

/** 문두 1줄 절단본(~120자) — 개행·연속 공백을 접고 넘치면 말줄임(dossier 행 동형). */
function truncateStem(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 120)}…` : oneLine;
}

/**
 * Question.tags(JSON 문자열)를 string[] 로 안전 파싱 — 플랜 태그 해석 정본
 * getQuestionGenerationPlanFromTags 의 입력 재료. 라이브러리의 원문 파서
 * (readQuestionTags)는 비공개라 파일 내 최소 관용구로 구현(자유형 방어 동일).
 */
function parseTagList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

// ── 클래스 평면 문항 조회 ─────────────────────────────────────────────────────

export async function listStudioClassQuestions(input: {
  classId: string;
}): Promise<
  StudioActionResult<{
    rows: StudioClassQuestionRow[];
    total: number;
    truncated: boolean;
  }>
> {
  try {
    const staff = await requireStaffAuth();
    const classId = typeof input.classId === "string" ? input.classId : "";
    if (!classId) return { success: false, error: "클래스 정보가 올바르지 않습니다." };

    const cls = await prisma.class.findFirst({
      where: { id: classId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };

    const links = await prisma.studioClassPassage.findMany({
      where: { academyId: staff.academyId, classId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 300,
      select: { passageId: true },
    });
    if (links.length === 0) {
      return { success: true, data: { rows: [], total: 0, truncated: false } };
    }

    // StudioClassPassage 는 relation-free soft-ref — 지문 실존·학원 스코프는
    // passage 2단 질의로 재검증한다(삭제된 지문의 링크는 여기서 걸러진다).
    const passages = await prisma.passage.findMany({
      where: {
        id: { in: links.map((l) => l.passageId) },
        academyId: staff.academyId,
      },
      select: { id: true, title: true },
    });
    if (passages.length === 0) {
      return { success: true, data: { rows: [], total: 0, truncated: false } };
    }
    const titleByPassageId = new Map(passages.map((p) => [p.id, p.title]));
    const passageIds = passages.map((p) => p.id);

    const questionRows = await prisma.question.findMany({
      where: {
        passageId: { in: passageIds },
        academyId: staff.academyId,
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: QUESTION_TAKE,
      select: {
        id: true,
        passageId: true,
        type: true,
        subType: true,
        difficulty: true,
        approved: true,
        questionText: true,
        tags: true,
        createdAt: true,
      },
    });

    // 프리미엄 판정 — 플랜 태그 우선(상세 모달 배지와 동일 정본 헬퍼), 태그로
    // 판정 불가한 구세대 행이 하나라도 있을 때만 PREMIUM 잡 역교집합 폴백 질의
    // (§3.10.11-e). 전 행이 태그 판정이면 잡 질의 자체를 생략한다.
    const planById = new Map<string, QuestionGenerationPlan | null>();
    const legacyPassageIds = new Set<string>();
    for (const q of questionRows) {
      const plan = getQuestionGenerationPlanFromTags(parseTagList(q.tags));
      planById.set(q.id, plan);
      if (!plan && q.passageId) legacyPassageIds.add(q.passageId);
    }
    // 폴백 집합 — PREMIUM 잡 result.questionIds 합집합 ∩ 행 id. result 는 Json
    // 자유형이라 string[] 원소만 안전 파싱. 이 질의만 실패해도 목록 본체는
    // 살린다 — catch 빈 배열 강등(구세대 행 premium=false, dossier.ts 동일 계열).
    // 예산은 **구세대 행이 있는 지문으로 좁혀 지문 수 비례**(적대 감사 major):
    // 클래스 전체 300지문에 take 100 총예산을 공유하면 dossier(지문당 100)와
    // 판정이 갈라져 같은 문항의 배지가 표면마다 다르게 보인다.
    const premiumIds = new Set<string>();
    if (legacyPassageIds.size > 0) {
      const premiumJobs = await prisma.workbenchAiJob
        .findMany({
          where: {
            passageId: { in: [...legacyPassageIds] },
            academyId: staff.academyId,
            domain: "QUESTION_GENERATION",
            generationPlan: "PREMIUM",
            deletedAt: null,
          },
          orderBy: { createdAt: "desc" },
          take: Math.min(legacyPassageIds.size * 100, 1000),
          select: { result: true },
        })
        .catch(() => []);
      for (const job of premiumJobs) {
        const result = (job.result ?? {}) as { questionIds?: unknown };
        if (!Array.isArray(result.questionIds)) continue;
        for (const id of result.questionIds) {
          if (typeof id === "string") premiumIds.add(id);
        }
      }
    }

    const rows: StudioClassQuestionRow[] = [];
    for (const q of questionRows) {
      // passageId 는 스키마상 nullable — where 절이 in 목록으로 보장하지만
      // 타입 서사를 위해 방어(도달 불가).
      if (!q.passageId) continue;
      const plan = planById.get(q.id) ?? null;
      rows.push({
        id: q.id,
        type: q.type,
        subType: q.subType,
        difficulty: q.difficulty,
        approved: q.approved,
        premium: plan ? plan === "PREMIUM" : premiumIds.has(q.id),
        stem: truncateStem(q.questionText),
        createdAt: q.createdAt.toISOString(),
        passageId: q.passageId,
        passageTitle: titleByPassageId.get(q.passageId) ?? "",
      });
    }

    return {
      success: true,
      data: {
        rows,
        total: rows.length,
        truncated: questionRows.length >= QUESTION_TAKE,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "문항 목록을 불러오지 못했습니다.",
    };
  }
}
