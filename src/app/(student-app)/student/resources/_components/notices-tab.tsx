"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pin, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentNotices, markNoticeAsRead } from "@/actions/student-app";

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
          <div key={i} className="h-16 bg-[var(--erp-border-light)] rounded-[var(--radius-md)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (notices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--erp-text-muted)]">
        <p className="text-[var(--fs-sm)]">공지사항이 없습니다</p>
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
              "rounded-[var(--radius-md)] border bg-[var(--erp-surface)] transition-colors",
              notice.isRead ? "border-[var(--erp-border-light)]" : "border-[var(--erp-primary)]/30 bg-[var(--erp-primary-subtle)]",
            )}
          >
            <button
              onClick={() => toggleExpand(notice)}
              className="w-full flex items-center gap-2 p-3 text-left"
            >
              {notice.isPinned && (
                <Pin size={13} className="text-[var(--erp-error)] shrink-0" />
              )}
              {!notice.isRead && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--erp-primary)] shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-[var(--fs-sm)] truncate",
                  notice.isRead ? "text-[var(--erp-text-secondary)]" : "text-[var(--erp-text)] font-semibold",
                )}>
                  {notice.title}
                </p>
                <p className="text-[var(--fs-caption)] text-[var(--erp-text-muted)] mt-0.5">
                  {new Date(notice.publishedAt).toLocaleDateString("ko-KR")}
                </p>
              </div>
              {isExpanded ? (
                <ChevronUp size={16} className="text-[var(--erp-text-muted)] shrink-0" />
              ) : (
                <ChevronDown size={16} className="text-[var(--erp-text-muted)] shrink-0" />
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
                  <div className="px-3 pb-3 pt-0 border-t border-[var(--erp-border-light)]">
                    <p className="text-[var(--fs-xs)] text-[var(--erp-text-secondary)] whitespace-pre-wrap pt-2 leading-relaxed">
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
