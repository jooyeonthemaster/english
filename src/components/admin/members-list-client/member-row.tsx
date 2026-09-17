"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, AlertTriangle, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SaveButton } from "@/components/ui/save-button";
import { StatusBadge, Td, Tr } from "@/components/admin/kit";
import { activeFlag } from "@/lib/admin-labels";
import type { MemberListItem } from "@/actions/admin-members";
import { updateMemberMemo } from "@/actions/admin-members";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { SmsToggle } from "./sms-toggle";
import { memberRowDetail } from "./member-hover-detail";
import { formatDate, formatRelative, getInitials } from "./formatters";
import { LOW_BALANCE_THRESHOLD } from "./member-list-model";

const MAX_MEMO_LENGTH = 5000;

/** 이름 옆 "비활성" 표시 — 라벨은 레지스트리(activeFlag)에서. */
function InactiveBadge() {
  return <StatusBadge status={activeFlag(false, ["활성", "비활성"])} className="h-5 shrink-0" />;
}

export function MemberRow({
  member,
  now,
  selected,
  onSelectChange,
}: {
  member: MemberListItem;
  now: number;
  selected: boolean;
  onSelectChange: (checked: boolean) => void;
}) {
  const router = useRouter();
  const href = `/admin/members/${member.id}`;

  // 행 클릭 = 상세 이동. 첫 셀의 <Link> 가 키보드/스크린리더 진입점으로 남는다.
  // 글자를 드래그 중이거나 안쪽 링크·버튼을 눌렀을 땐 가로채지 않는다.
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("a, button")) return;
      if (window.getSelection()?.toString()) return;
      router.push(href);
    },
    [router, href],
  );
  // 호버 상세 — 행 클릭(상세 페이지 이동)은 그대로 두고 팝오버만 붙인다.
  const detail = useMemo(() => memberRowDetail(member), [member]);

  return (
    <AdminHoverDetail title={member.name} detail={detail} click="none">
      <Tr onClick={handleRowClick} clickable selected={selected} className="group">
        <Td className="w-9 pr-0" onClick={(e) => e.stopPropagation()} data-no-detail>
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onSelectChange(v === true)}
            aria-label={`${member.name} 선택`}
          />
        </Td>
        <Td>
          <Link
            href={href}
            className="-m-1 flex items-center gap-3 rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          >
            <Avatar name={member.name} avatarUrl={member.avatarUrl} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] font-medium text-gray-900">
                  {member.name}
                </span>
                {!member.isActive && <InactiveBadge />}
              </div>
              <div className="truncate text-[11px] text-gray-400">{member.email}</div>
            </div>
          </Link>
        </Td>
        <Td className="hidden xl:table-cell">
          <div className="min-w-0 max-w-[280px]">
            <div className="truncate text-[12px] text-gray-700">{member.academy.name}</div>
            <div className="truncate text-[11px] text-gray-400">/{member.academy.slug}</div>
            <MemoCell memberId={member.id} memo={member.academy.memo} />
          </div>
        </Td>
        <Td>
          <LatestPurchaseCell purchase={member.latestPurchase} />
        </Td>
        <Td align="right">
          <BalanceCell balance={member.creditBalance?.balance ?? null} />
        </Td>
        <Td>
          <ExpiryCell expiresAt={member.creditBalance?.expiresAt ?? null} now={now} />
        </Td>
        <Td className="hidden text-[12px] tabular-nums text-gray-600 xl:table-cell">
          {formatDate(member.createdAt)}
        </Td>
        <Td className="hidden text-[12px] tabular-nums text-gray-600 2xl:table-cell">
          {member.lastActiveAt ? (
            <span title={formatDate(member.lastActiveAt)}>
              {formatRelative(member.lastActiveAt, now)}
            </span>
          ) : (
            <span className="text-gray-300">활동 없음</span>
          )}
        </Td>
        <Td className="hidden lg:table-cell" data-no-detail>
          <SmsToggle memberId={member.id} optOut={member.smsOptOut} isInternal={member.isInternal} />
        </Td>
        <Td align="right">
          <ChevronRight
            className="inline-block size-4 text-gray-300 transition-colors group-hover:text-gray-500"
            strokeWidth={2}
            aria-hidden="true"
          />
        </Td>
      </Tr>
    </AdminHoverDetail>
  );
}

/**
 * 회원별 보기 모바일 카드 — 가로 스크롤 없이 한 회원의 핵심 정보를 세로로 쌓는다.
 * 표(MemberRow)와 같은 셀 컴포넌트(Avatar/LatestPurchaseCell/BalanceCell/ExpiryCell)를
 * 재사용해 데스크톱과 표시 내용이 어긋나지 않게 한다.
 */
