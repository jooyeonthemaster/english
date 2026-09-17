// ============================================================================
// 단어장 만들기 위저드 — 서버 리졸버 (server-only)
//
// 풀 해석은 탐색 정본(listWordbookSensesData)을 **그대로 재사용**한다 —
// 위저드 미리보기와 탐색 화면·최종 덱이 같은 해석기를 타야
// "미리보기 따로, 실제 따로"가 원천적으로 불가능하다.
// 순수 산식·타입은 wordbook-plan-types.ts(클라이언트 안전) 참조.
// ============================================================================
import "server-only";

import { prisma } from "@/lib/prisma";
import {
  listWordbookSensesData,
  type WordbookFilter,
  type WordbookSort,
  type WordbookSortDir,
} from "./wordbook-explore";
import {
  clampPlanSize,
  clampWordsPerDay,
  normalizeStudyDays,
  planCalendarDays,
  planTotalDays,
  type WordbookOrderScheme,
  type WordbookPlan,
  type WordbookPlanInput,
  type WordbookUnitPlan,
} from "./wordbook-plan-types";

/** 정렬 체계 → 탐색 정렬축 매핑. 2차 정렬 per10k DESC 는 질의 계층이 보장한다. */
const SCHEME_SORT: Record<
  WordbookOrderScheme,
  { sort: WordbookSort; dir: WordbookSortDir }
> = {
  "easy-first": { sort: "difficulty", dir: "asc" },
  frequency: { sort: "per10k", dir: "desc" },
  "tier-ladder": { sort: "tier", dir: "asc" },
  // 아래 셋은 **선정은 빈출순**(자주 나온 것부터 size 만큼 확보)이고
  // 배열만 JS 에서 바꾼다 — 진짜 무작위 표본을 뽑으면 꼬리의 희귀어가
  // 교재에 섞여 품질이 무너진다(선정과 배열을 분리하는 이유).
  "mixed-pos": { sort: "per10k", dir: "desc" },
  "pos-grouped": { sort: "per10k", dir: "desc" },
  random: { sort: "per10k", dir: "desc" },
};

/** 탐색 질의 페이지 상한(PAGE_SIZE_MAX)과 같은 값 — 리졸버는 이 크기로 페이징한다 */
const RESOLVE_PAGE = 200;

interface ResolvedSense {
  senseId: string;
  lemma: string;
  pos: string;
  senseKo: string;
  tier: string;
  difficulty: number;
  per10k: number | null;
}

const TIER_ORDER: Record<string, number> = {
  basic: 0,
  core: 1,
  academic: 2,
  advanced: 3,
};

/** 조건 모드 — 탐색 질의를 페이징해 size 만큼 확보 */
async function resolveByFilter(
  input: WordbookPlanInput,
  size: number,
): Promise<{ senses: ResolvedSense[]; totalMatched: number }> {
  const { sort, dir } = SCHEME_SORT[input.order] ?? SCHEME_SORT.frequency;
  const filter: WordbookFilter = {
    ...input.base,
    // 3상태 함정 — 위저드는 항상 명시한다. 만에 하나 빠졌으면 대표 뜻만.
    allSenses: input.base.allSenses === true,
  };
  const senses: ResolvedSense[] = [];
  let totalMatched = 0;
  for (let offset = 0; offset < size; offset += RESOLVE_PAGE) {
    const page = await listWordbookSensesData({
      filter,
      sort,
      dir,
      offset,
      limit: Math.min(RESOLVE_PAGE, size - offset),
    });
    totalMatched = page.total;
    for (const r of page.rows) {
      senses.push({
        senseId: r.senseId,
        lemma: r.lemma,
        pos: r.pos,
        senseKo: r.senseKo,
        tier: r.tier,
        difficulty: r.difficulty,
        per10k: r.per10k,
      });
    }
    if (page.rows.length < RESOLVE_PAGE || senses.length >= page.total) break;
  }
  return { senses: senses.slice(0, size), totalMatched };
}

