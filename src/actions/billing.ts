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

export interface InvoiceFilters {
  month?: string; // "2026-03"
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateInvoiceData {
  studentId: string;
  title: string;
  amount: number;
  discount?: number;
  dueDate: string;
  memo?: string;
}

export interface RecordPaymentData {
  amount: number;
  method: string;
  paidAt?: string;
  reference?: string;
  memo?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireDirector() {
  const staff = await requireStaffAuth("DIRECTOR");
  return staff;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function getInvoices(filters: InvoiceFilters = {}) {
  const staff = await requireDirector();
  const { month, status, search, page = 1, pageSize = 20 } = filters;

  const where: Record<string, unknown> = {
    academyId: staff.academyId,
  };

  if (status && status !== "ALL") {
    where.status = status;
  }

  if (month) {
    const [year, mon] = month.split("-").map(Number);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 0, 23, 59, 59);
    where.dueDate = {
      gte: startDate,
      lte: endDate,
    };
  }

  if (search) {
    where.student = {
      name: { contains: search, mode: "insensitive" },
    };
  }

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, grade: true, phone: true } },
        payments: { orderBy: { paidAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);

  return { invoices, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getInvoice(invoiceId: string) {
  const staff = await requireDirector();

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, academyId: staff.academyId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          grade: true,
          phone: true,
          school: { select: { name: true } },
          parentLinks: {
            include: { parent: { select: { name: true, phone: true, relation: true } } },
          },
        },
      },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });

  if (!invoice) throw new Error("청구서를 찾을 수 없습니다.");
  return invoice;
}

