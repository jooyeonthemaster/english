"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";
import {
  getAdminCreditProduct,
  type AdminCreditProductView,
} from "@/lib/credit-top-up-products";
import { type ActionResult } from "./helpers";

function revalidateCreditSurfaces() {
  revalidatePath("/admin/credit-plans");
  revalidatePath("/director/credits");
  revalidatePath("/credits/products");
  revalidatePath("/refund-policy");
}

// ============================================================================
// 상품 기본 정보 (프로모션은 별도 CRUD로 관리)
// ============================================================================

const creditProductUpdateSchema = z.object({
  name: z.string().trim().min(1, "상품명을 입력해주세요.").max(60),
  basePrice: z.coerce.number().int().min(100).max(100_000_000),
  expiryDays: z.coerce.number().int().min(0).max(3650).default(0),
  description: z.string().trim().max(1000).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type CreditProductUpdateData = z.input<typeof creditProductUpdateSchema>;

export async function updateCreditTopUpProduct(
  productId: string,
  data: CreditProductUpdateData,
): Promise<ActionResult & { product?: AdminCreditProductView }> {
  await requireAdminAuth("SUPER_ADMIN");
  try {
    const parsed = creditProductUpdateSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.issues[0]?.message ??
          "크레딧 상품 입력값을 다시 확인해주세요.",
      };
    }

    const exists = await prisma.creditTopUpProduct.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!exists) return { success: false, error: "상품을 찾을 수 없습니다." };

    await prisma.creditTopUpProduct.update({
      where: { id: productId },
      data: {
        name: parsed.data.name,
        basePrice: parsed.data.basePrice,
        expiryDays: parsed.data.expiryDays > 0 ? parsed.data.expiryDays : null,
        description: parsed.data.description?.trim() || null,
        isActive: parsed.data.isActive,
        sortOrder: parsed.data.sortOrder,
      },
    });

    revalidateCreditSurfaces();
    const product = await getAdminCreditProduct(productId);
    return { success: true, product: product ?? undefined };
  } catch (err) {
    console.error("[updateCreditTopUpProduct] Error:", err);
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "크레딧 상품을 저장하지 못했습니다.",
    };
  }
}

// ============================================================================
// 프로모션 CRUD (한 상품에 여러 개 동시 운영)
// ============================================================================

const promotionSchema = z
  .object({
    productId: z.string().min(1),
    id: z.string().optional(), // 있으면 수정, 없으면 신규
    name: z.string().trim().max(60).optional().nullable(),
    // 할인: PERCENT(%) 또는 AMOUNT(원). / 보너스: PERCENT(%) 또는 AMOUNT(크레딧 수).
    discountType: z.enum(["PERCENT", "AMOUNT"]).default("PERCENT"),
    discountValue: z.coerce.number().int().min(0).max(100_000_000).default(0),
    bonusType: z.enum(["PERCENT", "AMOUNT"]).default("PERCENT"),
    bonusValue: z.coerce.number().int().min(0).max(100_000_000).default(0),
    startsAt: z.string().trim().min(1, "시작일을 입력해주세요."),
    endsAt: z.string().trim().min(1, "종료일을 입력해주세요."),
    audience: z.enum(["ALL", "TARGETED"]).default("ALL"),
    priority: z.coerce.number().int().min(0).max(999).default(0),
    isActive: z.boolean().default(true),
    targetAcademyIds: z.array(z.string().min(1)).max(5000).default([]),
  })
  .superRefine((d, ctx) => {
    if (d.discountValue <= 0 && d.bonusValue <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "할인 또는 크레딧 추가 지급 중 하나는 값이 있어야 합니다.",
      });
    }
    if (d.discountType === "PERCENT" && d.discountValue > 99) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "할인율(%)은 99를 초과할 수 없습니다.",
      });
    }
    if (d.bonusType === "PERCENT" && d.bonusValue > 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bonusValue"],
        message: "추가 지급률(%)은 1000을 초과할 수 없습니다.",
      });
    }
    const s = new Date(d.startsAt);
    const e = new Date(d.endsAt);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startsAt"],
        message: "프로모션 기간 형식이 올바르지 않습니다.",
      });
    } else if (s >= e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "종료일은 시작일보다 뒤여야 합니다.",
      });
    }
  });

export type PromotionUpsertData = z.input<typeof promotionSchema>;

