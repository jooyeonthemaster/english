// ============================================================================
// 학습지 어휘 시험 — 코퍼스 오답 자산 조회 (server-only)
//
// 기출 단어 코퍼스(vocab_drill_*)와 문항 자산 팩(vocab_drill_item_assets)에서
// 학습지 vocabulary rows 의 표제어별 오답 재료를 사전 질의해 컴파일러에 주입한다.
// 규범: docs/class-studio-spec.md §9. 소비자는 compile.ts buildVocabQuiz(순수).
//
// 계약:
//  · 표제어 조회는 trim().toLowerCase() — 코퍼스 lemma 는 소문자 [a-z0-9' -]만.
//  · sense 확정은 senseOrder=0 강제 금지 — 학습지 한국어 뜻을 senseKo·
//    senseKoCandidates 에 토큰 대조(비대표 뜻 17.9% 함정, wordbook-explore 실측).
//  · 문맥 없는 UI 라 팩 meaningChoiceSets(스템 동반 필수)는 쓰지 않는다 —
//    안전 재료는 wordChoiceDistractors(동의어·어간공유 사전 배제)와 confusable 뿐.
//  · bannedKo 는 같은 철자 **전 sense** 표기로 넓힌다(다의어 동의 표기 함정).
//  · 반환 배열은 결정론 정렬 — 셔플·선택은 컴파일러의 seeded rng 소관.
//  · 실패는 전부 fail-open({}) — 어휘 시험은 현행 폴백으로 계속된다.
// ============================================================================

import "server-only";

import type { GenVocab } from "@/lib/passage-report/analysis-report/study-activities";
import { prisma } from "@/lib/prisma";
import { fetchPackAssets } from "@/lib/vocab-drill/pack-assets";
import type { VocabAssetMap, VocabDistractorAsset } from "./types";

const MAX_HEADWORDS = 120;
const POOL_PER_POS = 260;
const KO_DISTRACTORS_PER_WORD = 12;
const EN_DISTRACTORS_PER_WORD = 12;

/** compile.ts normLite 와 동일 규칙(표제어 키) — 계약: 두 곳이 같은 키를 써야 한다. */
const normLite = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

/** 한국어 표기 비교 키 — compile.ts normKo 와 동일 규칙. */
const normKo = (s: string): string =>
  s
    .replace(/\([^)]*\)/g, "")
    .replace(/[~〜∼]/g, "")
    .replace(/[\s·]/g, "")
    .trim();

const koTokens = (s: string): string[] =>
  s
    .split(/[,;/·]/)
    .map((t) => normKo(t))
    .filter((t) => t.length > 0);

/** djb2 — 결정론 오프셋용(compile.ts hashString 과 동일 알고리즘). */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function parseKoCandidates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (v && typeof v === "object" && typeof (v as { ko?: unknown }).ko === "string") {
      out.push((v as { ko: string }).ko);
    }
  }
  return out;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

interface SenseRow {
  id: string;
  lemmaId: string;
  lemma: string;
  pos: string;
  senseKo: string;
  senseKoCandidates: unknown;
  difficulty: number;
  occurrences: number;
}

/**
 * 학습지 vocabulary rows → 표제어별 오답 자산 맵.
 * 질의 4회(표제어 lemma → sense 전량 → 품사별 오답 풀 → 문항팩) — 리포트당 1회 호출.
 */
