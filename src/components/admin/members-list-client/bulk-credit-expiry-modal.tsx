"use client";

// 선택 학원(대표 원장)의 크레딧 소멸기한을 일괄 지정하거나 즉시 소멸시키는 모달.

import { useState, useTransition } from "react";
import { AlertCircle, CalendarClock, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminDialog } from "@/components/admin/kit";
import { setMembersCreditExpiry, wipeMembersCredits } from "@/actions/admin-members";

interface BulkCreditExpiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberIds: string[];
  onDone: () => void;
}

type Mode = "set" | "wipe";

const FORM_ID = "bulk-credit-expiry-form";

export function BulkCreditExpiryModal({
  open,
  onOpenChange,
  memberIds,
  onDone,
}: BulkCreditExpiryModalProps) {
  const [mode, setMode] = useState<Mode>("set");
  const [dateValue, setDateValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const count = memberIds.length;
  const reasonValid = reason.trim().length >= 5;
  const setDateValid = dateValue.length > 0;
  const canSubmit = !isPending && reasonValid && (mode === "wipe" || setDateValid);

  // 무기한은 두지 않는다 — 아주 먼 날짜를 빠르게 지정하는 프리셋.
  const toLocalInput = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const presetFromNow = (days: number) =>
    setDateValue(toLocalInput(new Date(Date.now() + days * 86_400_000)));
  const presetFar = () => setDateValue(toLocalInput(new Date("2030-12-31T23:59:00+09:00")));

  function reset() {
    setMode("set");
    setDateValue("");
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
      const res =
        mode === "wipe"
          ? await wipeMembersCredits({ memberIds, reason: reason.trim() })
          : await setMembersCreditExpiry({
              memberIds,
              expiresAt: new Date(dateValue).toISOString(),
              reason: reason.trim(),
            });
      if (!res.success) {
        setError(res.error);
        return;
      }
      toast.success(
        `${res.succeeded}명 처리 완료${res.failed > 0 ? ` · ${res.failed}명 실패` : ""}`,
      );
      reset();
      onOpenChange(false);
      onDone();
    });
  }

  return (
    <AdminDialog
      open={open}
      onOpenChange={handleOpenChange}
      size="sm"
      title="소멸기한 일괄 관리"
      description={
        <>
          선택한 <span className="font-medium text-gray-700">{count}명</span>의 소멸 예정일을
          강제로 지정하거나 잔여 크레딧을 즉시 소멸시킵니다. 각 회원은 개별 처리되며 모든 변경은
          거래 내역에 기록됩니다.
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
            className={cn("min-w-[90px]", mode === "wipe" && "bg-rose-600 hover:bg-rose-700")}
          >
            {isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden />
                처리 중
              </>
            ) : mode === "wipe" ? (
              `${count}명 즉시 소멸`
            ) : (
              `${count}명 적용`
            )}
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

        {mode === "set" ? (
          <div className="space-y-2">
            <Label htmlFor="bulk-expiry-date" className="text-[12px] text-gray-700">
              소멸 예정일시 <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="bulk-expiry-date"
              type="datetime-local"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="h-10 text-[13px]"
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
                  onClick={p.onClick}
                  className="text-gray-600"
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
              선택한 {count}명의 잔여 크레딧이 즉시 0으로 소멸됩니다. 되돌릴 수 없습니다.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="bulk-expiry-reason" className="text-[12px] text-gray-700">
            사유 <span className="text-rose-500">*</span>
            <span className="ml-1.5 text-[11px] font-normal text-gray-400">
              (감사 로그에 기록됨, 5-500자)
            </span>
          </Label>
          <Textarea
            id="bulk-expiry-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="예: 프로모션 일괄 회수, 소멸기한 정책 정정 등"
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

        {error && <p className="text-[12px] text-rose-600">{error}</p>}
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
      variant="outline"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-10 text-[13px]",
        active && tone === "primary" && "border-blue-600 bg-blue-600 text-white hover:bg-blue-700 hover:text-white",
        active && tone === "danger" && "border-rose-600 bg-rose-600 text-white hover:bg-rose-700 hover:text-white",
        !active && "text-gray-600",
      )}
    >
      {icon}
      {label}
    </Button>
  );
}
