// 단어장 위저드 액션 입력 새니타이즈 — wordbook-wizard.ts 의 500줄 규약 분리체.
// 클라 숫자를 믿지 않는다(스펙 §8-7) — 액션 진입부가 반드시 이 관문을 거친다.

import {
  clampPlanSize,
  clampWordsPerDay,
  normalizeStudyDays,
  type WordbookOrderScheme,
  type WordbookPlanBase,
  type WordbookPlanInput,
} from "@/lib/vocab-drill/wordbook-plan-types";
import { sanitizeVocabPassageScope } from "@/lib/vocab-drill/payload";

const ALLOWED_GRADES = ["고1", "고2", "고3"];
const ALLOWED_TIERS = ["basic", "core", "academic", "advanced"];
const ALLOWED_POS = [
  "noun", "verb", "adjective", "adverb", "preposition",
  "conjunction", "idiom", "phrasal_verb", "collocation",
];
const ORDER_SCHEMES: WordbookOrderScheme[] = [
  "easy-first", "frequency", "tier-ladder", "mixed-pos", "pos-grouped", "random",
];

export function strs(v: unknown, allow: string[] | null, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return [
    ...new Set(
      v.filter(
        (x): x is string =>
          typeof x === "string" && !!x && x.length <= 64 &&
          (!allow || allow.includes(x)),
      ),
    ),
  ].slice(0, cap);
}

function sanitizeBase(raw: unknown): WordbookPlanBase {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw
    : {}) as Record<string, unknown>;
  const base: WordbookPlanBase = {
    // 3상태 함정 — 위저드 경로는 항상 boolean 확정(스펙 §8-1).
    allSenses: r.allSenses === true,
  };
  const grades = strs(r.grades, ALLOWED_GRADES, 3);
  if (grades.length) base.grades = grades;
  const tiers = strs(r.tiers, ALLOWED_TIERS, 4);
  if (tiers.length) base.tiers = tiers;
  if (Array.isArray(r.difficulties)) {
    const diffs = [
      ...new Set(
        r.difficulties.filter(
          (d): d is number =>
            typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 5,
        ),
      ),
    ].slice(0, 5);
    if (diffs.length) base.difficulties = diffs;
  }
  const posList = strs(r.posList, ALLOWED_POS, 9);
  if (posList.length) base.posList = posList;
  const trendLabels = strs(r.trendLabels, null, 8);
  if (trendLabels.length) base.trendLabels = trendLabels;
  if (r.excludePhrase === true) base.excludePhrase = true;
  if (r.excludeStopwords === true) base.excludeStopwords = true;
  if (
    typeof r.minTrapRate === "number" &&
    Number.isFinite(r.minTrapRate) &&
    r.minTrapRate > 0
  ) {
    base.minTrapRate = Math.min(1, r.minTrapRate);
  }
  const passage = sanitizeVocabPassageScope(r.passage);
  if (passage) base.passage = passage;
  return base;
}

export function sanitizePlanInput(input: WordbookPlanInput): WordbookPlanInput {
  return {
    base: sanitizeBase(input.base),
    sourceSenseIds: strs(input.sourceSenseIds, null, 500),
    size: clampPlanSize(Number(input.size)),
    wordsPerDay: clampWordsPerDay(Number(input.wordsPerDay)),
    studyDays: normalizeStudyDays({ studyDays: input.studyDays }),
    order: ORDER_SCHEMES.includes(input.order) ? input.order : "easy-first",
  };
}

