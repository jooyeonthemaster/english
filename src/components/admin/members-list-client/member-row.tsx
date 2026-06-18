"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, AlertTriangle, StickyNote, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { ProviderBadge } from "@/components/admin/provider-badge";
import type { MemberListItem } from "@/actions/admin-members";
import { updateMemberMemo } from "@/actions/admin-members";
import { SmsToggle } from "./sms-toggle";
import { formatDate, formatRelative, getInitials, tierBadgeClass } from "./formatters";

const MAX_MEMO_LENGTH = 5000;

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
        <div className="min-w-0 max-w-[280px]">
          <div className="text-[12px] text-gray-700 truncate">
            {member.academy.name}
          </div>
          <div className="text-[11px] text-gray-400 truncate">
            /{member.academy.slug}
          </div>
          <MemoCell memberId={member.id} memo={member.academy.memo} />
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
        {member.lastActiveAt ? (
          <span title={formatDate(member.lastActiveAt)}>
            {formatRelative(member.lastActiveAt, now)}
          </span>
        ) : (
          <span className="text-gray-300">활동 없음</span>
        )}
      </TableCell>
      <TableCell>
        <SmsToggle
          memberId={member.id}
          optOut={member.smsOptOut}
          isInternal={member.isInternal}
        />
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

/**
 * 회원 목록에서 학원 메모를 바로 보고/쓰는 인라인 셀. 메모가 없던 회원도 "메모 추가"를
 * 눌러 곧장 작성할 수 있다(상세페이지의 updateMemberMemo 액션 재사용). 저장하면 낙관적
 * 으로 즉시 반영하고, 서버 데이터(검색 등)도 router.refresh로 동기화한다. 셀 내부 클릭은
 * stopPropagation으로 막아 행 전체 클릭(상세 이동)과 충돌하지 않게 한다.
 */
function MemoCell({
  memberId,
  memo,
}: {
  memberId: string;
  memo: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(memo ?? "");
  const [value, setValue] = useState(memo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const preview = current
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setValue(current);
    setError(null);
    setEditing(true);
  }
  function cancel() {
    setValue(current);
    setError(null);
    setEditing(false);
  }
  function save() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const res = await updateMemberMemo({ memberId, memo: value });
      if (!res.success) {
        setError(res.error);
        return;
      }
      const trimmed = value.trim();
      setCurrent(trimmed);
      setValue(trimmed);
      setEditing(false);
      router.refresh(); // 검색·다른 행 동기화(낙관적 표시는 이미 반영됨)
    });
  }

  if (editing) {
    return (
      <div className="mt-1" onClick={(e) => e.stopPropagation()}>
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={2}
          maxLength={MAX_MEMO_LENGTH}
          placeholder="학원 메모 입력… (첫 줄이 목록에 표시)"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
            if (e.key === "Escape") cancel();
          }}
          className="w-full min-h-[44px] resize-y rounded-md border border-amber-200 bg-amber-50/40 px-2 py-1 text-[12px] leading-snug text-gray-700 outline-none focus:border-amber-400"
        />
        {error && <p className="mt-0.5 text-[10.5px] text-rose-600">{error}</p>}
        <div className="mt-1 flex items-center gap-1.5">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="inline-flex h-6 items-center gap-1 rounded bg-blue-600 px-2 text-[11px] font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {isPending && (
              <Loader2 className="size-3 animate-spin" strokeWidth={2} aria-hidden />
            )}
            저장
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={isPending}
            className="h-6 rounded px-2 text-[11px] text-gray-500 transition-colors hover:bg-gray-100"
          >
            취소
          </button>
          <span className="ml-auto text-[10px] text-gray-300">⌘↵ 저장 · Esc 취소</span>
        </div>
      </div>
    );
  }

  if (preview) {
    return (
      <button
        type="button"
        onClick={startEdit}
        title={`${preview}\n\n클릭해서 메모 편집`}
        className="mt-1 flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-amber-50"
      >
        <StickyNote
          className="size-3.5 shrink-0 text-amber-500"
          strokeWidth={1.8}
          aria-hidden
        />
        <span className="truncate min-w-0 text-[12.5px] leading-snug text-gray-600">
          {preview}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="mt-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11.5px] text-gray-300 transition-colors hover:bg-amber-50/60 hover:text-amber-600"
    >
      <StickyNote className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
      메모 추가
    </button>
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
