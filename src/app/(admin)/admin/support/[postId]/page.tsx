import { AdminHelpDetailClient } from "@/components/admin/help/admin-help-detail-client";

export const dynamic = "force-dynamic";

export default async function AdminSupportDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return <AdminHelpDetailClient board="SUPPORT" postId={postId} />;
}
