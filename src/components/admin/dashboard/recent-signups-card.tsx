import Link from "next/link";
import { UserPlus } from "lucide-react";
import { formatNumber, formatRelativeTime } from "@/lib/utils";
import type { RecentSignupAcademy } from "@/actions/admin/dashboard";

/**
 * 대시보드 「최근 가입 학원(7일)」 — 구 「체험 종료 임박」 자리(analytics-spec §9.2 F9·D5).
 * 원장이 있으면 회원 상세(`/admin/members/[staffId]`), 없으면 학원 상세로 보낸다.
 */
export function RecentSignupsCard({
  items,
  total,
}: {
  items: RecentSignupAcademy[];
  total: number;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-50">
        <UserPlus className="size-4 text-blue-500" strokeWidth={1.9} />
        <h3 className="text-[13px] font-semibold text-gray-800">
          최근 가입 학원 (7일)
        </h3>
        <span className="ml-auto text-[11px] text-gray-400 tabular-nums">
          {formatNumber(total)}곳
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-6 text-center text-[12.5px] text-gray-400">
          최근 7일 가입 학원이 없습니다
        </p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {items.map((a) => (
            <li key={a.academyId}>
              <Link
                href={
                  a.directorStaffId
                    ? `/admin/members/${a.directorStaffId}`
                    : `/admin/academies/${a.academyId}`
                }
                className="flex items-center justify-between gap-2 px-5 py-2.5 hover:bg-gray-50/60"
              >
                <span className="min-w-0 truncate text-[13px] text-gray-700">
                  {a.name}
                </span>
                <span className="shrink-0 text-[12px] text-gray-400 tabular-nums">
                  {formatRelativeTime(a.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > items.length && (
        <div className="border-t border-gray-50 px-5 py-2 text-right">
          <Link
            href="/admin/members"
            className="text-[11.5px] text-blue-600 hover:underline"
          >
            외 {formatNumber(total - items.length)}곳 · 회원 목록
          </Link>
        </div>
      )}
    </div>
  );
}
