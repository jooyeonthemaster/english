// ============================================================================
// 단어 훈련 — 문항 조립기 (server-only)
//
// 큐 빌더(queue.ts)가 "어떤 sense 를 낼지" 를 정하면, 이 모듈이 "그 sense 를 어떤
// 문항으로 만들지" 를 정한다. 유형별 재료(예문·형제 뜻·오답 선지)를 모아 붙이고,
// 재료가 모자라면 폴백 사슬로 다른 유형에 넘긴다.
//
// ★ 이 파일의 최우선 규약: **정답이 되는 값을 페이로드에 넣지 않는다.**
//   lemma 는 base 가 아니라 유형별 필드이고(표제어를 묻는 유형엔 없다), 힌트에도
//   정답 표기를 넣지 않는다. EXAMPLE_MATCH·TRAP_JUDGE 의 채점 근거는 암호화된
//   probe 토큰에만 담는다(적대검수 2026-08-04).
// ============================================================================
import "server-only";

import type { VocabDrillSense } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { blankOutSurface, exampleSourceLabel, fetchDistractorPool } from "./content";
import { normalizeAnswer, normalizeKo } from "./grade";
import type { VocabClientItem, VocabItemType } from "./payload";
import { opaqueLabel, sealProbe } from "./probe";

/** 배열을 섞는다 — 선지 위치·문항 순서 무작위화. */
export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── 문항 재료 일괄 수집 ──────────────────────────────────────────────────────
// 큐 하나(≤12 sense)당 질의 4번으로 끝낸다: 예문·표제어·형제 sense·오답 풀.

interface ExampleLite {
  id: string;
  senseId: string;
  en: string;
  ko: string;
  surface: string;
  year: number | null;
  grade: string | null;
  typeGroup: string | null;
}

export interface BuildSupport {
  examplesBySense: Map<string, ExampleLite[]>;
  lemmaById: Map<string, { confusable: string[]; collocations: string[] }>;
  siblingsByLemma: Map<string, VocabDrillSense[]>;
  meanings: { senseKo: string; lemmaId: string; pos: string }[];
  lemmas: { lemma: string; lemmaId: string; pos: string }[];
}

export async function collectSupport(senses: VocabDrillSense[]): Promise<BuildSupport> {
  const senseIds = senses.map((s) => s.id);
  const lemmaIds = [...new Set(senses.map((s) => s.lemmaId))];
  const posList = [...new Set(senses.map((s) => s.pos))];
  const difficulties = [
    ...new Set(senses.flatMap((s) => [s.difficulty, Math.min(5, s.difficulty + 1), Math.max(1, s.difficulty - 1)])),
  ];

  const [lemmaRows, siblingRows, pool] = await Promise.all([
    prisma.vocabDrillLemma.findMany({
      where: { id: { in: lemmaIds }, retiredAt: null },
      select: { id: true, confusable: true, collocations: true },
    }),
    prisma.vocabDrillSense.findMany({
      where: { lemmaId: { in: lemmaIds }, retiredAt: null },
      orderBy: { senseOrder: "asc" },
      take: 200,
    }),
    fetchDistractorPool(posList, difficulties),
  ]);

  // 예문은 대상 sense 뿐 아니라 **형제 sense 것까지** 떠온다 —
  // EXAMPLE_MATCH(뜻↔예문 짝짓기)·TRAP_JUDGE 의 재료다. senseId 인덱스를 탄다.
  const exampleSenseIds = [
    ...new Set([...senseIds, ...siblingRows.map((s) => s.id)]),
  ].slice(0, 250);
  const examples = await prisma.vocabDrillExample.findMany({
    where: { senseId: { in: exampleSenseIds }, retiredAt: null },
    orderBy: [{ senseId: "asc" }, { ord: "asc" }],
    take: 500,
    select: {
      id: true,
      senseId: true,
      en: true,
      ko: true,
      surface: true,
      year: true,
      grade: true,
      typeGroup: true,
    },
  });

  const examplesBySense = new Map<string, ExampleLite[]>();
  for (const e of examples) {
    const list = examplesBySense.get(e.senseId) ?? [];
    list.push(e);
    examplesBySense.set(e.senseId, list);
  }
  const lemmaById = new Map(
    lemmaRows.map((l) => [
      l.id,
      {
        confusable: (Array.isArray(l.confusable) ? l.confusable : []).filter(
          (x): x is string => typeof x === "string",
        ),
        collocations: (Array.isArray(l.collocations) ? l.collocations : []).filter(
          (x): x is string => typeof x === "string",
        ),
      },
    ]),
  );
  const siblingsByLemma = new Map<string, VocabDrillSense[]>();
  for (const s of siblingRows) {
    const list = siblingsByLemma.get(s.lemmaId) ?? [];
    list.push(s);
    siblingsByLemma.set(s.lemmaId, list);
  }
  return { examplesBySense, lemmaById, siblingsByLemma, meanings: pool.meanings, lemmas: pool.lemmas };
}

