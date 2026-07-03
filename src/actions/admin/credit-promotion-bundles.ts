"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";
import { type ActionResult } from "./helpers";

// ============================================================================
// 프로모션 번들 CRUD — 여러 프로모션을 한 링크(/credits/promo/b/{slug})·한
// 랜딩으로 묶어 노출한다. 쿠키·가격엔진은 프로모션 linkToken 을 키로 쓰므로,
// 번들에 담기는 프로모션에는 linkToken 이 없으면 저장 시 자동 발급한다.
// ============================================================================

export type AdminBundleItemView = {
  promotionId: string;
  sortOrder: number;
  promotionName: string | null;
  productId: string;
  productName: string;
  discountType: string;
  discountValue: number;
  bonusType: string;
  bonusValue: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  /** 지금 기간 내 유효한가(활성 + 할인/보너스 존재 + 기간 내). */
  isInWindow: boolean;
  hasLink: boolean;
};

export type AdminBundleView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  items: AdminBundleItemView[];
};

// lib/credit-top-up-products.ts 의 promotionInWindow 와 동일 판정(비공개라 재정의).
function promotionInWindow(
  p: {
    isActive: boolean;
    discountValue: number;
    bonusValue: number;
    startsAt: Date;
    endsAt: Date;
  },
  now: Date,
): boolean {
  return (
    p.isActive &&
    (p.discountValue > 0 || p.bonusValue > 0) &&
    p.startsAt <= now &&
    now < p.endsAt
  );
}

const BUNDLE_INCLUDE = {
  items: {
    orderBy: { sortOrder: "asc" },
    include: {
      promotion: {
        include: { product: { select: { id: true, name: true } } },
      },
    },
  },
} as const;

type BundleRecord = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.creditPromotionBundle.findFirst<{
        include: typeof BUNDLE_INCLUDE;
      }>
    >
  >
>;

function toBundleView(bundle: BundleRecord, now: Date): AdminBundleView {
  return {
    id: bundle.id,
    slug: bundle.slug,
    name: bundle.name,
    description: bundle.description,
    isActive: bundle.isActive,
    createdAt: bundle.createdAt.toISOString(),
    updatedAt: bundle.updatedAt.toISOString(),
    items: bundle.items.map((item) => ({
      promotionId: item.promotionId,
      sortOrder: item.sortOrder,
      promotionName: item.promotion.name,
      productId: item.promotion.product.id,
      productName: item.promotion.product.name,
      discountType: item.promotion.discountType,
      discountValue: item.promotion.discountValue,
      bonusType: item.promotion.bonusType,
      bonusValue: item.promotion.bonusValue,
      startsAt: item.promotion.startsAt.toISOString(),
      endsAt: item.promotion.endsAt.toISOString(),
      isActive: item.promotion.isActive,
      isInWindow: promotionInWindow(item.promotion, now),
      hasLink: item.promotion.linkToken != null,
    })),
  };
}

async function fetchBundleViews(): Promise<AdminBundleView[]> {
  const now = new Date();
  const bundles = await prisma.creditPromotionBundle.findMany({
    orderBy: { createdAt: "desc" },
    include: BUNDLE_INCLUDE,
  });
  return bundles.map((b) => toBundleView(b, now));
}

/** 번들 목록(각 번들 + 포함 프로모션 요약). 관리 페이지 초기 로드용. */
export async function getBundles(): Promise<AdminBundleView[]> {
  await requireAdminAuth("SUPER_ADMIN");
  return fetchBundleViews();
}

// ============================================================================
// slug — 미입력 시 이름 기반 자동 생성(한글 등 비ASCII는 랜덤 접미), 형식/유일성 검증.
// ============================================================================

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function slugBaseFromName(name: string): string {
  const ascii = name
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  if (ascii.length >= 2) return ascii;
  return `promo-${randomBytes(3).toString("hex")}`;
}

async function ensureUniqueSlug(
  base: string,
  excludeBundleId?: string,
): Promise<string> {
  let candidate = base;
  for (let i = 2; i <= 50; i += 1) {
    const existing = await prisma.creditPromotionBundle.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeBundleId) return candidate;
    candidate = `${base}-${i}`;
  }
  // 사실상 도달 불가 — 랜덤 접미로 탈출.
  return `${base}-${randomBytes(3).toString("hex")}`;
}

// ============================================================================
// 저장 (신규/수정 공용)
// ============================================================================

const bundleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "번들 이름을 입력해주세요.").max(60),
  slug: z.string().trim().max(64).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  isActive: z.boolean().default(true),
  // 포함 프로모션(배열 순서 = 노출 순서).
  promotionIds: z
    .array(z.string().min(1))
    .min(1, "번들에 담을 프로모션을 1개 이상 선택해주세요.")
    .max(50, "번들에는 프로모션을 최대 50개까지 담을 수 있습니다."),
});

export type BundleUpsertData = z.input<typeof bundleSchema>;

