"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { generateStudentCode } from "@/lib/utils";
import { requireAuth } from "./_helpers";
import type { ActionResult, CreateStudentData } from "./types";

/** Create student with auto-generated code and optional parent */
export async function createStudent(
  academyId: string,
  data: CreateStudentData
): Promise<ActionResult & { studentId?: string }> {
  try {
    const staff = await requireAuth();
    // Allow passing "__CURRENT__" to use the session's academyId
    if (academyId === "__CURRENT__") {
      academyId = staff.academyId;
    }

    // Generate unique student code
    let code = generateStudentCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.student.findUnique({
        where: { studentCode: code },
      });
      if (!existing) break;
      code = generateStudentCode();
      attempts++;
    }

    const student = await prisma.student.create({
      data: {
        academyId,
        name: data.name,
        studentCode: code,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        gender: data.gender || null,
        phone: data.phone || null,
        schoolId: data.schoolId || null,
        grade: data.grade,
        memo: data.memo || null,
        status: "ACTIVE",
      },
    });

    // Create parent if parent info provided
    if (data.parentName && data.parentPhone) {
      const parent = await prisma.parent.create({
        data: {
          academyId,
          name: data.parentName,
          phone: data.parentPhone,
          relation: data.parentRelation || null,
          emergencyContact: data.emergencyContact || null,
        },
      });

      await prisma.parentStudent.create({
        data: {
          parentId: parent.id,
          studentId: student.id,
        },
      });
    }

    revalidatePath("/director/students");
    return { success: true, studentId: student.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "학생 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/** Update student info */
export async function updateStudent(
  studentId: string,
  data: Partial<CreateStudentData>
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.student.update({
      where: { id: studentId },
      data: {
        name: data.name,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        gender: data.gender,
        phone: data.phone,
        schoolId: data.schoolId || null,
        grade: data.grade,
        memo: data.memo,
      },
    });

    // Update parent if provided
    if (data.parentName || data.parentPhone) {
      const existingLink = await prisma.parentStudent.findFirst({
        where: { studentId },
        include: { parent: true },
      });

      if (existingLink) {
        await prisma.parent.update({
          where: { id: existingLink.parentId },
          data: {
            name: data.parentName || existingLink.parent.name,
            phone: data.parentPhone || existingLink.parent.phone,
            relation: data.parentRelation ?? existingLink.parent.relation,
            emergencyContact: data.emergencyContact ?? existingLink.parent.emergencyContact,
          },
        });
      } else if (data.parentName && data.parentPhone) {
        const student = await prisma.student.findUnique({
          where: { id: studentId },
          select: { academyId: true },
        });
        if (student) {
          const parent = await prisma.parent.create({
            data: {
              academyId: student.academyId,
              name: data.parentName,
              phone: data.parentPhone,
              relation: data.parentRelation || null,
              emergencyContact: data.emergencyContact || null,
            },
          });
          await prisma.parentStudent.create({
            data: { parentId: parent.id, studentId },
          });
        }
      }
    }

    revalidatePath("/director/students");
    revalidatePath(`/director/students/${studentId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "학생 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/** Change student status */
export async function updateStudentStatus(
  studentId: string,
  status: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    const updateData: Record<string, unknown> = { status };

    if (status === "WITHDRAWN") {
      updateData.withdrawDate = new Date();
    } else if (status === "PAUSED") {
      updateData.pauseDate = new Date();
    } else if (status === "ACTIVE") {
      updateData.withdrawDate = null;
      updateData.pauseDate = null;
    }

    await prisma.student.update({
      where: { id: studentId },
      data: updateData,
    });

    revalidatePath("/director/students");
    revalidatePath(`/director/students/${studentId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "상태 변경 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/** Assign student to a class */
export async function assignStudentToClass(
  studentId: string,
  classId: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.classEnrollment.upsert({
      where: {
        classId_studentId: { classId, studentId },
      },
      update: {
        status: "ENROLLED",
        droppedAt: null,
      },
      create: {
        classId,
        studentId,
        status: "ENROLLED",
      },
    });

    revalidatePath("/director/students");
    revalidatePath(`/director/students/${studentId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "반 배정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/** Soft delete student (set WITHDRAWN status) */
export async function deleteStudent(studentId: string): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.student.update({
      where: { id: studentId },
      data: {
        status: "WITHDRAWN",
        withdrawDate: new Date(),
      },
    });

    revalidatePath("/director/students");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "학생 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/** Bulk update student status */
export async function bulkUpdateStudentStatus(
  studentIds: string[],
  status: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    const updateData: Record<string, unknown> = { status };
    if (status === "WITHDRAWN") updateData.withdrawDate = new Date();
    if (status === "PAUSED") updateData.pauseDate = new Date();

    await prisma.student.updateMany({
      where: { id: { in: studentIds } },
      data: updateData,
    });

    revalidatePath("/director/students");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "일괄 상태 변경 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}
