// 어드민 공지 DTO 타입 + 직렬화기 — "use server" 가 아닌 순수 모듈(동기 함수 export
// 가능). 서버 액션(get-announcements)과 자동 발행(instrumentation)이 공유한다.

export interface AdminAnnouncementDto {
  id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  publishedAt: string | null; // ISO
  isPinned: boolean;
  audiences: string; // "ALL" 또는 콤마 조인
  sourceType: string; // "MANUAL" | "RELEASE"
  releaseSlug: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export function serializeAnnouncement(row: {
  id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  publishedAt: Date | null;
  isPinned: boolean;
  audiences: string;
  sourceType: string;
  releaseSlug: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AdminAnnouncementDto {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    status: row.status,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    isPinned: row.isPinned,
    audiences: row.audiences,
    sourceType: row.sourceType,
    releaseSlug: row.releaseSlug,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
