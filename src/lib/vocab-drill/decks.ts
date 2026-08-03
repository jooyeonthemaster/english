// 단어 훈련 — 기본 덱 프로비저닝 (server-only)
//
// 덱은 "저장된 질의"다(init.sql 3-3 — 멤버십 테이블 없음). 학원에 덱이 하나도
// 없으면 학생 첫 진입이 빈 화면이 되므로, 학년별 핵심·숙어·고난도 5종을
// slug 멱등으로 1회 심는다. 디렉터가 지우거나(ARCHIVED) 고쳐도 다시 만들지
// 않는다 — 존재 판정을 slug 로 하기 때문이다(부분 유니크: academyId+slug).
import "server-only";

import { prisma } from "@/lib/prisma";
import type { VocabDrillDeck } from "@prisma/client";
import { countDeckPool } from "./content";
import type { VocabDeckSpec } from "./payload";

interface DefaultDeck {
  slug: string;
  title: string;
  subtitle: string;
  spec: VocabDeckSpec;
  orderIndex: number;
}

const DEFAULT_DECKS: DefaultDeck[] = [
  {
    slug: "go1-core-200",
    title: "고1 핵심 200",
    subtitle: "고1 기출에서 가장 자주 나오는 핵심 어휘",
    spec: { grades: ["고1"], tiers: ["core", "basic"], excludePhrase: true, limit: 200 },
    orderIndex: 10,
  },
  {
    slug: "go2-core-200",
    title: "고2 핵심 200",
    subtitle: "고2 기출 최다 빈출 어휘",
    spec: { grades: ["고2"], tiers: ["core", "academic"], excludePhrase: true, limit: 200 },
    orderIndex: 20,
  },
  {
    slug: "go3-core-200",
    title: "고3 핵심 200",
    subtitle: "고3·수능 기출 최다 빈출 어휘",
    spec: { grades: ["고3"], tiers: ["core", "academic"], excludePhrase: true, limit: 200 },
    orderIndex: 30,
  },
  {
    slug: "idioms-150",
    title: "구동사·숙어 150",
    subtitle: "기출 구동사·숙어·연어 고빈도 순",
    spec: { posList: ["idiom", "phrasal_verb", "collocation"], limit: 150 },
    orderIndex: 40,
  },
  {
    slug: "advanced-150",
    title: "고난도 어휘 150",
    subtitle: "변별력을 가르는 advanced 티어",
    spec: { tiers: ["advanced"], excludePhrase: true, limit: 150 },
    orderIndex: 50,
  },
];

/** 학원에 기본 덱이 없으면 심는다. 이미 있으면 아무것도 하지 않는다(멱등). */
export async function ensureDefaultDecks(academyId: string): Promise<void> {
  const existing = await prisma.vocabDrillDeck.findMany({
    where: { academyId, slug: { in: DEFAULT_DECKS.map((d) => d.slug) } },
    select: { slug: true },
  });
  const have = new Set(existing.map((d) => d.slug));
  const missing = DEFAULT_DECKS.filter((d) => !have.has(d.slug));
  if (!missing.length) return;

  // 심는 시점에 senseCount 를 함께 센다. 캐시 신선도 판정이 updatedAt 기반이라
  // (deckSenseCountIsFresh) 0 인 채로 심으면 방금 만든 덱이 TTL 동안 "0단어"로
  // 굳는다. 실패해도 심는 것 자체는 막지 않는다 — 0 으로 두면 다음 렌더가 센다.
  const counts = await Promise.all(
    missing.map((d) => countDeckPool(d.spec).catch(() => 0)),
  );
  // allSettled — 동시 진입 경합의 거절을 삼킨다(정본은 DB 부분 유니크 academyId+slug).
  await Promise.allSettled(
    missing.map((d, i) =>
      prisma.vocabDrillDeck.create({
        data: {
          academyId,
          scope: "ACADEMY",
          slug: d.slug,
          title: d.title,
          subtitle: d.subtitle,
          spec: d.spec as object,
          senseCountCache: counts[i],
          orderIndex: d.orderIndex,
          status: "ACTIVE",
        },
      }),
    ),
  );
}

/** 학생 트랙 허브용 덱 목록 (ACTIVE, 표시 순서). */
export async function listActiveDecks(academyId: string) {
  return prisma.vocabDrillDeck.findMany({
    where: { academyId, status: "ACTIVE" },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    take: 30,
  });
}

