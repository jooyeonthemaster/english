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
import { fetchPackAssets, type PackRow, type PackSenseAsset } from "./pack-assets";
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
  /** 예문 id 직조회 — 팩 stems·trapClaims 의 exampleId 를 출처 라벨로 되돌린다 */
  exampleById: Map<string, ExampleLite>;
  lemmaById: Map<string, { confusable: string[]; collocations: string[] }>;
  siblingsByLemma: Map<string, VocabDrillSense[]>;
  /** 사전 구축 문항 팩 — 있으면 런타임 조립보다 우선한다(문항 자산 캠페인) */
  packBySense: Map<string, PackRow>;
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

  const [lemmaRows, siblingRows, pool, packBySense] = await Promise.all([
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
    fetchPackAssets(senseIds),
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
  const exampleById = new Map<string, ExampleLite>();
  for (const e of examples) {
    const list = examplesBySense.get(e.senseId) ?? [];
    list.push(e);
    examplesBySense.set(e.senseId, list);
    exampleById.set(e.id, e);
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
  return {
    examplesBySense,
    exampleById,
    lemmaById,
    siblingsByLemma,
    packBySense,
    meanings: pool.meanings,
    lemmas: pool.lemmas,
  };
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

// ── 팩 보조 ──────────────────────────────────────────────────────────────────

const HINT_FILLERS: [string, string] = [
  "문장 속 쓰임을 떠올려 보세요.",
  "함께 자주 나오는 말(연어)을 기억해 보세요.",
];

/**
 * 팩 힌트의 **유형별 살균** (적대검수 C-1 — 팩 힌트는 sense당 1쌍인데 유형마다
 * 정답이 반대라, 무살균 재사용은 정답 유출이다):
 *  · 표제어가 정답인 유형(WORD_CHOICE·CONTEXT_FILL·SPELL): 힌트 속 표제어와
 *    굴절형을 전부 ____ 마스킹. 그래도 남으면 그 힌트 폐기.
 *  · 뜻이 정답인 유형(MEANING_CHOICE): senseKo·통용 표기의 어간이 힌트에
 *    들어 있으면 폐기(팩 게이트의 정확일치 검사는 '손질하다'→"손질하고"를
 *    못 잡았다 — 실측 33건).
 */
function packHints(
  asset: PackSenseAsset,
  sense: VocabDrillSense,
  answerIs: "lemma" | "meaning",
): [string, string] {
  const out: string[] = [];
  if (answerIs === "lemma") {
    const escd = sense.lemma.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 굴절형까지: "getting"·"asked" — 표제어로 시작하는 영단어 토큰 전체를 지운다.
    const re = new RegExp(`(?<![A-Za-z])${escd}[a-z]*`, "gi");
    for (const h of asset.hints) {
      const masked = h.replace(re, "____");
      if (!masked.toLowerCase().includes(sense.lemma.toLowerCase()) || sense.lemma.length < 3) {
        out.push(masked);
      }
    }
  } else {
    // 뜻 어간 유출 검사 — senseKo와 통용 표기의 어미를 벗긴 어간이 힌트에 보이면 폐기.
    const cands = Array.isArray(sense.senseKoCandidates) ? sense.senseKoCandidates : [];
    const stems = [sense.senseKo, ...cands.map((c) => (typeof c === "string" ? c : (c as { ko?: string })?.ko))]
      .filter((x): x is string => typeof x === "string")
      .map((x) => normalizeKo(x).replace(/(하다|하게|하는|하며|되다|스럽다|스러운|스럽게|히|이)$/, ""))
      .filter((x) => x.length >= 2);
    for (const h of asset.hints) {
      const hNorm = normalizeKo(h);
      if (!stems.some((s) => hNorm.includes(s))) out.push(h);
    }
  }
  const clean = out.filter((x) => x.trim().length > 0);
  return [clean[0] ?? HINT_FILLERS[0], clean[1] ?? HINT_FILLERS[1]];
}

/** 팩 스템 선택 — ord 로 결정론 순환(같은 sense 재출제 시 다른 예문). */
function packStem(asset: PackSenseAsset, ord: number) {
  if (!asset.stems.length) return null;
  return asset.stems[ord % asset.stems.length];
}

/**
 * 폴백(팩 없음) 힌트의 오라클 제거 — 감사 확정 병리(블라인드 98.3%의 주범이던
 * "N글자입니다"류)를 서빙에서 삭제한다. 대체는 마스킹된 연어(의미 단서).
 */
function fallbackLemmaHint(
  sense: VocabDrillSense,
  support: BuildSupport,
  posKo: string,
): string {
  const colloc = (support.lemmaById.get(sense.lemmaId)?.collocations ?? [])[0];
  if (colloc) {
    const masked =
      blankOutSurface(colloc, sense.lemma) ??
      (colloc.toLowerCase().includes(sense.lemma.toLowerCase()) ? null : colloc);
    if (masked) return `자주 쓰는 연어: ${masked}`;
  }
  return `${posKo} 자리에서 쓰입니다.`;
}

export function buildItem(
  sense: VocabDrillSense,
  type: VocabItemType,
  ord: number,
  support: BuildSupport,
): VocabClientItem | null {
  // 아티팩트 sense 전면 차단 — buildWithFallback 뿐 아니라 learn(FLASH)·context 가
  // buildItem 을 직접 부르는 경로까지 막는다(적대검수 M-3).
  if (support.packBySense.get(sense.id)?.serve === false) return null;
  const examples = support.examplesBySense.get(sense.id) ?? [];
  const posKo = POS_KO[sense.pos] ?? sense.pos;
  const packRow = support.packBySense.get(sense.id);
  const pack = packRow?.serve ? (packRow.asset ?? null) : null;

  switch (type) {
    case "MEANING_CHOICE": {
      // ── 팩 우선: 설계된 오답 세트 + 문맥 예문 동반(이중정답 방지 불변식) ──
      // 팩 MC 오답에는 같은 표제어의 다른 뜻이 들어간다 — 문맥이 **무조건** 필요하다
      // (적대검수 M-7: contextRequired 여부와 무관). srcEx 는 LIVE 필터를 통과한
      // 원문이다 — 스템 텍스트 복원은 이중 굴절·은퇴 예문 우회를 만든다(M-9).
      if (pack && pack.meaningChoiceSets.length) {
        const stem = packStem(pack, ord);
        const srcEx = stem ? support.exampleById.get(stem.exampleId) : undefined;
        if (srcEx) {
          const set = pack.meaningChoiceSets[ord % pack.meaningChoiceSets.length];
          return {
            ...base(sense, type, ord),
            lemma: sense.lemma,
            options: shuffle([sense.senseKo, ...set.distractors.map((d) => d.ko)]),
            sentence: srcEx.en,
            sourceLabel: exampleSourceLabel(srcEx),
            hints: packHints(pack, sense, "meaning"),
          };
        }
      }
      // 문맥 필수 sense 는 문맥 없는 런타임 MC 로도 내지 않는다(적대검수 M-6 —
      // WORD_CHOICE/SPELL 의 null 이 폴백 체인으로 이 분기에 떨어지는 경로 봉인).
      if (pack?.contextRequired) return null;
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
          `${posKo} 단어입니다.`,
          maskedExample
            ? `기출 예문: ${maskedExample}`
            : "문장 속 쓰임을 떠올려 보세요.",
        ],
      };
    }
    case "WORD_CHOICE": {
      // 문맥 필수 sense 는 문맥 없는 유형으로 내지 않는다(비대표 뜻 무맥락 병리).
      if (pack?.contextRequired) return null;
      // ── 팩 우선: DB 대조로 동의어·어간공유가 배제된 설계 오답 ──
      if (pack && pack.wordChoiceDistractors.length >= 3) {
        return {
          ...base(sense, type, ord),
          senseKo: sense.senseKo,
          senseEn: sense.senseEn,
          options: shuffle([
            sense.lemma,
            ...pack.wordChoiceDistractors.slice(0, 3).map((d) => d.en),
          ]),
          hints: packHints(pack, sense, "lemma"),
        };
      }
      const distractors = pickLemmaDistractors(sense, support, 3);
      if (distractors.length < 2) return null;
      return {
        ...base(sense, type, ord),
        senseKo: sense.senseKo,
        senseEn: sense.senseEn,
        options: shuffle([sense.lemma, ...distractors]),
        hints: [
          `${posKo} 단어입니다.`,
          // 감사 확정 병리: "N글자입니다" 힌트는 선지 길이 대조만으로 정답을
          // 주는 오라클이었다 — 의미 단서(마스킹 연어)로 교체.
          fallbackLemmaHint(sense, support, posKo),
        ],
      };
    }
    case "CONTEXT_FILL": {
      // ── 팩 우선: 검증된 스템 + 설계 오답 ──
      if (pack) {
        const stem = packStem(pack, ord);
        const srcEx = stem ? support.exampleById.get(stem.exampleId) : undefined;
        if (stem && srcEx && pack.wordChoiceDistractors.length >= 3) {
          // 정답 잔존 재마스킹(적대검수 C-2) — luna 마스킹은 첫 등장만 지운 사례가
          // 있다("in one hour, it will use 10 Wh"). blankOutSurface 는 전 등장을
          // 지운다(/g) — 표제어·표면형 순으로 재적용 후에도 표제어가 단어 경계로
          // 남아 있으면 그 스템은 쓰지 않는다.
          let text: string | null = stem.text;
          text = blankOutSurface(text, sense.lemma) ?? blankOutSurface(text, stem.answerSurface) ?? text;
          const leakRe = new RegExp(
            `(?<![A-Za-z])${sense.lemma.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`,
            "i",
          );
          if (!leakRe.test(text)) {
            return {
              ...base(sense, type, ord),
              exampleId: stem.exampleId,
              sentence: text,
              sourceLabel: exampleSourceLabel(srcEx),
              options: shuffle([
                sense.lemma,
                ...pack.wordChoiceDistractors.slice(0, 3).map((d) => d.en),
              ]),
              hints: packHints(pack, sense, "lemma"),
            };
          }
        }
      }
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
          // "N글자" 오라클 제거(감사 확정 병리) — 의미 단서로 교체.
          fallbackLemmaHint(sense, support, posKo),
        ],
      };
    }
    case "SPELL": {
      // 철자 문항은 단일 낱말만 — 하이픈·아포스트로피 포함형은 입력 규약이 모호하다.
      if (sense.isPhrase || /[^a-zA-Z]/.test(sense.lemma)) return null;
      // 팩이 부적격 판정(기능어·동의어 구분 불가·문맥 필수)한 sense 는 내지 않는다.
      if (pack && (!pack.spellEligible || pack.contextRequired)) return null;
      return {
        ...base(sense, type, ord),
        senseKo: sense.senseKo,
        senseEn: sense.senseEn,
        length: sense.lemma.length, // 입력 칸 렌더링용 — 형식 고유값
        hints: pack
          ? packHints(pack, sense, "lemma")
          : [
              `${posKo} 단어입니다.`,
              // "첫 글자" 힌트는 절반의 정답 공개다(감사) — 의미 단서로 교체.
              fallbackLemmaHint(sense, support, posKo),
            ],
      };
    }
    case "TRAP_JUDGE": {
      // ── 팩 우선: 함정노트 기반 설계 주장(근거 게이트 통과) ──
      // 참/거짓을 코인플립으로 강제 균형한다(적대검수 M-5: 팩 주장의 83%가
      // 거짓이라 그대로 내면 "무조건 X" 오라클이 된다). 참 주장이 팩에 없으면
      // sense 의 senseKo 로 합성한다 — 런타임 경로의 참 주장과 같은 형태다.
      if (pack && pack.trapClaims.length) {
        const falses = pack.trapClaims.filter((t) => !t.isTrue);
        const trues = pack.trapClaims.filter((t) => t.isTrue);
        const useTrue = Math.random() < 0.5;
        const pool = useTrue ? trues : falses;
        const picked = pool.length
          ? pool[Math.floor(Math.random() * pool.length)]
          : null;
        const anyEx = pack.trapClaims[Math.floor(Math.random() * pack.trapClaims.length)];
        const claim =
          picked ??
          (useTrue
            ? { exampleId: anyEx.exampleId, claimKo: sense.senseKo, isTrue: true }
            : null);
        const ex = claim ? support.exampleById.get(claim.exampleId) : undefined;
        if (claim && ex) {
          return {
            ...base(sense, type, ord),
            lemma: sense.lemma,
            exampleId: claim.exampleId,
            sentence: ex.en,
            sourceLabel: exampleSourceLabel(ex),
            claimKo: claim.claimKo,
            probe: sealProbe({
              kind: "TRAP_JUDGE",
              senseId: sense.id,
              // 거짓 주장은 실키 sense 가 아니라 자유 표기 — 감시값이 ≠senseId 를
              // 보장해 기존 채점식(claimSenseId===senseId → 참)이 그대로 성립한다.
              claimSenseId: claim.isTrue ? sense.id : "pack:false",
              claimKo: claim.claimKo,
              exampleId: claim.exampleId,
            }),
            hints: [
              // 팩 힌트는 뜻 풀이라 주장 판정의 답을 흘린다 — 중립 힌트만 쓴다.
              `이 표제어는 뜻이 여러 개인 다의어일 수 있습니다.`,
              `문장 전체의 흐름과 뜻이 맞는지 확인하세요.`,
            ],
          };
        }
      }
      const siblings = (support.siblingsByLemma.get(sense.lemmaId) ?? []).filter(
        (s) =>
          s.id !== sense.id &&
          normalizeKo(s.senseKo) !== normalizeKo(sense.senseKo) &&
          // 아티팩트 형제 뜻이 주장으로 새는 우회 봉인(적대검수 M-4)
          support.packBySense.get(s.id)?.serve !== false,
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
        (s) =>
          (support.examplesBySense.get(s.id) ?? []).length > 0 &&
          // 아티팩트 형제 sense 가 짝짓기 선지·채점 정본으로 새는 우회 봉인(M-4)
          support.packBySense.get(s.id)?.serve !== false,
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
  // 추출 아티팩트("not a because b" 류) — 팩이 서빙 부적격 판정한 sense 는
  // 어떤 유형으로도 내지 않는다(감사 확정 병리: 아티팩트 17종 서빙).
  if (support.packBySense.get(sense.id)?.serve === false) return null;
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

