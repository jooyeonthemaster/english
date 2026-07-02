"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";
import { toCreditTopUpProductView } from "@/lib/credit-top-up-products";
import { type ActionResult } from "./helpers";

const creditProductUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "상품명을 입력해주세요.").max(60),
    basePrice: z.coerce.number().int().min(100).max(100_000_000),
    // Credit validity in days. 0/blank = 무기한 (stored as null).
    expiryDays: z.coerce.number().int().min(0).max(3650).default(0),
    discountRate: z.coerce.number().int().min(0).max(99).default(0),
    promotionName: z.string().trim().max(60).optional().nullable(),
    promotionStartsAt: z.string().trim().optional().nullable(),
    promotionEndsAt: z.string().trim().optional().nullable(),
    description: z.string().trim().max(1000).optional().nullable(),
    isActive: z.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  })
  .superRefine((data, ctx) => {
    if (data.discountRate <= 0) return;

    if (!data.promotionStartsAt || !data.promotionEndsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["promotionStartsAt"],
        message: "할인율을 적용하려면 시작일과 종료일을 모두 입력해주세요.",
      });
      return;
    }

    const startsAt = new Date(data.promotionStartsAt);
    const endsAt = new Date(data.promotionEndsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["promotionStartsAt"],
        message: "프로모션 기간 형식이 올바르지 않습니다.",
      });
      return;
    }

    if (startsAt >= endsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["promotionEndsAt"],
        message: "프로모션 종료일은 시작일보다 뒤여야 합니다.",
      });
    }
  });

export type CreditProductUpdateData = z.input<typeof creditProductUpdateSchema>;

export async function updateCreditTopUpProduct(
  productId: string,
  data: CreditProductUpdateData,
): Promise<ActionResult & { product?: ReturnType<typeof toCreditTopUpProductView> }> {
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

    const product = await prisma.creditTopUpProduct.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return { success: false, error: "상품을 찾을 수 없습니다." };
    }

    const updated = await prisma.creditTopUpProduct.update({
      where: { id: productId },
      data: {
        name: parsed.data.name,
        basePrice: parsed.data.basePrice,
        expiryDays: parsed.data.expiryDays > 0 ? parsed.data.expiryDays : null,
        discountRate: parsed.data.discountRate,
        promotionName: parsed.data.promotionName?.trim() || null,
        promotionStartsAt:
          parsed.data.discountRate > 0
            ? new Date(parsed.data.promotionStartsAt ?? "")
            : null,
        promotionEndsAt:
          parsed.data.discountRate > 0
            ? new Date(parsed.data.promotionEndsAt ?? "")
            : null,
        description: parsed.data.description?.trim() || null,
        isActive: parsed.data.isActive,
        sortOrder: parsed.data.sortOrder,
      },
    });

    revalidatePath("/admin/credit-plans");
    revalidatePath("/director/credits");
    revalidatePath("/credits/products");
    revalidatePath("/refund-policy");

    return {
      success: true,
      product: toCreditTopUpProductView(updated),
    };
  } catch (err) {
    console.error("[updateCreditTopUpProduct] Error:", err);
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "크레딧 상품을 저장하지 못했습니다.",
    };
  }
}
