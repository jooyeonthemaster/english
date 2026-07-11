"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { fail, type ActionResult } from "./_shared";

const PATH = "/admin/offline-marketing";
const CATEGORIES_KEY = "offline_marketing_categories";

/** 최초 사용 시 기본으로 제공할 분류(태그). */
const DEFAULT_CATEGORIES = ["전단지", "세미나", "학습지 샘플", "포스터", "기타"];

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** 중복 제거(대소문자·공백 무시하지 않되 정확 일치 기준). 순서 보존. */
function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const t = item.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

async function readStored(): Promise<string[] | null> {
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key: CATEGORIES_KEY } });
    return row ? parseList(row.value) : null;
  } catch {
    return null;
  }
}

async function writeStored(list: string[]): Promise<void> {
  const value = JSON.stringify(dedupe(list));
  await prisma.platformSetting.upsert({
    where: { key: CATEGORIES_KEY },
    create: { key: CATEGORIES_KEY, value },
    update: { value },
  });
}

/** 현재 캠페인들이 실제 사용 중인 분류(누락 방지용). */
async function inUseCategories(): Promise<string[]> {
  try {
    const rows = await prisma.offlineMarketingCampaign.findMany({
      select: { category: true },
      distinct: ["category"],
    });
    return rows.map((r) => r.category).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 관리 중인 분류(태그) 목록.
 * 저장된 목록이 없으면 기본값 + 사용 중 분류로 초기화해 저장한다.
 */
export async function getOfflineMarketingCategories(): Promise<string[]> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return [];

  const stored = await readStored();
  if (stored === null) {
    const seeded = dedupe([...DEFAULT_CATEGORIES, ...(await inUseCategories())]);
    try {
      await writeStored(seeded);
    } catch {
      /* 읽기 전용 실패는 무시하고 계산값 반환 */
    }
    return seeded;
  }
  // 저장 목록에 없는 사용 중 분류는 뒤에 덧붙여 항상 노출(칩 누락 방지).
  return dedupe([...stored, ...(await inUseCategories())]);
}

/** 분류(태그) 추가 — 이미 있으면 그대로. 업데이트된 전체 목록 반환. */
export async function addOfflineMarketingCategory(
  name: string,
): Promise<ActionResult<{ categories: string[] }>> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");

  const value = name.trim();
  if (!value) return fail("분류 이름을 입력하세요.");
  if (value.length > 60) return fail("분류는 60자 이하로 입력하세요.");

  try {
    const stored = (await readStored()) ?? dedupe([...DEFAULT_CATEGORIES, ...(await inUseCategories())]);
    if (stored.some((c) => c === value)) {
      return { success: true, categories: dedupe([...stored, ...(await inUseCategories())]) };
    }
    const next = dedupe([...stored, value]);
    await writeStored(next);
    revalidatePath(PATH);
    return { success: true, categories: dedupe([...next, ...(await inUseCategories())]) };
  } catch {
    return fail("분류 추가에 실패했습니다.");
  }
}

/**
 * 분류(태그) 삭제 — 목록에서만 제거한다. 이미 이 분류를 쓰는 홍보의 값은 유지되며,
 * 사용 중인 분류는 칩 목록에 계속 노출된다(데이터 정합성 보호).
 */
export async function removeOfflineMarketingCategory(
  name: string,
): Promise<ActionResult<{ categories: string[] }>> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");

  const value = name.trim();
  if (!value) return fail("분류 이름이 없습니다.");

  try {
    const inUse = await inUseCategories();
    if (inUse.includes(value)) {
      return fail("이 분류를 사용 중인 홍보가 있어 삭제할 수 없습니다.");
    }
    const stored = (await readStored()) ?? DEFAULT_CATEGORIES;
    const next = stored.filter((c) => c !== value);
    await writeStored(next);
    revalidatePath(PATH);
    return { success: true, categories: dedupe([...next, ...inUse]) };
  } catch {
    return fail("분류 삭제에 실패했습니다.");
  }
}

/** 캠페인 저장 시 새 분류를 목록에 자동 편입(내부 헬퍼, best effort). */
export async function trackOfflineMarketingCategory(name: string): Promise<void> {
  const value = name.trim();
  if (!value) return;
  try {
    const stored = await readStored();
    const base = stored ?? dedupe([...DEFAULT_CATEGORIES, ...(await inUseCategories())]);
    if (base.some((c) => c === value)) {
      if (stored === null) await writeStored(base);
      return;
    }
    await writeStored([...base, value]);
  } catch {
    /* best effort */
  }
}
