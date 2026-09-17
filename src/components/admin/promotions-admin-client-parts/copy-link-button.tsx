"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 클립보드 복사 버튼(복사됨 피드백 포함). 행 클릭으로 번지지 않게 stopPropagation. */
export function CopyLinkButton({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard 미지원 무시 */
        }
      }}
      className="text-[11px] text-gray-600"
    >
      {copied ? (
        <Check className="size-3 text-emerald-600" strokeWidth={2.4} />
      ) : (
        <Copy className="size-3" strokeWidth={2} />
      )}
      {copied ? "복사됨" : label ?? "복사"}
    </Button>
  );
}
