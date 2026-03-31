"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pin, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentNotices, markNoticeAsRead } from "@/actions/student-app-resources";

type Notice = Awaited<ReturnType<typeof getStudentNotices>>[number];

export function NoticesTab() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getStudentNotices()
      .then(setNotices)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggleExpand(notice: Notice) {
    if (expandedId === notice.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(notice.id);
    if (!notice.isRead) {
      await markNoticeAsRead(notice.id).catch(() => {});
      setNotices((prev) =>
        prev.map((n) => (n.id === notice.id ? { ...n, isRead: true } : n)),
      );
    }
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
        <p className="text-sm">공지사항이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notices.map((notice) => {
        const isExpanded = expandedId === notice.id;
        return (
          <div
            key={notice.id}
            className={cn(
              "rounded-2xl border bg-white transition-colors",
              notice.isRead ? "border-gray-100" : "border-blue-500/30 bg-blue-50",
            )}
          >
            <button
              onClick={() => toggleExpand(notice)}
              className="w-full flex items-center gap-2 p-3 text-left"
            >
              {notice.isPinned && (
                <Pin size={13} className="text-red-500 shrink-0" />
              )}
              {!notice.isRead && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm truncate",
                  notice.isRead ? "text-gray-500" : "text-gray-900 font-semibold",
                )}>
                  {notice.title}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
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
                    <p className="text-xs text-gray-500 whitespace-pre-wrap pt-2 leading-relaxed">
                      {notice.content}
                    </p>
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
