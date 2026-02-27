"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ActionResult {
  success: boolean;
  error?: string;
}

interface PromptData {
  schoolId: string;
  passageId?: string;
  content: string;
  promptType: string;
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function requireAuth() {
  const session = await auth();
  if (!session?.user) throw new Error("인증이 필요합니다.");
  return session;
}

// ---------------------------------------------------------------------------
// TeacherPrompt CRUD
// ---------------------------------------------------------------------------

export async function getPrompts(schoolId: string) {
  await requireAuth();

  const prompts = await prisma.teacherPrompt.findMany({
    where: { schoolId },
    include: {
      passage: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return prompts;
}

export async function createPrompt(data: PromptData): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.teacherPrompt.create({
      data: {
        schoolId: data.schoolId,
        passageId: data.passageId || null,
        content: data.content,
        promptType: data.promptType,
        isActive: data.isActive ?? true,
      },
    });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "프롬프트 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updatePrompt(
  id: string,
  data: Partial<PromptData>
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.teacherPrompt.update({
      where: { id },
      data: {
        passageId: data.passageId !== undefined ? data.passageId || null : undefined,
        content: data.content,
        promptType: data.promptType,
        isActive: data.isActive,
      },
    });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "프롬프트 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deletePrompt(id: string): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.teacherPrompt.delete({ where: { id } });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "프롬프트 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}
