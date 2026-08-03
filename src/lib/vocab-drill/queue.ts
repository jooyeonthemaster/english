// ============================================================================
// 단어 훈련 — 큐 빌더 (server-only)
//
// 이 모듈은 "**어떤 sense 를 낼지**" 만 정한다 — 문항 조립(선지·힌트·probe)은
// queue-items.ts 소관이다.
// 어법 orderCandidates 3층(미출제→오답→최저빈도)의 정신을 승계하되, 후보 풀을
// 메모리 전수 스캔이 아니라 **DB 인덱스 질의 + LIMIT** 으로 가져온다(Q1~Q3).
// 문항 유형은 box 난이도 창이 정한다:
//   box 0~1  MEANING_CHOICE      (표제어 → 뜻)
//   box 2~3  WORD_CHOICE / CONTEXT_FILL (뜻·문맥 → 표제어)
//   box 4~5  SPELL / TRAP_JUDGE  (출력·함정 판별)
// ============================================================================
import "server-only";

import type { VocabDrillSense } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { QUEUE_SIZE, DECK_TEST_SIZE, WEAK_SCORE } from "./constants";
import { getSensesByIds, resolveDeckSenses } from "./content";
import { deckStageAllows } from "./deck-progress";
import type {
  VocabClientItem,
  VocabDeckSpec,
  VocabDrillMode,
  VocabItemType,
  VocabQueueResponse,
} from "./payload";
import {
  buildItem,
  buildWithFallback,
  collectSupport,
  shuffle,
  typeForBox,
} from "./queue-items";

interface QueueSession {
  studentId: string;
  academyId: string;
}

interface QueueOpts {
  deckId?: string;
  assignmentId?: string;
}

/**
 * 정상적 빈 상태 — "복습할 게 없다", "과제를 다 풀었다" 는 오류가 아니다.
 * null(→404)은 **존재하지 않는 덱·과제** 에만 쓴다. 이 구분이 없으면 학생이
 * 정상 상황에서 "문항을 불러오지 못했습니다" 오류 화면을 본다(적대검수 2026-08-04).
 */
function EMPTY(
  mode: VocabDrillMode,
  title: string,
  deckId?: string,
): VocabQueueResponse {
  return { mode, title, items: [], ...(deckId ? { deckId } : {}) };
}

// ── 후보 sense 선정 ──────────────────────────────────────────────────────────

/**
 * rows 순서(만기순·취약순)를 정본으로 sense 를 재배열한다.
 * findMany(id in) 은 DB 반환 순서라 그대로 쓰면 우선순위가 사라진다.
 */
function orderByRows(
  rows: { senseId: string }[],
  senses: VocabDrillSense[],
): VocabDrillSense[] {
  const byId = new Map(senses.map((s) => [s.id, s]));
  return rows
    .map((r) => byId.get(r.senseId))
    .filter((s): s is VocabDrillSense => s !== undefined);
}

/** 학생 숙달도와 병합해 (sense, box) 목록으로. box 는 문항 유형 결정에만 쓴다. */
async function attachBoxes(
  studentId: string,
  senses: VocabDrillSense[],
): Promise<{ sense: VocabDrillSense; box: number }[]> {
  if (!senses.length) return [];
  const rows = await prisma.vocabDrillMastery.findMany({
    where: { studentId, senseId: { in: senses.map((s) => s.id) } },
    select: { senseId: true, box: true },
  });
  const boxBySense = new Map(rows.map((r) => [r.senseId, r.box]));
  return senses.map((sense) => ({ sense, box: boxBySense.get(sense.id) ?? 0 }));
}

/**
 * 뜻 고르기 문항 가치가 없는 초고빈도 기능어 — 자동 편성에서만 제외한다
 * (덱 spec 이 명시하면 서빙된다 — 디렉터 의도 우선).
 */
const DRILL_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "so", "that", "this", "these", "those",
  "it", "its", "they", "them", "their", "he", "she", "his", "her", "him", "you",
  "your", "we", "our", "who", "whom", "whose", "which", "what", "when", "where",
  "how", "why", "not", "no", "yes", "do", "does", "did", "have", "has", "had",
  "be", "been", "being", "was", "were", "will", "would", "can", "could", "may",
  "might", "must", "shall", "should", "there", "here", "then", "than", "very",
  "just", "only", "also", "too", "more", "most", "much", "many", "some", "any",
  "all", "both", "each", "every", "other", "another", "such", "own", "same",
  "one", "two", "first", "now", "even", "still", "again", "ever", "never",
  "of one's", "one's",
]);

