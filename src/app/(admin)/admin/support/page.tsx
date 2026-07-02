import { adminGetHelpPosts } from "@/actions/admin-help-center";
import { AdminHelpBoardClient } from "@/components/admin/help/admin-help-board-client";

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
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">문의 게시판 관리</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          결제·이용 문의를 접수하고 1:1로 답변합니다
        </p>
      </div>
      <AdminHelpBoardClient
        board="SUPPORT"
        initialData={posts}
        initialStatus={status}
      />
    </div>
  );
}
