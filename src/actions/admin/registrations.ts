"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { createUniqueAcademyCode } from "@/lib/tutor/academy-code";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import {
  type ActionResult,
  type ApproveData,
  type RegistrationFilters,
  generatePassword,
  generateSlug,
} from "./helpers";

/**
 * List all academy registration requests, optionally filtered by status.
 */
export async function getRegistrations(filters?: RegistrationFilters) {
  await requireAdminAuth();

  const where: Record<string, unknown> = {};
  if (filters?.status) {
    where.status = filters.status;
  }

  const registrations = await prisma.academyRegistration.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
  });

  return registrations;
}

/**
 * Approve a registration request.
 *
 * Creates Academy, Staff (DIRECTOR), AcademySubscription, CreditBalance
 * inside a single transaction. Returns the generated temporary password
 * so the admin can share it with the director.
 */
export async function approveRegistration(
  registrationId: string,
  data: ApproveData,
): Promise<ActionResult & { tempPassword?: string; academyId?: string }> {
  const admin = await requireAdminAuth("SUPER_ADMIN");

  try {
    // 1. Fetch the registration
    const registration = await prisma.academyRegistration.findUnique({
      where: { id: registrationId },
    });

    if (!registration) {
      return { success: false, error: "Registration not found" };
    }
    if (registration.status !== "PENDING") {
      return {
        success: false,
        error: `Registration is already ${registration.status}`,
      };
    }

    // 2. Resolve the subscription plan
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { tier: data.planTier },
    });
    if (!plan) {
      return { success: false, error: `Plan tier "${data.planTier}" not found` };
    }

    // 3. Check for duplicate director email
    const existingStaff = await prisma.staff.findUnique({
      where: { email: registration.directorEmail },
    });
    if (existingStaff) {
      return {
        success: false,
        error: `Staff with email "${registration.directorEmail}" already exists`,
      };
    }

    // 4. Prepare values
    const slug = generateSlug(registration.academyName);
    const tempPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    const initialCredits = data.initialCredits ?? plan.monthlyCredits;

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // 5. Execute everything in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 5a. Create Academy
      const academy = await tx.academy.create({
        data: {
          name: registration.academyName,
          slug,
          code: await createUniqueAcademyCode(tx),
          phone: registration.phone,
          address: registration.address ?? undefined,
          status: "ACTIVE",
        },
      });

      // 5b. Create Staff (DIRECTOR)
      await tx.staff.create({
        data: {
          academyId: academy.id,
          email: registration.directorEmail,
          password: hashedPassword,
          name: registration.directorName,
          phone: registration.directorPhone,
          role: "DIRECTOR",
        },
      });

      // 5c. Create AcademySubscription
      await tx.academySubscription.create({
        data: {
          academyId: academy.id,
          planId: plan.id,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      // 5d. Create CreditBalance
      await tx.creditBalance.create({
        data: {
          academyId: academy.id,
          balance: initialCredits,
          monthlyAllocation: plan.monthlyCredits,
          totalAllocated: initialCredits,
          lastResetAt: now,
        },
      });

      // 5e. Record the initial credit allocation transaction
      await tx.creditTransaction.create({
        data: {
          academyId: academy.id,
          type: "ALLOCATION",
          amount: initialCredits,
          balanceAfter: initialCredits,
          description: "Initial credit allocation on registration approval",
          adminId: admin.adminId,
        },
      });

      // 5f. Update registration status
      await tx.academyRegistration.update({
        where: { id: registrationId },
        data: {
          status: "APPROVED",
          reviewedById: admin.adminId,
          reviewNote: data.reviewNote ?? null,
          reviewedAt: now,
          academyId: academy.id,
        },
      });

      return academy;
    });

    revalidatePath("/admin/registrations");
    revalidatePath("/admin/academies");

    return {
      success: true,
      tempPassword,
      academyId: result.id,
    };
  } catch (err) {
    console.error("[approveRegistration] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to approve registration",
    };
  }
}

/**
 * Reject a registration request with a review note.
 */
export async function rejectRegistration(
  registrationId: string,
  reviewNote: string,
): Promise<ActionResult> {
  const admin = await requireAdminAuth("SUPER_ADMIN");

  try {
    const registration = await prisma.academyRegistration.findUnique({
      where: { id: registrationId },
    });

    if (!registration) {
      return { success: false, error: "Registration not found" };
    }
    if (registration.status !== "PENDING") {
      return {
        success: false,
        error: `Registration is already ${registration.status}`,
      };
    }

    await prisma.academyRegistration.update({
      where: { id: registrationId },
      data: {
        status: "REJECTED",
        reviewedById: admin.adminId,
        reviewNote,
        reviewedAt: new Date(),
      },
    });

    revalidatePath("/admin/registrations");

    return { success: true };
  } catch (err) {
    console.error("[rejectRegistration] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to reject registration",
    };
  }
}
