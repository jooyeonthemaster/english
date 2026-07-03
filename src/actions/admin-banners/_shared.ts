// Shared types/validation/helpers for admin-banners server actions.

import { z } from "zod";
import {
  ALL_AUDIENCES,
  BANNER_TEMPLATES,
  DISMISS_MODES,
} from "@/lib/site-banners/templates";

export type ActionFail = { success: false; error: string };
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ActionResult<T extends object = {}> =
  | ({ success: true } & T)
  | ActionFail;

export function fail(error: string): ActionFail {
  return { success: false, error };
}

const templateKeys = BANNER_TEMPLATES.map((t) => t.key) as [string, ...string[]];
const dismissModes = DISMISS_MODES.map((d) => d.value) as [string, ...string[]];

/** Admin editor payload — validated before create/update. */
export const bannerInputSchema = z
  .object({
    title: z.string().trim().min(1, "제목을 입력하세요").max(120),
    type: z.enum(["TEMPLATE", "IMAGE"]),
    templateKey: z.enum(templateKeys).nullish(),
    content: z.record(z.string(), z.string()).default({}),
    imageUrl: z.string().trim().url("올바른 이미지 URL이 아닙니다").nullish(),
    imageAlt: z.string().trim().max(200).nullish(),
    linkUrl: z.string().trim().url("올바른 링크 URL이 아닙니다").nullish().or(z.literal("")),
    audiences: z.array(z.enum(["DIRECTOR", "TEACHER", "STUDENT"])).min(1, "노출 대상을 1개 이상 선택하세요"),
    priority: z.number().int().min(0).max(9999).default(0),
    isActive: z.boolean().default(false),
    dismissMode: z.enum(dismissModes),
    showDismissButton: z.boolean().default(true),
    startsAt: z.string().datetime().nullish().or(z.literal("")),
    endsAt: z.string().datetime().nullish().or(z.literal("")),
    autoOpenOnLowCredit: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.type === "TEMPLATE" && !val.templateKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "템플릿을 선택하세요", path: ["templateKey"] });
    }
    if (val.type === "IMAGE" && !val.imageUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "이미지를 업로드하세요", path: ["imageUrl"] });
    }
  });

export type BannerInput = z.infer<typeof bannerInputSchema>;

export function toNullableDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export { ALL_AUDIENCES };
