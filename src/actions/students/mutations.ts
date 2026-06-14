"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateStudentCode } from "@/lib/utils";
import {
  createStudentCodeLookupHmac,
  hashStudentCode,
} from "@/lib/tutor/crypto";
import { requireAuth } from "./_helpers";
import type { ActionResult, CreateStudentData } from "./types";

/** Valid student.status values (enforced server-side). */
const STUDENT_STATUS_VALUES = ["ACTIVE", "PAUSED", "WAITING", "WITHDRAWN"] as const;
type StudentStatus = (typeof STUDENT_STATUS_VALUES)[number];
function isStudentStatus(value: string): value is StudentStatus {
  return (STUDENT_STATUS_VALUES as readonly string[]).includes(value);
}

/** Apply status-driven date side effects (withdraw/pause/active reset). */
function statusDateFields(status: StudentStatus): Record<string, unknown> {
  if (status === "WITHDRAWN") return { withdrawDate: new Date() };
  if (status === "PAUSED") return { pauseDate: new Date() };
  if (status === "ACTIVE") return { withdrawDate: null, pauseDate: null };
  return {};
}

/** Revalidate every surface that renders a student list/row. */
function revalidateStudentSurfaces(studentId?: string) {
  revalidatePath("/director/tutor");
  revalidatePath("/director/students");
  if (studentId) revalidatePath(`/director/students/${studentId}`);
}

/**
 * Generate a student code unique within the academy and return it together
 * with its lookup HMAC + bcrypt hash so the tutor login (HMAC/hash path) works
 * immediately without relying on the legacy plaintext backfill.
 */
async function generateUniqueStudentCode(academyId: string) {
  let code = generateStudentCode();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await prisma.student.findFirst({
      where: { academyId, studentCode: code },
      select: { id: true },
    });
    if (!existing) break;
    code = generateStudentCode();
    attempts++;
  }
  const [lookupHmac, hash] = await Promise.all([
    Promise.resolve(createStudentCodeLookupHmac(academyId, code)),
    hashStudentCode(academyId, code),
  ]);
  return { code, lookupHmac, hash };
}

