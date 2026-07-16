"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Ticket, Loader2 } from "lucide-react";

/**
 * 크레딧 관리 페이지의 "쿠폰 등록" 카드 — 실물 쿠폰 8자리 코드를 직접 입력해 등록.
 * 크레딧 지급형이면 즉시 적립, 할인형이면 보유 쿠폰으로 등록(다음 충전 시 적용).
 * 등록 후 onRegistered로 크레딧/보유쿠폰 데이터를 새로고침한다.
 */
export function CouponRegisterCard({
  onRegistered,
}: {
  onRegistered: () => void | Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error("쿠폰 코드를 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/coupons/printable/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "쿠폰 등록에 실패했습니다.");
        return;
      }
      if (data.mode === "granted") {
        toast.success(
          `크레딧 ${Number(data.granted).toLocaleString("ko-KR")}가 지급되었습니다.`,
        );
      } else {
        toast.success(
          "할인 쿠폰이 등록되었습니다. 다음 크레딧 충전 시 적용할 수 있어요.",
        );
      }
      setCode("");
      await onRegistered();
    } catch {
      toast.error("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-5 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 lg:min-w-0 lg:flex-1">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Ticket className="size-3.5" />
          </div>
          <div className="lg:flex lg:min-w-0 lg:items-center lg:gap-2">
            <h2 className="shrink-0 whitespace-nowrap text-[15px] font-bold text-gray-900">
              쿠폰 등록
            </h2>
            <p className="text-[12px] text-gray-400 lg:truncate">
              받으신 실물 쿠폰의 8자리 코드를 입력하세요. QR이 있으면 스캔해도 됩니다.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !submitting) void submit();
            }}
            placeholder="예: ABCD2345"
            autoComplete="off"
            maxLength={16}
            className="h-10 flex-1 rounded-xl border border-gray-200 px-3 font-mono text-[14px] tracking-widest outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 lg:w-64 lg:flex-none"
          />
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-[14px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Ticket className="size-4" />
            )}
            등록
          </button>
        </div>
      </div>
    </div>
  );
}
