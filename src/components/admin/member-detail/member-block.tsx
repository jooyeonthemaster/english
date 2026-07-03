import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ProviderBadge } from "@/components/admin/provider-badge";
import { Avatar, DefList, DefRow } from "@/components/admin/member-detail/atoms";
import { OutreachCard } from "@/components/admin/member-detail/outreach-card";
import type { MemberDetail } from "@/actions/admin-members";

type StaffItem = MemberDetail["academyStaff"][number];

const ROLE_LABEL: Record<string, string> = {
  DIRECTOR: "원장",
  TEACHER: "강사",
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 회원(원장·강사) 한 명 단위 블록 — 회원 정보 + 맞춤 문자 생성을 하나로 묶는다. */
export function MemberBlock({
  staff,
  academyName,
  consumptionByOp,
  dailyConsumption,
  isCurrent,
}: {
  staff: StaffItem;
  academyName: string;
  consumptionByOp: { operationType: string | null; count: number }[];
  dailyConsumption: { total: number }[];
  isCurrent: boolean;
}) {
  return (
    <div
      id={`member-${staff.id}`}
      className={cn(
        "scroll-mt-24 rounded-2xl border bg-white overflow-hidden",
        isCurrent ? "border-blue-200" : "border-gray-100",
      )}
    >
      {/* 블록 헤더 — 회원 요약 */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 bg-gray-50/40">
        <Avatar name={staff.name} avatarUrl={staff.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-semibold text-gray-900 truncate">
              {staff.name}
            </span>
            <Badge
              variant="secondary"
              className={cn(
                "border-0 text-[10px] px-1.5 h-4 font-medium shrink-0",
                staff.role === "DIRECTOR"
                  ? "bg-blue-50 text-blue-600"
                  : "bg-gray-100 text-gray-500",
              )}
            >
              {ROLE_LABEL[staff.role] ?? staff.role}
            </Badge>
            {isCurrent && (
              <span className="text-[10px] font-medium text-blue-600 shrink-0">
                현재 보기
              </span>
            )}
            {!staff.isActive && (
              <span className="text-[10px] text-gray-400 shrink-0">비활성</span>
            )}
          </div>
          <span className="block text-[11px] text-gray-400 truncate">
            {staff.email}
          </span>
        </div>
        <ProviderBadge provider={staff.authProvider} size="sm" showLabel />
      </div>

      {/* 본문 — 회원 정보 + 맞춤 문자 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 lg:divide-x divide-gray-50">
        <div className="lg:col-span-1 p-5">
          <h4 className="text-[12px] font-semibold text-gray-500 mb-2.5">
            회원 정보
          </h4>
          <DefList>
            <DefRow label="전화번호" value={staff.phone ?? "—"} />
            <DefRow
              label="가입 경로"
              value={<ProviderBadge provider={staff.authProvider} size="sm" showLabel />}
            />
            <DefRow
              label="가입일"
              value={<span className="tabular-nums">{formatDate(staff.createdAt)}</span>}
            />
            <DefRow
              label="최근 로그인"
              value={
                staff.lastLoginAt ? (
                  <span className="tabular-nums">{formatDateTime(staff.lastLoginAt)}</span>
                ) : (
                  <span className="text-gray-300">로그인 없음</span>
                )
              }
            />
            {staff.kakaoId && (
              <DefRow
                label="Kakao ID"
                value={
                  <span className="font-mono text-[11px] text-gray-500">
                    {staff.kakaoId}
                  </span>
                }
              />
            )}
            {staff.supabaseUserId && (
              <DefRow
                label="Supabase UID"
                value={
                  <span
                    className="font-mono text-[11px] text-gray-500 truncate inline-block max-w-[150px] align-middle"
                    title={staff.supabaseUserId}
                  >
                    {staff.supabaseUserId}
                  </span>
                }
              />
            )}
          </DefList>
        </div>

        <div className="lg:col-span-2">
          <OutreachCard
            teacherName={staff.name}
            academyName={academyName}
            phone={staff.phone}
            lastActiveAt={staff.lastLoginAt}
            consumptionByOp={consumptionByOp}
            dailyConsumption={dailyConsumption}
          />
        </div>
      </div>
    </div>
  );
}
