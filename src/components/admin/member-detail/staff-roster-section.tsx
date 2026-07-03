import Link from "next/link";
import { Users, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, SectionCard } from "@/components/admin/member-detail/atoms";
import { ProviderBadge } from "@/components/admin/provider-badge";
import type { MemberDetail } from "@/actions/admin-members";

type StaffItem = MemberDetail["academyStaff"][number];

const ROLE_LABEL: Record<string, string> = {
  DIRECTOR: "원장",
  TEACHER: "강사",
};

/**
 * 학원 상세의 "소속 회원" 섹션. 학원에 속한 원장·강사 로스터.
 * 현재 보고 있는 회원은 강조하고, 다른 원장은 그 회원 관점의 상세로 이동.
 * (상세는 원장 전용이라 강사 행은 링크 없이 정보만 표시)
 */
export function StaffRosterSection({
  staff,
  currentMemberId,
}: {
  staff: StaffItem[];
  currentMemberId: string;
}) {
  return (
    <SectionCard
      title={`소속 회원 ${staff.length}명`}
      icon={<Users />}
    >
      <ul className="divide-y divide-gray-50 -mx-1">
        {staff.map((s) => {
          const isCurrent = s.id === currentMemberId;
          const isDirector = s.role === "DIRECTOR";
          const inner = (
            <div
              className={cn(
                "flex items-center gap-2.5 px-1 py-2 rounded-md",
                isCurrent && "bg-blue-50/60",
                !isCurrent && isDirector && "hover:bg-gray-50",
              )}
            >
              <Avatar name={s.name} avatarUrl={s.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-medium text-gray-900 truncate">
                    {s.name}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "border-0 text-[10px] px-1.5 h-4 font-medium shrink-0",
                      isDirector
                        ? "bg-blue-50 text-blue-600"
                        : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {ROLE_LABEL[s.role] ?? s.role}
                  </Badge>
                  {!s.isActive && (
                    <span className="text-[10px] text-gray-400 shrink-0">비활성</span>
                  )}
                  {isCurrent && (
                    <span className="text-[10px] font-medium text-blue-600 shrink-0">
                      현재 보기
                    </span>
                  )}
                </div>
                <span className="block text-[11px] text-gray-400 truncate">
                  {s.email}
                </span>
              </div>
              <ProviderBadge provider={s.authProvider} size="sm" />
              {isDirector && !isCurrent && (
                <ChevronRight
                  className="size-4 text-gray-300 shrink-0"
                  strokeWidth={2}
                  aria-hidden
                />
              )}
            </div>
          );

          return (
            <li key={s.id} id={`member-${s.id}`} className="scroll-mt-24">
              {isDirector && !isCurrent ? (
                <Link
                  href={`/admin/members/${s.id}`}
                  className="block outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 rounded-md"
                >
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 px-1 text-[11px] text-gray-400">
        크레딧·구입·콘텐츠는 학원 단위로 공유됩니다.
      </p>
    </SectionCard>
  );
}
