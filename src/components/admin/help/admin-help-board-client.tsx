"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { adminGetHelpPosts, type AdminHelpPostListItem } from "@/actions/admin-help-center";
import {
  boardStatuses,
  boardCategories,
  labelOf,
  statusOf,
  HELP_BOARD_META,
  type HelpBoard,
} from "@/lib/help-center";
import { StatusBadge } from "@/components/help-center/status-badge";
import { formatRelativeTime } from "@/lib/utils";
import { Lock, Pin, MessageSquare, ThumbsUp, CheckCircle2, Search } from "lucide-react";

export function AdminHelpBoardClient({
  board,
  initialPosts,
}: {
  board: HelpBoard;
  initialPosts: AdminHelpPostListItem[];
}) {
  const meta = HELP_BOARD_META[board];
  const statuses = boardStatuses(board);
  const categories = boardCategories(board);

  const [posts, setPosts] = useState(initialPosts);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  function reload(nextStatus = status) {
    startTransition(async () => {
      const data = await adminGetHelpPosts({
        board,
        status: nextStatus,
        search: search || undefined,
      });
      setPosts(data);
    });
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && reload()}
            placeholder="제목 검색..."
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-[13px] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ value: "ALL", label: "전체" }, ...statuses].map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setStatus(s.value);
                reload(s.value);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                status === s.value
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        {isPending && posts.length === 0 && (
          <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
        )}
        {!isPending && posts.length === 0 && (
          <div className="py-16 text-center text-gray-400 text-sm">등록된 글이 없습니다</div>
        )}
        <ul className="divide-y divide-gray-50">
          {posts.map((p) => (
            <li key={p.id}>
              <Link
                href={`${meta.adminPath}/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-center gap-2 shrink-0">
                  {p.isPinned && <Pin className="size-3.5 text-amber-500 fill-amber-500" />}
                  <StatusBadge status={statusOf(statuses, p.status)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {p.isPrivate && <Lock className="size-3 text-slate-400 shrink-0" />}
                    <span className="text-[13px] font-semibold text-gray-900 truncate">{p.title}</span>
                    {p.hasOfficialAnswer && (
                      <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                    <span className="text-slate-500 font-medium">{labelOf(categories, p.category)}</span>
                    <span>·</span>
                    <span>{p.authorName}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(new Date(p.createdAt))}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-[11px] text-gray-400">
                  {board === "FEEDBACK" && (
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="size-3" />
                      {p.upvoteCount}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <MessageSquare className="size-3" />
                    {p.replyCount}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
