import { adminGetHelpPosts } from "@/actions/admin-help-center";
import { AdminHelpBoardClient } from "@/components/admin/help/admin-help-board-client";
import { PageHeader } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const posts = await adminGetHelpPosts({ board: "FEEDBACK", status, page: 1 });
  return (
    <div className="space-y-6">
      <PageHeader
        title="피드백"
        description="원장들이 남긴 개선 의견에 답변하고 반영 상태를 관리합니다"
      />
      <AdminHelpBoardClient board="FEEDBACK" initialData={posts} initialStatus={status} />
    </div>
  );
}
