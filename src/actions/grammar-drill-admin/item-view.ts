"use server";

// ============================================================================
// 어법 드릴 — 원장/강사용 서버 액션: 문항 강사 뷰·배정 풀 카운트
//
// 둘 다 코드 번들 인메모리 조회(DB 0회). 정답·해설이 포함된 강사 전용
// 페이로드이므로 학생 경로에서 절대 재사용하지 않는다.
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import {
  GRAMMAR_UNITS,
  CONCEPT_SKELETON_BY_ID,
} from "@/lib/grammar-drill/curriculum";
import { getGrammarBundle, getGrammarItem } from "@/lib/grammar-drill/bundle";

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