/** 담은 단어 모드 — 명시 목록을 직접 조회 후 JS 정렬(체계는 동일하게 적용) */
async function resolveBySourceIds(
  ids: string[],
  order: WordbookOrderScheme,
): Promise<{ senses: ResolvedSense[]; totalMatched: number }> {
  const rows = await prisma.vocabDrillSense.findMany({
    where: { id: { in: ids }, retiredAt: null },
    select: {
      id: true,
      lemma: true,
      pos: true,
      senseKo: true,
      tier: true,
      difficulty: true,
      per10k: true,
    },
  });
  const byId = new Map(
    rows.map((r) => [
      r.id,
      {
        senseId: r.id,
        lemma: r.lemma,
        pos: r.pos,
        senseKo: r.senseKo,
        tier: r.tier,
        difficulty: r.difficulty,
        per10k: r.per10k === null ? null : Number(r.per10k),
      } satisfies ResolvedSense,
    ]),
  );
  // 담은 순서를 기본으로 복원한 뒤 체계 정렬 — 동률은 담은 순서가 유지된다(stable sort).
  const senses = ids
    .map((id) => byId.get(id))
    .filter((s): s is ResolvedSense => !!s);
  const byFreq = (a: ResolvedSense, b: ResolvedSense) =>
    (b.per10k ?? -1) - (a.per10k ?? -1);
  if (order === "easy-first") {
    senses.sort((a, b) => a.difficulty - b.difficulty || byFreq(a, b));
  } else if (order === "tier-ladder") {
    senses.sort(
      (a, b) =>
        (TIER_ORDER[a.tier] ?? 4) - (TIER_ORDER[b.tier] ?? 4) || byFreq(a, b),
    );
  } else {
    // frequency · mixed-pos 공통 — mixed-pos 는 분할 단계에서 섞는다.
    senses.sort(byFreq);
  }
  return { senses, totalMatched: senses.length };
}

/**
 * mixed-pos 배열 — 품사 버킷을 **비례 보간**(smooth weighted round-robin)으로
 * 섞는다. 단순 라운드로빈은 작은 버킷(부사·숙어)이 앞 단계에서 소진돼 뒷
 * 단계가 명사·형용사만 남는다(스모크 실측: 뒷 단계 표본 품사 2종). 비례
 * 보간은 버킷 소비 속도가 크기에 비례해 전 버킷이 거의 동시에 바닥난다 —
 * 어느 단계를 잘라도 품사 구성이 전체 분포를 닮는다.
 */
function roundRobinByPos(senses: ResolvedSense[]): ResolvedSense[] {
  const buckets = new Map<string, ResolvedSense[]>();
  for (const s of senses) {
    const arr = buckets.get(s.pos) ?? [];
    arr.push(s);
    buckets.set(s.pos, arr);
  }
  const entries = [...buckets.entries()].map(([pos, items]) => ({
    pos,
    items,
    weight: items.length,
    credit: 0,
  }));
  const total = senses.length;
  const out: ResolvedSense[] = [];
  while (out.length < total) {
    let best: (typeof entries)[number] | null = null;
    for (const e of entries) {
      if (!e.items.length) continue;
      e.credit += e.weight;
      if (!best || e.credit > best.credit) best = e;
    }
    if (!best) break; // 방어 — 전 버킷 소진
    best.credit -= total;
    out.push(best.items.shift() as ResolvedSense);
  }
  return out;
}

/** 품사별 묶음 — 교수 관례 순(명사→동사→형용사→부사→숙어→구동사→연어→전치사→접속사).
 *  같은 품사 안에서는 받은 순서(빈출순)를 유지한다. 미지 품사는 뒤에. */
const POS_BLOCK_ORDER = [
  "noun", "verb", "adjective", "adverb",
  "idiom", "phrasal_verb", "collocation", "preposition", "conjunction",
];
function groupByPos(senses: ResolvedSense[]): ResolvedSense[] {
  const rank = new Map(POS_BLOCK_ORDER.map((p, i) => [p, i]));
  // 안정 정렬 — 같은 품사 안 상대 순서(빈출순)가 보존된다.
  return [...senses].sort(
    (a, b) => (rank.get(a.pos) ?? 99) - (rank.get(b.pos) ?? 99),
  );
}

