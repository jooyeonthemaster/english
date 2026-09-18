"use client";

// 쿠폰 발급 팝업 — 효과·값·라벨·수량을 입력하고 발급 후 인쇄 탭을 연다.
// 항상 마운트해 두어(open 만 토글) 연속 발급 시 직전 입력값이 유지된다(라벨/쿠폰명만 비움).

import { useState } from "react";
import { Banknote, Coins, Loader2, Percent, Printer } from "lucide-react";
import { toast } from "sonner";
import { AdminDialog } from "@/components/admin/kit";
import { AdminField } from "@/components/admin/credit-promotion-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  couponEffectHeadline,
  type PrintableCouponEffectType,
} from "@/lib/printable-coupon-format";
import { issuePrintableCouponBatch } from "@/actions/admin/printable-coupons";
import { EFFECT_OPTIONS } from "./effect-options";
import type { PrintHandoff } from "./print-handoff";

const EFFECT_ICON: Record<PrintableCouponEffectType, typeof Coins> = {
  CREDIT_GRANT: Coins,
  DISCOUNT_AMOUNT: Banknote,
  DISCOUNT_PERCENT: Percent,
};

export function IssueCouponDialog({
  open,
  onOpenChange,
  onIssued,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued: (batchId: string, handoff: PrintHandoff) => void;
}) {
  const [effectType, setEffectType] = useState<PrintableCouponEffectType>("CREDIT_GRANT");
  const [batchName, setBatchName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [grantCredits, setGrantCredits] = useState("");
  const [grantExpiryAt, setGrantExpiryAt] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [perAcademyLimit, setPerAcademyLimit] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  const num = (s: string): number | undefined => {
    const n = Number(s);
    return s.trim() === "" || Number.isNaN(n) ? undefined : n;
  };

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await issuePrintableCouponBatch({
        batchName,
        title,
        description: description.trim() || undefined,
        effectType,
        grantCredits: effectType === "CREDIT_GRANT" ? num(grantCredits) : undefined,
        grantExpiryAt:
          effectType === "CREDIT_GRANT" && grantExpiryAt ? grantExpiryAt : undefined,
        discountAmount: effectType === "DISCOUNT_AMOUNT" ? num(discountAmount) : undefined,
        discountPercent: effectType === "DISCOUNT_PERCENT" ? num(discountPercent) : undefined,
        validUntil: validUntil || undefined,
        quantity: num(quantity) ?? 0,
        perAcademyLimit: num(perAcademyLimit),
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const b = res.batch;
      const fmtDate = (s: string) => {
        if (!s) return undefined;
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString("ko-KR");
      };
      onIssued(b.batchId, {
        batchName: b.batchName,
        title: b.title,
        effectType: b.effectType,
        description: description.trim() || undefined,
        registerBy: fmtDate(validUntil),
        creditExpiry: effectType === "CREDIT_GRANT" ? fmtDate(grantExpiryAt) : undefined,
        headline: couponEffectHeadline({
          effectType: b.effectType,
          grantCredits: num(grantCredits) ?? null,
          discountAmount: num(discountAmount) ?? null,
          discountPercent: num(discountPercent) ?? null,
        }),
        cards: b.cards,
      });
      toast.success(`${b.cards.length}장을 발급했습니다. 인쇄 탭을 확인하세요.`);
      // 성공 후 값 유지(연속 발급 편의) — 라벨/쿠폰명만 비운다.
      setBatchName("");
      setTitle("");
      onOpenChange(false);
    } catch {
      toast.error("발급 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title="쿠폰 발급"
      description="발급 직후 인쇄 탭이 열립니다. QR 원본 토큰은 저장하지 않으므로 바로 인쇄하세요."
      size="lg"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            취소
          </Button>
          <Button type="button" size="sm" disabled={submitting} onClick={submit}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Printer className="size-4" strokeWidth={2} />
            )}
            발급 후 인쇄
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* effectType 선택 */}
        <div className="space-y-1.5">
          <span className="text-[12px] font-semibold text-gray-500">쿠폰 효과</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {EFFECT_OPTIONS.map((o) => {
              const Icon = EFFECT_ICON[o.value];
              const active = effectType === o.value;
              return (
                <Button
                  key={o.value}
                  type="button"
                  variant="outline"
                  aria-pressed={active}
                  onClick={() => setEffectType(o.value)}
                  className={cn(
                    "h-auto justify-start gap-2.5 rounded-xl p-3 text-left font-normal whitespace-normal",
                    active
                      ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500/30 hover:bg-blue-50/60"
                      : "border-gray-200 hover:border-gray-300",
                  )}
                >
                  <Icon
                    className={cn("size-4 shrink-0", active ? "text-blue-600" : "text-gray-400")}
                    strokeWidth={2}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-gray-800">{o.label}</span>
                    <span className="block truncate text-[11px] text-gray-400">{o.hint}</span>
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* 효과별 값 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {effectType === "CREDIT_GRANT" && (
            <>
              <AdminField label="지급 크레딧 *">
                <Input
                  type="number"
                  min={1}
                  value={grantCredits}
                  onChange={(e) => setGrantCredits(e.target.value)}
                  placeholder="예: 100"
                  className="text-[13px]"
                />
              </AdminField>
              <AdminField label="크레딧 유효 보장일 (선택)">
                <Input
                  type="date"
                  value={grantExpiryAt}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setGrantExpiryAt(e.target.value)}
                  className="text-[13px]"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                  등록한 학원의 <b className="font-semibold text-gray-500">전체 크레딧</b>을 이
                  날짜까지 쓸 수 있게 보장합니다(단일 소멸일 모델). 이미 더 늦은
                  소멸일이 있으면 그대로 두고 앞당기지 않으며,{" "}
                  <b className="font-semibold text-gray-500">비우면 소멸일을 바꾸지 않습니다</b>.
                </p>
              </AdminField>
            </>
          )}
          {effectType === "DISCOUNT_AMOUNT" && (
            <AdminField label="할인 금액(원, 100원 단위) *">
              <Input
                type="number"
                min={100}
                step={100}
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="예: 5000"
                className="text-[13px]"
              />
            </AdminField>
          )}
          {effectType === "DISCOUNT_PERCENT" && (
            <AdminField label="할인율(%, 1~100) *">
              <Input
                type="number"
                min={1}
                max={100}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                placeholder="예: 10"
                className="text-[13px]"
              />
            </AdminField>
          )}
        </div>

        {/* 공통 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AdminField label="발급 라벨(관리자용) *">
            <Input
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="예: 신규가입 쿠폰 2026.07.07"
              className="text-[13px]"
            />
          </AdminField>
          <AdminField label="쿠폰명(인쇄 카드) *">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 스모트 웰컴 쿠폰"
              className="text-[13px]"
            />
          </AdminField>
          <AdminField label="설명(선택)" className="sm:col-span-2">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="인쇄 카드 하단 안내 문구"
              className="text-[13px]"
            />
          </AdminField>
          <AdminField label="발급 장수 (1~500) *">
            <Input
              type="number"
              min={1}
              max={500}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="text-[13px]"
            />
          </AdminField>
          <AdminField label="학원당 등록 한도">
            <Input
              type="number"
              min={1}
              value={perAcademyLimit}
              onChange={(e) => setPerAcademyLimit(e.target.value)}
              className="text-[13px]"
            />
          </AdminField>
          <AdminField label="등록 마감일(선택) — 비우면 무기한" className="sm:col-span-2">
            <Input
              type="datetime-local"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="text-[13px]"
            />
          </AdminField>
        </div>
      </div>
    </AdminDialog>
  );
}
