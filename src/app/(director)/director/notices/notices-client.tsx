"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Inbox,
  ListFilter,
  Pin,
  Search,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { markStaffAnnouncementsRead } from "@/actions/platform-announcements";
import type { AnnouncementListItem } from "@/lib/announcements/server";
import {
  ANNOUNCEMENT_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_BADGE_CLASS,
  type AnnouncementCategory,
} from "@/lib/announcements/shared";
import { AnnouncementBody } from "@/components/announcements/announcement-body";
import { APP_VERSION_LABEL } from "@/lib/app-version";

/** 본문 첫 줄을 마크다운 기호 없이 미리보기 문구로. */
function previewOf(content: string): string {
  for (const raw of content.split("\n")) {
    const line = raw
      .replace(/^\s*[-*•]\s+/, "")
      .replace(/^#{1,6}\s+/, "")
      .replace(/\*\*/g, "")
      .trim();
    if (line) return line;
  }
  return "";
}

const CATEGORY_FILTERS: { value: "ALL" | AnnouncementCategory; label: string }[] = [
  { value: "ALL", label: "전체 분류" },
  ...ANNOUNCEMENT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
];

export default function NoticesClient({
  initialAnnouncements,
  buildRef,
}: {
  initialAnnouncements: AnnouncementListItem[];
  buildRef?: string | null;
}) {
  const [announcements] = useState(initialAnnouncements);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [category, setCategory] = useState<"ALL" | AnnouncementCategory>("ALL");
  const [search, setSearch] = useState("");

  // 진입하면 "마지막 확인 시각"을 갱신해 사이드바 새 소식 배지를 지운다.
  useEffect(() => {
    void markStaffAnnouncementsRead().catch(() => {});
  }, []);

  const filtersActive = category !== "ALL";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return announcements.filter((a) => {
      if (category !== "ALL" && a.category !== category) return false;
      if (q && !`${a.title} ${a.content}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [announcements, category, search]);

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">스모트 소식</h1>
          <p className="text-muted-foreground text-sm mt-1">
            스모트의 새로운 기능과 업데이트 소식을 여기에서 모아 보실 수 있어요.
          </p>
        </div>
      </div>

      {/* Toolbar: 필터 · 검색 */}
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
        {/* 필터 popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="필터"
              aria-label="필터"
              className={cn(
                "relative flex size-7 shrink-0 items-center justify-center rounded-md border bg-white shadow-sm transition-colors hover:bg-slate-50",
                filtersActive
                  ? "border-blue-300 text-blue-600"
                  : "border-slate-200 text-slate-600 hover:text-slate-800",
              )}
            >
              <ListFilter className="size-3.5 shrink-0" />
              {filtersActive && (
                <span className="absolute -right-1 -top-1 size-2 rounded-full bg-blue-500 ring-2 ring-white" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3 p-3">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-400">분류</p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_FILTERS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center justify-center rounded-md border px-2.5 text-[11px] font-semibold shadow-sm transition-colors",
                      category === c.value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* 검색 popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="검색"
              aria-label="검색"
              className={cn(
                "relative flex size-7 shrink-0 items-center justify-center rounded-md border bg-white shadow-sm transition-colors hover:bg-slate-50",
                search
                  ? "border-blue-300 text-blue-600"
                  : "border-slate-200 text-slate-600 hover:text-slate-800",
              )}
            >
              <Search className="size-3.5 shrink-0" />
              {search && (
                <span className="absolute -right-1 -top-1 size-2 rounded-full bg-blue-500 ring-2 ring-white" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="소식 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Inbox className="size-12 mx-auto mb-3 opacity-30" />
            <p>{announcements.length === 0 ? "아직 등록된 소식이 없어요" : "조건에 맞는 소식이 없어요"}</p>
          </div>
        )}

        {filtered.map((a) => {
          const expanded = expandedId === a.id;
          const cat = a.category as AnnouncementCategory;
          return (
            <div
              key={a.id}
              className={cn(
                "rounded-xl border transition-colors",
                expanded
                  ? "border-blue-300 bg-slate-50/60"
                  : "border-slate-200 hover:border-blue-300 hover:bg-slate-50/60",
              )}
            >
              <button
                onClick={() => setExpandedId(expanded ? null : a.id)}
                className="flex w-full items-start gap-3 p-4 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    {a.isPinned && (
                      <Pin className="size-3.5 shrink-0 fill-amber-500 text-amber-500" />
                    )}
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                        CATEGORY_BADGE_CLASS[cat] ?? "bg-slate-100 text-slate-600",
                      )}
                    >
                      {CATEGORY_LABELS[cat] ?? a.category}
                    </span>
                    {a.isNew && (
                      <span className="rounded bg-red-50 px-1.5 py-px text-[10px] font-bold text-red-500">
                        NEW
                      </span>
                    )}
                    <h3 className="truncate text-sm font-semibold">{a.title}</h3>
                  </div>

                  {!expanded && previewOf(a.content) && (
                    <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">
                      {previewOf(a.content)}
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDateTime(a.publishedAt)}</span>
                  </div>
                </div>

                {expanded ? (
                  <ChevronUp className="mt-0.5 size-4 shrink-0 text-slate-400" />
                ) : (
                  <ChevronDown className="mt-0.5 size-4 shrink-0 text-slate-400" />
                )}
              </button>

              {expanded && (
                <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                  <AnnouncementBody
                    content={a.content}
                    className="text-[13.5px] text-slate-600"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-slate-300">
        스모트 {APP_VERSION_LABEL}
        {buildRef ? ` · ${buildRef}` : ""}
      </p>
    </div>
  );
}
