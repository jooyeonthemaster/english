import { AdminHelpDetailClient } from "@/components/admin/help/admin-help-detail-client";

export const dynamic = "force-dynamic";

export default async function AdminSupportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ postId: string }>;
  /** 목록에서 넘어온 상태 필터 — "목록" 으로 돌아갈 때 복원한다. */
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ postId }, { status }] = await Promise.all([params, searchParams]);
  return <AdminHelpDetailClient board="SUPPORT" postId={postId} listStatus={status} />;
}
