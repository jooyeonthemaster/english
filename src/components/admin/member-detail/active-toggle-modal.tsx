"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, ShieldOff, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { toggleMemberActive } from "@/actions/admin-members";

interface ActiveToggleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  memberName: string;
  currentlyActive: boolean;
}

export function ActiveToggleModal({
  open,
  onOpenChange,
  memberId,
  memberName,
  currentlyActive,
}: ActiveToggleModalProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nextActive = !currentlyActive;
  // 5+ chars matches credit-adjust modal — substantive reasons for audit log.
  const reasonValid = reason.trim().length >= 5;

  function reset() {
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
    if (!reasonValid) return;
    setError(null);
    startTransition(async () => {
      const res = await toggleMemberActive({
        memberId,
        isActive: nextActive,
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

  const Icon = nextActive ? ShieldCheck : ShieldOff;
  const titleText = nextActive ? "회원 활성화" : "회원 비활성화";
  const cta = nextActive ? "활성화" : "비활성화";
  const tone = nextActive ? "positive" : "negative";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-7 rounded-md flex items-center justify-center",
                tone === "negative"
                  ? "bg-rose-50 text-rose-600"
                  : "bg-emerald-50 text-emerald-600",
              )}
              aria-hidden
            >
              <Icon className="size-4" strokeWidth={2} />
            </span>
            <DialogTitle className="text-[16px] font-semibold text-gray-900">
              {titleText}
            </DialogTitle>
          </div>
          <DialogDescription className="text-[12px] text-gray-500 pt-1">
            {nextActive ? (
              <>
                <span className="font-medium text-gray-700">{memberName}</span>{" "}
                회원의 계정을 다시 활성화합니다. 로그인이 가능해집니다.
              </>
            ) : (
              <>
                <span className="font-medium text-gray-700">{memberName}</span>{" "}
                회원의 계정을 비활성화합니다. 비활성 상태에서는 로그인이 차단됩니다.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="toggle-reason" className="text-[12px] text-gray-700">
              사유 <span className="text-rose-500">*</span>
              <span className="text-[11px] text-gray-400 font-normal ml-1.5">
                (감사 로그에 기록됨, 5-500자)
              </span>
            </Label>
            <Textarea
              id="toggle-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={
                nextActive
                  ? "예: 본인 확인 완료, 보안 점검 종료 등"
                  : "예: 결제 분쟁 발생, 계정 도용 의심 등"
              }
              className="text-[13px] resize-none"
              aria-invalid={(reason.length > 0 && !reasonValid) ? true : undefined}
            />
            <div className="text-[11px] text-gray-400 text-right tabular-nums">
              {reason.length} / 500
            </div>
          </div>

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

          <DialogFooter className="pt-1 gap-2 sm:gap-2">
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
              disabled={!reasonValid || isPending}
              className={cn(
                "text-[13px] min-w-[90px]",
                tone === "negative"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-emerald-600 hover:bg-emerald-700",
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
              ) : (
                `${cta} 확정`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
