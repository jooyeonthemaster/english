"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { consultationSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";

export async function getConsultations(filters?: {
  type?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}) {
  const staff = await requireStaffAuth();

  const where: Record<string, unknown> = {
    academyId: staff.academyId,
  };

  if (filters?.type && filters.type !== "ALL") {
    where.type = filters.type;
  }

  if (filters?.status && filters.status !== "ALL") {
    where.status = filters.status;
  }

  if (filters?.startDate || filters?.endDate) {
    where.date = {};
    if (filters.startDate) {
      (where.date as Record<string, unknown>).gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      (where.date as Record<string, unknown>).lte = new Date(filters.endDate);
    }
  }

  const consultations = await prisma.consultation.findMany({
    where,
    include: {
      student: { select: { id: true, name: true, grade: true } },
      staff: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });

  return consultations;
}

export async function getConsultation(id: string) {
  await requireStaffAuth();

  const consultation = await prisma.consultation.findUnique({
    where: { id },
    include: {
      student: {
        select: { id: true, name: true, grade: true, phone: true },
      },
      staff: { select: { id: true, name: true } },
    },
  });

  return consultation;
}

export async function createConsultation(data: FormData) {
  const staff = await requireStaffAuth();

  const raw = {
    type: data.get("type") as string,
    studentId: (data.get("studentId") as string) || undefined,
    staffId: (data.get("staffId") as string) || staff.id,
    date: data.get("date") as string,
    channel: (data.get("channel") as string) || undefined,
    status: (data.get("status") as string) || "SCHEDULED",
    content: (data.get("content") as string) || undefined,
    category: (data.get("category") as string) || undefined,
    followUpDate: (data.get("followUpDate") as string) || undefined,
    followUpNote: (data.get("followUpNote") as string) || undefined,
  };

  const validated = consultationSchema.parse(raw);

  const consultation = await prisma.consultation.create({
    data: {
      academyId: staff.academyId,
      type: validated.type,
      studentId: validated.studentId || null,
      staffId: validated.staffId || staff.id,
      date: new Date(validated.date),
      channel: validated.channel || null,
      status: validated.status,
      content: validated.content || null,
      category: validated.category || null,
      followUpDate: validated.followUpDate
        ? new Date(validated.followUpDate)
        : null,
      followUpNote: validated.followUpNote || null,
    },
  });

  revalidatePath("/director/consultations");
  return { success: true, id: consultation.id };
}

export async function updateConsultation(id: string, data: FormData) {
  await requireStaffAuth();

  const raw = {
    type: data.get("type") as string,
    studentId: (data.get("studentId") as string) || undefined,
    staffId: (data.get("staffId") as string) || undefined,
    date: data.get("date") as string,
    channel: (data.get("channel") as string) || undefined,
    status: (data.get("status") as string) || "SCHEDULED",
    content: (data.get("content") as string) || undefined,
    category: (data.get("category") as string) || undefined,
    followUpDate: (data.get("followUpDate") as string) || undefined,
    followUpNote: (data.get("followUpNote") as string) || undefined,
  };

  const validated = consultationSchema.parse(raw);

  await prisma.consultation.update({
    where: { id },
    data: {
      type: validated.type,
      studentId: validated.studentId || null,
      staffId: validated.staffId || null,
      date: new Date(validated.date),
      channel: validated.channel || null,
      status: validated.status,
      content: validated.content || null,
      category: validated.category || null,
      followUpDate: validated.followUpDate
        ? new Date(validated.followUpDate)
        : null,
      followUpNote: validated.followUpNote || null,
    },
  });

  revalidatePath("/director/consultations");
  return { success: true };
}

export async function deleteConsultation(id: string) {
  await requireStaffAuth("DIRECTOR");

  await prisma.consultation.delete({
    where: { id },
  });

  revalidatePath("/director/consultations");
  return { success: true };
}

export async function getStudentConsultations(studentId: string) {
  await requireStaffAuth();

  const consultations = await prisma.consultation.findMany({
    where: { studentId },
    include: {
      staff: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });

  return consultations;
}

export async function getUpcomingFollowUps() {
  const staff = await requireStaffAuth();

  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const followUps = await prisma.consultation.findMany({
    where: {
      academyId: staff.academyId,
      status: "FOLLOW_UP",
      followUpDate: {
        gte: now,
        lte: nextWeek,
      },
    },
    include: {
      student: { select: { id: true, name: true } },
      staff: { select: { id: true, name: true } },
    },
    orderBy: { followUpDate: "asc" },
  });

  return followUps;
}

// Helper: get staff list for dropdown
export async function getStaffList() {
  const staff = await requireStaffAuth();

  const staffList = await prisma.staff.findMany({
    where: { academyId: staff.academyId, isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  return staffList;
}

// Helper: search students
export async function searchStudents(query: string) {
  const staff = await requireStaffAuth();

  if (!query || query.length < 1) return [];

  const students = await prisma.student.findMany({
    where: {
      academyId: staff.academyId,
      status: "ACTIVE",
      name: { contains: query, mode: "insensitive" },
    },
    select: { id: true, name: true, grade: true },
    take: 10,
    orderBy: { name: "asc" },
  });

  return students;
}

// Helper: get classes for notice targeting
export async function getClassList() {
  const staff = await requireStaffAuth();

  const classes = await prisma.class.findMany({
    where: { academyId: staff.academyId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return classes;
}
