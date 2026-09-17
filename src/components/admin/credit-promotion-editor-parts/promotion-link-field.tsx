"use client";

// 프로모션 공유 링크 — 생성 / 복사 / 제거. 저장된 프로모션(promotionId)에서만 동작.

import { useState, useTransition } from "react";
import { Check, Copy, Link2, Loader2 } from "lucide-react";
import {
  clearCreditPromotionLink,
  generateCreditPromotionLink,
} from "@/actions/admin/credit-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PromotionLinkField({
  promotionId,
  linkToken,
  onLinkTokenChange,
  origin,
}: {
  promotionId: string | null;
  linkToken: string | null;
  onLinkTokenChange: (token: string | null) => void;
  origin: string;
}) {
  const [linkPending, startLinkTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const linkUrl = linkToken ? `${origin}/credits/promo/${linkToken}` : "";

  function genLink() {
    if (!promotionId || linkPending) return;
    startLinkTransition(async () => {
      const res = await generateCreditPromotionLink(promotionId);
      if (res.success && res.token) onLinkTokenChange(res.token);
    });
  }
  function clearLink() {
    if (!promotionId || linkPending) return;
    startLinkTransition(async () => {
      const res = await clearCreditPromotionLink(promotionId);
      if (res.success) onLinkTokenChange(null);
    });
  }
  async function copyLink() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 미지원 무시 */
    }
  }

  if (!promotionId) {
    return (
      <p className="text-[11px] text-gray-400">
        공유 링크는 프로모션을 저장한 뒤 생성할 수 있어요.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500">
        <Link2 className="size-3.5" strokeWidth={2} />
        프로모션 링크
      </span>
      {linkToken ? (
        <div className="flex items-center gap-1.5">
          <Input
            readOnly
            value={linkUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 text-[12px] text-gray-600"
            aria-label="프로모션 링크"
          />
          <Button type="button" variant="outline" size="sm" onClick={copyLink}>
            {copied ? (
              <Check className="size-3.5 text-emerald-600" strokeWidth={2.4} />
            ) : (
              <Copy className="size-3.5" strokeWidth={2} />
            )}
            {copied ? "복사됨" : "복사"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearLink}
            disabled={linkPending}
            className="text-gray-500 hover:text-rose-600"
          >
            {linkPending ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
            ) : (
              "제거"
            )}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={genLink}
          disabled={linkPending}
          className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700"
        >
          {linkPending ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <Link2 className="size-3.5" strokeWidth={2} />
          )}
          링크 생성
        </Button>
      )}
    </div>
  );
}
