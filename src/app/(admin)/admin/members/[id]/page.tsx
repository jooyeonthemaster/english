import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import {
  getMemberDetail,
  getMemberTransactions,
} from "@/actions/admin-members";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberDetailClient } from "@/components/admin/member-detail-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function MemberContent({ memberId }: { memberId: string }) {
  const result = await getMemberDetail(memberId);

  if (result.kind === "not_found") {
    notFound();
  }

  if (result.kind === "not_director") {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-12 flex flex-col items-center text-center">
        <div className="size-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
          <AlertCircle
            className="size-6 text-gray-400"
            strokeWidth={1.6}
            aria-hidden="true"
          />
        </div>
        <h2 className="text-[15px] font-semibold text-gray-800">
          원장 회원이 아닙니다
        </h2>
        <p className="text-[12px] text-gray-500 mt-1">
          이 사용자는 DIRECTOR 권한이 아니므로 회원 관리 화면에서 표시되지 않습니다.
        </p>
        <Link
          href="/admin/members"
          className="mt-4 inline-flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-700"
        >
          <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden />
          회원 목록으로
        </Link>
      </div>
    );
  }

  // result.kind === "ok"
  const member = result.member;

  // First page of transactions, server-fetched
  const txResult = await getMemberTransactions(memberId, { limit: 30 });
  const initialTransactions =
    txResult.kind === "ok"
      ? { items: txResult.items, nextCursor: txResult.nextCursor }
      : { items: [], nextCursor: null };

  return (
    <MemberDetailClient
      member={member}
      initialTransactions={initialTransactions}
    />
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-[400px] rounded-xl lg:col-span-1" />
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-[140px] rounded-xl" />
          <Skeleton className="h-[200px] rounded-xl" />
          <Skeleton className="h-[400px] rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default async function MemberDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[12px] text-gray-500">
        <Link
          href="/admin/members"
          className="inline-flex items-center gap-1 hover:text-gray-800 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 rounded px-1 -mx-1"
        >
          <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden />
          회원 목록
        </Link>
      </div>

      <Suspense fallback={<DetailSkeleton />}>
        <MemberContent memberId={id} />
      </Suspense>
    </div>
  );
}