export async function createInvoice(data: CreateInvoiceData): Promise<ActionResult> {
  try {
    const staff = await requireDirector();
    const finalAmount = data.amount - (data.discount || 0);

    const invoice = await prisma.invoice.create({
      data: {
        academyId: staff.academyId,
        studentId: data.studentId,
        title: data.title,
        amount: data.amount,
        discount: data.discount || 0,
        finalAmount,
        dueDate: new Date(data.dueDate),
        memo: data.memo || null,
        status: "PENDING",
      },
    });

    revalidatePath("/director/billing");
    return { success: true, id: invoice.id };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function bulkCreateInvoices(
  classIds: string[],
  month: string,
  dueDate: string
): Promise<ActionResult & { count?: number }> {
  try {
    const staff = await requireDirector();

    // Get all enrolled students from selected classes
    const enrollments = await prisma.classEnrollment.findMany({
      where: {
        classId: { in: classIds },
        status: "ENROLLED",
        student: { status: "ACTIVE" },
      },
      include: {
        student: { select: { id: true, name: true } },
        class: { select: { name: true, fee: true } },
      },
    });

    if (enrollments.length === 0) {
      return { success: false, error: "선택한 반에 재원생이 없습니다." };
    }

    // Group by student (a student may be in multiple selected classes)
    const studentInvoices = new Map<
      string,
      { studentId: string; amount: number; classNames: string[] }
    >();

    for (const enrollment of enrollments) {
      const existing = studentInvoices.get(enrollment.student.id);
      if (existing) {
        existing.amount += enrollment.class.fee;
        existing.classNames.push(enrollment.class.name);
      } else {
        studentInvoices.set(enrollment.student.id, {
          studentId: enrollment.student.id,
          amount: enrollment.class.fee,
          classNames: [enrollment.class.name],
        });
      }
    }

    const [year, mon] = month.split("-");
    const invoiceData = Array.from(studentInvoices.values()).map((si) => ({
      academyId: staff.academyId,
      studentId: si.studentId,
      title: `${year}년 ${parseInt(mon)}월 수강료 (${si.classNames.join(", ")})`,
      amount: si.amount,
      discount: 0,
      finalAmount: si.amount,
      dueDate: new Date(dueDate),
      status: "PENDING",
    }));

    await prisma.invoice.createMany({ data: invoiceData });

    revalidatePath("/director/billing");
    return { success: true, count: invoiceData.length };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function recordPayment(
  invoiceId: string,
  data: RecordPaymentData
): Promise<ActionResult> {
  try {
    const staff = await requireDirector();

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, academyId: staff.academyId },
      include: { payments: true },
    });

    if (!invoice) return { success: false, error: "청구서를 찾을 수 없습니다." };

    const totalPaid =
      invoice.payments.reduce((sum, p) => sum + p.amount, 0) + data.amount;

    await prisma.$transaction([
      prisma.payment.create({
        data: {
          invoiceId,
          amount: data.amount,
          method: data.method,
          paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
          reference: data.reference || null,
          memo: data.memo || null,
        },
      }),
      prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: totalPaid >= invoice.finalAmount ? "PAID" : "PARTIAL",
          paidDate: totalPaid >= invoice.finalAmount ? new Date() : null,
        },
      }),
    ]);

    revalidatePath("/director/billing");
    revalidatePath(`/director/billing/${invoiceId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function updateInvoiceStatus(
  invoiceId: string,
  status: string
): Promise<ActionResult> {
  try {
    const staff = await requireDirector();

    await prisma.invoice.update({
      where: { id: invoiceId, academyId: staff.academyId },
      data: {
        status,
        paidDate: status === "PAID" ? new Date() : undefined,
      },
    });

    revalidatePath("/director/billing");
    revalidatePath(`/director/billing/${invoiceId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function cancelInvoice(invoiceId: string): Promise<ActionResult> {
  return updateInvoiceStatus(invoiceId, "CANCELLED");
}

export async function getOverdueInvoices() {
  const staff = await requireDirector();

  const invoices = await prisma.invoice.findMany({
    where: {
      academyId: staff.academyId,
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      dueDate: { lt: new Date() },
    },
    include: {
      student: { select: { id: true, name: true, grade: true, phone: true } },
      payments: true,
    },
    orderBy: { dueDate: "asc" },
  });

  return invoices.map((inv) => {
    const totalPaid = inv.payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = inv.finalAmount - totalPaid;
    const daysOverdue = Math.floor(
      (Date.now() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    return { ...inv, remaining, daysOverdue };
  });
}

export async function getBillingSummary(month?: string) {
  const staff = await requireDirector();

  const now = new Date();
  const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [year, mon] = targetMonth.split("-").map(Number);
  const startDate = new Date(year, mon - 1, 1);
  const endDate = new Date(year, mon, 0, 23, 59, 59);

  const invoices = await prisma.invoice.findMany({
    where: {
      academyId: staff.academyId,
      dueDate: { gte: startDate, lte: endDate },
    },
    include: { payments: true },
  });

  const totalBilled = invoices.reduce((sum, inv) => sum + inv.finalAmount, 0);
  const totalCollected = invoices
    .filter((inv) => inv.status === "PAID")
    .reduce((sum, inv) => sum + inv.finalAmount, 0);
  const partialCollected = invoices
    .filter((inv) => inv.status === "PARTIAL")
    .reduce((sum, inv) => {
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
      return sum + paid;
    }, 0);
  const totalReceived = totalCollected + partialCollected;
  const outstanding = totalBilled - totalReceived;
  const refunded = invoices
    .filter((inv) => inv.status === "REFUNDED" || inv.status === "CANCELLED")
    .reduce((sum, inv) => sum + inv.finalAmount, 0);
  const collectionRate = totalBilled > 0 ? (totalReceived / totalBilled) * 100 : 0;

  return {
    totalBilled,
    totalCollected: totalReceived,
    collectionRate,
    outstanding,
    refunded,
    invoiceCount: invoices.length,
    paidCount: invoices.filter((inv) => inv.status === "PAID").length,
    pendingCount: invoices.filter((inv) => ["PENDING", "PARTIAL", "OVERDUE"].includes(inv.status)).length,
  };
}

export async function getStudentsForInvoice() {
  const staff = await requireDirector();

  return prisma.student.findMany({
    where: { academyId: staff.academyId, status: "ACTIVE" },
    select: { id: true, name: true, grade: true, phone: true },
    orderBy: { name: "asc" },
  });
}

export async function getClassesForBulkInvoice() {
  const staff = await requireDirector();

  return prisma.class.findMany({
    where: { academyId: staff.academyId, isActive: true },
    select: {
      id: true,
      name: true,
      fee: true,
      _count: { select: { enrollments: { where: { status: "ENROLLED" } } } },
    },
    orderBy: { name: "asc" },
  });
}