// ── 오답 선지 ────────────────────────────────────────────────────────────────

function pickMeaningDistractors(
  sense: VocabDrillSense,
  support: BuildSupport,
  n: number,
): string[] {
  const taken = new Set<string>([normalizeKo(sense.senseKo)]);
  const out: string[] = [];
  // 같은 품사 우선 — 명사 문항에 동사 뜻("~하다")이 섞이면 품사만으로 소거된다(실측).
  const shuffled = shuffle(support.meanings);
  for (const pool of [
    shuffled.filter((c) => c.pos === sense.pos),
    shuffled.filter((c) => c.pos !== sense.pos),
  ]) {
    for (const cand of pool) {
      if (out.length >= n) break;
      if (cand.lemmaId === sense.lemmaId) continue; // 같은 표제어의 다른 뜻 금지
      const key = normalizeKo(cand.senseKo);
      if (taken.has(key)) continue;
      taken.add(key);
      out.push(cand.senseKo);
    }
  }
  return out;
}

function pickLemmaDistractors(
  sense: VocabDrillSense,
  support: BuildSupport,
  n: number,
): string[] {
  const taken = new Set<string>([normalizeAnswer(sense.lemma)]);
  const out: string[] = [];
  const confusable = support.lemmaById.get(sense.lemmaId)?.confusable ?? [];
  for (const c of confusable) {
    if (out.length >= n) break;
    const key = normalizeAnswer(c);
    if (taken.has(key)) continue;
    taken.add(key);
    out.push(c);
  }
  for (const cand of shuffle(support.lemmas)) {
    if (out.length >= n) break;
    if (cand.lemmaId === sense.lemmaId) continue;
    const key = normalizeAnswer(cand.lemma);
    if (taken.has(key)) continue;
    taken.add(key);
    out.push(cand.lemma);
  }
  return out;
}

// ── 문항 조립 ────────────────────────────────────────────────────────────────

function maskLemmaInText(text: string, surface: string, lemma: string): string {
  const blanked = blankOutSurface(text, surface) ?? blankOutSurface(text, lemma);
  return blanked ?? text;
}

/**
 * 전 유형 공통 필드만 담는다. **lemma 는 여기 없다** — 표제어를 묻는 유형
 * (WORD_CHOICE·CONTEXT_FILL·SPELL)에서는 그것이 곧 정답이기 때문이다.
 * lemma 가 필요한 유형은 각 분기에서 명시적으로 얹는다(payload.ts 유니온 참조).
 */
function base<T extends VocabItemType>(sense: VocabDrillSense, type: T, ord: number) {
  return {
    id: `${sense.id}:${type}:${ord}`,
    senseId: sense.id,
    lemmaId: sense.lemmaId,
    pos: sense.pos,
    tier: sense.tier,
    difficulty: sense.difficulty,
    type,
  };
}

const POS_KO: Record<string, string> = {
  noun: "명사",
  verb: "동사",
  adjective: "형용사",
  adverb: "부사",
  preposition: "전치사",
  conjunction: "접속사",
  idiom: "숙어",
  phrasal_verb: "구동사",
  collocation: "연어",
};

