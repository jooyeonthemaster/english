"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

export interface ExpenseFilters {
  category?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateExpenseData {
  category: string;
  amount: number;
  date: string;
  description?: string;
  receipt?: string;
}

export interface SalaryData {
  basePay: number;
  bonus?: number;
  deductions?: number;
  memo?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireDirector() {
  return requireStaffAuth("DIRECTOR");
}

// ---------------------------------------------------------------------------
// Finance Summary
// ---------------------------------------------------------------------------

export async function getFinanceSummary(period?: { startDate: string; endDate: string }) {
  const staff = await requireDirector();

  const now = new Date();
  const start = period
    ? new Date(period.startDate)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = period
    ? new Date(period.endDate)
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [invoices, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        academyId: staff.academyId,
        status: "PAID",
        paidDate: { gte: start, lte: end },
      },
      include: { payments: true },
    }),
    prisma.expense.findMany({
      where: {
        academyId: staff.academyId,
        date: { gte: start, lte: end },
      },
    }),
  ]);

  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.finalAmount, 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const netProfit = totalRevenue - totalExpenses;
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Revenue breakdown (for now, all from tuition)
  const revenueBreakdown = [
    { category: "수강료", amount: totalRevenue },
  ];

  // Expense breakdown by category
  const expenseMap = new Map<string, number>();
  for (const exp of expenses) {
    expenseMap.set(exp.category, (expenseMap.get(exp.category) || 0) + exp.amount);
  }
  const expenseBreakdown = Array.from(expenseMap.entries()).map(([category, amount]) => ({
    category,
    amount,
  }));

  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    margin,
    revenueBreakdown,
    expenseBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Revenue Trend (6 months)
// ---------------------------------------------------------------------------

export async function getRevenueTrend() {
  const staff = await requireDirector();

  const now = new Date();
  const months: { label: string; start: Date; end: Date }[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: `${d.getMonth() + 1}월`,
      start: new Date(d.getFullYear(), d.getMonth(), 1),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
    });
  }

  const trend = await Promise.all(
    months.map(async (m) => {
      const [revenue, expenses] = await Promise.all([
        prisma.invoice
          .aggregate({
            where: {
              academyId: staff.academyId,
              status: "PAID",
              paidDate: { gte: m.start, lte: m.end },
            },
            _sum: { finalAmount: true },
          })
          .then((r) => r._sum.finalAmount || 0),
        prisma.expense
          .aggregate({
            where: {
              academyId: staff.academyId,
              date: { gte: m.start, lte: m.end },
            },
            _sum: { amount: true },
          })
          .then((r) => r._sum.amount || 0),
      ]);

      return { month: m.label, revenue, expenses };
    })
  );

  return trend;
}

// ---------------------------------------------------------------------------
// Collection Rate Trend (6 months)
// ---------------------------------------------------------------------------

export async function getCollectionRateTrend() {
  const staff = await requireDirector();

  const now = new Date();

  // Build month descriptors for the last 6 months
  const months = Array.from({ length: 6 }, (_, idx) => {
    const i = 5 - idx;
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      label: `${d.getMonth() + 1}월`,
      start: new Date(d.getFullYear(), d.getMonth(), 1),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
    };
  });

  // All 6 findMany queries are independent — run in parallel
  const invoicesByMonth = await Promise.all(
    months.map((m) =>
      prisma.invoice.findMany({
        where: {
          academyId: staff.academyId,
          dueDate: { gte: m.start, lte: m.end },
        },
        select: { finalAmount: true, status: true },
      })
    )
  );

  const trend = months.map((m, idx) => {
    const invoices = invoicesByMonth[idx];
    const totalBilled = invoices.reduce((sum, inv) => sum + inv.finalAmount, 0);
    const totalPaid = invoices
      .filter((inv) => inv.status === "PAID")
      .reduce((sum, inv) => sum + inv.finalAmount, 0);

    return {
      month: m.label,
      rate: totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0,
    };
  });

  return trend;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export async function getExpenses(filters: ExpenseFilters = {}) {
  const staff = await requireDirector();
  const { category, startDate, endDate, page = 1, pageSize = 20 } = filters;

  const where: Record<string, unknown> = {
    academyId: staff.academyId,
  };

  if (category && category !== "ALL") {
    where.category = category;
  }

  if (startDate || endDate) {
    where.date = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
  }

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.expense.count({ where }),
  ]);

  return { expenses, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function createExpense(data: CreateExpenseData): Promise<ActionResult> {
  try {
    const staff = await requireDirector();

    const expense = await prisma.expense.create({
      data: {
        academyId: staff.academyId,
        category: data.category,
        amount: data.amount,
        date: new Date(data.date),
        description: data.description || null,
        receipt: data.receipt || null,
      },
    });

    revalidatePath("/director/finance");
    return { success: true, id: expense.id };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Salaries
// ---------------------------------------------------------------------------

export async function getSalaries(month: string) {
  const staff = await requireDirector();

  const staffList = await prisma.staff.findMany({
    where: { academyId: staff.academyId, isActive: true },
    select: {
      id: true,
      name: true,
      role: true,
      salaries: {
        where: { month },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return staffList.map((s) => ({
    staffId: s.id,
    name: s.name,
    role: s.role,
    salary: s.salaries[0] || null,
  }));
}

export async function updateSalary(
  staffId: string,
  month: string,
  data: SalaryData
): Promise<ActionResult> {
  try {
    const director = await requireDirector();
    const totalPay = data.basePay + (data.bonus || 0) - (data.deductions || 0);

    await prisma.salary.upsert({
      where: { staffId_month: { staffId, month } },
      update: {
        basePay: data.basePay,
        bonus: data.bonus || 0,
        deductions: data.deductions || 0,
        totalPay,
        memo: data.memo || null,
      },
      create: {
        academyId: director.academyId,
        staffId,
        month,
        basePay: data.basePay,
        bonus: data.bonus || 0,
        deductions: data.deductions || 0,
        totalPay,
        memo: data.memo || null,
      },
    });

    revalidatePath("/director/salaries");
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function markSalaryPaid(salaryId: string): Promise<ActionResult> {
  try {
    await requireDirector();

    await prisma.salary.update({
      where: { id: salaryId },
      data: { paidAt: new Date() },
    });

    revalidatePath("/director/salaries");
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function bulkMarkSalariesPaid(month: string): Promise<ActionResult> {
  try {
    const staff = await requireDirector();

    await prisma.salary.updateMany({
      where: {
        academyId: staff.academyId,
        month,
        paidAt: null,
      },
      data: { paidAt: new Date() },
    });

    revalidatePath("/director/salaries");
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
