import "server-only";

// ============================================================================
// 레슨 번들 — src/data/grammar-drill/lessons/*.json 을 프로세스당 1회 적재.
//
// 핵심: 레슨의 CHECK·RECAP 문항은 **드릴 문항 뱅크와 동일한 자산**이다.
// 별도 items JSON 을 생성하지 않고(드리프트 0), 여기서 GrammarItem 으로 변환해
// grammar-drill 번들에 합류시킨다(bundle.ts 가 이 함수를 호출).
//
// 규범: docs/study-os-spec.md §3.3
// ============================================================================

import fs from "fs";
import path from "path";
import type { GrammarItem } from "@/lib/grammar-drill/types";
import {
  CONCEPT_SKELETON_BY_ID,
  GRAMMAR_CONCEPT_SKELETONS,
  UNIT_BY_ID,
} from "@/lib/grammar-drill/curriculum";
import type { ClientItem } from "@/lib/grammar-drill/payload";
import type { GrammarLesson, LessonItem } from "./lesson-types";
import type { SafeLesson, SafeLessonBlock } from "./lesson-payload";

const LESSON_DIR = path.join(process.cwd(), "src", "data", "grammar-drill", "lessons");

export interface LessonBundle {
  lessonsById: Map<string, GrammarLesson>;
  /** 레슨에서 추출한 드릴 문항 */
  items: GrammarItem[];
}

/**
 * 레슨 문항 → GrammarItem.
 * hints[2] 는 저작 부담을 줄이기 위해 레슨에서 결정론적으로 합성한다.
 *  1단계 힌트 = 개념 한 줄(무엇을 보는 문제인가)
 *  2단계 힌트 = 판단 절차의 첫 단계(어떻게 보는가)
 */
function toGrammarItem(lesson: GrammarLesson, item: LessonItem): GrammarItem {
  const algorithm = lesson.blocks.find((b) => b.type === "ALGORITHM");
  const step1 =
    algorithm && algorithm.type === "ALGORITHM" && algorithm.steps[0]
      ? algorithm.steps[0].text
      : lesson.oneLiner;
  const base = {
    id: item.id,
    unitId: lesson.unitId,
    conceptId: lesson.id,
    difficulty: item.difficulty,
    trapTags: item.trapTags ?? [],
    hints: [lesson.oneLiner, step1] as [string, string],
    explanation: item.explanation,
  };
  if (item.type === "CHOICE") {
    return {
      ...base,
      type: "CHOICE",
      stem: item.stem,
      options: item.options,
      answer: item.answer,
      translation: item.translation,
    };
  }
  return {
    ...base,
    type: "OX",
    sentence: item.sentence,
    isCorrect: item.isCorrect,
    correction: item.correction,
    translation: item.translation,
  };
}

function buildLessonBundle(): LessonBundle {
  const lessonsById = new Map<string, GrammarLesson>();
  const items: GrammarItem[] = [];

  if (!fs.existsSync(LESSON_DIR)) return { lessonsById, items };

  for (const skeleton of GRAMMAR_CONCEPT_SKELETONS) {
    const file = path.join(LESSON_DIR, `${skeleton.id}.json`);
    if (!fs.existsSync(file)) continue;
    let lesson: GrammarLesson;
    try {
      lesson = JSON.parse(fs.readFileSync(file, "utf-8")) as GrammarLesson;
    } catch {
      continue; // 손상 파일은 조용히 건너뛴다(검증은 verify-lessons.ts 가 한다)
    }
    lessonsById.set(lesson.id, lesson);
    for (const block of lesson.blocks) {
      if (block.type === "CHECK" || block.type === "RECAP") {
        for (const item of block.items) items.push(toGrammarItem(lesson, item));
      }
    }
  }

  return { lessonsById, items };
}

let cached: LessonBundle | null = null;

export function getLessonBundle(): LessonBundle {
  if (!cached) cached = buildLessonBundle();
  return cached;
}

export function getLesson(conceptId: string): GrammarLesson | null {
  return getLessonBundle().lessonsById.get(conceptId) ?? null;
}

/** 유닛의 레슨 전량 (order 순) */
export function getLessonsForUnit(conceptIds: string[]): GrammarLesson[] {
  const bundle = getLessonBundle();
  return conceptIds
    .map((id) => bundle.lessonsById.get(id))
    .filter((l): l is GrammarLesson => Boolean(l))
    .sort((a, b) => a.order - b.order);
}

/**
 * 클라이언트 안전 페이로드 — CHECK·RECAP 문항에서 정답·해설·번역을 제거한다.
 * (그 문항들은 드릴 뱅크와 같은 자산이므로 정답을 내려보내면 드릴이 함께 샌다.)
 * 규범: src/lib/study-os/lesson-payload.ts 헤더
 */
export function toSafeLesson(lesson: GrammarLesson): SafeLesson {
  const unit = UNIT_BY_ID.get(lesson.unitId);
  const concept = CONCEPT_SKELETON_BY_ID.get(lesson.id);

  // engine.toClientItem 과 동일 계약이지만, 순환 import(engine → bundle → lesson-bundle)
  // 를 피하기 위해 CHOICE·OX 두 유형만 여기서 직접 매핑한다.
  const toSafeItem = (item: LessonItem): ClientItem => {
    const g = toGrammarItem(lesson, item);
    const base = {
      id: g.id,
      unitId: g.unitId,
      unitTitle: unit?.title ?? g.unitId,
      conceptId: g.conceptId,
      conceptTitle: concept?.title ?? g.conceptId,
      difficulty: g.difficulty,
      hints: g.hints,
    };
    return item.type === "CHOICE"
      ? { ...base, type: "CHOICE", stem: item.stem, options: item.options }
      : { ...base, type: "OX", sentence: item.sentence };
  };

  const blocks: SafeLessonBlock[] = lesson.blocks.map((block) => {
    if (block.type === "CHECK" || block.type === "RECAP") {
      return {
        id: block.id,
        type: block.type,
        tier: block.tier,
        title: block.title,
        items: block.items.map(toSafeItem),
      };
    }
    return block;
  });
  return {
    id: lesson.id,
    unitId: lesson.unitId,
    unitTitle: unit?.title ?? lesson.unitId,
    order: lesson.order,
    title: lesson.title,
    oneLiner: lesson.oneLiner,
    estimatedMinutes: lesson.estimatedMinutes,
    lenses: lesson.lenses,
    gradeStamp: lesson.gradeStamp,
    blocks,
  };
}
