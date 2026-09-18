import {
  getTemplate,
  withTemplateDefaults,
  type BannerAudience,
  type BannerDismissMode,
  type BannerType,
} from "@/lib/site-banners/templates";
import type { AdminBannerDto } from "@/actions/admin-banners";

// 앱 배너 편집기의 초안(Draft) 모델과 DTO·프리필 → 초안 변환.

export interface BannerDraft {
  title: string;
  type: BannerType;
  templateKey: string;
  content: Record<string, string>;
  imageUrl: string;
  imageAlt: string;
  linkUrl: string;
  audiences: BannerAudience[];
  priority: number;
  isActive: boolean;
  dismissMode: BannerDismissMode;
  showDismissButton: boolean;
  targetMode: "ALL" | "SPECIFIC";
  targetAcademyIds: string[];
  startsAt: string;
  endsAt: string;
  autoOpenOnLowCredit: boolean;
}

// ── ISO ↔ datetime-local input ─────────────────────────────────────────────
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function localInputToIso(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function draftFromDto(dto: AdminBannerDto | null): BannerDraft {
  if (!dto) {
    return {
      title: "",
      type: "TEMPLATE",
      templateKey: "announcement",
      content: { ...(getTemplate("announcement")?.defaultContent ?? {}) },
      imageUrl: "",
      imageAlt: "",
      linkUrl: "",
      audiences: ["DIRECTOR"],
      priority: 0,
      isActive: false,
      dismissMode: "DAILY",
      showDismissButton: true,
      targetMode: "ALL",
      targetAcademyIds: [],
      startsAt: "",
      endsAt: "",
      autoOpenOnLowCredit: false,
    };
  }
  return {
    title: dto.title,
    type: dto.type,
    templateKey: dto.templateKey ?? "announcement",
    content: withTemplateDefaults(dto.templateKey, dto.content),
    imageUrl: dto.imageUrl ?? "",
    imageAlt: dto.imageAlt ?? "",
    linkUrl: dto.linkUrl ?? "",
    audiences: dto.audiences.length ? dto.audiences : ["DIRECTOR"],
    priority: dto.priority,
    isActive: dto.isActive,
    dismissMode: dto.dismissMode,
    showDismissButton: dto.showDismissButton,
    targetMode: dto.targetMode,
    targetAcademyIds: dto.targetAcademyIds,
    startsAt: isoToLocalInput(dto.startsAt),
    endsAt: isoToLocalInput(dto.endsAt),
    autoOpenOnLowCredit: dto.autoOpenOnLowCredit,
  };
}

/** 공지 → 배너 원클릭 프리필 payload(announcement 템플릿 필드에 매핑). */
export interface BannerPrefill {
  title?: string;
  eyebrow?: string;
  heading?: string;
  body?: string;
  linkUrl?: string;
  audiences?: BannerAudience[];
}

export function draftFromPrefill(prefill: BannerPrefill): BannerDraft {
  const base = draftFromDto(null);
  return {
    ...base,
    title: prefill.title ?? base.title,
    linkUrl: prefill.linkUrl ?? base.linkUrl,
    audiences: prefill.audiences?.length ? prefill.audiences : base.audiences,
    content: {
      ...base.content,
      ...(prefill.eyebrow !== undefined ? { eyebrow: prefill.eyebrow } : {}),
      ...(prefill.heading !== undefined ? { heading: prefill.heading } : {}),
      ...(prefill.body !== undefined ? { body: prefill.body } : {}),
    },
  };
}
