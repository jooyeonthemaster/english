"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Megaphone, Pin } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import {
  markStaffAnnouncementsRead,
  type AnnouncementListItem,
} from "@/actions/platform-announcements";
import {
  CATEGORY_LABELS,
  CATEGORY_BADGE_CLASS,
  type AnnouncementCategory,
} from "@/lib/announcements/shared";
import { AnnouncementBody } from "@/components/announcements/announcement-body";
import { APP_VERSION_LABEL } from "@/lib/app-version";

export default function NoticesClient({
  initialAnnouncements,
  buildRef,
}: {
  initialAnnouncements: AnnouncementListItem[];
  buildRef?: string | null;
}) {
  const [announcements] = useState(initialAnnouncements);
  const [expandedId, setExpandedId] = useState<string | null>(
    // 첫 글은 기본으로 펼쳐 보여준다.
    initialAnnouncements[0]?.id ?? null,
  );

  // 진입하면 "마지막 확인 시각"을 갱신해 사이드바 새 소식 배지를 지운다.
  useEffect(() => {
    void markStaffAnnouncementsRead().catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">스모트 소식</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          스모트의 새로운 기능과 업데이트 소식을 여기에서 모아 보실 수 있어요.
        </p>
      </div>

      {announcements.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
          <Megaphone className="size-12 opacity-30" />
          <p className="text-sm">아직 등록된 소식이 없어요</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {announcements.map((a) => {
            const expanded = expandedId === a.id;
            const cat = a.category as AnnouncementCategory;
            return (
              <div
                key={a.id}
                className={cn(
                  "overflow-hidden rounded-2xl border bg-white transition-colors",
                  expanded ? "border-slate-200" : "border-slate-100",
                )}
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : a.id)}
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      {a.isPinned && (
                        <Pin className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
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
                        <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-500">
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[15px] font-semibold text-slate-900">
                      {a.title}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-400">
                      {formatDateTime(a.publishedAt)}
                    </p>
                  </div>
                  {expanded ? (
                    <ChevronUp className="mt-1 size-4 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown className="mt-1 size-4 shrink-0 text-slate-400" />
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
      )}

      <p className="pt-2 text-center text-[11px] text-slate-300">
        스모트 {APP_VERSION_LABEL}
        {buildRef ? ` · ${buildRef}` : ""}
      </p>
    </div>
  );
}
