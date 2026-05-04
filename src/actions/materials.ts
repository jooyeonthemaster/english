"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { getStudentSession } from "@/lib/auth-student";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

export interface MaterialItem {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  className: string | null;
  uploaderName: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Supabase Storage client (server-side only)
// ---------------------------------------------------------------------------
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 환경 변수가 설정되지 않았습니다.");
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Admin: 자료 목록 조회
// ---------------------------------------------------------------------------
export async function getMaterials(
  academyId: string,
  classId?: string
): Promise<MaterialItem[]> {
  await requireStaffAuth();

  const where: Record<string, unknown> = { academyId };
  if (classId) where.classId = classId;

  const materials = await prisma.classMaterial.findMany({
    where,
    include: {
      class: { select: { name: true } },
      uploader: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return materials.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    fileUrl: m.fileUrl,
    fileName: m.fileName,
    fileType: m.fileType,
    fileSize: m.fileSize,
    className: m.class?.name ?? null,
    uploaderName: m.uploader.name,
    createdAt: m.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Admin: 자료 업로드
// ---------------------------------------------------------------------------
export async function uploadMaterial(
  formData: FormData
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string;
    const description = (formData.get("description") as string) || null;
    const classId = (formData.get("classId") as string) || null;
    const academyId = formData.get("academyId") as string;

    if (!file || !title || !academyId) {
      return { success: false, error: "필수 항목이 누락되었습니다." };
    }

    // 파일 크기 제한 (50MB)
    if (file.size > 50 * 1024 * 1024) {
      return { success: false, error: "파일 크기는 50MB 이하만 가능합니다." };
    }

    // 파일 타입 결정
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const fileType = getFileType(ext);

    // Supabase Storage 업로드
    const supabase = getSupabaseAdmin();
    const filePath = `${academyId}/${Date.now()}_${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("class-materials")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return { success: false, error: `업로드 실패: ${uploadError.message}` };
    }

    // Public URL 생성
    const {
      data: { publicUrl },
    } = supabase.storage.from("class-materials").getPublicUrl(filePath);

    // DB 레코드 생성
    const material = await prisma.classMaterial.create({
      data: {
        academyId,
        classId,
        title,
        description,
        fileUrl: publicUrl,
        fileName: file.name,
        fileType,
        fileSize: file.size,
        uploadedBy: staff.id,
      },
    });

    revalidatePath("/director/materials");
    return { success: true, id: material.id };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "자료 업로드 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Admin: 자료 삭제
// ---------------------------------------------------------------------------
export async function deleteMaterial(
  materialId: string
): Promise<ActionResult> {
  try {
    await requireStaffAuth();

    const material = await prisma.classMaterial.findUnique({
      where: { id: materialId },
    });
    if (!material) return { success: false, error: "자료를 찾을 수 없습니다." };

    // Supabase Storage에서 파일 삭제 (URL에서 path 추출)
    try {
      const supabase = getSupabaseAdmin();
      const url = new URL(material.fileUrl);
      const pathParts = url.pathname.split("/class-materials/");
      if (pathParts.length > 1) {
        await supabase.storage
          .from("class-materials")
          .remove([decodeURIComponent(pathParts[1])]);
      }
    } catch {
      // Storage 삭제 실패해도 DB 레코드는 삭제 진행
    }

    await prisma.classMaterial.delete({ where: { id: materialId } });

    revalidatePath("/director/materials");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "자료 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Student: 수업 자료 조회
// ---------------------------------------------------------------------------
export async function getStudentMaterials(): Promise<MaterialItem[]> {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");

  const student = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: {
      academyId: true,
      classEnrollments: {
        where: { status: "ENROLLED" },
        select: { classId: true },
      },
    },
  });

  if (!student) return [];
  const classIds = student.classEnrollments.map((e) => e.classId);

  // 본인 반 자료 + 전체 공개 자료 (classId = null)
  const materials = await prisma.classMaterial.findMany({
    where: {
      academyId: student.academyId,
      OR: [{ classId: { in: classIds } }, { classId: null }],
    },
    include: {
      class: { select: { name: true } },
      uploader: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return materials.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    fileUrl: m.fileUrl,
    fileName: m.fileName,
    fileType: m.fileType,
    fileSize: m.fileSize,
    className: m.class?.name ?? "전체",
    uploaderName: m.uploader.name,
    createdAt: m.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getFileType(ext: string): string {
  if (["pdf"].includes(ext)) return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext))
    return "image";
  if (["doc", "docx"].includes(ext)) return "docx";
  if (["mp4", "mov", "avi", "webm"].includes(ext)) return "video";
  if (["ppt", "pptx"].includes(ext)) return "pptx";
  if (["xls", "xlsx"].includes(ext)) return "xlsx";
  if (["hwp", "hwpx"].includes(ext)) return "hwp";
  return "other";
}