export function MemberCard({
  member,
  now,
  selected,
  onSelectChange,
}: {
  member: MemberListItem;
  now: number;
  selected: boolean;
  onSelectChange: (checked: boolean) => void;
}) {
  const href = `/admin/members/${member.id}`;
  return (
    <li
      className={cn(
        "rounded-xl border bg-white px-4 py-3.5 transition-colors",
        selected ? "border-blue-200 bg-blue-50/40 ring-1 ring-blue-100" : "border-gray-100",
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onSelectChange(v === true)}
          aria-label={`${member.name} 선택`}
          className="mt-2.5 shrink-0"
        />
        <Link
          href={href}
          className="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        >
          <Avatar name={member.name} avatarUrl={member.avatarUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[13px] font-medium text-gray-900">
                {member.name}
              </span>
              {!member.isActive && <InactiveBadge />}
            </div>
            <div className="truncate text-[11px] text-gray-400">{member.email}</div>
          </div>
        </Link>
        {/* 크레딧 잔고 + 바로 아래 소멸시효(작은 회색 글씨) */}
        <div className="flex shrink-0 flex-col items-end gap-0.5 pt-1">
          <BalanceCell balance={member.creditBalance?.balance ?? null} />
          <CardExpiryHint expiresAt={member.creditBalance?.expiresAt ?? null} now={now} />
        </div>
      </div>

      <div className="mt-2.5 space-y-1 pl-1 text-[11px] text-gray-400">
        {/* 학원 (+ 문자수신 토글 우측) */}
        <div className="flex items-center gap-1">
          <span className="shrink-0">학원</span>
          <span className="min-w-0 flex-1 truncate text-gray-600">{member.academy.name}</span>
          <span className="shrink-0">
            <SmsToggle memberId={member.id} optOut={member.smsOptOut} isInternal={member.isInternal} />
          </span>
        </div>
        {/* 최근 구매 — 학원 아래로, 한 줄로 */}
        <div className="flex items-center gap-1">
          <span className="shrink-0">최근 구매</span>
          {member.latestPurchase ? (
            <span className="min-w-0 truncate tabular-nums text-gray-600">
              {member.latestPurchase.name} ·{" "}
              {member.latestPurchase.creditAmount.toLocaleString("ko-KR")} C ·{" "}
              {formatDate(member.latestPurchase.purchasedAt)}
            </span>
          ) : (
            <span className="text-gray-300">구입 없음</span>
          )}
        </div>
      </div>
    </li>
  );
}

/** 카드에서 크레딧 잔고 바로 아래 표시하는 소멸시효 — 작은 회색 글씨 한 줄. */
function CardExpiryHint({ expiresAt, now }: { expiresAt: Date | string | null; now: number }) {
  if (!expiresAt) return null;
  const days = Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
  return (
    <span className="text-[11px] leading-tight tabular-nums text-gray-400">
      소멸 {formatDate(expiresAt)}
      {days >= 0 ? ` · D-${days}` : " · 만료"}
    </span>
  );
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null | undefined }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt="" className="size-9 shrink-0 rounded-full bg-gray-100 object-cover" />
    );
  }
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[13px] font-semibold text-blue-700"
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
function MemoCell({ memberId, memo }: { memberId: string; memo: string | null }) {
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
      <div className="mt-1" onClick={(e) => e.stopPropagation()} data-no-detail>
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
          className="min-h-[44px] w-full resize-y rounded-lg border border-amber-200 bg-amber-50/40 px-2 py-1 text-[12px] leading-snug text-gray-700 outline-none focus:border-amber-400"
        />
        {error && <p className="mt-0.5 text-[12px] text-rose-600">{error}</p>}
        <div className="mt-1 flex items-center gap-1.5">
          <SaveButton onClick={save} saving={isPending} className="h-6 min-w-0 rounded px-2" />
          <Button variant="ghost" size="xs" onClick={cancel} disabled={isPending} className="text-gray-500">
            취소
          </Button>
          <span className="ml-auto text-[11px] text-gray-300">⌘↵ 저장 · Esc 취소</span>
        </div>
      </div>
    );
  }

  if (preview) {
    return (
      <Button
        variant="ghost"
        size="xs"
        onClick={startEdit}
        title={`${preview}\n\n클릭해서 메모 편집`}
        className="mt-1 h-auto w-full justify-start gap-1.5 px-1 py-0.5 text-left font-normal hover:bg-amber-50"
      >
        <StickyNote className="size-3.5 shrink-0 text-amber-500" strokeWidth={1.8} aria-hidden />
        <span className="min-w-0 truncate text-[12px] leading-snug text-gray-600">{preview}</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={startEdit}
      className="mt-1 h-auto gap-1 px-1 py-0.5 text-[11px] font-normal text-gray-300 hover:bg-amber-50/60 hover:text-amber-600"
    >
      <StickyNote className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
      메모 추가
    </Button>
  );
}

/** "최근 구입 상품" 셀 — 가장 최근 구입한 충전 상품명 + 크레딧·구입일. */
export function LatestPurchaseCell({ purchase }: { purchase: MemberListItem["latestPurchase"] }) {
  if (!purchase) {
    return <span className="text-[11px] text-gray-300">구입 없음</span>;
  }
  return (
    <div className="min-w-0 leading-tight">
      <div className="truncate text-[12px] text-gray-800">{purchase.name}</div>
      <div className="text-[11px] tabular-nums text-gray-400">
        {purchase.creditAmount.toLocaleString("ko-KR")} C · {formatDate(purchase.purchasedAt)}
      </div>
    </div>
  );
}

/** 소멸시효 셀 — 날짜 + D-day(7일 이내 로즈). 표/카드 공용. */
export function ExpiryCell({ expiresAt, now }: { expiresAt: Date | string | null; now: number }) {
  if (!expiresAt) {
    return <span className="text-[11px] text-gray-300">—</span>;
  }
  const days = Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
  return (
    <div className="leading-tight tabular-nums">
      <div className="text-[12px] text-gray-600">{formatDate(expiresAt)}</div>
      <div
        className={cn(
          "text-[11px]",
          days < 0 ? "text-gray-300" : days <= 7 ? "text-rose-500" : "text-gray-400",
        )}
      >
        {days < 0 ? "만료" : `D-${days}`}
      </div>
    </div>
  );
}

/** 크레딧 잔고 셀 — 저잔고(50 미만)는 로즈 + 경고 아이콘. 표/카드 공용. */
export function BalanceCell({ balance }: { balance: number | null }) {
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
        <AlertTriangle className="size-3 shrink-0 text-rose-500" strokeWidth={2} aria-hidden="true" />
      )}
      <span className="text-[13px] font-semibold leading-none">{balance.toLocaleString("ko-KR")}</span>
      <span className="text-[11px] font-normal text-gray-400">C</span>
    </span>
  );
}
