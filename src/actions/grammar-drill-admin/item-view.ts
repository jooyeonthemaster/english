"use server";

// ============================================================================
// 어법 드릴 — 원장/강사용 서버 액션: 문항 강사 뷰·배정 풀 카운트
//
// 둘 다 코드 번들 인메모리 조회(DB 0회). 정답·해설이 포함된 강사 전용
// 페이로드이므로 학생 경로에서 절대 재사용하지 않는다.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import {
  GRAMMAR_UNITS,
  UNIT_BY_ID,
  CONCEPT_SKELETON_BY_ID,
} from "@/lib/grammar-drill/curriculum";
import { getGrammarBundle, getGrammarItem } from "@/lib/grammar-drill/bundle";
import { stripMarkup } from "@/lib/grammar-drill/markup";
import { MIN_ATTEMPTS, WEAK_SCORE } from "@/lib/grammar-drill/weakness";
import type { GrammarItem } from "@/lib/grammar-drill/types";

// ── 문항 강사 뷰 (시도 상세 모달·질문 로그 컨텍스트) ─────────────────────────

/** 강사 전용 문항 전체 뷰 — 정답·해설 포함(학생 페이로드 아님) */
export interface GrammarItemTeacherView {
  itemId: string;
  type: string;
  difficulty: number;
  unitId: string;
  unitTitle: string;
  conceptId: string;
  conceptTitle: string;
  /** 마크업 원문(stem|sentence|text) — MarkupText 렌더러로 표시 */
  text: string;
  directive: string | null;
  /** CHOICE 보기 목록 */
  options: string[] | null;
  /** 정답 표시 문자열 — "② prepared" | "X → have been" | "studies" 등 */
  answerDisplay: string;
  /** MULTI_UNDERLINE/PASSAGE 정답 밑줄 번호(1-based) — 지문 하이라이트용 */
  answerNumber: number | null;
  correction: string | null;
  explanation: string;
  /** MULTI_UNDERLINE/PASSAGE 밑줄별 판단 근거 */
  rationales: string[] | null;
  translation: string | null;
  hints: [string, string];
  trapTags: string[];
}

const CIRCLED = ["①", "②", "③", "④", "⑤"];

export async function getGrammarItemTeacherView(
  itemId: string,
): Promise<{ success: boolean; error?: string; data?: GrammarItemTeacherView }> {
  try {
    await requireStaffAuth();
    const item = getGrammarItem(itemId);
    if (!item) return { success: false, error: "문항을 찾을 수 없습니다." };

    const unit = GRAMMAR_UNITS.find((u) => u.id === item.unitId);
    const base = {
      itemId: item.id,
      type: item.type,
      difficulty: item.difficulty,
      unitId: item.unitId,
      unitTitle: unit?.title ?? item.unitId,
      conceptId: item.conceptId,
      conceptTitle:
        CONCEPT_SKELETON_BY_ID.get(item.conceptId)?.title ?? item.conceptId,
      explanation: item.explanation,
      hints: item.hints,
      trapTags: item.trapTags,
      directive: null as string | null,
      options: null as string[] | null,
      correction: null as string | null,
      rationales: null as string[] | null,
      translation: null as string | null,
      answerNumber: null as number | null,
    };

    let view: GrammarItemTeacherView;
    if (item.type === "CHOICE") {
      view = {
        ...base,
        text: item.stem,
        options: item.options,
        answerDisplay: `${CIRCLED[item.answer] ?? item.answer + 1} ${item.options[item.answer] ?? ""}`.trim(),
        translation: item.translation,
      };
    } else if (item.type === "OX") {
      view = {
        ...base,
        text: item.sentence,
        answerDisplay: item.isCorrect ? "O (어법상 옳음)" : `X${item.correction ? ` → ${item.correction}` : ""}`,
        correction: item.correction ?? null,
        translation: item.translation,
      };
    } else if (item.type === "MULTI_UNDERLINE") {
      view = {
        ...base,
        text: item.text,
        answerDisplay: `${CIRCLED[item.answer - 1] ?? item.answer} → ${item.correction}`,
        answerNumber: item.answer,
        correction: item.correction,
        rationales: item.rationales,
      };
    } else if (item.type === "PASSAGE") {
      view = {
        ...base,
        text: item.text,
        directive: item.directive,
        answerDisplay: `${CIRCLED[item.answer - 1] ?? item.answer} → ${item.correction}`,
        answerNumber: item.answer,
        correction: item.correction,
        rationales: item.rationales,
      };
    } else if (item.type === "WRITE_FORM") {
      view = {
        ...base,
        text: item.stem,
        directive: `괄호 제시어: ${item.given}`,
        answerDisplay: item.acceptedAnswers[0] ?? "",
        translation: item.translation,
      };
    } else {
      view = {
        ...base,
        text: item.sentence,
        answerDisplay: item.acceptedAnswers[0] ?? "",
        correction: item.acceptedAnswers[0] ?? null,
        translation: item.translation,
      };
    }
    return { success: true, data: view };
  } catch (error) {
    console.error("[grammar-lab] getGrammarItemTeacherView", error);
    return { success: false, error: "문항 조회에 실패했습니다." };
  }
}

