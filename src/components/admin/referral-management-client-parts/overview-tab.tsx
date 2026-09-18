"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Coins,
  ShieldAlert,
  Undo2,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getReferralStatDetail, getReferralRowDetail } from "@/actions/admin/detail/referrals";
import {
  clawbackReferral,
  type ReferralOverview,
  type ReferralOverviewRow,
} from "@/actions/admin/referrals";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import {
  AdminDialog,
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  ResultCount,
  StatCard,
  StatGrid,
  StatusBadge,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { REFERRAL_STATUS } from "@/lib/admin-labels";
import type { ReferralStatKey } from "@/lib/admin-block-detail/referrals";
import { cn } from "@/lib/utils";
import { fmtDate } from "./format";

const n = (v: number) => v.toLocaleString("ko-KR");

/** 지표 카드 6개 — 호버=상세 팝오버, 클릭=같은 기준의 추천 목록 팝업. */
const STATS: ReadonlyArray<{
  key: ReferralStatKey;
  label: string;
  icon: typeof UserPlus;
  tone?: "emerald" | "amber" | "rose" | "blue";
  pick: (s: ReferralOverview["stats"]) => number;
  /** 값만으로는 모자란 카드의 보조 한 줄(구성 내역·정합 경고). */
  sub?: (s: ReferralOverview["stats"]) => string | null;
}> = [
  {
    key: "total",
    label: "총 전환",
    icon: UserPlus,
    pick: (s) => s.totalSignups,
    // 5개 상태 밖의 건이 있으면 카드 합계가 총계와 안 맞는다 — 숨기지 않고 여기서 드러낸다.
    sub: (s) => (s.otherStatus > 0 ? `미분류 ${n(s.otherStatus)}건 포함` : null),
  },
  {
    key: "granted",
    label: "지급 완료",
    icon: CheckCircle2,
    tone: "emerald",
    // F17: GRANTED 만 세면 보류 심사를 통과한 APPROVED 가 어느 카드에도 안 잡혀
    //      카드 합계가 총 전환보다 작아진다. 실제로 보상이 나간 건 = GRANTED + APPROVED.
    pick: (s) => s.paid,
    sub: (s) => `자동 ${n(s.granted)} · 승인 ${n(s.approved)}`,
  },
  { key: "held", label: "보류", icon: ShieldAlert, tone: "amber", pick: (s) => s.held },
  { key: "rejected", label: "반려", icon: XCircle, pick: (s) => s.rejected },
  { key: "clawedBack", label: "회수", icon: Undo2, tone: "rose", pick: (s) => s.clawedBack },
  { key: "creditsIssued", label: "지급 크레딧", icon: Coins, tone: "blue", pick: (s) => s.creditsIssued },
];

export function OverviewTab({
  overview,
  pending,
  onPage,
}: {
  overview: ReferralOverview;
  pending: boolean;
  onPage: (page: number) => void;
}) {
  const { stats, rows, total, page, pageSize } = overview;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <StatGrid cols={6}>
        {STATS.map((s) => (
          <AdminHoverDetail
            key={s.key}
            title={s.label}
            load={() => getReferralStatDetail(s.key)}
            cacheKey={`referrals:stat:${s.key}`}
          >
            {/* StatCard 는 DOM 이벤트를 받지 않으므로 호버·클릭은 이 래퍼가 받는다. */}
            <div className="cursor-pointer rounded-xl outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500/30">
              <StatCard
                size="sm"
                label={s.label}
                value={n(s.pick(stats))}
                sub={s.sub?.(stats)}
                icon={s.icon}
                valueTone={s.tone}
              />
            </div>
          </AdminHoverDetail>
        ))}
      </StatGrid>

      <ResultCount total={total} page={Math.min(page, totalPages)} totalPages={totalPages} />

      <div
        className={cn(
          "overflow-hidden rounded-xl border border-gray-100 bg-white transition-opacity",
          pending && "opacity-60",
        )}
      >
        <DataTable bare minWidth={900}>
          <DataTableHeader>
            <Tr>
              <Th>추천한 학원</Th>
              <Th>가입한 학원</Th>
              <Th>상태</Th>
              <Th align="right">보상</Th>
              <Th align="right">위험도</Th>
              <Th>생성일</Th>
              <Th align="right" />
            </Tr>
          </DataTableHeader>
          <DataTableBody>
            {rows.length === 0 ? (
              <DataTableEmpty colSpan={7}>
                <AdminEmptyState icon={UserPlus} title="아직 추천 기록이 없습니다" />
              </DataTableEmpty>
            ) : (
              rows.map((r) => <OverviewRow key={r.id} row={r} />)
            )}
          </DataTableBody>
        </DataTable>
        <AdminPagination page={page} totalPages={totalPages} disabled={pending} onChange={onPage} />
      </div>
    </div>
  );
}

