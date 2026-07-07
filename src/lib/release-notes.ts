/**
 * release-notes/ 디렉터리(프로젝트 루트)에 커밋된 릴리즈 노트 마크다운을 읽어
 * 파싱한다. 배포 시 instrumentation 이 이 결과를 플랫폼 공지로 자동 발행한다.
 *
 * 서버 전용(fs 사용). 외부 마크다운/YAML 라이브러리 없이 최소 프론트매터만 파싱한다.
 *
 * 파일 규약: release-notes/YYYY-MM-DD-slug.md
 *   ---
 *   slug: 2026-05-08-first-launch      # 자동 발행 멱등성 키(고유). 생략 시 파일명.
 *   title: 사진만 올리면 지문이 정리돼요
 *   category: UPDATE                   # UPDATE | MAINTENANCE | EVENT | GENERAL
 *   audiences: ALL                     # ALL 또는 DIRECTOR,TEACHER,STUDENT,PARENT
 *   publishedAt: 2026-05-08T09:00:00+09:00
 *   pinned: false
 *   ---
 *   (본문 마크다운)
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ANNOUNCEMENT_CATEGORIES,
  parseAnnouncementAudiences,
  serializeAnnouncementAudiences,
  type AnnouncementCategory,
} from "@/lib/announcements/shared";

export interface ParsedReleaseNote {
  slug: string;
  title: string;
  category: AnnouncementCategory;
  /** 저장용 audiences 컬럼 값("ALL" 또는 콤마 조인). */
  audiences: string;
  publishedAt: Date;
  pinned: boolean;
  content: string;
}

const RELEASE_NOTES_DIR = path.join(process.cwd(), "release-notes");

/** 최소 프론트매터 파서 — 첫 `---` 블록의 `key: value` 라인만 읽는다. */
function parseFrontmatter(raw: string): {
  data: Record<string, string>;
  body: string;
} {
  const normalized = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: normalized.trim() };

  const data: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // 따옴표 제거
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }
  return { data, body: match[2].trim() };
}

function coerceCategory(v: string | undefined): AnnouncementCategory {
  const up = (v ?? "").toUpperCase();
  return (ANNOUNCEMENT_CATEGORIES as string[]).includes(up)
    ? (up as AnnouncementCategory)
    : "GENERAL";
}

/** "YYYY-MM-DD-slug.md" 파일명에서 날짜를 뽑아 KST 09:00 기준 Date 로. */
function dateFromFilename(filename: string): Date {
  const m = filename.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(0);
  // KST(+09:00) 09시로 고정 — 프로덕션(UTC)에서도 게시일이 밀리지 않도록.
  return new Date(`${m[1]}-${m[2]}-${m[3]}T09:00:00+09:00`);
}

function parseOne(filename: string, raw: string): ParsedReleaseNote | null {
  const { data, body } = parseFrontmatter(raw);
  const title = data.title?.trim();
  if (!title) return null; // 제목 없는 파일은 건너뜀

  const slug = (data.slug?.trim() || filename.replace(/\.md$/i, "")).trim();
  const publishedAt = data.publishedAt
    ? new Date(data.publishedAt)
    : dateFromFilename(filename);

  return {
    slug,
    title,
    category: coerceCategory(data.category),
    audiences: serializeAnnouncementAudiences(
      parseAnnouncementAudiences(data.audiences),
    ),
    publishedAt: Number.isNaN(publishedAt.getTime())
      ? dateFromFilename(filename)
      : publishedAt,
    pinned: /^(true|1|yes)$/i.test(data.pinned ?? ""),
    content: body,
  };
}

/** release-notes/ 의 모든 .md(README 제외)를 파싱해 반환. 디렉터리 없으면 빈 배열. */
export async function readReleaseNotes(): Promise<ParsedReleaseNote[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(RELEASE_NOTES_DIR);
  } catch {
    return [];
  }
  const files = entries
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .filter((f) => f.toLowerCase() !== "readme.md")
    .sort();

  const notes: ParsedReleaseNote[] = [];
  for (const filename of files) {
    try {
      const raw = await fs.readFile(path.join(RELEASE_NOTES_DIR, filename), "utf8");
      const parsed = parseOne(filename, raw);
      if (parsed) notes.push(parsed);
    } catch {
      // 개별 파일 오류는 무시하고 계속(자동 발행이 통째로 실패하지 않게).
    }
  }
  return notes;
}
