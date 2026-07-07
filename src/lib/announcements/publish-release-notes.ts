/**
 * release-notes/ 의 릴리즈 노트를 플랫폼 공지로 자동 발행한다(배포 시 instrumentation
 * 에서 호출). releaseSlug 유니크 제약으로 멱등 — 이미 발행된 slug 는 건드리지 않아
 * 콜드스타트마다 실행돼도 중복 발행이 없고, 운영자가 어드민에서 고친 내용도 덮어쓰지
 * 않는다(신규 파일만 새로 발행).
 *
 * 서버 전용.
 */

import { prisma } from "@/lib/prisma";
import { readReleaseNotes } from "@/lib/release-notes";

export interface PublishReleaseNotesResult {
  scanned: number;
  created: number;
  createdSlugs: string[];
}

export async function publishReleaseNotes(): Promise<PublishReleaseNotesResult> {
  const notes = await readReleaseNotes();
  const createdSlugs: string[] = [];

  for (const note of notes) {
    // 이미 존재하면 건너뜀(멱등). 존재 여부를 먼저 확인해 "새로 만든 것"만 집계한다.
    const existing = await prisma.platformAnnouncement.findUnique({
      where: { releaseSlug: note.slug },
      select: { id: true },
    });
    if (existing) continue;

    try {
      await prisma.platformAnnouncement.create({
        data: {
          title: note.title,
          content: note.content,
          category: note.category,
          status: "PUBLISHED",
          publishedAt: note.publishedAt,
          isPinned: note.pinned,
          audiences: note.audiences,
          sourceType: "RELEASE",
          releaseSlug: note.slug,
        },
      });
      createdSlugs.push(note.slug);
    } catch {
      // 동시 콜드스타트 경합으로 유니크 충돌 시 무시(다른 인스턴스가 이미 생성).
    }
  }

  return { scanned: notes.length, created: createdSlugs.length, createdSlugs };
}