async function upsertBundle(
  data: BundleUpsertData,
): Promise<ActionResult & { bundles?: AdminBundleView[] }> {
  const admin = await requireAdminAuth("SUPER_ADMIN");
  try {
    const parsed = bundleSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.issues[0]?.message ?? "번들 입력값을 확인해주세요.",
      };
    }
    const d = parsed.data;
    const promotionIds = [...new Set(d.promotionIds)];

    // slug 결정: 수동 입력이면 형식 검증, 미입력이면 이름 기반 자동 생성.
    const manualSlug = d.slug?.trim().toLowerCase() || "";
    if (manualSlug && !SLUG_RE.test(manualSlug)) {
      return {
        success: false,
        error:
          "링크 주소(slug)는 영문 소문자·숫자·하이픈만 사용할 수 있습니다. (예: spring-sale)",
      };
    }
    const slug = await ensureUniqueSlug(
      manualSlug || slugBaseFromName(d.name),
      d.id,
    );

    const found = await prisma.creditPromotion.findMany({
      where: { id: { in: promotionIds } },
      select: { id: true, linkToken: true },
    });
    if (found.length !== promotionIds.length) {
      return {
        success: false,
        error: "선택한 프로모션 중 삭제되었거나 찾을 수 없는 항목이 있습니다.",
      };
    }

    await prisma.$transaction(async (tx) => {
      let bundleId = d.id;
      const base = {
        slug,
        name: d.name,
        description: d.description?.trim() || null,
        isActive: d.isActive,
      };
      if (bundleId) {
        const existing = await tx.creditPromotionBundle.findUnique({
          where: { id: bundleId },
          select: { id: true },
        });
        if (!existing) throw new Error("bundle_not_found");
        await tx.creditPromotionBundle.update({
          where: { id: bundleId },
          data: base,
        });
      } else {
        const created = await tx.creditPromotionBundle.create({
          data: { ...base, createdByAdminId: admin.adminId },
          select: { id: true },
        });
        bundleId = created.id;
      }

      // 쿠키·가격엔진이 linkToken 을 키로 쓰므로 번들 구성원에는 링크 토큰이
      // 반드시 있어야 한다 — 없으면 단일 링크 발급과 같은 규칙으로 자동 발급.
      for (const promo of found) {
        if (!promo.linkToken) {
          await tx.creditPromotion.update({
            where: { id: promo.id },
            data: { linkToken: randomBytes(16).toString("base64url") },
          });
        }
      }

      // 구성원 전체 교체(배열 순서 = sortOrder).
      await tx.creditPromotionBundleItem.deleteMany({ where: { bundleId } });
      await tx.creditPromotionBundleItem.createMany({
        data: promotionIds.map((promotionId, index) => ({
          bundleId: bundleId!,
          promotionId,
          sortOrder: index,
        })),
      });
    });

    revalidatePath(`/credits/promo/b/${slug}`);
    return { success: true, bundles: await fetchBundleViews() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg === "bundle_not_found") {
      return { success: false, error: "번들을 찾을 수 없습니다." };
    }
    console.error("[upsertBundle] Error:", err);
    return { success: false, error: "번들을 저장하지 못했습니다." };
  }
}

export async function createBundle(
  data: Omit<BundleUpsertData, "id">,
): Promise<ActionResult & { bundles?: AdminBundleView[] }> {
  return upsertBundle({ ...data, id: undefined });
}

export async function updateBundle(
  bundleId: string,
  data: Omit<BundleUpsertData, "id">,
): Promise<ActionResult & { bundles?: AdminBundleView[] }> {
  return upsertBundle({ ...data, id: bundleId });
}

export async function deleteBundle(
  bundleId: string,
): Promise<ActionResult & { bundles?: AdminBundleView[] }> {
  await requireAdminAuth("SUPER_ADMIN");
  try {
    const bundle = await prisma.creditPromotionBundle.findUnique({
      where: { id: bundleId },
      select: { slug: true },
    });
    if (!bundle) return { success: false, error: "번들을 찾을 수 없습니다." };
    await prisma.creditPromotionBundle.delete({ where: { id: bundleId } });
    revalidatePath(`/credits/promo/b/${bundle.slug}`);
    return { success: true, bundles: await fetchBundleViews() };
  } catch (err) {
    console.error("[deleteBundle] Error:", err);
    return { success: false, error: "번들을 삭제하지 못했습니다." };
  }
}

export async function toggleBundleActive(
  bundleId: string,
  isActive: boolean,
): Promise<ActionResult & { bundles?: AdminBundleView[] }> {
  await requireAdminAuth("SUPER_ADMIN");
  try {
    const bundle = await prisma.creditPromotionBundle.findUnique({
      where: { id: bundleId },
      select: { slug: true },
    });
    if (!bundle) return { success: false, error: "번들을 찾을 수 없습니다." };
    await prisma.creditPromotionBundle.update({
      where: { id: bundleId },
      data: { isActive },
    });
    revalidatePath(`/credits/promo/b/${bundle.slug}`);
    return { success: true, bundles: await fetchBundleViews() };
  } catch (err) {
    console.error("[toggleBundleActive] Error:", err);
    return { success: false, error: "상태 변경에 실패했습니다." };
  }
}
