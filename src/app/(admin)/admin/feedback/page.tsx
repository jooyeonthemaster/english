import { adminGetHelpPosts } from "@/actions/admin-help-center";
import { AdminHelpBoardClient } from "@/components/admin/help/admin-help-board-client";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const posts = await adminGetHelpPosts({ board: "FEEDBACK", page: 1 });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">피드백 관리</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          원장들이 남긴 개선 의견에 답변하고 반영 상태를 관리합니다
        </p>
      </div>
      <AdminHelpBoardClient board="FEEDBACK" initialData={posts} />
    </div>
  );
}