// ── 배정 풀 카운트 (과제 컴포저 라이브 검증) ─────────────────────────────────

/** countGrammarDrillPool 반환 — 번들 인메모리 집계(DB 0회) */
export interface GrammarPoolCount {
  total: number;
  /** 유형별 문항 수 (0개 유형은 미포함) */
  byType: Record<string, number>;
  /** 난이도(1~4 문자열 키)별 문항 수 */
  byDifficulty: Record<string, number>;
  /** 예시 문항 id — 유형 다양성 우선, 최대 3개 */
  sampleItemIds: string[];
}

/**
 * 배정 스펙과 일치하는 번들 문항 집계 — 필터 술어는 engine.ts buildQueue 의
 * assignment 풀과 동일 규칙(유닛/개념/유형/난이도 교집합, 빈 배열=무필터).
 * 빈 풀 배정(영원히 완료 불가)을 배포 전에 걸러내는 근거 데이터.
 */
export async function countGrammarDrillPool(spec: {
  unitIds?: string[];
  conceptIds?: string[];
  itemTypes?: string[];
  difficulties?: number[];
}): Promise<GrammarPoolCount> {
  await requireStaffAuth();

  const pool = [...getGrammarBundle().itemsById.values()].filter((i) => {
    if (spec.conceptIds?.length && !spec.conceptIds.includes(i.conceptId)) return false;
    if (spec.unitIds?.length && !spec.unitIds.includes(i.unitId)) return false;
    if (spec.itemTypes?.length && !spec.itemTypes.includes(i.type)) return false;
    if (spec.difficulties?.length && !spec.difficulties.includes(i.difficulty)) return false;
    return true;
  });

  const byType: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  for (const item of pool) {
    byType[item.type] = (byType[item.type] ?? 0) + 1;
    byDifficulty[String(item.difficulty)] =
      (byDifficulty[String(item.difficulty)] ?? 0) + 1;
  }

  // 예시는 유형이 겹치지 않게 우선 채우고, 모자라면 순서대로 보충
  const sampleItemIds: string[] = [];
  const seenTypes = new Set<string>();
  for (const item of pool) {
    if (sampleItemIds.length >= 3) break;
    if (seenTypes.has(item.type)) continue;
    seenTypes.add(item.type);
    sampleItemIds.push(item.id);
  }
  for (const item of pool) {
    if (sampleItemIds.length >= 3) break;
    if (!sampleItemIds.includes(item.id)) sampleItemIds.push(item.id);
  }

  return { total: pool.length, byType, byDifficulty, sampleItemIds };
}

// ── 풀 문항 실물 목록 (유닛 브라우저 — v3 design §D3-4 ③ · D5 훈련소 공유) ──

/**
 * 브라우저 테이블 1행 — 정답·해설 **미포함** 메타 전용(발문 1줄 미리보기까지).
 * 실물 전체는 행 클릭 → getGrammarItemTeacherView(GrammarItemModal)로 본다.
 */
export interface GrammarPoolItemRow {
  id: string;
  type: string;
  difficulty: number;
  unitId: string;
  unitTitle: string;
  conceptId: string;
  conceptTitle: string;
  /** 발문 1줄 — 마크업 제거·공백 압축·100자 절단(정답 정보 없음) */
  preview: string;
}

/** 개념 숙달도 요약 — 보충 필요(attempts>=3 · score<60) 판정·행 배지 근거 */
export interface GrammarPoolConceptMastery {
  /** 반올림 숙달도 0~100 */
  score: number;
  attempts: number;
  /** attempts - correct */
  wrong: number;
}

export interface GrammarPoolItemList {
  items: GrammarPoolItemRow[];
  /** 절단 전 매칭 총수 */
  total: number;
  /** 무필터(유닛·개념 모두 빈) 스펙 → 상위 200개 절단 시 true */
  truncated: boolean;
  /** studentId 전달 시 conceptId → 숙달도 요약 — 미전달이면 null */
  masteryByConcept: Record<string, GrammarPoolConceptMastery> | null;
}

/** 무필터(유닛·개념 모두 빈) 요청의 절단 상한 — 전수 렌더 방어(에러 대신 절단) */
const UNFILTERED_ITEM_CAP = 200;

/** 발문 1줄 미리보기 — 유형별 원문 필드에서 마크업 제거 후 1줄 압축 */
function toPreviewLine(item: GrammarItem): string {
  const raw =
    item.type === "CHOICE" || item.type === "WRITE_FORM"
      ? item.stem
      : item.type === "OX" || item.type === "WRITE_CORRECT"
        ? item.sentence
        : item.text;
  const flat = stripMarkup(raw).replace(/\s+/g, " ").trim();
  return flat.length > 100 ? `${flat.slice(0, 99)}…` : flat;
}