export function buildItem(
  sense: VocabDrillSense,
  type: VocabItemType,
  ord: number,
  support: BuildSupport,
): VocabClientItem | null {
  const examples = support.examplesBySense.get(sense.id) ?? [];
  const posKo = POS_KO[sense.pos] ?? sense.pos;

  switch (type) {
    case "MEANING_CHOICE": {
      const distractors = pickMeaningDistractors(sense, support, 3);
      if (distractors.length < 2) return null;
      const ex = examples[0];
      const maskedExample = ex
        ? maskLemmaInText(ex.en, ex.surface, sense.lemma)
        : null;
      return {
        ...base(sense, type, ord),
        lemma: sense.lemma, // 이 유형은 표제어가 문제, 뜻이 정답
        options: shuffle([sense.senseKo, ...distractors]),
        hints: [
          `${posKo} · ${sense.tier} 티어의 단어입니다.`,
          maskedExample
            ? `기출 예문: ${maskedExample}`
            : `${sense.difficulty}단계 난이도의 단어입니다.`,
        ],
      };
    }
    case "WORD_CHOICE": {
      const distractors = pickLemmaDistractors(sense, support, 3);
      if (distractors.length < 2) return null;
      return {
        ...base(sense, type, ord),
        senseKo: sense.senseKo,
        senseEn: sense.senseEn,
        options: shuffle([sense.lemma, ...distractors]),
        hints: [
          `${posKo} · ${sense.tier} 티어의 단어입니다.`,
          `${sense.lemma.length}글자입니다.`,
        ],
      };
    }
    case "CONTEXT_FILL": {
      const ex = examples.find(
        (e) => blankOutSurface(e.en, e.surface) ?? blankOutSurface(e.en, sense.lemma),
      );
      if (!ex) return null;
      const sentence =
        blankOutSurface(ex.en, ex.surface) ?? blankOutSurface(ex.en, sense.lemma);
      if (!sentence) return null;
      const distractors = pickLemmaDistractors(sense, support, 3);
      if (distractors.length < 2) return null;
      return {
        ...base(sense, type, ord),
        exampleId: ex.id,
        sentence,
        sourceLabel: exampleSourceLabel(ex),
        options: shuffle([sense.lemma, ...distractors]),
        hints: [
          // 뜻(senseKo)을 힌트로 주면 선지에서 뜻이 맞는 표제어를 고르면 되므로 곧 정답이다.
          `빈칸에는 ${posKo}가 들어갑니다.`,
          `${sense.lemma.length}글자입니다.`,
        ],
      };
    }
    case "SPELL": {
      // 철자 문항은 단일 낱말만 — 하이픈·아포스트로피 포함형은 입력 규약이 모호하다.
      if (sense.isPhrase || /[^a-zA-Z]/.test(sense.lemma)) return null;
      return {
        ...base(sense, type, ord),
        senseKo: sense.senseKo,
        senseEn: sense.senseEn,
        length: sense.lemma.length,
        hints: [
          `${sense.lemma.length}글자 ${posKo}입니다.`,
          `첫 글자는 "${sense.lemma[0]}" 입니다.`,
        ],
      };
    }
    case "TRAP_JUDGE": {
      const siblings = (support.siblingsByLemma.get(sense.lemmaId) ?? []).filter(
        (s) => s.id !== sense.id && normalizeKo(s.senseKo) !== normalizeKo(sense.senseKo),
      );
      const ex = examples[0];
      if (!ex || !siblings.length) return null;
      const useTrue = Math.random() < 0.5;
      const claim = useTrue ? sense : siblings[Math.floor(Math.random() * siblings.length)];
      return {
        ...base(sense, type, ord),
        lemma: sense.lemma, // 어떤 단어의 뜻을 판정하는지 알아야 문항이 성립한다
        exampleId: ex.id,
        sentence: ex.en,
        sourceLabel: exampleSourceLabel(ex),
        claimKo: claim.senseKo,
        probe: sealProbe({
          kind: "TRAP_JUDGE",
          senseId: sense.id,
          claimSenseId: claim.id,
          exampleId: ex.id,
        }),
        hints: [
          `이 표제어는 뜻이 ${siblings.length + 1}개인 다의어입니다.`,
          `문장 전체의 흐름과 뜻이 맞는지 확인하세요.`,
        ],
      };
    }
    case "EXAMPLE_MATCH": {
      const siblings = (support.siblingsByLemma.get(sense.lemmaId) ?? []).filter(
        (s) => (support.examplesBySense.get(s.id) ?? []).length > 0,
      );
      const uniqueKo = new Map<string, VocabDrillSense>();
      for (const s of siblings) {
        const key = normalizeKo(s.senseKo);
        if (!uniqueKo.has(key)) uniqueKo.set(key, s);
      }
      const picked = [...uniqueKo.values()].slice(0, 3);
      if (picked.length < 3) return null;
      const pairs = picked.flatMap((s) => {
        const e = (support.examplesBySense.get(s.id) ?? [])[0];
        return e ? [{ sense: s, example: e }] : [];
      });
      if (pairs.length < 3) return null;
      // 라벨은 큐 한정 난수다 — 전역 senseId/exampleId 를 실으면 sense 상세 라우트로
      // 짝을 역산할 수 있다(적대검수 2026-08-04). 매핑은 probe 안에만 존재한다.
      const labeled = pairs.map((p) => ({
        ...p,
        senseLabel: opaqueLabel(),
        exampleLabel: opaqueLabel(),
      }));
      const senseLabels: Record<string, string> = {};
      const exampleLabels: Record<string, { exampleId: string; senseId: string }> = {};
      for (const p of labeled) {
        senseLabels[p.senseLabel] = p.sense.id;
        exampleLabels[p.exampleLabel] = {
          exampleId: p.example.id,
          senseId: p.sense.id,
        };
      }
      return {
        ...base(sense, type, ord),
        lemma: sense.lemma,
        senses: shuffle(
          labeled.map((p) => ({ key: p.senseLabel, senseKo: p.sense.senseKo })),
        ),
        examples: shuffle(
          labeled.map((p) => ({
            exampleId: p.exampleLabel,
            sentence: p.example.en,
          })),
        ),
        probe: sealProbe({
          kind: "EXAMPLE_MATCH",
          senseId: sense.id,
          senseLabels,
          exampleLabels,
        }),
        hints: [
          `같은 단어 "${sense.lemma}" 의 서로 다른 뜻 3개입니다.`,
          `각 문장에서 단어가 어떤 목적어·전치사와 쓰였는지 보세요.`,
        ],
      };
    }
    case "FLASH": {
      const ex = examples[0] ?? null;
      const collocations = (support.lemmaById.get(sense.lemmaId)?.collocations ?? []).slice(0, 4);
      return {
        ...base(sense, type, ord),
        lemma: sense.lemma, // 학습 카드 앞면
        senseKo: sense.senseKo,
        senseEn: sense.senseEn,
        example: ex ? { en: ex.en, ko: ex.ko } : null,
        collocations,
        hints: ["", ""],
      };
    }
  }
}

