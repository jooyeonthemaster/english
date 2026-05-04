"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionResult {
  success: boolean;
  error?: string;
}

interface RegistrationFilters {
  status?: string;
}

interface ApproveData {
  planTier: string;
  initialCredits?: number;
  reviewNote?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a URL-safe slug from an academy name.
 * For Korean names, produces a random slug like "academy-a1b2c3d4".
 * For ASCII names, converts to lowercase kebab-case with a short suffix.
 */
function generateSlug(name: string): string {
  const suffix = crypto.randomBytes(4).toString("hex"); // 8 hex chars
  // Strip non-ASCII to check if there's usable Latin text
  const ascii = name.replace(/[^\x20-\x7E]/g, "").trim();
  if (ascii.length >= 2) {
    const base = ascii
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `${base}-${suffix}`;
  }
  return `academy-${suffix}`;
}

/**
 * Generate a random 8-character alphanumeric password.
 */
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

// ===========================================================================
// 1. REGISTRATION MANAGEMENT
// ===========================================================================

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

// ===========================================================================
// 2. ACADEMY MONITORING
// ===========================================================================

/**
 * List all academies with subscription info, credit balance, and aggregate counts.
 */
export async function getAcademyList() {
  await requireAdminAuth();

  const academies = await prisma.academy.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { plan: true },
      },
      creditBalance: true,
      _count: {
        select: {
          questions: true,
          staff: true,
          students: true,
        },
      },
    },
  });

  return academies.map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    status: a.status,
    createdAt: a.createdAt,
    subscription: a.subscriptions[0] ?? null,
    creditBalance: a.creditBalance,
    questionCount: a._count.questions,
    staffCount: a._count.staff,
    studentCount: a._count.students,
  }));
}

/**
 * Get full details for a single academy, including subscription, credits,
 * staff roster, recent transactions, and usage stats.
 */