/** 전역 드릴 풀 — ①만기 복습 ②취약 ③미학습 고빈도 3층 병합(각 층 인덱스 질의). */
async function globalDrillSenses(studentId: string): Promise<VocabDrillSense[]> {
  const now = new Date();
  const [due, weak] = await Promise.all([
    prisma.vocabDrillMastery.findMany({
      where: { studentId, dueAt: { lte: now } },
      orderBy: { dueAt: "asc" },
      take: 4,
      select: { senseId: true },
    }),
    prisma.vocabDrillMastery.findMany({
      where: { studentId, masteryScore: { lt: WEAK_SCORE }, attempts: { gte: 2 } },
      orderBy: { masteryScore: "asc" },
      take: 6,
      select: { senseId: true },
    }),
  ]);
  const pickedIds = new Set<string>();
  for (const r of due) pickedIds.add(r.senseId);
  for (const r of weak) {
    if (pickedIds.size >= 7) break;
    pickedIds.add(r.senseId);
  }
  const picked = await getSensesByIds([...pickedIds]);

  // 미학습 고빈도 보충 — 이미 숙달도 행이 있는 sense 는 제외한다.
  // 실측 교훈(2026-08-04 스모크): 코퍼스 최고빈도 지대는 to·that·have·not 류 기능어다.
  // 품사 필터만으로는 안 끝난다(that 이 대명사류로, in 이 부사로 태깅돼 빠져나온다) —
  // 불용어 목록 + core/academic 티어 + 철자 기준 중복 제거로 삼중 차단한다.
  const need = QUEUE_SIZE - picked.length;
  if (need > 0) {
    const seen = await prisma.vocabDrillMastery.findMany({
      where: { studentId },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: { senseId: true },
    });
    const seenIds = new Set(seen.map((r) => r.senseId));
    const fresh = await prisma.vocabDrillSense.findMany({
      where: {
        retiredAt: null,
        tier: { in: ["core", "academic"] },
        pos: { notIn: ["preposition", "conjunction"] },
        difficulty: { gte: 2 },
      },
      orderBy: [{ per10k: { sort: "desc", nulls: "last" } }, { id: "asc" }],
      take: 120,
    });
    const usedLemmas = new Set(picked.map((s) => s.lemma.toLowerCase()));
    for (const s of fresh) {
      if (picked.length >= QUEUE_SIZE) break;
      if (seenIds.has(s.id) || pickedIds.has(s.id)) continue;
      const key = s.lemma.toLowerCase();
      if (key.length <= 2 || DRILL_STOPWORDS.has(key)) continue;
      if (usedLemmas.has(key)) continue;
      usedLemmas.add(key);
      picked.push(s);
    }
  }
  return picked.slice(0, QUEUE_SIZE);
}

async function deckById(deckId: string, academyId: string) {
  return prisma.vocabDrillDeck.findFirst({
    where: { id: deckId, academyId, status: "ACTIVE" },
  });
}

// ── 모드별 빌드 ──────────────────────────────────────────────────────────────

