"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coins, Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminDialog } from "@/components/admin/kit";
import { adjustMemberCredits } from "@/actions/admin-members";
import { MAX_ADJUSTMENT_AMOUNT as MAX_AMOUNT } from "@/lib/admin-members-labels";

interface CreditAdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  memberName: string;
  currentBalance: number | null;
}

type Direction = "grant" | "deduct";
const FORM_ID = "credit-adjust-form";

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
  const [expiryDays, setExpiryDays] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const numericAmount = (() => {
    const n = parseInt(amount.replace(/,/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const numericExpiry = (() => {
    const n = parseInt(expiryDays.replace(/,/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const signedAmount = direction === "grant" ? numericAmount : -numericAmount;
  const projectedBalance =
    currentBalance !== null ? currentBalance + signedAmount : null;

  const tooLarge = numericAmount > MAX_AMOUNT;
  // 감사 로그용 사유 — "ok"·"?" 같은 무의미한 값을 막기 위해 5자 이상.
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
    setExpiryDays("");
    setReason("");
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await adjustMemberCredits({
        memberId,
        amount: signedAmount,
        reason: reason.trim(),
        // 지급만 유효기간을 가진다. 비우면(0) 기존 소멸기한을 그대로 탄다.
        expiryDays: direction === "grant" && numericExpiry > 0 ? numericExpiry : undefined,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `크레딧 ${direction === "grant" ? "지급" : "차감"}: ${numericAmount.toLocaleString("ko-KR")} C`,
      );
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <AdminDialog
      open={open}
      onOpenChange={handleOpenChange}
      size="sm"
      title="크레딧 조정"
      description={
        <>
          <span className="font-medium text-gray-700">{memberName}</span> 회원의 크레딧을
          지급하거나 회수합니다. 모든 조정은 거래 내역에 기록됩니다.
        </>
      }
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            취소
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            size="sm"
            disabled={!canSubmit}
            className={cn(
              "min-w-[90px]",
              direction === "deduct" && "bg-rose-600 text-white hover:bg-rose-700",
            )}
          >
            {isPending && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden />}
            {isPending ? "처리 중" : direction === "grant" ? "지급 확정" : "차감 확정"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        {/* 지급 / 차감 */}
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

        {/* 수량 */}
        <div className="space-y-1.5">
          <Label htmlFor="adjust-amount" className="text-[12px] text-gray-700">
            크레딧 수량 <span className="text-rose-500">*</span>
          </Label>
          <div className="relative">
            <Coins
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
              strokeWidth={1.8}
              aria-hidden
            />
            <Input
              id="adjust-amount"
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="0"
              className="h-10 pl-9! pr-12! text-[14px] tabular-nums"
              aria-invalid={tooLarge ? true : undefined}
              aria-describedby={tooLarge ? "amount-error" : undefined}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-gray-400">
              C
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            {tooLarge ? (
              <span id="amount-error" className="text-rose-600">
                최대 {MAX_AMOUNT.toLocaleString("ko-KR")} 크레딧
              </span>
            ) : overdraft ? (
              <span className="text-rose-600">잔고보다 많이 차감할 수 없습니다</span>
            ) : cantDeductNoBalance ? (
              <span className="text-rose-600">
                잔고가 미생성 상태입니다. 먼저 지급이 필요합니다.
              </span>
            ) : (
              <span className="text-gray-400">최대 {MAX_AMOUNT.toLocaleString("ko-KR")}</span>
            )}
            {numericAmount > 0 && projectedBalance !== null && (
              <span className="tabular-nums text-gray-500">
                조정 후 잔고:{" "}
                <span
                  className={cn(
                    "font-semibold",
                    projectedBalance < 0 ? "text-rose-600" : "text-gray-800",
                  )}
                >
                  {projectedBalance.toLocaleString("ko-KR")} C
                </span>
              </span>
            )}
          </div>
        </div>

        {/* 빠른 추가 — 누를 때마다 더해진다 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            빠른 추가
          </span>
          {[100, 500, 1000, 5000, 10000].map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="xs"
              className="text-gray-600"
              onClick={() => setAmount(String(Math.min(numericAmount + preset, MAX_AMOUNT)))}
            >
              +{preset.toLocaleString("ko-KR")}
            </Button>
          ))}
          {amount && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-gray-400 hover:text-gray-700"
              onClick={() => setAmount("")}
            >
              초기화
            </Button>
          )}
        </div>

        {/* 유효기간(지급만) — 잔고 전체 소멸기한을 (남은 + 이번) 으로 연장. 비우면 기존 유지. */}
        {direction === "grant" && (
          <div className="space-y-1.5">
            <Label htmlFor="adjust-expiry" className="text-[12px] text-gray-700">
              소멸기한 (일)
              <span className="ml-1.5 text-[11px] font-normal text-gray-400">
                (비우면 기존 소멸기한 유지)
              </span>
            </Label>
            <Input
              id="adjust-expiry"
              type="text"
              inputMode="numeric"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="예: 30 (30일). 비우면 기존 소멸기한에 합산 없이 유지"
              className="h-10 text-[14px] tabular-nums"
            />
            {numericExpiry > 0 && (
              <p className="text-[11px] text-gray-500">
                기존 잔여 소멸기한에 <b>+{numericExpiry}일</b>이 더해져 갱신됩니다.
              </p>
            )}
          </div>
        )}

        {/* 사유 */}
        <div className="space-y-1.5">
          <Label htmlFor="adjust-reason" className="text-[12px] text-gray-700">
            사유 <span className="text-rose-500">*</span>
            <span className="ml-1.5 text-[11px] font-normal text-gray-400">
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
            className="resize-none text-[13px]"
            aria-invalid={reason.length > 0 && !reasonValid ? true : undefined}
          />
          <div className="flex items-center justify-between text-[11px] tabular-nums text-gray-400">
            <span>
              {reason.length > 0 && !reasonValid && (
                <span className="text-rose-500">5자 이상 입력</span>
              )}
            </span>
            <span>{reason.length} / 500</span>
          </div>
        </div>
      </form>
    </AdminDialog>
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
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-10 text-[13px]",
        active && tone === "negative" && "bg-rose-600 text-white hover:bg-rose-700",
        !active && "text-gray-600",
      )}
    >
      {icon}
      {label}
    </Button>
  );
}
