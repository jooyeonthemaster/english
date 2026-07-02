"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CalendarClock, Loader2, Trash2 } from "lucide-react";
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
import {
  setMembersCreditExpiry,
  wipeMembersCredits,
} from "@/actions/admin-members";

interface BulkCreditExpiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberIds: string[];
  onDone: () => void;
}

type Mode = "set" | "wipe";

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
  const canSubmit =
    !isPending && reasonValid && (mode === "wipe" || setDateValid);

  // 무기한은 두지 않는다 — 아주 먼 날짜를 빠르게 지정하는 프리셋.
  const toLocalInput = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const presetFromNow = (days: number) =>
    setDateValue(toLocalInput(new Date(Date.now() + days * 86_400_000)));
  const presetFar = () =>
    setDateValue(toLocalInput(new Date("2030-12-31T23:59:00+09:00")));

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-gray-900">
            소멸기한 일괄 관리
          </DialogTitle>
          <DialogDescription className="text-[12px] text-gray-500">
            선택한 <b className="text-gray-700">{count}명</b>의 소멸 예정일을 강제로
            지정하거나 잔여 크레딧을 즉시 소멸시킵니다. 각 회원은 개별 처리되며 모든
            변경은 거래 내역에 기록됩니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <ModeButton
              active={mode === "set"}
              onClick={() => setMode("set")}
              icon={<CalendarClock className="size-4" strokeWidth={2.2} />}
              label="소멸기한 설정"
              tone="primary"
            />
            <ModeButton
              active={mode === "wipe"}
              onClick={() => setMode("wipe")}
              icon={<Trash2 className="size-4" strokeWidth={2.2} />}
              label="즉시 소멸"
              tone="danger"
            />
          </div>

          {mode === "set" ? (
            <div className="space-y-2">
              <Label
                htmlFor="bulk-expiry-date"
                className="text-[12px] text-gray-700"
              >
                소멸 예정일시 <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="bulk-expiry-date"
                type="datetime-local"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                className="h-10 text-[14px]"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-gray-400">
                  빠른 설정
                </span>
                {[
                  { label: "+1년", onClick: () => presetFromNow(365) },
                  { label: "+3년", onClick: () => presetFromNow(365 * 3) },
                  { label: "2030-12-31", onClick: presetFar },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={p.onClick}
                    className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-4 text-gray-400">
                무기한은 지원하지 않습니다. 사실상 무기한처럼 두려면 아주 먼
                날짜를 지정하세요.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md bg-rose-50 border border-rose-100 px-3 py-2.5">
              <AlertCircle
                className="size-4 text-rose-500 shrink-0 mt-px"
                strokeWidth={2}
              />
              <p className="text-[12px] text-rose-700 leading-5">
                선택한 {count}명의 잔여 크레딧이 즉시 0으로 소멸됩니다. 되돌릴 수
                없습니다.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="bulk-expiry-reason" className="text-[12px] text-gray-700">
              사유 <span className="text-rose-500">*</span>
              <span className="text-[11px] text-gray-400 font-normal ml-1.5">
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

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-rose-50 border border-rose-100 px-3 py-2">
              <AlertCircle
                className="size-4 text-rose-500 shrink-0 mt-px"
                strokeWidth={2}
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
                mode === "wipe"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-blue-600 hover:bg-blue-700",
              )}
            >
              {isPending ? (
                <>
                  <Loader2
                    className="size-3.5 mr-1.5 animate-spin"
                    strokeWidth={2}
                  />
                  처리 중
                </>
              ) : mode === "wipe" ? (
                `${count}명 즉시 소멸`
              ) : (
                `${count}명 적용`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center gap-1.5 h-10 rounded-lg border text-[13px] font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
        active && tone === "primary" && "bg-blue-600 border-blue-600 text-white",
        active && tone === "danger" && "bg-rose-600 border-rose-600 text-white",
        !active &&
          "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