export async function getAcademyDetail(academyId: string) {
  await requireAdminAuth();

  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    include: {
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { plan: true },
      },
      creditBalance: true,
      staff: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          questions: true,
          students: true,
          passages: true,
          exams: true,
          classes: true,
        },
      },
    },
  });

  if (!academy) {
    return null;
  }

  // Recent credit transactions (last 50)
  const recentTransactions = await prisma.creditTransaction.findMany({
    where: { academyId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Usage stats: credits consumed in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const consumptionAgg = await prisma.creditTransaction.aggregate({
    where: {
      academyId,
      type: "CONSUMPTION",
      createdAt: { gte: thirtyDaysAgo },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Fetch actual content data for the file browser
  const [passages, questions, exams] = await Promise.all([
    prisma.passage.findMany({
      where: { academyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        content: true,
        difficulty: true,
        grade: true,
        semester: true,
        unit: true,
        publisher: true,
        createdAt: true,
        _count: { select: { questions: true } },
      },
    }),
    prisma.question.findMany({
      where: { academyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        subType: true,
        difficulty: true,
        questionText: true,
        aiGenerated: true,
        approved: true,
        starred: true,
        passageId: true,
        createdAt: true,
      },
    }),
    prisma.exam.findMany({
      where: { academyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        createdAt: true,
        _count: { select: { questions: true } },
      },
    }),
  ]);

  return {
    ...academy,
    subscription: academy.subscriptions[0] ?? null,
    recentTransactions,
    usageStats: {
      creditsConsumedLast30Days: Math.abs(consumptionAgg._sum.amount ?? 0),
      transactionCountLast30Days: consumptionAgg._count.id,
      questionCount: academy._count.questions,
      studentCount: academy._count.students,
      passageCount: academy._count.passages,
      examCount: academy._count.exams,
      classCount: academy._count.classes,
    },
    content: {
      passages,
      questions,
      exams,
    },
  };
}

// ===========================================================================
// 3. CREDIT MANAGEMENT
// ===========================================================================

/**
 * Manually adjust an academy's credit balance. Positive amount adds credits,
 * negative amount subtracts credits. Creates an audit trail transaction.
 */
/**
 * Adjust an academy's credit balance with race-safe overdraft detection and
 * a guaranteed-coupled audit row. Mirrors `adjustMemberCredits` in
 * src/actions/admin-members.ts; both must move together so neither becomes
 * a TOCTOU sidedoor.
 *
 * Pre-2026-05 a naive read-then-write version of this lived here and was
 * race-vulnerable. The new path uses raw `UPDATE/INSERT ... RETURNING` so
 * `balanceAfter` is read out of the same statement that mutated the row,
 * eliminating any window where concurrent writers can produce inconsistent
 * audit snapshots.
 */
export async function adjustCredits(
  academyId: string,
  amount: number,
  description: string,
): Promise<ActionResult> {
  const admin = await requireAdminAuth("SUPER_ADMIN");

  if (!Number.isInteger(amount) || amount === 0) {
    return { success: false, error: "Adjustment amount must be a non-zero integer" };
  }
  if (Math.abs(amount) > 1_000_000) {
    return { success: false, error: "Adjustment amount exceeds 1,000,000" };
  }
  const trimmed = description.trim();
  if (trimmed.length < 5) {
    return { success: false, error: "Description must be at least 5 characters" };
  }

  // Resolve plan's monthlyCredits — needed when initializing a CreditBalance
  // row that doesn't yet exist (so the monthly reset job uses the right
  // allocation).
  const activeSub = await prisma.academySubscription.findFirst({
    where: { academyId, status: { in: ["ACTIVE", "TRIAL"] } },
    include: { plan: { select: { monthlyCredits: true } } },
    orderBy: { createdAt: "desc" },
  });
  const planMonthlyCredits = activeSub?.plan.monthlyCredits ?? 0;

  try {
    await prisma.$transaction(
      async (tx) => {
        let newBalance: number;

        if (amount < 0) {
          const decremented = await tx.$queryRaw<Array<{ balance: number }>>`
            UPDATE credit_balances
            SET balance = balance + ${amount}, "updatedAt" = NOW()
            WHERE "academyId" = ${academyId}
              AND balance >= ${-amount}
            RETURNING balance
          `;
          if (decremented.length === 0) {
            const exists = await tx.creditBalance.findUnique({
              where: { academyId },
              select: { id: true },
            });
            if (!exists) throw new Error("balance_not_initialized");
            throw new Error("insufficient_balance");
          }
          newBalance = decremented[0].balance;
        } else {
          const upserted = await tx.$queryRaw<Array<{ balance: number }>>`
            INSERT INTO credit_balances (id, "academyId", balance, "monthlyAllocation", "updatedAt")
            VALUES (${crypto.randomUUID()}, ${academyId}, ${amount}, ${planMonthlyCredits}, NOW())
            ON CONFLICT ("academyId") DO UPDATE
              SET balance = credit_balances.balance + EXCLUDED.balance,
                  "updatedAt" = NOW()
            RETURNING balance
          `;
          if (upserted.length === 0) throw new Error("balance_upsert_failed");
          newBalance = upserted[0].balance;
        }

        await tx.creditTransaction.create({
          data: {
            academyId,
            type: "ADJUSTMENT",
            amount,
            balanceAfter: newBalance,
            description: trimmed,
            adminId: admin.adminId,
            referenceType: "ADMIN_ADJUSTMENT",
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 10_000,
      },
    );

    revalidatePath("/admin/academies");
    revalidatePath(`/admin/academies/${academyId}`);
    revalidatePath("/admin/members");

    return { success: true };
  } catch (err) {
    const code = err instanceof Error ? err.message : "unknown_error";
    if (code === "insufficient_balance") {
      return { success: false, error: "Adjustment would result in negative balance" };
    }
    if (code === "balance_not_initialized") {
      return {
        success: false,
        error: "Credit balance not initialized; run a positive adjustment first",
      };
    }
    console.error("[adjustCredits] Error", { academyId, adminId: admin.adminId, err });
    return {
      success: false,
      error: "Failed to adjust credits. Please retry.",
    };
  }
}

/**
 * Get system-wide statistics for the admin dashboard.
 */
export async function getSystemStats() {
  await requireAdminAuth();

  const [
    totalAcademies,
    activeAcademies,
    totalStudents,
    totalStaff,
    totalQuestions,
    totalPassages,
    totalExams,
    pendingRegistrations,
    creditStats,
    recentTransactions,
    directorProviderRows,
  ] = await Promise.all([
    prisma.academy.count(),
    prisma.academy.count({ where: { status: "ACTIVE" } }),
    prisma.student.count(),
    prisma.staff.count(),
    prisma.question.count(),
    prisma.passage.count(),
    prisma.exam.count(),
    prisma.academyRegistration.count({ where: { status: "PENDING" } }),
    prisma.creditTransaction.aggregate({
      _sum: { amount: true },
      where: { type: "CONSUMPTION" },
    }),
    prisma.creditTransaction.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.staff.groupBy({
      by: ["authProvider"],
      where: { role: "DIRECTOR" },
      _count: { _all: true },
    }),
  ]);

  // Revenue estimate: sum of all subscription plan monthly prices for active subscriptions
  const activeSubscriptions = await prisma.academySubscription.findMany({
    where: { status: { in: ["ACTIVE", "TRIAL"] } },
    include: { plan: { select: { monthlyPrice: true } } },
  });
  const monthlyRevenue = activeSubscriptions.reduce(
    (sum, sub) => sum + sub.plan.monthlyPrice,
    0,
  );

  // Director signup attribution. Kakao bypasses Supabase Auth (custom OAuth in
  // /api/auth/kakao), so the canonical source is staff.authProvider, not
  // auth.identities. Null = pre-OAuth seed data or credential-based imports.
  const providerCounts = { google: 0, kakao: 0, other: 0 };
  for (const row of directorProviderRows) {
    const key = row.authProvider;
    if (key === "google") providerCounts.google += row._count._all;
    else if (key === "kakao") providerCounts.kakao += row._count._all;
    else providerCounts.other += row._count._all;
  }
  const totalDirectors =
    providerCounts.google + providerCounts.kakao + providerCounts.other;

  return {
    totalAcademies,
    activeAcademies,
    totalStudents,
    totalStaff,
    totalQuestions,
    totalPassages,
    totalExams,
    pendingRegistrations,
    totalCreditsConsumed: Math.abs(creditStats._sum.amount ?? 0),
    transactionsLast30Days: recentTransactions,
    estimatedMonthlyRevenue: monthlyRevenue,
    directorsByProvider: {
      total: totalDirectors,
      google: providerCounts.google,
      kakao: providerCounts.kakao,
      other: providerCounts.other,
    },
  };
}

// ===========================================================================
// 5. ACADEMY CONTENT — Detailed views for passages, questions, exams
// ===========================================================================

/**
 * Fetch all passages for a given academy, with question count and analysis info.
 */
export async function getAcademyPassages(academyId: string) {
  await requireAdminAuth();

  const passages = await prisma.passage.findMany({
    where: { academyId },
    orderBy: { createdAt: "desc" },
    include: {
      school: { select: { id: true, name: true } },
      analysis: { select: { id: true } },
      _count: { select: { questions: true, notes: true } },
    },
  });

  return passages.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    source: p.source,
    grade: p.grade,
    semester: p.semester,
    unit: p.unit,
    publisher: p.publisher,
    difficulty: p.difficulty,
    tags: p.tags,
    order: p.order,
    createdAt: p.createdAt,
    school: p.school,
    hasAnalysis: !!p.analysis,
    questionCount: p._count.questions,
    noteCount: p._count.notes,
  }));
}

/**
 * Fetch a single passage with full analysis, connected questions, and notes.
 */
export async function getAcademyPassageDetail(
  academyId: string,
  passageId: string,
) {
  await requireAdminAuth();

  const passage = await prisma.passage.findFirst({
    where: { id: passageId, academyId },
    include: {
      school: { select: { id: true, name: true } },
      analysis: true,
      notes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          content: true,
          noteType: true,
          highlightStart: true,
          highlightEnd: true,
          createdAt: true,
        },
      },
      questions: {
        orderBy: { createdAt: "desc" },
        include: {
          explanation: true,
          _count: { select: { examLinks: true } },
        },
      },
    },
  });

  if (!passage) return null;

  return {
    id: passage.id,
    title: passage.title,
    content: passage.content,
    source: passage.source,
    grade: passage.grade,
    semester: passage.semester,
    unit: passage.unit,
    publisher: passage.publisher,
    difficulty: passage.difficulty,
    tags: passage.tags,
    createdAt: passage.createdAt,
    school: passage.school,
    analysis: passage.analysis
      ? {
          id: passage.analysis.id,
          analysisData: passage.analysis.analysisData,
          version: passage.analysis.version,
          createdAt: passage.analysis.createdAt,
        }
      : null,
    notes: passage.notes,
    questions: passage.questions.map((q) => ({
      id: q.id,
      type: q.type,
      subType: q.subType,
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer,
      points: q.points,
      difficulty: q.difficulty,
      tags: q.tags,
      aiGenerated: q.aiGenerated,
      approved: q.approved,
      starred: q.starred,
      createdAt: q.createdAt,
      explanation: q.explanation
        ? {
            id: q.explanation.id,
            content: q.explanation.content,
            keyPoints: q.explanation.keyPoints,
            wrongOptionExplanations: q.explanation.wrongOptionExplanations,
          }
        : null,
      _count: { examLinks: q._count.examLinks },
    })),
  };
}

/**
 * Fetch all questions for a given academy with passage info and explanations.
 */
export async function getAcademyQuestions(academyId: string) {
  await requireAdminAuth();

  const questions = await prisma.question.findMany({
    where: { academyId },
    orderBy: { createdAt: "desc" },
    include: {
      passage: {
        select: {
          id: true,
          title: true,
          content: true,
          grade: true,
          semester: true,
          publisher: true,
          school: { select: { id: true, name: true } },
        },
      },
      explanation: {
        select: {
          id: true,
          content: true,
          keyPoints: true,
          wrongOptionExplanations: true,
        },
      },
      _count: { select: { examLinks: true } },
    },
  });

  return questions.map((q) => ({
    id: q.id,
    type: q.type,
    subType: q.subType,
    questionText: q.questionText,
    options: q.options,
    correctAnswer: q.correctAnswer,
    points: q.points,
    difficulty: q.difficulty,
    tags: q.tags,
    aiGenerated: q.aiGenerated,
    approved: q.approved,
    starred: q.starred,
    createdAt: q.createdAt,
    passage: q.passage,
    explanation: q.explanation,
    _count: { examLinks: q._count.examLinks },
  }));
}

/**
 * Fetch all exams for a given academy with class, school, question and submission counts.
 */
export async function getAcademyExams(academyId: string) {
  await requireAdminAuth();

  const exams = await prisma.exam.findMany({
    where: { academyId },
    orderBy: { createdAt: "desc" },
    include: {
      class: { select: { id: true, name: true } },
      school: { select: { id: true, name: true } },
      _count: { select: { questions: true, submissions: true } },
    },
  });

  return exams.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    status: e.status,
    grade: e.grade,
    semester: e.semester,
    examDate: e.examDate,
    totalPoints: e.totalPoints,
    createdAt: e.createdAt,
    class: e.class,
    school: e.school,
    _count: { questions: e._count.questions, submissions: e._count.submissions },
  }));
}

/**
 * Fetch credit transactions across all academies with optional filters.
 */
export async function getCreditTransactionsAll(filters?: {
  academyId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}) {
  await requireAdminAuth();

  const where: Record<string, unknown> = {};
  if (filters?.academyId) where.academyId = filters.academyId;
  if (filters?.type) where.type = filters.type;

  const limit = Math.min(filters?.limit ?? 50, 200);
  const offset = filters?.offset ?? 0;

  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        academy: { select: { id: true, name: true, slug: true } },
        admin: { select: { id: true, name: true } },
      },
    }),
    prisma.creditTransaction.count({ where }),
  ]);

  return { transactions, total, limit, offset };
}

// ===========================================================================
// 4. PLAN MANAGEMENT
// ===========================================================================

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
