"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarClock, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminDialog } from "@/components/admin/kit";
import {
  setMemberCreditExpiry,
  wipeMemberCredits,
} from "@/actions/admin-members";

interface CreditExpiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  memberName: string;
  currentBalance: number | null;
  currentExpiresAt: string | null;
}

type Mode = "set" | "wipe";
const FORM_ID = "credit-expiry-form";

/** datetime-local 입력용 "YYYY-MM-DDTHH:mm"(로컬 시각). */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreditExpiryModal({
  open,
  onOpenChange,
  memberId,
  memberName,
  currentBalance,
  currentExpiresAt,
}: CreditExpiryModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("set");
  const [dateValue, setDateValue] = useState(toDatetimeLocal(currentExpiresAt));
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const reasonValid = reason.trim().length >= 5;
  const setDateValid = dateValue.length > 0;
  const canSubmit =
    !isPending && reasonValid && (mode === "wipe" || setDateValid);

  // 무기한은 두지 않는다. 대신 아주 먼 날짜를 빠르게 지정할 수 있는 프리셋.
  const presetFromNow = (days: number) =>
    setDateValue(toDatetimeLocal(new Date(Date.now() + days * 86_400_000).toISOString()));
  const presetFar = () =>
    setDateValue(toDatetimeLocal("2030-12-31T23:59:00+09:00"));

  function reset() {
    setMode("set");
    setDateValue(toDatetimeLocal(currentExpiresAt));
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
      const res =
        mode === "wipe"
          ? await wipeMemberCredits({ memberId, reason: reason.trim() })
          : await setMemberCreditExpiry({
              memberId,
              expiresAt: new Date(dateValue).toISOString(),
              reason: reason.trim(),
            });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(mode === "wipe" ? "잔여 크레딧을 소멸시켰습니다" : "소멸기한을 저장했습니다");
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
      title="크레딧 소멸기한 관리"
      description={
        <>
          <span className="font-medium text-gray-700">{memberName}</span> 회원의 소멸
          예정일을 강제로 지정하거나, 잔여 크레딧을 즉시 소멸시킵니다. 모든 처리는 거래
          내역에 기록됩니다.
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
              mode === "wipe" && "bg-rose-600 text-white hover:bg-rose-700",
            )}
          >
            {isPending && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden />}
            {isPending ? "처리 중" : mode === "wipe" ? "즉시 소멸" : "소멸기한 저장"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <ModeButton
            active={mode === "set"}
            onClick={() => setMode("set")}
            icon={<CalendarClock className="size-4" strokeWidth={2.2} aria-hidden />}
            label="소멸기한 설정"
            tone="primary"
          />
          <ModeButton
            active={mode === "wipe"}
            onClick={() => setMode("wipe")}
            icon={<Trash2 className="size-4" strokeWidth={2.2} aria-hidden />}
            label="즉시 소멸"
            tone="danger"
          />
        </div>

        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[12px] tabular-nums text-gray-600">
          현재 잔고{" "}
          <b className="text-gray-800">{(currentBalance ?? 0).toLocaleString("ko-KR")} C</b>
          {" · "}
          소멸 예정일{" "}
          <b className="text-gray-800">
            {currentExpiresAt
              ? new Date(currentExpiresAt).toLocaleDateString("ko-KR")
              : "무기한"}
          </b>
        </div>

        {mode === "set" ? (
          <div className="space-y-2">
            <Label htmlFor="expiry-date" className="text-[12px] text-gray-700">
              소멸 예정일시 <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="expiry-date"
              type="datetime-local"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="h-10 text-[14px]"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-gray-400">빠른 설정</span>
              {[
                { label: "+1년", onClick: () => presetFromNow(365) },
                { label: "+3년", onClick: () => presetFromNow(365 * 3) },
                { label: "2030-12-31", onClick: presetFar },
              ].map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  variant="outline"
                  size="xs"
                  className="text-gray-600"
                  onClick={p.onClick}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <p className="text-[11px] leading-4 text-gray-400">
              무기한은 지원하지 않습니다. 사실상 무기한처럼 두려면 아주 먼 날짜를 지정하세요.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2.5">
            <AlertCircle className="mt-px size-4 shrink-0 text-rose-500" strokeWidth={2} aria-hidden />
            <p className="text-[12px] leading-5 text-rose-700">
              잔여 크레딧 <b>{(currentBalance ?? 0).toLocaleString("ko-KR")} C</b>가 즉시
              0으로 소멸되고 소멸기한이 제거됩니다. 되돌릴 수 없습니다.
            </p>
          </div>
        )}

        {/* 사유 */}
        <div className="space-y-1.5">
          <Label htmlFor="expiry-reason" className="text-[12px] text-gray-700">
            사유 <span className="text-rose-500">*</span>
            <span className="ml-1.5 text-[11px] font-normal text-gray-400">
              (감사 로그에 기록됨, 5-500자)
            </span>
          </Label>
          <Textarea
            id="expiry-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="예: 프로모션 회수, 정책 위반 회수, 소멸기한 정정 등"
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

function ModeButton({
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
  tone: "primary" | "danger";
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-10 text-[13px]",
        active && tone === "danger" && "bg-rose-600 text-white hover:bg-rose-700",
        !active && "text-gray-600",
      )}
    >
      {icon}
      {label}
    </Button>
  );
}
