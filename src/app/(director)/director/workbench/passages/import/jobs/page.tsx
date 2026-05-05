import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getStaffSession } from "@/lib/auth";
import { RecentExtractionJobs } from "../_components/recent-extraction-jobs";

export const dynamic = "force-dynamic";

export default async function ExtractionJobsPage() {
  const staff = await getStaffSession();
  if (!staff) {
    redirect("/login?callbackUrl=/director/workbench/passages/import/jobs");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            href="/director/workbench/passages/import"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 transition-colors hover:text-sky-700"
          >
            <ArrowLeft className="size-3.5" />
            시험지 일괄 등록으로 돌아가기
          </Link>
          <h1 className="mt-2 text-[20px] font-bold tracking-tight text-slate-900">
            추출 작업 전체 목록
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            최근 추출 작업을 다시 열거나, 저장하지 않을 임시 작업을 정리합니다.
          </p>
        </div>
      </div>

      <RecentExtractionJobs
        maxItems={0}
        fetchLimit={200}
        filter="all"
        showViewAll={false}
        showEmptyState
        className="mx-0 mt-0"
        title="최근 추출 작업"
        description="처리 중, 검토 대기, 실패, 저장 완료 작업을 함께 표시합니다."
      />
    </div>
  );
}
