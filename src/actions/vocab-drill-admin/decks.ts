"use server";

// ============================================================================
// 단어 훈련 — 원장/강사용 서버 액션: 단어장(덱) 관리
//
// 덱은 "저장된 질의"다(멤버십 테이블 없음 — lib/vocab-drill/decks.ts 참조).
// spec 은 VocabDeckSpec 형상만 통과시키는 화이트리스트 검증을 거치고,
// senseCountCache 는 countDeckPool(정본은 spec 파생)로 갱신한다.
// 반환 봉투는 study-assignments StudyActionResult 동형(success/error/data).
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { countDeckPool } from "@/lib/vocab-drill/content";
import type { VocabDeckSpec } from "@/lib/vocab-drill/payload";

export interface VocabDeckActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

// ── spec 화이트리스트 검증 ───────────────────────────────────────────────────

const ALLOWED_GRADES = ["고1", "고2", "고3"];
const ALLOWED_TIERS = ["basic", "core", "academic", "advanced"];
const ALLOWED_POS = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "preposition",
  "conjunction",
  "idiom",
  "phrasal_verb",
  "collocation",
];
const LIMIT_MIN = 1;
const LIMIT_MAX = 500;
const LIMIT_DEFAULT = 100;

function pickStrings(v: unknown, allow?: string[], cap = 20): string[] {
  if (!Array.isArray(v)) return [];
  const out = v.filter(
    (x): x is string =>
      typeof x === "string" && x.length > 0 && x.length <= 64 &&
      (!allow || allow.includes(x)),
  );
  return [...new Set(out)].slice(0, cap);
}