/**
 * 학생 표면 진입점 — **목록을 먼저 보고, 비었을 때만** 기본 덱을 심는다.
 *
 * 뒤집기 전에는 ensureDefaultDecks 가 매 렌더 앞줄에서 돌아, 이미 덱이 다 있는
 * 학원에도 slug 5개 조회가 무조건 한 번 더 붙었다(적대검수 2026-08-04).
 * 멱등성은 그대로다 — 프로비저닝 판정의 정본은 여전히 slug 부분 유니크이고,
 * 디렉터가 전부 보관(ARCHIVED)한 학원에서는 목록이 비어도 slug 가 살아 있어
 * 아무것도 다시 심지 않는다(재조회 결과도 빈 목록 — 디렉터의 의도를 존중한다).
 */
export async function listStudentDecks(
  academyId: string,
): Promise<VocabDrillDeck[]> {
  const decks = await listActiveDecks(academyId);
  if (decks.length) return decks;
  await ensureDefaultDecks(academyId);
  return listActiveDecks(academyId);
}

// ── senseCount 캐시 ──────────────────────────────────────────────────────────
//
// 캐시 판정을 "senseCountCache > 0" 으로 하면 **0 을 미계산으로 오판**한다.
// 조건에 맞는 단어가 실제로 0인 덱(콘텐츠 미적재 학원의 기본 덱이 전형)은 매
// 렌더마다 COUNT 를 다시 돌게 되고, 덱 수만큼 N+1 로 불어난다(적대검수 2026-08-04).
//
// 그래서 판정 축을 값이 아니라 **언제 계산했는가**로 옮긴다:
//   · senseCountCache > 0            → 신뢰. 값이 바뀌는 사건(spec 수정)은
//                                      updateVocabDeck 가 그 자리에서 재계산한다.
//   · 0 인데 최근에 갱신됐다          → 신뢰(진짜 0이다). 재계산하지 않는다.
//   · 0 이고 갱신된 지 오래됐다        → 미계산으로 보고 한 번만 다시 센다.
//
// TTL 을 1시간으로 둔 이유: 0 은 대개 "아직 코퍼스가 안 들어왔다"는 뜻이고,
// senseCount 는 덱 카드 진행률의 분모다. 24시간으로 잡으면 적재 직후 하루 동안
// 전 학생에게 0/0 카드가 보인다. 1시간이면 덱당 시간당 COUNT 1회 — 매 렌더
// N+1 은 사라지면서 적재 반영도 빠르다.
export const DECK_SENSE_COUNT_TTL_MS = 60 * 60 * 1000;

type DeckCountInput = Pick<
  VocabDrillDeck,
  "id" | "spec" | "senseCountCache" | "updatedAt"
>;

/** 이 덱의 senseCountCache 를 그대로 믿어도 되는가(= 미계산 표식이 아닌가). */
export function deckSenseCountIsFresh(
  deck: Pick<DeckCountInput, "senseCountCache" | "updatedAt">,
  now: number = Date.now(),
): boolean {
  if (deck.senseCountCache > 0) return true;
  return now - deck.updatedAt.getTime() < DECK_SENSE_COUNT_TTL_MS;
}

/**
 * 덱별 표시용 senseCount — 낡은 덱만, 그것도 **병렬로** 다시 센다.
 * 반환은 deckId → senseCount 맵이며, 재계산에 실패한 덱은 옛 캐시값으로 채운다
 * (표시가 질의 실패로 끊기지 않게. 캐시를 쓰지 않으므로 다음 렌더가 재시도한다).
 */
export async function resolveDeckSenseCounts(
  decks: DeckCountInput[],
  now: number = Date.now(),
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const stale: DeckCountInput[] = [];
  for (const deck of decks) {
    if (deckSenseCountIsFresh(deck, now)) {
      counts.set(deck.id, deck.senseCountCache);
    } else {
      stale.push(deck);
    }
  }
  if (!stale.length) return counts;

  const counted = await Promise.allSettled(
    stale.map((deck) => countDeckPool(deck.spec as VocabDeckSpec)),
  );
  const writes: { id: string; senseCount: number }[] = [];
  counted.forEach((result, i) => {
    const deck = stale[i];
    if (result.status === "fulfilled") {
      counts.set(deck.id, result.value);
      writes.push({ id: deck.id, senseCount: result.value });
    } else {
      counts.set(deck.id, deck.senseCountCache);
    }
  });

  // 캐시 갱신 실패는 무시 — 정본은 spec 파생값이다(다음 렌더가 다시 센다).
  await Promise.allSettled(
    writes.map((w) =>
      prisma.vocabDrillDeck.update({
        where: { id: w.id },
        data: { senseCountCache: w.senseCount },
      }),
    ),
  );
  return counts;
}