/**
 * 배정 스펙과 일치하는 번들 문항 **전수** 메타 목록 — 유닛 실물 브라우저의
 * 데이터 소스. 필터 술어는 countGrammarDrillPool(= engine buildQueue 의
 * assignment 풀)과 동일 규칙(유닛/개념/유형/난이도 교집합, 빈 배열=무필터)이되,
 * 후보 수집은 itemIdsByConcept/Unit 인덱스로 한다(전 문항 순회 회피).
 *
 * studentId 전달 시 grammarDrillMastery 1회 조회(그 외 DB 0회)로 개념별
 * 숙달도를 동봉하고, 보충 필요 개념(3회 이상 시도·숙달도 60 미만) 문항을
 * 낮은 점수순으로 상단 정렬한다.
 */
export async function listGrammarPoolItems(
  spec: {
    unitIds?: string[];
    conceptIds?: string[];
    itemTypes?: string[];
    difficulties?: number[];
  },
  options: { studentId?: string } = {},
): Promise<GrammarPoolItemList> {
  const staff = await requireStaffAuth();
  const bundle = getGrammarBundle();

  const conceptIds = spec.conceptIds ?? [];
  const unitIds = spec.unitIds ?? [];

  // 후보 수집 — 문항은 개념/유닛에 정확히 1소속이라 인덱스 union 에 중복 없음
  let candidateIds: string[];
  if (conceptIds.length > 0) {
    candidateIds = conceptIds.flatMap((cid) => bundle.itemIdsByConcept.get(cid) ?? []);
  } else if (unitIds.length > 0) {
    candidateIds = unitIds.flatMap((uid) => bundle.itemIdsByUnit.get(uid) ?? []);
  } else {
    candidateIds = [...bundle.itemsById.keys()];
  }

  const unitSet = new Set(unitIds);
  const typeSet = new Set(spec.itemTypes ?? []);
  const diffSet = new Set(spec.difficulties ?? []);
  const matched: GrammarItem[] = [];
  for (const id of candidateIds) {
    const item = bundle.itemsById.get(id);
    if (!item) continue;
    if (unitSet.size > 0 && !unitSet.has(item.unitId)) continue;
    if (typeSet.size > 0 && !typeSet.has(item.type)) continue;
    if (diffSet.size > 0 && !diffSet.has(item.difficulty)) continue;
    matched.push(item);
  }

  // 학생 컨텍스트 — 개념 숙달도 1회 조회(학원 스코프 강제)
  let masteryByConcept: Record<string, GrammarPoolConceptMastery> | null = null;
  if (options.studentId) {
    const rows = await prisma.grammarDrillMastery.findMany({
      where: { studentId: options.studentId, academyId: staff.academyId },
      select: { conceptId: true, masteryScore: true, attempts: true, correct: true },
    });
    masteryByConcept = {};
    for (const m of rows) {
      masteryByConcept[m.conceptId] = {
        score: Math.round(m.masteryScore),
        attempts: m.attempts,
        wrong: Math.max(0, m.attempts - m.correct),
      };
    }
  }

  // 정렬 — (1) 보충 필요 개념 문항 상단(낮은 숙달도 우선, studentId 시에만)
  //        (2) 커리큘럼 유닛 순 → 개념 → 난이도 → id (결정적 테이블 순서)
  const unitOrder = new Map(GRAMMAR_UNITS.map((u, idx) => [u.id, idx]));
  const weakScoreOf = (conceptId: string): number | null => {
    const m = masteryByConcept?.[conceptId];
    if (!m || m.attempts < MIN_ATTEMPTS) return null;
    return m.score < WEAK_SCORE ? m.score : null;
  };
  matched.sort((a, b) => {
    const wa = weakScoreOf(a.conceptId);
    const wb = weakScoreOf(b.conceptId);
    if ((wa === null) !== (wb === null)) return wa === null ? 1 : -1;
    if (wa !== null && wb !== null && wa !== wb) return wa - wb;
    const ua = unitOrder.get(a.unitId) ?? Number.MAX_SAFE_INTEGER;
    const ub = unitOrder.get(b.unitId) ?? Number.MAX_SAFE_INTEGER;
    if (ua !== ub) return ua - ub;
    if (a.conceptId !== b.conceptId) return a.conceptId < b.conceptId ? -1 : 1;
    if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
    return a.id < b.id ? -1 : 1;
  });

  // 무필터 전수 방지 — 유닛·개념 모두 빈 스펙은 에러 대신 상위 절단 + 플래그
  const unfiltered = conceptIds.length === 0 && unitIds.length === 0;
  const total = matched.length;
  const truncated = unfiltered && total > UNFILTERED_ITEM_CAP;
  const visible = truncated ? matched.slice(0, UNFILTERED_ITEM_CAP) : matched;

  return {
    items: visible.map((i) => ({
      id: i.id,
      type: i.type,
      difficulty: i.difficulty,
      unitId: i.unitId,
      unitTitle: UNIT_BY_ID.get(i.unitId)?.title ?? i.unitId,
      conceptId: i.conceptId,
      conceptTitle: CONCEPT_SKELETON_BY_ID.get(i.conceptId)?.title ?? i.conceptId,
      preview: toPreviewLine(i),
    })),
    total,
    truncated,
    masteryByConcept,
  };
}
