"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  Minus,
  AlertCircle,
  Loader2,
  Coins,
} from "lucide-react";
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
import { adjustMemberCredits } from "@/actions/admin-members";
import { MAX_ADJUSTMENT_AMOUNT as MAX_AMOUNT } from "@/lib/admin-members-labels";
import { useRouter } from "next/navigation";

interface CreditAdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  memberName: string;
  currentBalance: number | null;
}

type Direction = "grant" | "deduct";

export function CreditAdjustModal({
  open,
  onOpenChange,
  memberId,
  memberName,
  currentBalance,
}: CreditAdjustModalProps) {
  const router = useRouter();
  const [direction, setDirection] = useState<Direction>("grant");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const numericAmount = (() => {
    const n = parseInt(amount.replace(/,/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const signedAmount = direction === "grant" ? numericAmount : -numericAmount;
  const projectedBalance =
    currentBalance !== null ? currentBalance + signedAmount : null;

  const tooLarge = numericAmount > MAX_AMOUNT;
  // Audit logs need substantive reasons — 5+ chars rejects "ok" / "?" / "음".
  const reasonValid = reason.trim().length >= 5;
  const overdraft =
    direction === "deduct" &&
    currentBalance !== null &&
    numericAmount > currentBalance;
  const cantDeductNoBalance = direction === "deduct" && currentBalance === null;
  const canSubmit =
    !isPending &&
    numericAmount > 0 &&
    !tooLarge &&
    reasonValid &&
    !overdraft &&
    !cantDeductNoBalance;

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
      const res = await adjustMemberCredits({
        memberId,
        amount: signedAmount,
        reason: reason.trim(),
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-gray-900">
            크레딧 조정
          </DialogTitle>
          <DialogDescription className="text-[12px] text-gray-500">
            <span className="font-medium text-gray-700">{memberName}</span> 회원의 크레딧을
            지급하거나 회수합니다. 모든 조정은 거래 내역에 기록됩니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
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
            <Label htmlFor="adjust-amount" className="text-[12px] text-gray-700">
              크레딧 수량 <span className="text-rose-500">*</span>
            </Label>
            <div className="relative">
              <Coins
                className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400"
                strokeWidth={1.8}
                aria-hidden
              />
              <Input
                id="adjust-amount"
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^\d]/g, "");
                  setAmount(cleaned);
                }}
                placeholder="0"
                className="pl-9 pr-12 h-10 text-[14px] tabular-nums"
                aria-invalid={tooLarge ? true : undefined}
                aria-describedby={tooLarge ? "amount-error" : undefined}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 font-medium">
                C
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              {tooLarge ? (
                <span id="amount-error" className="text-rose-600">
                  최대 {MAX_AMOUNT.toLocaleString("ko-KR")} 크레딧
                </span>
              ) : overdraft ? (
                <span className="text-rose-600">
                  잔고보다 많이 차감할 수 없습니다
                </span>
              ) : cantDeductNoBalance ? (
                <span className="text-rose-600">
                  잔고가 미생성 상태입니다. 먼저 지급이 필요합니다.
                </span>
              ) : (
                <span className="text-gray-400">
                  최대 {MAX_AMOUNT.toLocaleString("ko-KR")}
                </span>
              )}
              {numericAmount > 0 && projectedBalance !== null && (
                <span className="text-gray-500 tabular-nums">
                  조정 후 잔고:{" "}
                  <span
                    className={cn(
                      "font-semibold",
                      projectedBalance < 0
                        ? "text-rose-600"
                        : "text-gray-800",
                    )}
                  >
                    {projectedBalance.toLocaleString("ko-KR")} C
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Quick add buttons — additive (each click increases the amount) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
              빠른 추가
            </span>
            {[100, 500, 1000, 5000, 10000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  const next = Math.min(numericAmount + preset, MAX_AMOUNT);
                  setAmount(String(next));
                }}
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
            <Label htmlFor="adjust-reason" className="text-[12px] text-gray-700">
              사유 <span className="text-rose-500">*</span>
              <span className="text-[11px] text-gray-400 font-normal ml-1.5">
                (감사 로그에 기록됨, 5-500자)
              </span>
            </Label>
            <Textarea
              id="adjust-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="예: 결제 누락 보전, 체험 추가 지급, 이중 결제 환불 등"
              className="text-[13px] resize-none"
              aria-invalid={(reason.length > 0 && !reasonValid) ? true : undefined}
            />
            <div className="flex items-center justify-between text-[11px] text-gray-400 tabular-nums">
              <span>
                {reason.length > 0 && !reasonValid && (
                  <span className="text-rose-500">
                    5자 이상 입력
                  </span>
                )}
              </span>
              <span>{reason.length} / 500</span>
            </div>
          </div>

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
                "지급 확정"
              ) : (
                "차감 확정"
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
        !active && "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
