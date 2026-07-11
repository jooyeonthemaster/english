"use server";

// ============================================================================
// 어법 드릴 — 원장/강사용 서버 액션: 배정 생성/취소
//
// 모든 액션은 requireStaffAuth 후 staff.academyId 로 테넌트 교차검증한다.
// 드릴 엔진(engine.ts)의 큐 편성·채점은 여기서 건드리지 않는다 — spec 저장만.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";

interface AssignmentSpecInput {
  unitIds?: string[];
  conceptIds?: string[];
  itemTypes?: string[];
  difficulties?: number[];
  count: number;
}

export async function createGrammarAssignment(input: {
  studentId: string;
  title: string;
  note?: string;
  spec: AssignmentSpecInput;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const staff = await requireStaffAuth();
    const student = await prisma.student.findFirst({
      where: { id: input.studentId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!student) return { success: false, error: "학생을 찾을 수 없습니다." };

    const title = input.title.trim();
    if (!title) return { success: false, error: "제목을 입력해 주십시오." };
    const count = Math.min(100, Math.max(1, Math.round(input.spec.count)));

    await prisma.grammarDrillAssignment.create({
      data: {
        academyId: staff.academyId,
        studentId: student.id,
        staffId: staff.id,
        title,
        note: input.note?.trim() || null,
        spec: {
          unitIds: input.spec.unitIds?.filter(Boolean) ?? [],
          conceptIds: input.spec.conceptIds?.filter(Boolean) ?? [],
          itemTypes: input.spec.itemTypes?.filter(Boolean) ?? [],
          difficulties: input.spec.difficulties?.filter(Boolean) ?? [],
          count,
        },
      },
    });
    revalidatePath(`/director/grammar-lab/${input.studentId}`);
    return { success: true };
  } catch (error) {
    console.error("[grammar-lab] createGrammarAssignment", error);
    return { success: false, error: "배정 생성에 실패했습니다." };
  }
}

export async function cancelGrammarAssignment(
  assignmentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const staff = await requireStaffAuth();
    const assignment = await prisma.grammarDrillAssignment.findFirst({
      where: { id: assignmentId, academyId: staff.academyId },
    });
    if (!assignment) return { success: false, error: "배정을 찾을 수 없습니다." };
    if (assignment.status === "DONE")
      return { success: false, error: "이미 완료된 배정입니다." };
    await prisma.grammarDrillAssignment.delete({ where: { id: assignment.id } });
    revalidatePath(`/director/grammar-lab/${assignment.studentId}`);
    return { success: true };
  } catch (error) {
    console.error("[grammar-lab] cancelGrammarAssignment", error);
    return { success: false, error: "배정 취소에 실패했습니다." };
  }
}