function OverviewRow({ row }: { row: ReferralOverviewRow }) {
  const [pending, startTransition] = useTransition();
  const [clawbackOpen, setClawbackOpen] = useState(false);
  const [reason, setReason] = useState("");
  // 회수는 실제로 지급된 보상에만 적용된다.
  const clawbackable = row.status === "GRANTED" || row.status === "APPROVED";

  function clawback() {
    startTransition(async () => {
      const res = await clawbackReferral(row.id, reason.trim() || undefined);
      if (res.success) {
        toast.success("추천 보상을 회수했습니다.");
        setClawbackOpen(false);
        setReason("");
      } else {
        toast.error(res.error ?? "회수에 실패했습니다.");
      }
    });
  }

  return (
    <AdminHoverDetail
      title={`${row.referrerAcademyName} → ${row.referredAcademyName}`}
      load={() => getReferralRowDetail(row.id)}
      cacheKey={`referrals:row:${row.id}:${row.status}`}
    >
      <Tr clickable>
        <Td className="font-medium text-gray-900">{row.referrerAcademyName}</Td>
        <Td>{row.referredAcademyName}</Td>
        <Td>
          <StatusBadge map={REFERRAL_STATUS} value={row.status} />
          {/* 미분류는 라벨만으론 무엇인지 알 수 없다 — 원본 status 를 조용히 덧붙인다. */}
          {row.status === "UNKNOWN" && (
            <span className="ml-1.5 align-middle text-[11px] text-gray-400">{row.statusRaw}</span>
          )}
        </Td>
        <Td align="right">+{n(row.referrerReward + row.referredReward)}</Td>
        <Td align="right" className={row.fraudScore >= 50 ? "text-rose-600" : "text-gray-400"}>
          {row.fraudScore}
        </Td>
        <Td muted className="tabular-nums">
          {fmtDate(row.createdAt)}
        </Td>
        <Td align="right">
          {clawbackable && (
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              disabled={pending}
              onClick={() => setClawbackOpen(true)}
            >
              <Undo2 className="size-3.5" strokeWidth={2} />
              회수
            </Button>
          )}
          <AdminDialog
            open={clawbackOpen}
            onOpenChange={(open) => !pending && setClawbackOpen(open)}
            size="sm"
            title="추천 보상 회수"
            description={`${row.referrerAcademyName} → ${row.referredAcademyName} · 지급된 ${n(row.referrerReward + row.referredReward)} 크레딧을 되돌립니다.`}
            footer={
              <>
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setClawbackOpen(false)}>
                  취소
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={clawback}
                  className="bg-rose-600 text-white hover:bg-rose-700"
                >
                  회수
                </Button>
              </>
            }
          >
            <div className="space-y-1.5">
              <label htmlFor={`clawback-reason-${row.id}`} className="text-[11px] font-semibold text-gray-500">
                회수 사유 (선택)
              </label>
              <Textarea
                id={`clawback-reason-${row.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="회수 사유를 입력하세요"
                rows={3}
                disabled={pending}
                className="min-h-20 resize-y text-[13px]"
              />
            </div>
          </AdminDialog>
        </Td>
      </Tr>
    </AdminHoverDetail>
  );
}