/** box → 유형. 재료가 안 되면(예문·형제 없음 등) 조립 단계에서 폴백한다. */
export function typeForBox(box: number, ord: number): VocabItemType {
  if (box <= 1) return "MEANING_CHOICE";
  if (box <= 3) return ord % 2 === 0 ? "WORD_CHOICE" : "CONTEXT_FILL";
  return ord % 2 === 0 ? "SPELL" : "TRAP_JUDGE";
}

const TYPE_FALLBACKS: Record<VocabItemType, VocabItemType[]> = {
  MEANING_CHOICE: ["WORD_CHOICE"],
  WORD_CHOICE: ["MEANING_CHOICE"],
  CONTEXT_FILL: ["WORD_CHOICE", "MEANING_CHOICE"],
  SPELL: ["WORD_CHOICE", "MEANING_CHOICE"],
  TRAP_JUDGE: ["CONTEXT_FILL", "MEANING_CHOICE"],
  EXAMPLE_MATCH: ["WORD_CHOICE", "MEANING_CHOICE"],
  FLASH: [],
};

/**
 * @param allowed 선생님이 고른 출제 유형(과제 spec.itemTypes) — **선호이지 보장이
 *   아니다**. 허용 집합을 먼저 순회하고, 전부 조립 불가(예: 숙어의 SPELL)면
 *   전체 폴백 체인으로 넘어간다. 하드 제한으로 두면 유형 제약 탓에 서빙 불가
 *   sense 가 생겨 과제가 영구 미완료가 된다(완료 가능성 > 유형 순도).
 */
export function buildWithFallback(
  sense: VocabDrillSense,
  type: VocabItemType,
  ord: number,
  support: BuildSupport,
  allowed?: VocabItemType[],
): VocabClientItem | null {
  if (allowed?.length) {
    // 선호 유형부터, 이어서 허용 집합의 나머지를 순서대로.
    const start = Math.max(0, allowed.indexOf(type));
    for (let k = 0; k < allowed.length; k++) {
      const t = allowed[(start + k) % allowed.length];
      const item = buildItem(sense, t, ord, support);
      if (item) return item;
    }
  }
  const item = buildItem(sense, type, ord, support);
  if (item) return item;
  for (const fb of TYPE_FALLBACKS[type]) {
    const alt = buildItem(sense, fb, ord, support);
    if (alt) return alt;
  }
  return null;
}

