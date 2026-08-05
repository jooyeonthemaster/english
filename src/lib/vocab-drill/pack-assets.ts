// ============================================================================
// 단어 훈련 — 사전 구축 문항 팩 조회 (server-only)
//
// 문항 자산 캠페인(2026-08 · 품질 전수조사 후속)이 luna 로 사전 구축한 sense 별
// 문항 팩을 서빙에 공급한다. 정본은 experiments/vocab-item-assets/packs 의 파일이고
// vocab_drill_item_assets 테이블은 그 적재본이다(scripts/vocab-item-assets/load-db.mjs).
//
// 소비 규약:
//  · 팩이 있으면 팩이 우선이다 — 런타임 즉석 조립(랜덤 오답·글자수 힌트)은 팩이
//    없는 꼬리의 폴백일 뿐이다.
//  · serve=false 행(추출 아티팩트: "not a because b" 류)은 **어떤 유형으로도
//    서빙하지 않는다** — buildWithFallback 이 null 을 돌려 큐에서 빠진다.
//  · 팩 MC 오답에는 같은 표제어의 다른 뜻이 의도적으로 들어간다(사람 vs 인칭).
//    그래서 팩 MEANING_CHOICE 는 **반드시 문맥 스템과 함께** 렌더한다 — 문맥 없이
//    내면 이중정답이 된다(재파일럿 실측: develop 개발하다/발전시키다).
// ============================================================================
import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface PackStem {
  exampleId: string;
  /** 기출 문장 — 대상 어절이 이미 ____ 로 비워져 있다 */
  text: string;
  /** 원문 굴절형(채점·복원용 — 클라이언트에 내리지 않는다) */
  answerSurface: string;
}

export interface PackMcDistractor {
  ko: string;
  whyWrong?: string;
}

export interface PackWcDistractor {
  en: string;
  whyWrong?: string;
}

export interface PackTrapClaim {
  exampleId: string;
  claimKo: string;
  isTrue: boolean;
  basis?: string;
}

export interface PackSenseAsset {
  pos: string;
  contextRequired: boolean;
  stems: PackStem[];
  meaningChoiceSets: { distractors: PackMcDistractor[] }[];
  wordChoiceDistractors: PackWcDistractor[];
  hints: string[];
  trapClaims: PackTrapClaim[];
  spellEligible: boolean;
}

export interface PackRow {
  serve: boolean;
  asset: PackSenseAsset | null;
}

const asArr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function parseAsset(content: unknown): PackSenseAsset | null {
  if (!content || typeof content !== "object") return null;
  const c = content as Record<string, unknown>;
  return {
    pos: typeof c.pos === "string" ? c.pos : "",
    contextRequired: c.contextRequired === true,
    stems: asArr<PackStem>(c.stems).filter(
      (s) =>
        typeof s?.text === "string" &&
        s.text.includes("____") &&
        typeof s?.answerSurface === "string" &&
        s.answerSurface.trim().length > 0 &&
        typeof s?.exampleId === "string",
    ),
    meaningChoiceSets: asArr<{ distractors: PackMcDistractor[] }>(
      c.meaningChoiceSets,
    ).filter((set) => asArr(set?.distractors).length === 3),
    wordChoiceDistractors: asArr<PackWcDistractor>(c.wordChoiceDistractors).filter(
      (d) => typeof d?.en === "string" && d.en.trim().length > 0,
    ),
    hints: asArr<string>(c.hints).filter((h) => typeof h === "string"),
    trapClaims: asArr<PackTrapClaim>(c.trapClaims).filter(
      (t) =>
        typeof t?.claimKo === "string" &&
        typeof t?.exampleId === "string" &&
        typeof t?.isTrue === "boolean",
    ),
    spellEligible: c.spellEligible === true,
  };
}

/** 큐 하나(≤12 sense)의 팩을 일괄 조회 — senseId → {serve, asset}. */
export async function fetchPackAssets(
  senseIds: string[],
): Promise<Map<string, PackRow>> {
  const ids = [...new Set(senseIds)].slice(0, 500);
  if (!ids.length) return new Map();
  try {
    // gate_clean 조건 — 게이트 미통과 세대가 부분 적재돼도 서빙에 섞이지 않는다.
    const rows = await prisma.$queryRaw<
      { sense_id: string; serve: boolean; content: unknown }[]
    >(Prisma.sql`
      SELECT sense_id, serve, content
      FROM vocab_drill_item_assets
      WHERE sense_id IN (${Prisma.join(ids)}) AND gate_clean = true`);
    const map = new Map<string, PackRow>();
    for (const r of rows) {
      map.set(r.sense_id, {
        serve: r.serve !== false,
        asset: r.serve === false ? null : parseAsset(r.content),
      });
    }
    return map;
  } catch (e) {
    // 테이블 부재·일시 장애 = 팩 없음으로 강등 — 서빙은 런타임 폴백으로 계속된다.
    // 단, 무성 실패는 serve=false 게이트까지 조용히 해제하므로 반드시 관측 가능하게
    // 남긴다(적대검수 M-8). 지속 발생 시 아티팩트 차단 이중화가 필요하다.
    console.error("[vocab-drill] pack-assets 조회 실패 — 런타임 폴백 강등:", e);
    return new Map();
  }
}

/** 단건 조회 — 제출 채점 후 오답 해설(whyWrong) 반환용. */
export async function fetchPackAsset(senseId: string): Promise<PackSenseAsset | null> {
  const map = await fetchPackAssets([senseId]);
  const row = map.get(senseId);
  return row?.serve ? (row.asset ?? null) : null;
}