export async function upsertCreditPromotion(
  data: PromotionUpsertData,
): Promise<ActionResult & { product?: AdminCreditProductView }> {
  await requireAdminAuth("SUPER_ADMIN");
  try {
    const parsed = promotionSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.issues[0]?.message ?? "프로모션 입력값을 확인해주세요.",
      };
    }
    const d = parsed.data;
    const targetIds =
      d.audience === "TARGETED" ? [...new Set(d.targetAcademyIds)] : [];

    const base = {
      name: d.name?.trim() || null,
      discountType: d.discountType,
      discountValue: d.discountValue,
      bonusType: d.bonusType,
      bonusValue: d.bonusValue,
      startsAt: new Date(d.startsAt),
      endsAt: new Date(d.endsAt),
      audience: d.audience,
      priority: d.priority,
      isActive: d.isActive,
    };

    await prisma.$transaction(async (tx) => {
      let promotionId = d.id;
      if (promotionId) {
        // 소속 상품이 맞는지 확인 후 수정.
        const existing = await tx.creditPromotion.findUnique({
          where: { id: promotionId },
          select: { productId: true },
        });
        if (!existing || existing.productId !== d.productId) {
          throw new Error("promotion_not_found");
        }
        await tx.creditPromotion.update({
          where: { id: promotionId },
          data: base,
        });
      } else {
        const created = await tx.creditPromotion.create({
          data: { ...base, productId: d.productId },
          select: { id: true },
        });
        promotionId = created.id;
      }
      // 대상 전체 교체.
      await tx.creditPromotionTarget.deleteMany({ where: { promotionId } });
      if (targetIds.length > 0) {
        await tx.creditPromotionTarget.createMany({
          data: targetIds.map((academyId) => ({ promotionId, academyId })),
          skipDuplicates: true,
        });
      }
    });

    revalidateCreditSurfaces();
    const product = await getAdminCreditProduct(d.productId);
    return { success: true, product: product ?? undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg === "promotion_not_found") {
      return { success: false, error: "프로모션을 찾을 수 없습니다." };
    }
    console.error("[upsertCreditPromotion] Error:", err);
    return { success: false, error: "프로모션을 저장하지 못했습니다." };
  }
}

/** 프로모션 활성/비활성만 즉시 토글(요약 블럭에서 사용). */
export async function setCreditPromotionActive(
  promotionId: string,
  isActive: boolean,
): Promise<ActionResult & { product?: AdminCreditProductView }> {
  await requireAdminAuth("SUPER_ADMIN");
  try {
    const promo = await prisma.creditPromotion.findUnique({
      where: { id: promotionId },
      select: { productId: true },
    });
    if (!promo) return { success: false, error: "프로모션을 찾을 수 없습니다." };
    await prisma.creditPromotion.update({
      where: { id: promotionId },
      data: { isActive },
    });
    revalidateCreditSurfaces();
    const product = await getAdminCreditProduct(promo.productId);
    return { success: true, product: product ?? undefined };
  } catch (err) {
    console.error("[setCreditPromotionActive] Error:", err);
    return { success: false, error: "상태 변경에 실패했습니다." };
  }
}

export async function deleteCreditPromotion(
  promotionId: string,
): Promise<ActionResult & { product?: AdminCreditProductView }> {
  await requireAdminAuth("SUPER_ADMIN");
  try {
    const promo = await prisma.creditPromotion.findUnique({
      where: { id: promotionId },
      select: { productId: true },
    });
    if (!promo) return { success: false, error: "프로모션을 찾을 수 없습니다." };
    await prisma.creditPromotion.delete({ where: { id: promotionId } });
    revalidateCreditSurfaces();
    const product = await getAdminCreditProduct(promo.productId);
    return { success: true, product: product ?? undefined };
  } catch (err) {
    console.error("[deleteCreditPromotion] Error:", err);
    return { success: false, error: "프로모션을 삭제하지 못했습니다." };
  }
}

/** 프로모션 공유 링크 토큰 생성/재발급. */
export async function generateCreditPromotionLink(
  promotionId: string,
): Promise<ActionResult & { token?: string }> {
  await requireAdminAuth("SUPER_ADMIN");
  try {
    const token = randomBytes(16).toString("base64url");
    await prisma.creditPromotion.update({
      where: { id: promotionId },
      data: { linkToken: token },
    });
    revalidateCreditSurfaces();
    return { success: true, token };
  } catch (err) {
    console.error("[generateCreditPromotionLink] Error:", err);
    return { success: false, error: "링크 생성에 실패했습니다." };
  }
}

export async function clearCreditPromotionLink(
  promotionId: string,
): Promise<ActionResult> {
  await requireAdminAuth("SUPER_ADMIN");
  try {
    await prisma.creditPromotion.update({
      where: { id: promotionId },
      data: { linkToken: null },
    });
    revalidateCreditSurfaces();
    return { success: true };
  } catch (err) {
    console.error("[clearCreditPromotionLink] Error:", err);
    return { success: false, error: "링크 제거에 실패했습니다." };
  }
}

/** 대상 지정용 학원 목록(원장 회원 기준, 경량). */
export async function listAcademiesForPromoPicker(): Promise<
  Array<{ academyId: string; name: string; slug: string }>
> {
  await requireAdminAuth("SUPER_ADMIN");
  const rows = await prisma.staff.findMany({
    where: { role: "DIRECTOR" },
    orderBy: { createdAt: "desc" },
    select: {
      academyId: true,
      academy: { select: { name: true, slug: true } },
    },
  });
  const seen = new Set<string>();
  const out: Array<{ academyId: string; name: string; slug: string }> = [];
  for (const r of rows) {
    if (seen.has(r.academyId)) continue;
    seen.add(r.academyId);
    out.push({
      academyId: r.academyId,
      name: r.academy.name,
      slug: r.academy.slug,
    });
  }
  return out;
}