/** 시드 고정 셔플(mulberry32 + Fisher–Yates) — 같은 입력이면 같은 순서가 나와
 *  미리보기(스텝3)와 생성물이 어긋나지 않고, 재계산 때마다 화면이 튀지 않는다. */
function seededShuffle(senses: ResolvedSense[]): ResolvedSense[] {
  let s = 0x9e3779b9 ^ senses.length;
  const rand = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...senses];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildUnits(
  senses: ResolvedSense[],
  wordsPerDay: number,
): WordbookUnitPlan[] {
  const units: WordbookUnitPlan[] = [];
  for (let i = 0; i < senses.length; i += wordsPerDay) {
    const chunk = senses.slice(i, i + wordsPerDay);
    const tierCounts: Record<string, number> = {};
    let diffSum = 0;
    for (const s of chunk) {
      tierCounts[s.tier] = (tierCounts[s.tier] ?? 0) + 1;
      diffSum += s.difficulty;
    }
    units.push({
      index: units.length + 1,
      title: `${units.length + 1}단계`,
      senseIds: chunk.map((s) => s.senseId),
      count: chunk.length,
      sample: chunk.slice(0, 6).map((s) => ({
        lemma: s.lemma,
        senseKo: s.senseKo,
        pos: s.pos,
      })),
      tierCounts,
      avgDifficulty: chunk.length
        ? Math.round((diffSum / chunk.length) * 10) / 10
        : null,
    });
  }
  return units;
}

/** 위저드 플랜 정본 — 미리보기(스텝3·5)와 생성 직전 확정이 같은 함수를 탄다 */
export async function buildWordbookPlan(
  input: WordbookPlanInput,
): Promise<WordbookPlan> {
  const size = clampPlanSize(input.size);
  const wordsPerDay = clampWordsPerDay(input.wordsPerDay);
  const studyDays = normalizeStudyDays({ studyDays: input.studyDays });

  const { senses, totalMatched } = input.sourceSenseIds?.length
    ? await resolveBySourceIds(input.sourceSenseIds.slice(0, size), input.order)
    : await resolveByFilter(input, size);

  const arranged =
    input.order === "mixed-pos"
      ? roundRobinByPos(senses)
      : input.order === "pos-grouped"
        ? groupByPos(senses)
        : input.order === "random"
          ? seededShuffle(senses)
          : senses;
  const units = buildUnits(arranged, wordsPerDay);
  const totalPlanned = arranged.length;
  const totalDays = planTotalDays(totalPlanned, wordsPerDay);

  const warnings: string[] = [];
  if (totalPlanned === 0) {
    warnings.push("조건에 맞는 단어가 없습니다. 조건을 넓혀 보세요.");
  } else if (totalMatched < size && !input.sourceSenseIds?.length) {
    warnings.push(
      `조건에 맞는 단어가 ${totalMatched.toLocaleString()}개라, 요청한 ${size.toLocaleString()}개 대신 전부를 담았습니다.`,
    );
  }
  if (units.length > 1) {
    const last = units[units.length - 1];
    if (last.count < Math.ceil(wordsPerDay / 2)) {
      warnings.push(
        `마지막 ${last.index}단계는 ${last.count}개로 가볍습니다(총량이 하루 양으로 나누어떨어지지 않아요).`,
      );
    }
  }

  return {
    totalMatched,
    totalPlanned,
    units,
    schedule: {
      wordsPerDay,
      studyDays,
      totalDays,
      calendarDays: planCalendarDays(totalDays, studyDays),
    },
    warnings,
  };
}

/** 스텝2 라이브 카운트 — rows 를 버리고 total 만 취한다(limit 1) */
export async function countWordbookMatches(
  base: WordbookPlanInput["base"],
): Promise<number> {
  const page = await listWordbookSensesData({
    filter: { ...base, allSenses: base.allSenses === true },
    sort: "per10k",
    dir: "desc",
    offset: 0,
    limit: 1,
  });
  return page.total;
}
