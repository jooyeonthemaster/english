"use server";

import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getCustomPrompts(promptType: string = "QUESTION_GENERATION") {
  const staff = await getStaffSession();
  if (!staff) return [];

  const prompts = await prisma.teacherPrompt.findMany({
    where: {
      academyId: staff.academyId,
      promptType,
      isActive: true,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      content: true,
      promptType: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return prompts;
}

export async function createCustomPrompt(data: {
  name: string;
  content: string;
  promptType?: string;
}) {
  const staff = await getStaffSession();
  if (!staff) return { error: "인증 필요" };

  const prompt = await prisma.teacherPrompt.create({
    data: {
      academyId: staff.academyId,
      staffId: staff.id,
      name: data.name,
      content: data.content,
      promptType: data.promptType || "QUESTION_GENERATION",
    },
  });

  revalidatePath("/director/workbench");
  return { success: true, prompt };
}

export async function updateCustomPrompt(id: string, data: {
  name?: string;
  content?: string;
}) {
  const staff = await getStaffSession();
  if (!staff) return { error: "인증 필요" };

  await prisma.teacherPrompt.updateMany({
    where: { id, academyId: staff.academyId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.content !== undefined && { content: data.content }),
      updatedAt: new Date(),
    },
  });

  revalidatePath("/director/workbench");
  return { success: true };
}

export async function deleteCustomPrompt(id: string) {
  const staff = await getStaffSession();
  if (!staff) return { error: "인증 필요" };

  await prisma.teacherPrompt.updateMany({
    where: { id, academyId: staff.academyId },
    data: { isActive: false },
  });

  revalidatePath("/director/workbench");
  return { success: true };
}