export async function buildVocabQueue(
  session: QueueSession,
  mode: VocabDrillMode,
  opts: QueueOpts,
): Promise<VocabQueueResponse | null> {
  const { studentId, academyId } = session;

  // 덱 문맥 — learn/test 는 덱 필수, drill/context 는 선택.
  let deckTitle: string | null = null;
  let deckSenses: VocabDrillSense[] | null = null;
  if (opts.deckId) {
    const deck = await deckById(opts.deckId, academyId);
    if (!deck) return null;
    deckTitle = deck.title;
    deckSenses = await resolveDeckSenses(deck.spec as VocabDeckSpec);
    if (!deckSenses.length) return null;
  }

  switch (mode) {
    case "learn": {
      if (!deckSenses || !opts.deckId) return null;
      // 아직 FLASH 를 안 본 것부터, 덱 표준 정렬(빈도) 유지.
      const flashed = await prisma.vocabDrillAttempt.groupBy({
        by: ["senseId"],
        where: {
          studentId,
          deckId: opts.deckId,
          itemType: "FLASH",
          senseId: { in: deckSenses.map((s) => s.id) },
        },
      });
      const done = new Set(flashed.map((r) => r.senseId));
      const unseen = deckSenses.filter((s) => !done.has(s.id));
      const targets = (unseen.length ? unseen : deckSenses).slice(0, QUEUE_SIZE);
      const support = await collectSupport(targets);
      const items = targets
        .map((s, i) => buildItem(s, "FLASH", i, support))
        .filter((x): x is VocabClientItem => x !== null);
      if (!items.length) return null;
      return {
        mode,
        title: `${deckTitle} — 학습`,
        deckId: opts.deckId,
        items,
      };
    }

    case "drill":
    case "context": {
      // 덱 문맥이면 단계 게이트를 **서버가** 강제한다(클라 잠금 표시는 안내일 뿐).
      if (opts.deckId) {
        const need = mode === "context" ? "CONTEXT" : "DRILL";
        if (!(await deckStageAllows(studentId, opts.deckId, need))) return null;
      }
      const poolSenses = deckSenses ?? (await globalDrillSenses(studentId));
      if (!poolSenses.length) return EMPTY(mode, deckTitle ?? "오늘의 어휘 드릴", opts.deckId);
      let pool = await attachBoxes(studentId, poolSenses);
      if (deckSenses) {
        // 덱 드릴은 미학습 → 낮은 box 순으로 10개.
        pool = shuffle(pool).sort((a, b) => a.box - b.box).slice(0, QUEUE_SIZE);
      }
      const support = await collectSupport(pool.map((p) => p.sense));
      const items: VocabClientItem[] = [];
      pool.forEach((p, i) => {
        const type = mode === "context" ? "CONTEXT_FILL" : typeForBox(p.box, i);
        const item =
          mode === "context"
            ? buildItem(p.sense, "CONTEXT_FILL", i, support)
            : buildWithFallback(p.sense, type, i, support);
        if (item) items.push(item);
      });
      if (!items.length) return null;
      return {
        mode,
        title: deckTitle
          ? `${deckTitle} — ${mode === "context" ? "문맥 훈련" : "드릴"}`
          : mode === "context"
            ? "문맥 훈련"
            : "오늘의 어휘 드릴",
        deckId: opts.deckId,
        items: items.slice(0, QUEUE_SIZE),
      };
    }

    case "test": {
      if (!deckSenses || !opts.deckId) return null;
      // 단계 미달이면 시험 자체를 발급하지 않는다 — URL 직행으로 MASTERED 를
      // 따가던 경로의 1차 방어선(2차는 completeDeckTest 의 stage 검사).
      if (!(await deckStageAllows(studentId, opts.deckId, "TEST"))) return null;
      const sampled = shuffle(deckSenses).slice(0, DECK_TEST_SIZE);
      const support = await collectSupport(sampled);
      // 12문항 고정 믹스 — 재료가 안 되는 유형은 폴백 사슬이 흡수한다.
      const mix: VocabItemType[] = [
        "MEANING_CHOICE", "MEANING_CHOICE", "MEANING_CHOICE", "MEANING_CHOICE",
        "WORD_CHOICE", "WORD_CHOICE",
        "CONTEXT_FILL", "CONTEXT_FILL", "CONTEXT_FILL",
        "SPELL", "TRAP_JUDGE", "EXAMPLE_MATCH",
      ];
      const items: VocabClientItem[] = [];
      sampled.forEach((s, i) => {
        const item = buildWithFallback(s, mix[i] ?? "MEANING_CHOICE", i, support);
        if (item) items.push(item);
      });
      if (items.length < Math.min(6, sampled.length)) return null;
      return {
        mode,
        title: `${deckTitle} — 덱 시험`,
        deckId: opts.deckId,
        items,
      };
    }

    case "review": {
      const now = new Date();
      const due = await prisma.vocabDrillMastery.findMany({
        where: { studentId, dueAt: { lte: now } },
        orderBy: { dueAt: "asc" },
        take: 20,
        select: { senseId: true, box: true },
      });
      let rows = due;
      if (rows.length < QUEUE_SIZE) {
        const weak = await prisma.vocabDrillMastery.findMany({
          where: {
            studentId,
            masteryScore: { lt: WEAK_SCORE },
            senseId: { notIn: rows.map((r) => r.senseId) },
          },
          orderBy: { masteryScore: "asc" },
          take: QUEUE_SIZE - rows.length,
          select: { senseId: true, box: true },
        });
        rows = [...rows, ...weak];
      }
      if (!rows.length) return EMPTY(mode, "오늘의 복습");
      // rows 순서가 정본이다 — getSensesByIds 는 DB 반환 순서라 만기 정렬을 잃는다.
      const senses = orderByRows(rows, await getSensesByIds(rows.map((r) => r.senseId)));
      const boxBySense = new Map(rows.map((r) => [r.senseId, r.box]));
      const support = await collectSupport(senses.slice(0, QUEUE_SIZE));
      const items: VocabClientItem[] = [];
      senses.slice(0, QUEUE_SIZE).forEach((s, i) => {
        const item = buildWithFallback(s, typeForBox(boxBySense.get(s.id) ?? 0, i), i, support);
        if (item) items.push(item);
      });
      if (!items.length) return EMPTY(mode, "오늘의 복습");
      return { mode, title: "오늘의 복습", items };
    }

    case "weak": {
      const rows = await prisma.vocabDrillMastery.findMany({
        where: { studentId, masteryScore: { lt: WEAK_SCORE }, attempts: { gte: 2 } },
        orderBy: { masteryScore: "asc" },
        take: 20,
        select: { senseId: true, box: true },
      });
      if (!rows.length) return EMPTY(mode, "취약 단어 훈련");
      const senses = orderByRows(rows, await getSensesByIds(rows.map((r) => r.senseId)));
      const boxBySense = new Map(rows.map((r) => [r.senseId, r.box]));
      const support = await collectSupport(senses.slice(0, QUEUE_SIZE));
      const items: VocabClientItem[] = [];
      senses.slice(0, QUEUE_SIZE).forEach((s, i) => {
        const item = buildWithFallback(s, typeForBox(boxBySense.get(s.id) ?? 0, i), i, support);
        if (item) items.push(item);
      });
      if (!items.length) return EMPTY(mode, "취약 단어 훈련");
      return { mode, title: "취약 단어 훈련", items };
    }

    case "assignment": {
      if (!opts.assignmentId) return null;
      const assignment = await prisma.vocabDrillAssignment.findFirst({
        where: { id: opts.assignmentId, studentId, academyId },
      });
      if (!assignment) return null;
      if (assignment.status === "DONE") return EMPTY(mode, assignment.title);
      // 부모 과제가 닫혔거나 아직 열리지 않았으면 URL 직행을 막는다.
      if (assignment.assignmentId) {
        const parent = await prisma.studyAssignment.findUnique({
          where: { id: assignment.assignmentId },
          select: { status: true, availableFrom: true },
        });
        if (parent) {
          if (parent.status === "CLOSED") return EMPTY(mode, assignment.title);
          if (parent.availableFrom && parent.availableFrom > new Date()) {
            return EMPTY(mode, assignment.title);
          }
        }
      }
      const spec = assignment.spec as {
        deckIds?: string[];
        senseIds?: string[];
        tiers?: string[];
        difficulties?: number[];
        count?: number;
      };

      let poolSenses: VocabDrillSense[] = [];
      if (spec.senseIds?.length) {
        poolSenses = await getSensesByIds(spec.senseIds);
      } else if (spec.deckIds?.length) {
        const decks = await prisma.vocabDrillDeck.findMany({
          where: { id: { in: spec.deckIds.slice(0, 5) }, academyId },
        });
        for (const d of decks) {
          poolSenses.push(...(await resolveDeckSenses(d.spec as VocabDeckSpec)));
        }
      } else {
        poolSenses = await resolveDeckSenses({
          tiers: spec.tiers,
          difficulties: spec.difficulties,
          limit: 500,
        });
      }
      // 덱이 겹치면 같은 sense 가 두 번 실린다 — 중복 출제·시도 인플레의 원인.
      poolSenses = [...new Map(poolSenses.map((s) => [s.id, s])).values()];
      if (!poolSenses.length) return EMPTY(mode, assignment.title);

      // 목표는 실제 풀 크기로 상한을 둔다 — 배포 가드가 놓친 과제(count > 풀)가
      // 영원히 미완료로 남지 않게. engine.advanceAssignment 와 같은 기준이다.
      const target = Math.max(
        1,
        Math.min(Number(spec?.count ?? 20), poolSenses.length),
      );

      const attempted = await prisma.vocabDrillAttempt.groupBy({
        by: ["senseId"],
        where: { studentId, assignmentId: assignment.id },
      });
      const doneIds = new Set(attempted.map((r) => r.senseId));
      const remaining = Math.max(0, target - doneIds.size);
      if (remaining <= 0) return EMPTY(mode, assignment.title);

      const nextSenses = poolSenses
        .filter((s) => !doneIds.has(s.id))
        .slice(0, Math.min(QUEUE_SIZE, remaining));
      if (!nextSenses.length) return EMPTY(mode, assignment.title);
      const pool = await attachBoxes(studentId, nextSenses);
      const support = await collectSupport(nextSenses);
      const items: VocabClientItem[] = [];
      pool.forEach((p, i) => {
        const item = buildWithFallback(p.sense, typeForBox(p.box, i), i, support);
        if (item) items.push(item);
      });
      if (!items.length) return EMPTY(mode, assignment.title);
      return {
        mode,
        title: assignment.title,
        items,
        assignmentRemaining: remaining,
      };
    }

    default:
      return null;
  }
}
