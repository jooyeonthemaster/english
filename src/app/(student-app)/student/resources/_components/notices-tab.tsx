"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pin, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getStudentAnnouncements,
  markStudentAnnouncementsRead,
  type AnnouncementListItem,
} from "@/actions/platform-announcements";
import {
  CATEGORY_LABELS,
  type AnnouncementCategory,
} from "@/lib/announcements/shared";
import { AnnouncementBody } from "@/components/announcements/announcement-body";

export function NoticesTab() {
  const [notices, setNotices] = useState<AnnouncementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getStudentAnnouncements()
      .then((list) => {
        setNotices(list);
        // 목록을 본 시점에 "마지막 확인 시각"을 갱신해 새 소식 표시를 지운다.
        void markStudentAnnouncementsRead().catch(() => {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (notices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <p className="text-[var(--fs-base)]">새로운 소식이 없어요</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notices.map((notice) => {
        const isExpanded = expandedId === notice.id;
        const cat = notice.category as AnnouncementCategory;
        return (
          <div
            key={notice.id}
            className={cn(
              "rounded-2xl border bg-white transition-colors",
              notice.isNew ? "border-gray-300 bg-gray-50" : "border-gray-100",
            )}
          >
            <button
              onClick={() => toggleExpand(notice.id)}
              className="w-full flex items-center gap-2 p-3 text-left"
            >
              {notice.isPinned && (
                <Pin size={13} className="text-red-500 shrink-0" />
              )}
              {notice.isNew && (
                <span className="w-1.5 h-1.5 rounded-full bg-black shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-[var(--fs-base)] truncate",
                    notice.isNew
                      ? "text-gray-900 font-semibold"
                      : "text-gray-500",
                  )}
                >
                  {notice.title}
                </p>
                <p className="text-[var(--fs-caption)] text-gray-500 mt-0.5">
                  {CATEGORY_LABELS[cat] ?? notice.category} ·{" "}
                  {new Date(notice.publishedAt).toLocaleDateString("ko-KR")}
                </p>
              </div>
              {isExpanded ? (
                <ChevronUp size={16} className="text-gray-400 shrink-0" />
              ) : (
                <ChevronDown size={16} className="text-gray-400 shrink-0" />
              )}
            </button>
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 pt-0 border-t border-gray-100">
                    <AnnouncementBody
                      content={notice.content}
                      className="text-[var(--fs-xs)] text-gray-500 pt-2"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
