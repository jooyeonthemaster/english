"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Ticket,
  QrCode,
  Coins,
  BadgePercent,
  CheckCircle2,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { couponEffectHeadline } from "@/lib/printable-coupon-format";

type ClaimSuccess =
  | {
      mode: "granted";
      title: string;
      granted: number;
      balanceAfter: number;
      expiresAt: string | null;
    }
  | {
      mode: "claimed";
      title: string;
      coupon: {
        effectType: string;
        discountAmount: number | null;
        discountPercent: number | null;
        validUntil: string | null;
      };
    };

export function CouponRegisterClient({
  initialToken,
}: {
  initialToken: string;
}) {
  const [token] = useState(initialToken);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimSuccess | null>(null);
  const autoRef = useRef(false);

  const hasToken = Boolean(token);

  async function submit(override?: { token?: string; code?: string }) {
    setError(null);
    const trimmed = code.trim();
    // 명시 payload(자동등록) > 수동 입력 코드 > QR 토큰 순.
    const payload =
      override ??
      (trimmed ? { code: trimmed } : token ? { token } : null);
    if (!payload) {
      setError("쿠폰 코드를 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/coupons/printable/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }
      setResult(data as ClaimSuccess);
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  // QR로 도착(토큰 보유)하면 코드 입력 없이 즉시 자동 등록. 로그인 직후 이 화면에
  // 오므로 "스캔 → (가입/로그인) → 자동 적립" 흐름이 완성된다. ref 가드로 1회만.
  useEffect(() => {
    if (token && !autoRef.current) {
      autoRef.current = true;
      void submit({ token });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (result) {
    return <ClaimResultCard result={result} />;
  }

  // 토큰 자동등록 진행/대기 중에는 폼 대신 로딩 카드를 보여준다(에러 시 폼으로 폴백).
  if (hasToken && !error) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <Loader2 className="mx-auto mb-3 size-7 animate-spin text-blue-600" />
        <p className="text-[15px] font-semibold text-slate-800">
          쿠폰을 등록하는 중이에요…
        </p>
        <p className="mt-1 text-[13px] text-slate-500">잠시만 기다려 주세요.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      {hasToken && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-[12px] font-medium text-blue-700">
          <QrCode className="size-4 shrink-0" />
          QR로 접속했습니다. 아래 &ldquo;쿠폰 등록&rdquo;을 누르면 바로 등록됩니다.
        </div>
      )}

      <label className="mb-1.5 block text-[12px] font-medium text-slate-500">
        쿠폰 코드 (8자리)
        {hasToken && (
          <span className="ml-1 text-slate-400">
            — QR로 등록하면 입력하지 않아도 됩니다
          </span>
        )}
      </label>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="예: ABCD2345"
        autoComplete="off"
        maxLength={16}
        className="h-11 w-full rounded-xl border border-slate-200 px-3 font-mono text-[15px] tracking-widest outline-none focus:border-blue-400"
      />

      {error && (
        <p className="mt-3 text-[13px] font-medium text-rose-600">{error}</p>
      )}

      <button
        type="button"
        disabled={submitting}
        onClick={() => submit()}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[14px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Ticket className="size-4" />
        )}
        쿠폰 등록
      </button>
    </div>
  );
}

function ClaimResultCard({ result }: { result: ClaimSuccess }) {
  if (result.mode === "granted") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="text-[16px] font-bold text-slate-900">
          크레딧이 지급되었습니다
        </p>
        <p className="mt-1 text-[13px] text-slate-500">{result.title}</p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 shadow-sm">
          <Coins className="size-4 text-emerald-600" />
          <span className="text-[13px] text-slate-500">지급</span>
          <CreditCostChip
            amount={result.granted}
            className="text-[15px] text-emerald-700"
          />
        </div>
        <p className="mt-3 text-[12px] text-slate-400">
          현재 잔액 {result.balanceAfter.toLocaleString("ko-KR")} 크레딧
        </p>
        {result.expiresAt && (
          <p className="mt-1 text-[12px] text-slate-400">
            보유 크레딧은 하나의 소멸일을 공유합니다 · 소멸 예정일{" "}
            {new Date(result.expiresAt).toLocaleDateString("ko-KR")}
          </p>
        )}
        <Link
          href="/director/credits"
          className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-600 hover:underline"
        >
          크레딧 내역 보기 <ArrowRight className="size-3.5" />
        </Link>
      </div>
    );
  }

  const headline = couponEffectHeadline(result.coupon);
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-6 text-center">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
        <BadgePercent className="size-6" />
      </div>
      <p className="text-[16px] font-bold text-slate-900">
        할인 쿠폰이 등록되었습니다
      </p>
      <p className="mt-1 text-[13px] text-slate-500">{result.title}</p>
      <div
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[15px] font-bold text-blue-700 shadow-sm",
        )}
      >
        {headline}
      </div>
      <p className="mt-3 text-[12px] text-slate-500">
        다음 크레딧 충전 결제 때 자동으로 적용할 수 있습니다.
      </p>
      <Link
        href="/director/credits"
        className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-600 hover:underline"
      >
        크레딧 충전하러 가기 <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
