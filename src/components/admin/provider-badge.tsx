import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";

type ProviderKey = "google" | "kakao" | "credentials" | "other";

interface ProviderBadgeProps {
  provider: string | null | undefined;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

function normalize(provider: string | null | undefined): ProviderKey {
  if (provider === "google") return "google";
  if (provider === "kakao") return "kakao";
  if (provider === "credentials") return "credentials";
  return "other";
}

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  google: "Google",
  kakao: "Kakao",
  credentials: "이메일",
  other: "기타",
};

export function ProviderBadge({
  provider,
  size = "md",
  showLabel = true,
  className,
}: ProviderBadgeProps) {
  const key = normalize(provider);
  const label = PROVIDER_LABELS[key];

  // Letter monograms are visual brand marks (non-text content per WCAG 1.4.4),
  // so we keep them at the size needed for the dot — the `aria-label` /
  // `title` carry the semantic value.
  const dotSize = size === "sm" ? "size-5 text-[11px]" : "size-6 text-[12px]";

  const baseDot =
    "inline-flex items-center justify-center rounded-md font-bold leading-none tracking-tighter shrink-0";

  if (!showLabel) {
    return (
      <span
        className={cn(
          baseDot,
          dotSize,
          key === "google" && "bg-blue-500 text-white",
          key === "kakao" && "bg-slate-800 text-white",
          key === "credentials" && "bg-slate-100 text-slate-600",
          key === "other" && "bg-slate-100 text-slate-500",
          className,
        )}
        aria-label={label}
        title={label}
      >
        {key === "google" ? (
          "G"
        ) : key === "kakao" ? (
          "K"
        ) : (
          <Mail className="size-3" strokeWidth={2} aria-hidden="true" />
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        key === "google" && "border-blue-200 bg-blue-50 text-blue-700",
        key === "kakao" && "border-slate-200 bg-slate-100 text-slate-800",
        key === "credentials" && "border-slate-200 bg-white text-slate-600",
        key === "other" && "border-slate-200 bg-white text-slate-600",
        className,
      )}
    >
      {/* Solid color dot — no letter inside, the label text supplies semantics */}
      <span
        className={cn(
          "size-2 rounded-full shrink-0",
          key === "google" && "bg-blue-500",
          key === "kakao" && "bg-slate-800",
          key === "credentials" && "bg-slate-300",
          key === "other" && "bg-slate-300",
        )}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
