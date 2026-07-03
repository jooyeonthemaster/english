"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  adminGetHelpPosts,
  type AdminHelpPostsResult,
} from "@/actions/admin-help-center";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
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

// 관리자가 한 번이라도 연 글의 id 를 브라우저에 저장 → 클릭 전까지만 파란 글로우.
const SEEN_KEY = "smoat_admin_help_seen";

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // 저장 실패는 무시(글로우가 다음 방문에 다시 보일 뿐).
  }
}

export function AdminHelpBoardClient({
  board,
  initialData,
  initialStatus,
}: {
  board: HelpBoard;
  initialData: AdminHelpPostsResult;
  /** 대시보드 등에서 넘어올 때 초기 상태 필터("PENDING"=미답변) */
  initialStatus?: string;
}) {
  const meta = HELP_BOARD_META[board];
  const statuses = boardStatuses(board);
  const categories = boardCategories(board);

  // 문의 게시판(SUPPORT)에는 접수+처리중을 묶어 보는 "미답변" 필터를 추가한다.
  const statusFilters =
    board === "SUPPORT"
      ? [
          { value: "ALL", label: "전체" },
          { value: "PENDING", label: "미답변" },
          ...statuses,
        ]
      : [{ value: "ALL", label: "전체" }, ...statuses];
  const validStatuses = new Set(statusFilters.map((s) => s.value));

  const [posts, setPosts] = useState(initialData.items);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const pageRef = useRef(initialData.page);
  const [status, setStatus] = useState(
    initialStatus && validStatuses.has(initialStatus) ? initialStatus : "ALL",
  );
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  // 미확인 글 글로우용. 하이드레이션 불일치를 막기 위해 마운트 후 localStorage 를 읽는다.
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [seenReady, setSeenReady] = useState(false);
  useEffect(() => {
    setSeen(loadSeen());
    setSeenReady(true);
  }, []);

  function markSeen(postId: string) {
    setSeen((prev) => {
      if (prev.has(postId)) return prev;
      const next = new Set(prev).add(postId);
      persistSeen(next);
      return next;
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / initialData.pageSize));

  function reload(nextStatus = status, nextPage = pageRef.current) {
    startTransition(async () => {
      const data = await adminGetHelpPosts({
        board,
        status: nextStatus,
        search: search || undefined,
        page: nextPage,
      });
      setPosts(data.items);
      setTotal(data.total);
      pageRef.current = data.page;
      setPage(data.page);
    });
  }

  // 목록 페이지는 10분마다 자동 새로고침. 특정 글을 읽는 상세 화면은
  // 별도 라우트(/admin/{board}/[postId])라 이 컴포넌트가 언마운트되므로
  // 읽는 동안에는 새로고침이 일어나지 않는다.
  useAutoRefresh(() => reload());

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && reload(status, 1)}
            placeholder="제목 검색..."
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-[13px] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setStatus(s.value);
                reload(s.value, 1);
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
            <li key={p.id} className={seenReady && !seen.has(p.id) ? "admin-unread-glow" : undefined}>
              <Link
                href={`${meta.adminPath}/${p.id}`}
                onClick={() => markSeen(p.id)}
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
        <AdminPagination
          page={page}
          totalPages={totalPages}
          disabled={isPending}
          onChange={(p) => reload(status, p)}
        />
      </div>
    </div>
  );
}