/** 허용 키만 남긴 VocabDeckSpec — 알 수 없는 키·값은 전부 버린다. */
function sanitizeDeckSpec(input: unknown): VocabDeckSpec {
  const raw = (input && typeof input === "object" && !Array.isArray(input)
    ? input
    : {}) as Record<string, unknown>;
  const spec: VocabDeckSpec = {};

  const grades = pickStrings(raw.grades, ALLOWED_GRADES, 3);
  if (grades.length) spec.grades = grades;
  const tiers = pickStrings(raw.tiers, ALLOWED_TIERS, 4);
  if (tiers.length) spec.tiers = tiers;
  if (Array.isArray(raw.difficulties)) {
    const difficulties = [
      ...new Set(
        raw.difficulties.filter(
          (d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 5,
        ),
      ),
    ].slice(0, 5);
    if (difficulties.length) spec.difficulties = difficulties;
  }
  const posList = pickStrings(raw.posList, ALLOWED_POS, 9);
  if (posList.length) spec.posList = posList;
  const trendLabels = pickStrings(raw.trendLabels, undefined, 8);
  if (trendLabels.length) spec.trendLabels = trendLabels;
  if (typeof raw.minPer10k === "number" && Number.isFinite(raw.minPer10k) && raw.minPer10k > 0) {
    spec.minPer10k = raw.minPer10k;
  }
  if (raw.excludePhrase === true) spec.excludePhrase = true;
  // 3상태 보존 — undefined 는 키 자체를 만들지 않는다(구형 덱 의미 유지).
  if (typeof raw.allSenses === "boolean") spec.allSenses = raw.allSenses;
  const senseIds = pickStrings(raw.senseIds, undefined, LIMIT_MAX);
  if (senseIds.length) spec.senseIds = senseIds;
  const limitRaw = Number(raw.limit);
  // ★ 명시 목록(senseIds) 덱의 기본 limit 은 **목록 길이**다.
  //   LIMIT_DEFAULT(100)로 고정하면 골라 담은 101번째부터가 조용히 잘려나가
  //   덱 카드에 100단어로 뜨고 학생에게도 100개만 서빙된다(적대검수 2026-08-04).
  //   조건형 덱(학년·티어 등)은 기존대로 100 — 무제한 서빙을 막는 안전 기본값.
  spec.limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.max(LIMIT_MIN, Math.min(LIMIT_MAX, Math.round(limitRaw)))
    : senseIds.length
      ? Math.min(LIMIT_MAX, senseIds.length)
      : LIMIT_DEFAULT;

  return spec;
}

// ── 목록 ─────────────────────────────────────────────────────────────────────

export interface VocabDeckRow {
  id: string;
  slug: string | null;
  title: string;
  subtitle: string | null;
  scope: string;
  status: string;
  spec: VocabDeckSpec;
  senseCountCache: number;
  orderIndex: number;
  createdAt: string;
}

export async function listVocabDecks(): Promise<VocabDeckRow[]> {
  const staff = await requireStaffAuth();
  const rows = await prisma.vocabDrillDeck.findMany({
    where: { academyId: staff.academyId },
    // "ACTIVE" < "ARCHIVED" — 활성이 먼저, 그 안에서 표시 순서.
    orderBy: [{ status: "asc" }, { orderIndex: "asc" }, { createdAt: "asc" }],
    take: 100,
  });
  return rows.map((d) => ({
    id: d.id,
    slug: d.slug,
    title: d.title,
    subtitle: d.subtitle,
    scope: d.scope,
    status: d.status,
    spec: sanitizeDeckSpec(d.spec),
    senseCountCache: d.senseCountCache,
    orderIndex: d.orderIndex,
    createdAt: d.createdAt.toISOString(),
  }));
}

// ── 생성 ─────────────────────────────────────────────────────────────────────

export async function createVocabDeck(input: {
  title: string;
  subtitle?: string | null;
  spec: VocabDeckSpec;
}): Promise<VocabDeckActionResult<{ id: string; senseCount: number }>> {
  try {
    const staff = await requireStaffAuth();
    const title = (input.title ?? "").trim().slice(0, 80);
    if (!title) return { success: false, error: "단어장 이름을 입력해 주세요." };
    const subtitle = (input.subtitle ?? "").trim().slice(0, 120) || null;
    const spec = sanitizeDeckSpec(input.spec);

    const senseCount = await countDeckPool(spec);
    if (senseCount === 0) {
      return {
        success: false,
        error: "조건에 맞는 단어가 없습니다. 학년·티어·품사 조건을 넓혀 보세요.",
      };
    }

    const deck = await prisma.vocabDrillDeck.create({
      data: {
        academyId: staff.academyId,
        scope: "ACADEMY",
        title,
        subtitle,
        spec: spec as object,
        senseCountCache: senseCount,
        orderIndex: 100,
        status: "ACTIVE",
        createdById: staff.id,
      },
    });
    return { success: true, data: { id: deck.id, senseCount } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "단어장을 만들지 못했습니다.",
    };
  }
}

// ── 수정 ─────────────────────────────────────────────────────────────────────

export async function updateVocabDeck(
  deckId: string,
  patch: {
    title?: string;
    subtitle?: string | null;
    spec?: VocabDeckSpec;
    orderIndex?: number;
  },
): Promise<VocabDeckActionResult<{ senseCount: number }>> {
  try {
    const staff = await requireStaffAuth();
    const deck = await prisma.vocabDrillDeck.findFirst({
      where: { id: deckId, academyId: staff.academyId },
      select: { id: true, senseCountCache: true },
    });
    if (!deck) return { success: false, error: "단어장을 찾을 수 없습니다." };

    const data: {
      title?: string;
      subtitle?: string | null;
      orderIndex?: number;
      spec?: object;
      senseCountCache?: number;
    } = {};
    if (typeof patch.title === "string") {
      const title = patch.title.trim().slice(0, 80);
      if (!title) return { success: false, error: "단어장 이름을 입력해 주세요." };
      data.title = title;
    }
    if (patch.subtitle !== undefined) {
      data.subtitle = (patch.subtitle ?? "").trim().slice(0, 120) || null;
    }
    if (
      typeof patch.orderIndex === "number" &&
      Number.isInteger(patch.orderIndex)
    ) {
      data.orderIndex = Math.max(0, Math.min(10_000, patch.orderIndex));
    }
    let senseCount = deck.senseCountCache;
    if (patch.spec !== undefined) {
      const spec = sanitizeDeckSpec(patch.spec);
      senseCount = await countDeckPool(spec);
      if (senseCount === 0) {
        return {
          success: false,
          error: "조건에 맞는 단어가 없습니다. 조건을 넓혀 보세요.",
        };
      }
      data.spec = spec as object;
      data.senseCountCache = senseCount;
    }
    if (Object.keys(data).length === 0) {
      return { success: false, error: "변경할 내용이 없습니다." };
    }

    await prisma.vocabDrillDeck.update({ where: { id: deck.id }, data });
    return { success: true, data: { senseCount } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "단어장을 수정하지 못했습니다.",
    };
  }
}

// ── 보관 ─────────────────────────────────────────────────────────────────────

export async function archiveVocabDeck(
  deckId: string,
): Promise<VocabDeckActionResult> {
  try {
    const staff = await requireStaffAuth();
    const deck = await prisma.vocabDrillDeck.findFirst({
      where: { id: deckId, academyId: staff.academyId },
      select: { id: true, status: true },
    });
    if (!deck) return { success: false, error: "단어장을 찾을 수 없습니다." };
    if (deck.status === "ARCHIVED") return { success: true };

    await prisma.vocabDrillDeck.update({
      where: { id: deck.id },
      data: { status: "ARCHIVED" },
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "단어장을 보관하지 못했습니다.",
    };
  }
}