export async function fetchWorksheetVocabAssets(
  vocab: readonly Pick<GenVocab, "headword" | "meaning">[],
): Promise<VocabAssetMap> {
  try {
    const rows = vocab
      .filter((v) => v.headword?.trim() && v.meaning?.trim())
      .slice(0, MAX_HEADWORDS);
    const keys = [...new Set(rows.map((v) => normLite(v.headword)))];
    if (keys.length === 0) return {};

    const lemmas = await prisma.vocabDrillLemma.findMany({
      where: { lemma: { in: keys }, retiredAt: null },
      select: { id: true, lemma: true, pos: true, confusable: true },
      // 결정론 계약 — confusable 합집합 순서가 DB 행 순서에 종속되지 않게 고정 정렬.
      // (같은 입력이 다른 뜻→단어 선지를 내던 경로 봉합, 적대검수 2026-08-09)
      orderBy: [{ lemma: "asc" }, { pos: "asc" }, { id: "asc" }],
    });
    if (lemmas.length === 0) return {};

    const senses: SenseRow[] = await prisma.vocabDrillSense.findMany({
      where: { lemmaId: { in: lemmas.map((l) => l.id) }, retiredAt: null },
      select: {
        id: true,
        lemmaId: true,
        lemma: true,
        pos: true,
        senseKo: true,
        senseKoCandidates: true,
        difficulty: true,
        occurrences: true,
      },
      orderBy: [{ occurrences: "desc" }, { id: "asc" }],
    });

    // 철자 → sense 전량 (품사 변이 포함 — bannedKo 의 모집단)
    const sensesBySpelling = new Map<string, SenseRow[]>();
    for (const s of senses) {
      const k = normLite(s.lemma);
      const list = sensesBySpelling.get(k);
      if (list) list.push(s);
      else sensesBySpelling.set(k, [s]);
    }

    // 학습지 뜻 ↔ sense 토큰 대조로 대상 sense 확정(표제어당 1개, 대조 실패 시 없음)
    const matchedByKey = new Map<string, SenseRow>();
    for (const row of rows) {
      const key = normLite(row.headword);
      if (matchedByKey.has(key)) continue;
      const candidates = sensesBySpelling.get(key);
      if (!candidates?.length) continue;
      const meaningToks = new Set(koTokens(row.meaning));
      let best: SenseRow | null = null;
      let bestScore = 0;
      for (const s of candidates) {
        const senseToks = [
          ...koTokens(s.senseKo),
          ...parseKoCandidates(s.senseKoCandidates).flatMap(koTokens),
        ];
        const score = senseToks.filter((t) => meaningToks.has(t)).length;
        if (score > bestScore) {
          best = s;
          bestScore = score;
        }
      }
      if (best) matchedByKey.set(key, best);
    }

    // 품사별 오답 풀 — 다른 철자의 고빈도 sense (결정론 정렬)
    const posSet = [...new Set([...matchedByKey.values()].map((s) => s.pos))];
    const poolByPos = new Map<string, { lemma: string; senseKo: string; difficulty: number }[]>();
    await Promise.all(
      posSet.map(async (pos) => {
        const pool = await prisma.vocabDrillSense.findMany({
          where: { pos, retiredAt: null, lemma: { notIn: keys } },
          select: { lemma: true, senseKo: true, difficulty: true },
          orderBy: [{ occurrences: "desc" }, { id: "asc" }],
          take: POOL_PER_POS,
        });
        poolByPos.set(pos, pool);
      }),
    );

    // 문항팩(뜻→단어 방향 wordChoiceDistractors — 동의어·어간공유 사전 배제 완료)
    const packMap = await fetchPackAssets([...matchedByKey.values()].map((s) => s.id));

    const out: VocabAssetMap = {};
    for (const row of rows) {
      const key = normLite(row.headword);
      if (out[key]) continue;
      const spellingSenses = sensesBySpelling.get(key);
      if (!spellingSenses?.length) continue;

      // 오답 금지 표기: 같은 철자 전 sense 의 senseKo + 대안 표기 전량
      const bannedKo = [
        ...new Set(
          spellingSenses.flatMap((s) => [
            s.senseKo,
            ...parseKoCandidates(s.senseKoCandidates),
          ]),
        ),
      ];

      const matched = matchedByKey.get(key);
      const asset: VocabDistractorAsset = {
        koDistractors: [],
        enDistractors: [],
        bannedKo,
      };

      if (matched) {
        const pack = packMap.get(matched.id);
        // serve=false(추출 아티팩트) 철자는 코퍼스 오답을 주지 않는다 — 폴백 강등.
        if (pack && pack.serve === false) {
          out[key] = asset;
          continue;
        }

        // 단어→뜻 오답: 같은 품사·난이도 창(±1, 부족 시 완화) 풀에서 결정론 창 슬라이스
        const pool = poolByPos.get(matched.pos) ?? [];
        const bannedSet = new Set(bannedKo.flatMap(koTokens));
        const eligible = (span: number) =>
          pool.filter(
            (p) =>
              Math.abs(p.difficulty - matched.difficulty) <= span &&
              !koTokens(p.senseKo).some((t) => bannedSet.has(t)),
          );
        let filtered = eligible(1);
        if (filtered.length < KO_DISTRACTORS_PER_WORD) filtered = eligible(2);
        if (filtered.length < KO_DISTRACTORS_PER_WORD) filtered = eligible(99);
        // 표제어별 결정론 오프셋 — 한 학습지의 같은 품사 문항들이 같은 12개를
        // 돌려쓰지 않게 창을 어긋낸다(반복 선지 방지).
        const offset =
          filtered.length > KO_DISTRACTORS_PER_WORD
            ? hashString(key) % (filtered.length - KO_DISTRACTORS_PER_WORD + 1)
            : 0;
        asset.koDistractors = filtered
          .slice(offset, offset + KO_DISTRACTORS_PER_WORD)
          .map((p) => p.senseKo);

        // 뜻→단어 오답: 팩 검증분 우선 + 혼동어(전 품사 변이 union)
        const confusables = [
          ...new Set(
            lemmas
              .filter((l) => normLite(l.lemma) === key)
              .flatMap((l) => parseStringArray(l.confusable)),
          ),
        ];
        const packWc = pack?.asset?.wordChoiceDistractors.map((d) => d.en) ?? [];
        const seen = new Set<string>([key]);
        for (const en of [...packWc, ...confusables]) {
          const k = normLite(en);
          if (!k || seen.has(k)) continue;
          seen.add(k);
          asset.enDistractors.push(en.trim());
          if (asset.enDistractors.length >= EN_DISTRACTORS_PER_WORD) break;
        }
      }

      out[key] = asset;
    }
    return out;
  } catch (e) {
    // 코퍼스 미적재·일시 장애 = 자산 없음으로 강등 — 어휘 시험은 현행 폴백 유지.
    console.error("[worksheet-study] vocab-assets 조회 실패 — 폴백 강등:", e);
    return {};
  }
}
