"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { ProviderBadge } from "@/components/admin/provider-badge";
import type { MemberListItem } from "@/actions/admin-members";
import { formatDate, formatRelative, getInitials, tierBadgeClass } from "./formatters";

const LOW_BALANCE_THRESHOLD = 50;

export function MemberRow({
  member,
  now,
}: {
  member: MemberListItem;
  now: number;
}) {
  const router = useRouter();
  const href = `/admin/members/${member.id}`;

  // Row-level click navigation: matches enterprise SaaS row affordance while
  // the first-cell <Link> remains the keyboard/SR entry point. Guards against
  // hijacking when the user is selecting text or clicking on an inner link.
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("a, button")) return;
      if (window.getSelection()?.toString()) return;
      router.push(href);
    },
    [router, href],
  );

  return (
    <TableRow
      onClick={handleRowClick}
      className="group hover:bg-gray-50/60 border-b border-gray-50/60 last:border-0 cursor-pointer"
    >
      <TableCell className="py-3 pl-5">
        <Link
          href={href}
          className="flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-md -m-1 p-1"
        >
          <Avatar name={member.name} avatarUrl={member.avatarUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[13px] font-medium text-gray-900 truncate">
                {member.name}
              </span>
              {!member.isActive && (
                <Badge
                  variant="secondary"
                  className="bg-gray-100 text-gray-500 border-0 text-[11px] px-1.5 h-4 font-medium shrink-0"
                >
                  비활성
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-gray-400 truncate">
              {member.email}
            </div>
          </div>
        </Link>
      </TableCell>
      <TableCell>
        <ProviderBadge provider={member.authProvider} size="sm" />
      </TableCell>
      <TableCell>
        <div className="min-w-0">
          <div className="text-[12px] text-gray-700 truncate">
            {member.academy.name}
          </div>
          <div className="text-[11px] text-gray-400 truncate">
            /{member.academy.slug}
          </div>
        </div>
      </TableCell>
      <TableCell>
        {member.subscription ? (
          <Badge
            variant="secondary"
            className={cn(
              "text-[11px] font-medium border-0 px-2",
              tierBadgeClass(member.subscription.planTier),
            )}
          >
            {member.subscription.planName}
          </Badge>
        ) : (
          <span className="text-[11px] text-gray-300">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <BalanceCell balance={member.creditBalance?.balance ?? null} />
      </TableCell>
      <TableCell className="text-[12px] text-gray-600 tabular-nums">
        {formatDate(member.createdAt)}
      </TableCell>
      <TableCell className="text-[12px] text-gray-600 tabular-nums">
        {member.lastLoginAt ? (
          <span title={formatDate(member.lastLoginAt)}>
            {formatRelative(member.lastLoginAt, now)}
          </span>
        ) : (
          <span className="text-gray-300">로그인 없음</span>
        )}
      </TableCell>
      <TableCell className="pr-5 text-right">
        <ChevronRight
          className="size-4 text-gray-300 group-hover:text-gray-500 transition-colors inline-block"
          strokeWidth={2}
          aria-hidden="true"
        />
      </TableCell>
    </TableRow>
  );
}

function Avatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null | undefined;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="size-9 rounded-full object-cover bg-gray-100 shrink-0"
      />
    );
  }
  return (
    <div
      className="size-9 rounded-full bg-blue-50 text-blue-700 text-[13px] font-semibold flex items-center justify-center shrink-0"
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}

function BalanceCell({ balance }: { balance: number | null }) {
  if (balance === null) {
    return <span className="text-[11px] text-gray-300">미생성</span>;
  }
  const isLow = balance < LOW_BALANCE_THRESHOLD;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 tabular-nums",
        isLow ? "text-rose-600" : "text-gray-800",
      )}
      title={isLow ? "잔고가 낮습니다" : undefined}
    >
      {isLow && (
        <AlertTriangle
          className="size-3 text-rose-500 shrink-0"
          strokeWidth={2}
          aria-hidden="true"
        />
      )}
      <span className="text-[14px] font-semibold leading-none">
        {balance.toLocaleString("ko-KR")}
      </span>
      <span className="text-[11px] text-gray-400 font-normal">C</span>
    </span>
  );
}
