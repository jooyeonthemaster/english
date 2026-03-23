"use server";

import { prisma } from "@/lib/prisma";
import { loginStudent, logoutStudent } from "@/lib/auth-student";

interface LoginResult {
  success: boolean;
  error?: string;
  schoolSlug?: string;
}

export async function loginStudentAction(
  formData: FormData
): Promise<LoginResult> {
  const schoolSlug = formData.get("schoolSlug") as string | null;
  const studentCode = formData.get("studentCode") as string | null;

  if (!schoolSlug || !schoolSlug.trim()) {
    return { success: false, error: "학교를 선택해주세요." };
  }

  if (!studentCode || !studentCode.trim()) {
    return { success: false, error: "학생 코드를 입력해주세요." };
  }

  try {
    // Look up school by slug (School.slug is not unique alone — use findFirst)
    const school = await prisma.school.findFirst({
      where: { slug: schoolSlug.trim() },
    });

    if (!school) {
      return { success: false, error: "존재하지 않는 학교입니다." };
    }

    const session = await loginStudent(school.academyId, studentCode.trim());
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "로그인 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function logoutStudentAction(): Promise<void> {
  await logoutStudent();
}
