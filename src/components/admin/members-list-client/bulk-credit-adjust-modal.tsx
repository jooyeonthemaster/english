"use client";

// ============================================================================
// 선택 회원 일괄 크레딧 조정 모달. 단일 조정(member-detail/credit-adjust-modal)과
// 같은 UX(지급/차감 토글·빠른 추가·사유 필수)지만, 여러 회원에게 동일한 금액·사유를
// 한 번에 적용한다. 회원마다 잔고가 달라 "조정 후 잔고" 미리보기는 없고, 차감 시
// 일부 회원의 잔고 부족은 서버가 회원별로 판정해 실패 목록으로 돌려준다.
// ============================================================================

import { useState, useTransition } from "react";
import { Plus, Minus, AlertCircle, Loader2, Coins, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adjustMembersCredits } from "@/actions/admin-members";
import { MAX_ADJUSTMENT_AMOUNT as MAX_AMOUNT } from "@/lib/admin-members-labels";
import { useRouter } from "next/navigation";

interface BulkCreditAdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberIds: string[];
  /** 성공적으로 처리된 뒤 선택 해제 등 후처리 */
  onDone: () => void;
}

type Direction = "grant" | "deduct";

export function BulkCreditAdjustModal({
  open,
  onOpenChange,
  memberIds,
  onDone,
}: BulkCreditAdjustModalProps) {
  const router = useRouter();
  const [direction, setDirection] = useState<Direction>("grant");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const count = memberIds.length;

  const numericAmount = (() => {
    const n = parseInt(amount.replace(/,/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const signedAmount = direction === "grant" ? numericAmount : -numericAmount;

  const tooLarge = numericAmount > MAX_AMOUNT;
  const reasonValid = reason.trim().length >= 5;
  const canSubmit =
    !isPending && count > 0 && numericAmount > 0 && !tooLarge && reasonValid;

  function reset() {
    setDirection("grant");
    setAmount("");
    setReason("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await adjustMembersCredits({
        memberIds,
        amount: signedAmount,
        reason: reason.trim(),
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      const verb = direction === "grant" ? "지급" : "차감";
      if (res.failed === 0) {
        toast.success(`${res.succeeded}명 ${verb} 완료`);
      } else {
        const firstError = res.results.find((r) => !r.success)?.error;
        toast.warning(
          `${res.succeeded}명 ${verb} 완료 · ${res.failed}명 실패` +
            (firstError ? ` (예: ${firstError})` : ""),
        );
      }
      reset();
      onOpenChange(false);
      onDone();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-gray-900">
            크레딧 일괄 조정
          </DialogTitle>
          <DialogDescription className="text-[12px] text-gray-500">
            선택한{" "}
            <span className="font-medium text-gray-700">{count}명</span>의 회원에게
            동일한 크레딧을 지급하거나 회수합니다. 모든 조정은 회원별 거래 내역에
            기록됩니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* 대상 요약 */}
          <div className="flex items-center gap-2 rounded-lg bg-blue-50/60 border border-blue-100 px-3 py-2">
            <Users className="size-4 text-blue-600 shrink-0" strokeWidth={2} aria-hidden />
            <span className="text-[12px] text-blue-800">
              대상 회원{" "}
              <span className="font-semibold tabular-nums">{count}명</span>
            </span>
          </div>

          {/* Direction toggle */}
          <div className="grid grid-cols-2 gap-2">
            <DirectionButton
              active={direction === "grant"}
              onClick={() => setDirection("grant")}
              icon={<Plus className="size-4" strokeWidth={2.2} aria-hidden />}
              label="지급"
              tone="positive"
            />
            <DirectionButton
              active={direction === "deduct"}
              onClick={() => setDirection("deduct")}
              icon={<Minus className="size-4" strokeWidth={2.2} aria-hidden />}
              label="차감"
              tone="negative"
            />
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="bulk-adjust-amount" className="text-[12px] text-gray-700">
              1인당 크레딧 수량 <span className="text-rose-500">*</span>
            </Label>
            <div className="relative">
              <Coins
                className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400"
                strokeWidth={1.8}
                aria-hidden
              />
              <Input
                id="bulk-adjust-amount"
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^\d]/g, ""))
                }
                placeholder="0"
                className="pl-9 pr-12 h-10 text-[14px] tabular-nums"
                aria-invalid={tooLarge ? true : undefined}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 font-medium">
                C
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              {tooLarge ? (
                <span className="text-rose-600">
                  최대 {MAX_AMOUNT.toLocaleString("ko-KR")} 크레딧
                </span>
              ) : (
                <span className="text-gray-400">
                  1인당 최대 {MAX_AMOUNT.toLocaleString("ko-KR")}
                </span>
              )}
              {numericAmount > 0 && (
                <span className="text-gray-500 tabular-nums">
                  {direction === "grant" ? "총 지급" : "총 차감"}:{" "}
                  <span className="font-semibold text-gray-800">
                    {(numericAmount * count).toLocaleString("ko-KR")} C
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Quick add buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
              빠른 추가
            </span>
            {[100, 500, 1000, 5000, 10000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() =>
                  setAmount(String(Math.min(numericAmount + preset, MAX_AMOUNT)))
                }
                className="px-2.5 py-1 text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
              >
                +{preset.toLocaleString("ko-KR")}
              </button>
            ))}
            {amount && (
              <button
                type="button"
                onClick={() => setAmount("")}
                className="px-2 py-1 text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
              >
                초기화
              </button>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="bulk-adjust-reason" className="text-[12px] text-gray-700">
              사유 <span className="text-rose-500">*</span>
              <span className="text-[11px] text-gray-400 font-normal ml-1.5">
                (감사 로그에 기록됨, 5-500자)
              </span>
            </Label>
            <Textarea
              id="bulk-adjust-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="예: 이벤트 일괄 지급, 서비스 장애 보상 등"
              className="text-[13px] resize-none"
              aria-invalid={reason.length > 0 && !reasonValid ? true : undefined}
            />
            <div className="flex items-center justify-between text-[11px] text-gray-400 tabular-nums">
              <span>
                {reason.length > 0 && !reasonValid && (
                  <span className="text-rose-500">5자 이상 입력</span>
                )}
              </span>
              <span>{reason.length} / 500</span>
            </div>
          </div>

          {direction === "deduct" && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
              차감 시 잔고가 부족한 회원은 자동으로 건너뛰며, 완료 후 성공·실패
              건수를 알려드립니다.
            </p>
          )}

          {/* Server error */}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-rose-50 border border-rose-100 px-3 py-2">
              <AlertCircle
                className="size-4 text-rose-500 shrink-0 mt-px"
                strokeWidth={2}
                aria-hidden
              />
              <p className="text-[12px] text-rose-700">{error}</p>
            </div>
          )}

          <DialogFooter className="pt-2 gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              className="text-[13px]"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                "text-[13px] min-w-[90px]",
                direction === "grant"
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-rose-600 hover:bg-rose-700",
              )}
            >
              {isPending ? (
                <>
                  <Loader2
                    className="size-3.5 mr-1.5 animate-spin"
                    strokeWidth={2}
                    aria-hidden
                  />
                  처리 중
                </>
              ) : direction === "grant" ? (
                `${count}명 지급`
              ) : (
                `${count}명 차감`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DirectionButton({
  active,
  onClick,
  icon,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone: "positive" | "negative";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center gap-1.5 h-10 rounded-lg border text-[13px] font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
        active && tone === "positive" && "bg-blue-600 border-blue-600 text-white",
        active && tone === "negative" && "bg-rose-600 border-rose-600 text-white",
        !active &&
          "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
