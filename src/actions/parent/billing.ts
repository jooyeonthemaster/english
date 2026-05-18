"use server";

import { prisma } from "@/lib/prisma";
import { requireParentAuth } from "@/lib/auth-parent";
import type { ChildBillingData } from "./types";

export async function getChildBillingInfo(
  studentId: string
): Promise<ChildBillingData> {
  const session = await requireParentAuth();
  if (!session.studentIds.includes(studentId)) {
    throw new Error("접근 권한이 없습니다.");
  }

  // Both invoice queries are independent — run in parallel
  const [activeInvoices, paidInvoices] = await Promise.all([
    // Active invoices (PENDING or OVERDUE)
    prisma.invoice.findMany({
      where: {
        studentId,
        status: { in: ["PENDING", "OVERDUE"] },
      },
      orderBy: { dueDate: "asc" },
    }),
    // Past payments
    prisma.invoice.findMany({
      where: {
        studentId,
        status: { in: ["PAID", "REFUNDED"] },
      },
      include: {
        payments: {
          orderBy: { paidAt: "desc" },
        },
      },
      orderBy: { paidDate: "desc" },
      take: 20,
    }),
  ]);

  const pastPayments = paidInvoices.flatMap((inv) =>
    inv.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      paidAt: p.paidAt.toISOString(),
      invoiceTitle: inv.title,
      status: inv.status,
    }))
  );

  const hasOverdue = activeInvoices.some((inv) => inv.status === "OVERDUE");

  return {
    activeInvoices: activeInvoices.map((inv) => ({
      id: inv.id,
      title: inv.title,
      finalAmount: inv.finalAmount,
      dueDate: inv.dueDate.toISOString(),
      status: inv.status,
    })),
    pastPayments,
    hasOverdue,
  };
}
