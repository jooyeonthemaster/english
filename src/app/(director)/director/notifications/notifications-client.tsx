"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GrowthIcon } from "@/components/growth/growth-icon";
import { notifyNotificationsChanged } from "@/lib/growth/notifications-client";

interface NotificationItem {
  id: string;
  category: string;
  type: string;
  title: string;
  body: string | null;
  iconKey: string | null;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

const PAGE_SIZE = 30;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "방금";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function NotificationsClient() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const seenSentRef = useRef(false);

  const loadInitial = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications/list?limit=${PAGE_SIZE}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { notifications: NotificationItem[] };
        const list = data.notifications ?? [];
        setItems(list);
        setHasMore(list.length >= PAGE_SIZE);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  // Mark inbox seen on mount → clears the bell badge.
  useEffect(() => {
    if (seenSentRef.current) return;
    seenSentRef.current = true;
    void (async () => {
      try {
        await fetch("/api/notifications/seen", { method: "POST" });
        notifyNotificationsChanged();
      } catch {
        // silent
      }
    })();
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || items.length === 0) return;
    setLoadingMore(true);
    try {
      const last = items[items.length - 1];
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        before: last.createdAt,
      });
      const res = await fetch(`/api/notifications/list?${params}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { notifications: NotificationItem[] };
        const more = data.notifications ?? [];
        setItems((prev) => {
          const existing = new Set(prev.map((n) => n.id));
          return [...prev, ...more.filter((n) => !existing.has(n.id))];
        });
        setHasMore(more.length >= PAGE_SIZE);
      }
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [items, loadingMore]);

  const markAllRead = useCallback(async () => {
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      notifyNotificationsChanged();
    } catch {
      // silent
    }
  }, []);

  const handleItemClick = useCallback(
    async (item: NotificationItem) => {
      if (!item.readAt) {
        setItems((prev) =>
          prev.map((n) =>
            n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n,
          ),
        );
        try {
          await fetch(`/api/notifications/${item.id}/read`, { method: "POST" });
          notifyNotificationsChanged();
        } catch {
          // silent
        }
      }
      if (item.actionUrl) router.push(item.actionUrl);
    },
    [router],
  );

  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div className="space-y-5 -mx-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Bell className="size-5" strokeWidth={1.9} />
          </span>
          <div>
            <h1 className="text-[20px] font-bold text-gray-900">알림</h1>
            <p className="mt-0.5 text-[13px] text-gray-400">
              미션 적립, 추천 보상, 공지를 한곳에서 확인하세요
            </p>
          </div>
        </div>
        {hasUnread && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 text-[13px] font-medium text-gray-500 transition-colors hover:border-blue-200 hover:text-blue-600"
          >
            <CheckCheck className="size-4" strokeWidth={2} />
            모두 읽음
          </button>
        )}
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-5 animate-spin text-blue-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <Inbox className="size-9 text-gray-200" strokeWidth={1.4} />
            <span className="text-[13px] text-gray-400">새로운 알림이 없습니다</span>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-50">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      "flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50/80",
                      !item.readAt && "bg-blue-50/40",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                        item.readAt
                          ? "bg-gray-100 text-gray-400"
                          : "bg-blue-100 text-blue-600",
                      )}
                    >
                      <GrowthIcon iconKey={item.iconKey} className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13.5px] font-semibold text-gray-900">
                          {item.title}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-gray-300">
                          {timeAgo(item.createdAt)}
                        </span>
                      </span>
                      {item.body && (
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-gray-500">
                          {item.body}
                        </span>
                      )}
                    </span>
                    {!item.readAt && (
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {hasMore && (
              <div className="border-t border-gray-100 p-3">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-gray-50 text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "더 보기"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
