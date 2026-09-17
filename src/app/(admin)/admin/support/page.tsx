import { adminGetHelpPosts } from "@/actions/admin-help-center";
import { AdminHelpBoardClient } from "@/components/admin/help/admin-help-board-client";
import { PageHeader } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const posts = await adminGetHelpPosts({ board: "SUPPORT", status, page: 1 });
  return (
    <div className="space-y-6">
      <PageHeader
        title="문의 게시판"
        description="결제·이용 문의를 접수하고 1:1로 답변합니다"
      />
      <AdminHelpBoardClient
        board="SUPPORT"
        initialData={posts}
        initialStatus={status}
      />
    </div>
  );
}
