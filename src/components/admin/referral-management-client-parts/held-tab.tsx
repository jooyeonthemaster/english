"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  approveReferral,
  rejectReferral,
  type HeldReferralRow,
  type HeldReferralsResult,
} from "@/actions/admin/referrals";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminEmptyState, SectionCard } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fmtDate } from "./format";

/** 보류 심사 탭 — 위험 신호가 잡혀 지급이 멈춘 추천을 한 건씩 승인/반려한다. */
export function HeldTab({
  held,
  pending,
  onPage,
}: {
  held: HeldReferralsResult;
  pending: boolean;
  onPage: (page: number) => void;
}) {
  const { rows, total, page, pageSize } = held;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white">
        <AdminEmptyState icon={ShieldAlert} title="심사 대기 중인 추천이 없습니다" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-3 transition-opacity", pending && "opacity-60")}>
      {rows.map((row) => (
        <HeldCard key={row.id} row={row} />
      ))}
      {totalPages > 1 && (
        <div className="rounded-xl border border-gray-100 bg-white">
          <AdminPagination page={page} totalPages={totalPages} disabled={pending} onChange={onPage} />
        </div>
      )}
    </div>
  );
}

function HeldCard({ row }: { row: HeldReferralRow }) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  function run(
    fn: (id: string, reason?: string) => Promise<{ success: boolean; error?: string }>,
    successMsg: string,
    requireReason?: boolean,
  ) {
    if (requireReason && reason.trim().length === 0) {
      toast.error("사유를 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const res = await fn(row.id, reason.trim() || undefined);
      if (res.success) toast.success(successMsg);
      else toast.error(res.error ?? "처리에 실패했습니다.");
    });
  }

  return (
    <SectionCard
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{row.referrerAcademyName}</span>
          <span className="shrink-0 font-normal text-gray-300">→</span>
          <span className="truncate font-normal text-gray-700">{row.referredAcademyName}</span>
        </span>
      }
      description={`보상 +${(row.referrerReward + row.referredReward).toLocaleString("ko-KR")} · ${fmtDate(row.createdAt)}`}
      actions={
        <div className="text-right">
          <div className="text-[11px] text-gray-400">위험도</div>
          <div
            className={cn(
              "text-[18px] font-bold tabular-nums",
              row.fraudScore >= 50 ? "text-rose-600" : "text-gray-600",
            )}
          >
            {row.fraudScore}
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {row.fraudSignals.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {row.fraudSignals.map((s, i) => (
              <span
                key={`${s.code}-${i}`}
                title={s.code}
                className="inline-flex h-6 items-center gap-1 rounded-md bg-rose-50 px-2 text-[11px] font-semibold text-rose-700"
              >
                <ShieldAlert className="size-3" strokeWidth={2} aria-hidden />
                {s.detail || s.code}
                {s.weight ? <span className="tabular-nums text-rose-400">+{s.weight}</span> : null}
              </span>
            ))}
          </div>
        )}

        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="심사 사유 (반려 시 필수, 승인 시 선택)"
          rows={2}
          disabled={pending}
          className="min-h-16 resize-y text-[13px]"
          aria-label="심사 사유"
        />

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(approveReferral, "추천 보상을 승인했습니다.")}
          >
            <CheckCircle2 className="size-3.5" strokeWidth={2} />
            승인
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(rejectReferral, "추천을 반려했습니다.", true)}
          >
            <XCircle className="size-3.5" strokeWidth={2} />
            반려
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