/** Create student with auto-generated code and optional parent */
export async function createStudent(
  academyId: string,
  data: CreateStudentData
): Promise<ActionResult & { studentId?: string; studentCode?: string }> {
  try {
    const staff = await requireAuth();
    // Allow passing "__CURRENT__" to use the session's academyId
    if (academyId === "__CURRENT__") {
      academyId = staff.academyId;
    }

    // Generate unique student code (+ lookup HMAC / hash for tutor login)
    const { code, lookupHmac, hash } = await generateUniqueStudentCode(academyId);

    const student = await prisma.student.create({
      data: {
        academyId,
        name: data.name,
        studentCode: code,
        studentCodeLookupHmac: lookupHmac,
        studentCodeHash: hash,
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

    revalidateStudentSurfaces();
    return { success: true, studentId: student.id, studentCode: code };
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
    const staff = await requireAuth();

    // Tenant guard — only touch a student in the caller's academy.
    const owned = await prisma.student.findFirst({
      where: { id: studentId, academyId: staff.academyId },
      select: { id: true, academyId: true },
    });
    if (!owned) return { success: false, error: "학생을 찾을 수 없습니다." };

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

    // Update the guardian only when BOTH name + phone are supplied — partial
    // input must not clobber the other field with a stale fallback. Target the
    // most recently created link for determinism.
    if (data.parentName && data.parentPhone) {
      const existingLink = await prisma.parentStudent.findFirst({
        where: { studentId },
        orderBy: { parent: { createdAt: "desc" } },
        include: { parent: true },
      });

      if (existingLink) {
        await prisma.parent.update({
          where: { id: existingLink.parentId },
          data: {
            name: data.parentName,
            phone: data.parentPhone,
            relation: data.parentRelation ?? existingLink.parent.relation,
            emergencyContact:
              data.emergencyContact ?? existingLink.parent.emergencyContact,
          },
        });
      } else {
        const parent = await prisma.parent.create({
          data: {
            academyId: owned.academyId,
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

    revalidateStudentSurfaces(studentId);
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
    const staff = await requireAuth();
    if (!isStudentStatus(status)) {
      return { success: false, error: "유효한 상태를 선택하세요." };
    }

    const owned = await prisma.student.findFirst({
      where: { id: studentId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "학생을 찾을 수 없습니다." };

    await prisma.student.update({
      where: { id: studentId },
      data: { status, ...statusDateFields(status) },
    });

    revalidateStudentSurfaces(studentId);
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
    const staff = await requireAuth();

    // Both student and class must belong to the caller's academy.
    const [owned, cls] = await Promise.all([
      prisma.student.findFirst({
        where: { id: studentId, academyId: staff.academyId },
        select: { id: true },
      }),
      prisma.class.findFirst({
        where: { id: classId, academyId: staff.academyId },
        select: { id: true },
      }),
    ]);
    if (!owned || !cls) return { success: false, error: "학생 또는 반을 찾을 수 없습니다." };

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

    revalidateStudentSurfaces(studentId);
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
    const staff = await requireAuth();

    const owned = await prisma.student.findFirst({
      where: { id: studentId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "학생을 찾을 수 없습니다." };

    await prisma.student.update({
      where: { id: studentId },
      data: {
        status: "WITHDRAWN",
        withdrawDate: new Date(),
      },
    });

    revalidateStudentSurfaces(studentId);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "학생 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/** Bulk update student status (scoped to the caller's academy). */
export async function bulkUpdateStudentStatus(
  studentIds: string[],
  status: string
): Promise<ActionResult> {
  try {
    const staff = await requireAuth();
    if (!isStudentStatus(status)) {
      return { success: false, error: "유효한 상태를 선택하세요." };
    }

    await prisma.student.updateMany({
      where: { id: { in: studentIds }, academyId: staff.academyId },
      data: { status, ...statusDateFields(status) },
    });

    revalidateStudentSurfaces();
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "일괄 상태 변경 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/**
 * Set a student's full class membership in one shot (multi-class).
 * Currently-enrolled classes not in `classIds` are DROPPED; classes in
 * `classIds` are ENROLLED (or WAITLISTED when the class is already full).
 * Returns the names of any classes the student was waitlisted into.
 */
export async function updateStudentClassAssignments(
  studentId: string,
  classIds: string[]
): Promise<ActionResult & { waitlisted?: string[] }> {
  try {
    const staff = await requireAuth();

    const student = await prisma.student.findFirst({
      where: { id: studentId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!student) return { success: false, error: "학생을 찾을 수 없습니다." };

    const uniqueIds = Array.from(new Set(classIds));
    const targetClasses = uniqueIds.length
      ? await prisma.class.findMany({
          where: { id: { in: uniqueIds }, academyId: staff.academyId },
          select: {
            id: true,
            name: true,
            capacity: true,
            _count: { select: { enrollments: { where: { status: "ENROLLED" } } } },
          },
        })
      : [];
    const targetIds = new Set(targetClasses.map((c) => c.id));

    const current = await prisma.classEnrollment.findMany({
      where: { studentId, status: { in: ["ENROLLED", "WAITLISTED"] } },
      select: { classId: true, status: true },
    });
    const currentStatusByClass = new Map(current.map((e) => [e.classId, e.status]));

    const waitlisted: string[] = [];

    await prisma.$transaction(async (tx) => {
      const toRemove = current
        .filter((e) => !targetIds.has(e.classId))
        .map((e) => e.classId);
      if (toRemove.length) {
        await tx.classEnrollment.updateMany({
          where: { studentId, classId: { in: toRemove } },
          data: { status: "DROPPED", droppedAt: new Date() },
        });
      }

      for (const cls of targetClasses) {
        const existing = currentStatusByClass.get(cls.id);
        let status: "ENROLLED" | "WAITLISTED";
        if (existing === "ENROLLED" || existing === "WAITLISTED") {
          status = existing; // keep current membership, no churn
        } else if (cls._count.enrollments >= cls.capacity) {
          status = "WAITLISTED";
          waitlisted.push(cls.name);
        } else {
          status = "ENROLLED";
        }
        await tx.classEnrollment.upsert({
          where: { classId_studentId: { classId: cls.id, studentId } },
          update: { status, droppedAt: null },
          create: { classId: cls.id, studentId, status },
        });
      }
    });

    revalidateStudentSurfaces(studentId);
    return { success: true, waitlisted: waitlisted.length ? waitlisted : undefined };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "반 배정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/** Revoke (unregister) one of a student's logged-in devices. */
export async function revokeStudentDevice(
  studentId: string,
  sessionId: string
): Promise<ActionResult> {
  try {
    const staff = await requireAuth();
    const result = await prisma.tutorStudentSession.updateMany({
      where: { id: sessionId, studentId, academyId: staff.academyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "director-revoked" },
    });
    if (result.count === 0) {
      return { success: false, error: "해제할 기기를 찾을 수 없습니다." };
    }
    revalidateStudentSurfaces(studentId);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "기기 해제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/**
 * Re-issue a student's login code (director only). The old code is invalidated
 * immediately and ALL of the student's active devices are revoked, so the
 * student must log in again on each device with the new code.
 */
export async function reissueStudentCode(
  studentId: string
): Promise<ActionResult & { studentCode?: string }> {
  try {
    const staff = await requireAuth();
    if (staff.role !== "DIRECTOR") {
      return { success: false, error: "원장만 학생 코드를 재발급할 수 있습니다." };
    }

    const student = await prisma.student.findFirst({
      where: { id: studentId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!student) return { success: false, error: "학생을 찾을 수 없습니다." };

    const { code, lookupHmac, hash } = await generateUniqueStudentCode(staff.academyId);

    await prisma.$transaction([
      prisma.student.update({
        where: { id: studentId },
        data: {
          studentCode: code,
          studentCodeLookupHmac: lookupHmac,
          studentCodeHash: hash,
        },
      }),
      prisma.tutorStudentSession.updateMany({
        where: { studentId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "code-reissued" },
      }),
    ]);

    revalidateStudentSurfaces(studentId);
    return { success: true, studentCode: code };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "코드 재발급 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

const BULK_ROW_SCHEMA = z.object({
  name: z.string().trim().min(1).max(50),
  grade: z.number().int().min(1).max(3),
});
const MAX_BULK_ROWS = 200;

export interface BulkCreateResult extends ActionResult {
  created: number;
  codes: { name: string; code: string }[];
  errors: { name: string; reason: string }[];
}

/**
 * Bulk-create students (name + grade only) for the paste-import path.
 * Each row is validated and given a unique code; partial failures are reported
 * per row rather than aborting the whole batch.
 */
export async function bulkCreateStudents(
  academyId: string,
  rows: { name: string; grade: number }[]
): Promise<BulkCreateResult> {
  try {
    const staff = await requireAuth();
    if (academyId === "__CURRENT__") academyId = staff.academyId;
    if (academyId !== staff.academyId) {
      return { success: false, error: "권한이 없습니다.", created: 0, codes: [], errors: [] };
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, error: "등록할 학생이 없습니다.", created: 0, codes: [], errors: [] };
    }
    if (rows.length > MAX_BULK_ROWS) {
      return {
        success: false,
        error: `한 번에 최대 ${MAX_BULK_ROWS}명까지 등록할 수 있어요.`,
        created: 0,
        codes: [],
        errors: [],
      };
    }

    const codes: { name: string; code: string }[] = [];
    const errors: { name: string; reason: string }[] = [];

    // Sequential: generateUniqueStudentCode does an academy-scoped uniqueness
    // probe per row, so concurrent creates could otherwise collide on the code.
    for (const raw of rows) {
      const parsed = BULK_ROW_SCHEMA.safeParse(raw);
      if (!parsed.success) {
        errors.push({ name: String(raw?.name ?? ""), reason: "이름(1~50자)·학년(1~3) 확인" });
        continue;
      }
      try {
        const { code, lookupHmac, hash } = await generateUniqueStudentCode(academyId);
        await prisma.student.create({
          data: {
            academyId,
            name: parsed.data.name,
            grade: parsed.data.grade,
            studentCode: code,
            studentCodeLookupHmac: lookupHmac,
            studentCodeHash: hash,
            status: "ACTIVE",
          },
        });
        codes.push({ name: parsed.data.name, code });
      } catch {
        errors.push({ name: parsed.data.name, reason: "등록 실패" });
      }
    }

    revalidateStudentSurfaces();
    return {
      success: codes.length > 0,
      error: codes.length === 0 ? "등록된 학생이 없습니다." : undefined,
      created: codes.length,
      codes,
      errors,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "대량 등록 중 오류가 발생했습니다.";
    return { success: false, error: message, created: 0, codes: [], errors: [] };
  }
}
