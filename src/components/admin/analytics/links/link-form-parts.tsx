"use client";

// 추적 링크 폼·UTM 빌더 공용 조각 — 입력 필드, 프리셋 칩, 예상 분류, URL 미리보기 줄.

import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import { classifyAttribution } from "@/lib/analytics/classify";
import { CHANNEL_COLORS, channelLabel, isChannel, sourceLabel } from "@/lib/analytics/channels";
import { LINK_PRESETS, type LinkPreset } from "@/lib/analytics/tracked-links";
import { cn } from "@/lib/utils";
import { copyText } from "./link-api";

export const INPUT_CLASS =
  "h-9 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-800 outline-none transition-colors placeholder:text-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400 aria-invalid:border-rose-300";

export function FormField({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <label htmlFor={htmlFor} className="block text-[12px] font-semibold text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[11.5px] text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-[11.5px] text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

export interface UtmDraft {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
}

/** 현재 값과 일치하는 프리셋 key */
export function matchPreset(d: Pick<UtmDraft, "utmSource" | "utmMedium" | "utmContent">): string | null {
  const src = d.utmSource.trim().toLowerCase();
  const med = d.utmMedium.trim().toLowerCase();
  const content = d.utmContent.trim();
  const hit = LINK_PRESETS.find(
    (p) => p.utmSource === src && p.utmMedium === med && (p.utmContent ? p.utmContent === content : true),
  );
  return hit?.key ?? null;
}

/** 프리셋 적용 — 소스·매체 채움, 콘텐츠는 프리셋 값이 있으면 채우고 이전 프리셋 콘텐츠면 비운다. */
export function applyPreset<T extends UtmDraft>(draft: T, preset: LinkPreset): T {
  const presetContents = new Set(LINK_PRESETS.map((p) => p.utmContent).filter(Boolean));
  const content = preset.utmContent ?? (presetContents.has(draft.utmContent.trim()) ? "" : draft.utmContent);
  return { ...draft, utmSource: preset.utmSource, utmMedium: preset.utmMedium, utmContent: content };
}

export function PresetChips({ activeKey, onPick }: { activeKey: string | null; onPick: (preset: LinkPreset) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LINK_PRESETS.map((p) => {
        const active = p.key === activeKey;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onPick(p)}
            aria-pressed={active}
            title={`utm_source=${p.utmSource} · utm_medium=${p.utmMedium}${p.utmContent ? ` · utm_content=${p.utmContent}` : ""}`}
            className={cn(
              "h-7 rounded-full border px-2.5 text-[12px] font-semibold transition-colors",
              active
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700",
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

/** 이 UTM 으로 들어온 방문이 대시보드에서 어떤 채널·소스로 잡히는지(분류기 그대로 실행). */
export function ClassificationHint({ utm }: { utm: UtmDraft }) {
  const source = utm.utmSource.trim();
  const medium = utm.utmMedium.trim();
  if (!source && !medium) return null;
  const query: Record<string, string> = {};
  if (source) query.utm_source = source;
  if (medium) query.utm_medium = medium;
  if (utm.utmCampaign.trim()) query.utm_campaign = utm.utmCampaign.trim();
  const a = classifyAttribution({ referrerHost: null, query, inApp: null });
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-gray-500">
      <span className="text-gray-400">대시보드 분류</span>
      <span className="inline-flex items-center gap-1 font-semibold text-gray-700">
        <span
          className="size-2 rounded-full"
          style={{ background: isChannel(a.channel) ? CHANNEL_COLORS[a.channel] : "#94a3b8" }}
          aria-hidden
        />
        {channelLabel(a.channel)}
      </span>
      <span className="text-gray-300">·</span>
      <span className="font-medium text-gray-600">{sourceLabel(a.source)}</span>
    </p>
  );
}

export function UrlLine({
  label,
  url,
  copyMessage,
  muted,
  disabled,
  hint,
}: {
  label: string;
  url: string;
  copyMessage: string;
  muted?: boolean;
  /** 아직 완성되지 않은 미리보기 — 흐리게 + 복사 막기(플레이스홀더가 박힌 죽은 주소 복사 방지) */
  disabled?: boolean;
  /** disabled 일 때 주소 대신 보여 줄 안내 */
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-16 shrink-0 text-[11.5px] font-semibold text-gray-400">{label}</span>
      <code
        className={cn(
          "min-w-0 flex-1 truncate rounded-md bg-white px-2 py-1 font-mono text-[12px]",
          disabled ? "text-gray-300" : muted ? "text-gray-500" : "text-blue-700",
        )}
        title={disabled ? hint ?? url : url}
      >
        {disabled && hint ? hint : url}
      </code>
      <CopyIconButton text={url} message={copyMessage} disabled={disabled} />
    </div>
  );
}

export function CopyIconButton({
  text,
  message,
  className,
  disabled,
}: {
  text: string;
  message: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        void copyText(text, message);
      }}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-gray-400",
        className,
      )}
      aria-label={message.replace(/했습니다$/, "")}
      title={disabled ? "아직 복사할 수 없습니다" : "복사"}
    >
      <Copy className="size-3.5" aria-hidden />
    </button>
  );
}
