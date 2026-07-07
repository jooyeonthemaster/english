// 스모트 소식(플랫폼 공지) 어드민 액션 공용 타입/검증/헬퍼.

import { z } from "zod";
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_STATUSES,
} from "@/lib/announcements/shared";

export type ActionFail = { success: false; error: string };
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ActionResult<T extends object = {}> =
  | ({ success: true } & T)
  | ActionFail;

export function fail(error: string): ActionFail {
  return { success: false, error };
}

const categories = ANNOUNCEMENT_CATEGORIES as [string, ...string[]];
const statuses = ANNOUNCEMENT_STATUSES as [string, ...string[]];

/** 어드민 편집기 payload — create/update 전 검증. */
export const announcementInputSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력하세요").max(200),
  content: z.string().trim().min(1, "본문을 입력하세요"),
  category: z.enum(categories),
  status: z.enum(statuses),
  isPinned: z.boolean().default(false),
  // 빈 배열 = 전체 노출(serializeAnnouncementAudiences 가 "ALL" 로 저장).
  audiences: z
    .array(z.enum(["DIRECTOR", "TEACHER", "STUDENT", "PARENT"]))
    .default([]),
  // 클라이언트가 datetimeLocalToIso 로 변환해 보낸 ISO 문자열(소급 과거 허용).
  publishedAt: z.string().datetime().nullish().or(z.literal("")),
});

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export function toNullableDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
