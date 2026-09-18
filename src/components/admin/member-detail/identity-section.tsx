import { IdCard } from "lucide-react";
import { ProviderBadge } from "@/components/admin/provider-badge";
import { DefList, DefRow, SectionCard } from "@/components/admin/member-detail/atoms";
import type { MemberDetail } from "@/actions/admin-members";
// 날짜 표시는 KST 고정 — 서버(Vercel)는 UTC 라 timeZone 없는 toLocale* 는 가입일·최근
// 로그인을 하루 이르게 찍는다(로컬은 KST 라 드러나지 않는다). 회원 상세의 다른 구역
// (member-block)과 같은 포매터를 써야 한 화면 안에서 표기가 갈리지 않는다. 스펙 I1·F14.
import { formatKstDate, formatKstDateTime } from "@/lib/admin-kst-format";

const formatDate = formatKstDate;
const formatDateTime = formatKstDateTime;

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
