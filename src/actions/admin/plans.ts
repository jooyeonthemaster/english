"use server";

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  parseSubscriptionPlanFeatures,
  serializeSubscriptionPlanFeatures,
} from "@/lib/subscription-plan-pricing";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult } from "./helpers";

const planUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "요금제 이름을 입력해주세요.").max(60),
    monthlyPrice: z.coerce.number().int().min(0).max(100_000_000),
    monthlyCredits: z.coerce.number().int().min(0).max(10_000_000),
    maxStudents: z.coerce.number().int().min(0).max(1_000_000),
    maxStaff: z.coerce.number().int().min(0).max(100_000),
    rolloverPolicy: z
      .enum(["RESET", "ROLLOVER", "PARTIAL_ROLLOVER"])
      .default("RESET"),
    rolloverMaxRate: z.coerce.number().min(0).max(1).default(0),
    description: z.string().trim().max(1000).optional().nullable(),
    isActive: z.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
    promotionEnabled: z.boolean().default(false),
    promotionName: z.string().trim().max(60).optional().nullable(),
    promotionDiscountRate: z.coerce.number().int().min(0).max(99).default(0),
    promotionStartsAt: z.string().trim().optional().nullable(),
    promotionEndsAt: z.string().trim().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.promotionEnabled) return;

    if (data.promotionDiscountRate <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["promotionDiscountRate"],
        message: "프로모션 할인율은 1% 이상 99% 이하로 입력해주세요.",
      });
    }

    if (data.monthlyPrice <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monthlyPrice"],
        message: "무료 요금제에는 결제 프로모션을 적용할 수 없습니다.",
      });
    }

    if (!data.promotionStartsAt || !data.promotionEndsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["promotionStartsAt"],
        message: "프로모션 시작일과 종료일을 모두 입력해주세요.",
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

export type PlanUpdateData = z.input<typeof planUpdateSchema>;

const planCreateSchema = z.object({
  name: z.string().trim().min(1, "상품 이름을 입력해주세요.").max(60),
  monthlyPrice: z.coerce.number().int().min(0).max(100_000_000),
  monthlyCredits: z.coerce.number().int().min(0).max(10_000_000),
  maxStudents: z.coerce.number().int().min(0).max(1_000_000).default(0),
  maxStaff: z.coerce.number().int().min(0).max(100_000).default(0),
  description: z.string().trim().max(1000).optional().nullable(),
});

export type PlanCreateData = z.input<typeof planCreateSchema>;

type PlanRecord = Awaited<ReturnType<typeof getPlans>>[number];
type PlanMutationResult = ActionResult & {
  message?: string;
  plan?: ReturnType<typeof serializePlan>;
};

function serializePlan(plan: PlanRecord) {
  return {
    ...plan,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function buildTierPrefix(name: string) {
  const ascii = name
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

  return ascii || "CUSTOM";
}

async function generateUniqueTier(name: string) {
  const prefix = buildTierPrefix(name);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
    const tier = `${prefix}_${suffix}`;
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { tier },
      select: { id: true },
    });
    if (!existing) return tier;
  }

  return `CUSTOM_${Date.now()}`;
}

/**
 * List all subscription plans.
 */
export async function getPlans(options?: { includeInactive?: boolean }) {
  await requireAdminAuth();

  return prisma.subscriptionPlan.findMany({
    where: options?.includeInactive ? undefined : { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { subscriptions: true } },
    },
  });
}

/**
 * Create a new plan as inactive by default.
 * Newly created products should not enter review/payment surfaces until reviewed.
 */
export async function createPlan(
  data: PlanCreateData,
): Promise<PlanMutationResult> {
  await requireAdminAuth("SUPER_ADMIN");

  try {
    const parsed = planCreateSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.issues[0]?.message ??
          "상품 입력값을 다시 확인해주세요.",
      };
    }

    const maxSortOrder = await prisma.subscriptionPlan.aggregate({
      _max: { sortOrder: true },
    });
    const tier = await generateUniqueTier(parsed.data.name);

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: parsed.data.name,
        tier,
        monthlyPrice: parsed.data.monthlyPrice,
        monthlyCredits: parsed.data.monthlyCredits,
        maxStudents: parsed.data.maxStudents,
        maxStaff: parsed.data.maxStaff,
        features: serializeSubscriptionPlanFeatures({}),
        rolloverPolicy: "RESET",
        rolloverMaxRate: 0,
        description: parsed.data.description?.trim() || null,
        isActive: false,
        sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
      },
      include: {
        _count: { select: { subscriptions: true } },
      },
    });

    revalidatePath("/admin/credit-plans");
    revalidatePath("/admin/registrations");

    return {
      success: true,
      message: "새 상품을 비활성 상태로 추가했습니다.",
      plan: serializePlan(plan),
    };
  } catch (err) {
    console.error("[createPlan] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create plan",
    };
  }
}

/**
 * Update a subscription plan's details.
 * Only allows updating safe fields; tier cannot be changed.
 */
export async function updatePlan(
  planId: string,
  data: PlanUpdateData,
): Promise<ActionResult> {
  await requireAdminAuth("SUPER_ADMIN");

  try {
    const parsed = planUpdateSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.issues[0]?.message ??
          "요금제 입력값을 다시 확인해주세요.",
      };
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return { success: false, error: "Plan not found" };
    }

    const features = parseSubscriptionPlanFeatures(plan.features);
    const {
      promotionEnabled,
      promotionName,
      promotionDiscountRate,
      promotionStartsAt,
      promotionEndsAt,
      ...planData
    } = parsed.data;

    if (promotionEnabled) {
      features.promotion = {
        name: promotionName?.trim() || `${promotionDiscountRate}% 할인`,
        discountRate: promotionDiscountRate,
        startsAt: new Date(promotionStartsAt ?? "").toISOString(),
        endsAt: new Date(promotionEndsAt ?? "").toISOString(),
      };
    } else {
      delete features.promotion;
    }

    await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: {
        ...planData,
        description: planData.description?.trim() || null,
        features: serializeSubscriptionPlanFeatures(features),
      },
    });

    revalidatePath("/admin/credit-plans");
    revalidatePath("/admin/registrations");

    return { success: true };
  } catch (err) {
    console.error("[updatePlan] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update plan",
    };
  }
}

/**
 * Delete a plan only when it has no subscriptions.
 * Plans with existing subscriptions are hidden instead to preserve billing history.
 */
export async function deletePlan(
  planId: string,
): Promise<PlanMutationResult> {
  await requireAdminAuth("SUPER_ADMIN");

  try {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      include: {
        _count: { select: { subscriptions: true } },
      },
    });

    if (!plan) {
      return { success: false, error: "Plan not found" };
    }

    if (plan._count.subscriptions > 0) {
      const updatedPlan = await prisma.subscriptionPlan.update({
        where: { id: planId },
        data: { isActive: false },
        include: {
          _count: { select: { subscriptions: true } },
        },
      });

      revalidatePath("/admin/credit-plans");
      revalidatePath("/admin/registrations");

      return {
        success: true,
        message:
          "연결된 구독이 있어 삭제 대신 비활성화했습니다. 기존 계약 이력은 유지됩니다.",
        plan: serializePlan(updatedPlan),
      };
    }

    await prisma.subscriptionPlan.delete({
      where: { id: planId },
    });

    revalidatePath("/admin/credit-plans");
    revalidatePath("/admin/registrations");

    return {
      success: true,
      message: "상품을 삭제했습니다.",
    };
  } catch (err) {
    console.error("[deletePlan] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete plan",
    };
  }
}
