import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";

interface Props {
  params: Promise<{ academyId: string }>;
}

/**
 * 학원 상세는 회원 상세로 통합됐다. 예전 링크(알림·북마크)는 그 학원 원장의
 * 회원 상세로 보낸다. 원장이 없으면 목록으로.
 */
export default async function AdminAcademyDetailRedirect({ params }: Props) {
  await requireAdminAuth();
  const { academyId } = await params;
  const director = await prisma.staff.findFirst({
    where: { academyId, role: "DIRECTOR" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  redirect(director ? `/admin/members/${director.id}` : "/admin/members");
}
