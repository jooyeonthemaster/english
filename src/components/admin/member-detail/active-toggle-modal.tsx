"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminDialog } from "@/components/admin/kit";
import { toggleMemberActive } from "@/actions/admin-members";

interface ActiveToggleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  memberName: string;
  currentlyActive: boolean;
}

const FORM_ID = "active-toggle-form";

export function ActiveToggleModal({
  open,
  onOpenChange,
  memberId,
  memberName,
  currentlyActive,
}: ActiveToggleModalProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const nextActive = !currentlyActive;
  // 크레딧 조정과 같은 기준(5자 이상) — 감사 로그에 남길 만한 사유.
  const reasonValid = reason.trim().length >= 5;

  function reset() {
    setReason("");
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reasonValid) return;
    startTransition(async () => {
      const res = await toggleMemberActive({
        memberId,
        isActive: nextActive,
        reason: reason.trim(),
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`${memberName} 회원을 ${nextActive ? "활성화" : "비활성화"}했습니다`);
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  const Icon = nextActive ? ShieldCheck : ShieldOff;
  const cta = nextActive ? "활성화" : "비활성화";

  return (
    <AdminDialog
      open={open}
      onOpenChange={handleOpenChange}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-md",
              nextActive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600",
            )}
            aria-hidden
          >
            <Icon className="size-4" strokeWidth={2} />
          </span>
          회원 {cta}
        </span>
      }
      description={
        nextActive ? (
          <>
            <span className="font-medium text-gray-700">{memberName}</span> 회원의 계정을 다시
            활성화합니다. 로그인이 가능해집니다.
          </>
        ) : (
          <>
            <span className="font-medium text-gray-700">{memberName}</span> 회원의 계정을
            비활성화합니다. 비활성 상태에서는 로그인이 차단됩니다.
          </>
        )
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
            disabled={!reasonValid || isPending}
            className={cn(
              "min-w-[90px]",
              nextActive
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-rose-600 text-white hover:bg-rose-700",
            )}
          >
            {isPending && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden />}
            {isPending ? "처리 중" : `${cta} 확정`}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-1.5">
        <Label htmlFor="toggle-reason" className="text-[12px] text-gray-700">
          사유 <span className="text-rose-500">*</span>
          <span className="ml-1.5 text-[11px] font-normal text-gray-400">
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
          className="resize-none text-[13px]"
          aria-invalid={reason.length > 0 && !reasonValid ? true : undefined}
        />
        <div className="text-right text-[11px] tabular-nums text-gray-400">
          {reason.length} / 500
        </div>
      </form>
    </AdminDialog>
  );
}
