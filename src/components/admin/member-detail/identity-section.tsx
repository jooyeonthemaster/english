import { IdCard } from "lucide-react";
import { ProviderBadge } from "@/components/admin/provider-badge";
import { DefList, DefRow, SectionCard } from "@/components/admin/member-detail/atoms";
import type { MemberDetail } from "@/actions/admin-members";

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function IdentitySection({ member }: { member: MemberDetail }) {
  return (
    <SectionCard title="회원 정보" icon={<IdCard />}>
      <DefList>
        <DefRow label="이름" value={member.name} />
        <DefRow label="이메일" value={member.email} />
        <DefRow label="전화번호" value={member.phone ?? "—"} />
        <DefRow
          label="가입 경로"
          value={
            <ProviderBadge
              provider={member.authProvider}
              size="sm"
              showLabel
            />
          }
        />
        <DefRow
          label="가입일"
          value={
            <span className="tabular-nums">{formatDate(member.createdAt)}</span>
          }
        />
        <DefRow
          label="최근 로그인"
          value={
            member.lastLoginAt ? (
              <span className="tabular-nums">
                {formatDateTime(member.lastLoginAt)}
              </span>
            ) : (
              <span className="text-gray-300">로그인 없음</span>
            )
          }
        />
        {member.kakaoId && (
          <DefRow
            label="Kakao ID"
            value={
              <span className="font-mono text-[11px] text-gray-500">
                {member.kakaoId}
              </span>
            }
          />
        )}
        {member.supabaseUserId && (
          <DefRow
            label="Supabase UID"
            value={
              <span
                className="font-mono text-[11px] text-gray-500 truncate inline-block max-w-[150px] align-middle"
                title={member.supabaseUserId}
              >
                {member.supabaseUserId}
              </span>
            }
          />
        )}
      </DefList>
    </SectionCard>
  );
}
