"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Check, CheckCheck, Inbox } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { GrowthIcon } from "@/components/growth/growth-icon";
import {
  NOTIFICATIONS_CHANGED_EVENT,
  notifyNotificationsChanged,
} from "@/lib/growth/notifications-client";

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

interface NotificationBellProps {
  collapsed?: boolean;
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
  /** Link target for "전체 알림 보기". Omit to hide the footer link (e.g. for roles
   *  without a full notifications page, avoiding cross-namespace navigation). */
  fullPageHref?: string;
}

const SUMMARY_POLL_INTERVAL_MS = 30_000;
const UNSEEN_CACHE_KEY = "notification-bell:last-unseen";

// Module-scoped so the badge survives remounts (navigation/modals) without a flash.
let lastKnownUnseen: number | null = null;
function readLastUnseen(): number {
  if (lastKnownUnseen !== null) return lastKnownUnseen;
  if (typeof window === "undefined") return 0;
  const raw = window.sessionStorage?.getItem(UNSEEN_CACHE_KEY);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : 0;
}
function writeLastUnseen(n: number) {
  lastKnownUnseen = n;
  try {
    window.sessionStorage?.setItem(UNSEEN_CACHE_KEY, String(n));
  } catch {
    // sessionStorage unavailable — module variable still holds it
  }
}

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

export function NotificationBell({
  collapsed = false,
  popoverSide,
  popoverAlign = "end",
  fullPageHref,
}: NotificationBellProps = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState<number>(() => readLastUnseen());
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSummary = useCallback(async (force = false) => {
    if (
      !force &&
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return;
    }
    try {
      const res = await fetch("/api/notifications/summary");
      if (!res.ok) return;
      const data = (await res.json()) as { unseenCount: number };
      if (typeof data.unseenCount === "number") {
        setUnseen(data.unseenCount);
        writeLastUnseen(data.unseenCount);
      }
    } catch {
      // silent — non-critical UI
    }
  }, []);

  useEffect(() => {
    fetchSummary(true);
    intervalRef.current = setInterval(fetchSummary, SUMMARY_POLL_INTERVAL_MS);
    const onChanged = () => fetchSummary(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchSummary(true);
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchSummary]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/notifications/list?limit=20");
      if (res.ok) {
        const data = (await res.json()) as { notifications: NotificationItem[] };
        setItems(data.notifications ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoadingList(false);
    }
    // Mark inbox seen → clears badge. Independent of the list fetch so a failed
    // list load still clears the badge (opening the popover = "seen").
    try {
      await fetch("/api/notifications/seen", { method: "POST" });
      setUnseen(0);
      writeLastUnseen(0);
    } catch {
      // silent
    }
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) void loadList();
    },
    [loadList],
  );

  const handleItemClick = useCallback(
    async (item: NotificationItem) => {
      if (!item.readAt) {
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
        );
        // Sync other surfaces (summary badge, full page) after the read lands.
        void fetch(`/api/notifications/${item.id}/read`, { method: "POST" }).then(
          () => notifyNotificationsChanged(),
          () => {},
        );
      }
      if (item.actionUrl) {
        setOpen(false);
        router.push(item.actionUrl);
      }
    },
    [router],
  );

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      notifyNotificationsChanged();
    } catch {
      // silent
    }
  }, []);

  const hasUnread = items.some((n) => !n.readAt);
  const badgeLabel = unseen > 99 ? "99+" : String(unseen);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-black/[0.04] transition-all duration-200 outline-none",
            collapsed ? "h-9 w-10 mx-auto" : "h-9 w-9",
          )}
          aria-label={unseen > 0 ? `알림 ${unseen}개 안 읽음` : "알림"}
        >
          <Bell className="size-[16px]" strokeWidth={1.7} />
          {unseen > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white"
              aria-hidden="true"
            >
              {badgeLabel}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side={popoverSide}
        align={popoverAlign}
        sideOffset={8}
        className="w-[340px] rounded-xl p-0 shadow-lg border-gray-200/60"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-gray-100">
          <span className="text-[13px] font-bold text-gray-900">알림</span>
          {hasUnread && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-blue-600 transition-colors"
            >
              <CheckCheck className="size-3.5" strokeWidth={2} />
              모두 읽음
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[380px] overflow-y-auto">
          {loadingList && items.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12px] text-gray-300">불러오는 중…</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Inbox className="size-7 text-gray-200" strokeWidth={1.5} />
              <span className="text-[12px] text-gray-400">새로운 알림이 없습니다</span>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50/80",
                      !item.readAt && "bg-blue-50/40",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                        item.readAt ? "bg-gray-100 text-gray-400" : "bg-blue-100 text-blue-600",
                      )}
                    >
                      <GrowthIcon iconKey={item.iconKey} className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12.5px] font-semibold text-gray-900">
                          {item.title}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-gray-300">
                          {timeAgo(item.createdAt)}
                        </span>
                      </span>
                      {item.body && (
                        <span className="mt-0.5 block line-clamp-2 text-[11.5px] leading-snug text-gray-500">
                          {item.body}
                        </span>
                      )}
                    </span>
                    {!item.readAt && (
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {fullPageHref && (
          <div className="border-t border-gray-100">
            <Link
              href={fullPageHref}
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 px-4 py-2.5 text-[12px] font-medium text-blue-500 hover:bg-blue-50/50 transition-colors rounded-b-xl"
            >
              <Check className="size-3.5" strokeWidth={2} />
              전체 알림 보기
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
