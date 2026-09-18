import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import {
  categoryLabel,
  SOURCE_TYPE_LABELS,
  statusLabel,
  type AnnouncementSourceType,
} from "@/lib/announcements/shared";
import type { AdminAnnouncementDto } from "@/actions/admin-announcements/dto";
import { formatDateTime } from "@/lib/utils";

// 공지 관리 목록 행 → 호버 상세. 목록에 이미 실려 온 값만 쓴다(추가 조회 없음).

const PREVIEW_MAX = 400;

/** 마크다운 기호를 걷어내고 앞부분만 남긴 본문 미리보기. */
function contentPreview(content: string): string | null {
  const plain = content
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*[-*•]\s+/, "· ")
        .replace(/^#{1,6}\s+/, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\*\*|__|`/g, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
  if (!plain) return null;
  return plain.length > PREVIEW_MAX ? `${plain.slice(0, PREVIEW_MAX)}…` : plain;
}

export function announcementRowDetail(
  a: AdminAnnouncementDto,
  labels: { visibility: string; audience: string },
): AdminDetail {
  return {
    title: a.title,
    subtitle: `${categoryLabel(a.category)} · ${labels.visibility}`,
    fields: detailFields([
      ["본문 미리보기", contentPreview(a.content), true],
      ["노출", labels.visibility],
      ["상태", statusLabel(a.status)],
      ["대상", labels.audience],
      ["작성 방식", SOURCE_TYPE_LABELS[a.sourceType as AnnouncementSourceType] ?? a.sourceType],
      ["릴리스 슬러그", a.releaseSlug],
      ["상단 고정", a.isPinned && "고정됨"],
      ["게시일", a.publishedAt ? formatDateTime(a.publishedAt) : "미정"],
      ["작성", formatDateTime(a.createdAt)],
      ["최근 수정", formatDateTime(a.updatedAt)],
    ]),
  };
}
