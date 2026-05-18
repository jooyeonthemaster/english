"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { revalidatePath } from "next/cache";
import { type ActionResult } from "./helpers";

/**
 * List all subscription plans.
 */
export async function getPlans() {
  await requireAdminAuth();

  return prisma.subscriptionPlan.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { subscriptions: true } },
    },
  });
}

/**
 * Update a subscription plan's details.
 * Only allows updating safe fields; tier cannot be changed.
 */
export async function updatePlan(
  planId: string,
  data: {
    name?: string;
    monthlyPrice?: number;
    monthlyCredits?: number;
    maxStudents?: number;
    maxStaff?: number;
    features?: string;
    rolloverPolicy?: string;
    rolloverMaxRate?: number;
    description?: string;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<ActionResult> {
  await requireAdminAuth("SUPER_ADMIN");

  try {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return { success: false, error: "Plan not found" };
    }

    await prisma.subscriptionPlan.update({
      where: { id: planId },
      data,
    });

    revalidatePath("/admin/plans");

    return { success: true };
  } catch (err) {
    console.error("[updatePlan] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update plan",
    };
  }
}
