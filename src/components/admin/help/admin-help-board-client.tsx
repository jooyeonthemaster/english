"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Lock, MessageSquare, Pin, ThumbsUp } from "lucide-react";
import {
  adminGetHelpPosts,
  type AdminHelpPostsResult,
} from "@/actions/admin-help-center";
import { getHelpPostHoverDetail } from "@/actions/admin/detail/help-posts";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import {
  AdminEmptyState,
  FilterBar,
  FilterChipGroup,
  ResultCount,
  SearchInput,
} from "@/components/admin/kit";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import {
  boardStatuses,
  boardCategories,
  labelOf,
  HELP_BOARD_META,
  type HelpBoard,
} from "@/lib/help-center";
import { cn, formatRelativeTime } from "@/lib/utils";
import { HelpStatusBadge } from "./help-status-badge";

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

/** 상태 필터를 ?status= 에 남겨 상세에서 돌아오거나 새로고침해도 같은 필터가 보이게 한다. */
function syncStatusParam(status: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (status === "ALL") url.searchParams.delete("status");
  else url.searchParams.set("status", status);
  window.history.replaceState(window.history.state, "", url);
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
          { key: "ALL", label: "전체" },
          { key: "PENDING", label: "미답변" },
          ...statuses.map((s) => ({ key: s.value, label: s.label })),
        ]
      : [{ key: "ALL", label: "전체" }, ...statuses.map((s) => ({ key: s.value, label: s.label }))];
  const validStatuses = new Set(statusFilters.map((s) => s.key));

  const [posts, setPosts] = useState(initialData.items);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const pageRef = useRef(initialData.page);
  const [status, setStatus] = useState(
    initialStatus && validStatuses.has(initialStatus) ? initialStatus : "ALL",
  );
  // 검색: 표시값은 즉시, 서버 조회는 250ms 디바운스로 커밋(Enter·지우기는 즉시).
  const [searchInput, setSearchInput] = useState("");
  const searchRef = useRef("");
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

  function reload(nextStatus = status, nextPage = pageRef.current, nextSearch = searchRef.current) {
    startTransition(async () => {
      const data = await adminGetHelpPosts({
        board,
        status: nextStatus,
        search: nextSearch || undefined,
        page: nextPage,
      });
      setPosts(data.items);
      setTotal(data.total);
      pageRef.current = data.page;
      setPage(data.page);
    });
  }

  const { schedule, flush } = useSearchDebounce((value) => {
    const q = value.trim();
    if (q === searchRef.current) return;
    searchRef.current = q;
    reload(status, 1, q);
  });

  function changeStatus(next: string) {
    setStatus(next);
    syncStatusParam(next);
    reload(next, 1);
  }

  // 목록 페이지는 10분마다 자동 새로고침. 특정 글을 읽는 상세 화면은
  // 별도 라우트(/admin/{board}/[postId])라 이 컴포넌트가 언마운트되므로
  // 읽는 동안에는 새로고침이 일어나지 않는다.
  useAutoRefresh(() => reload());

  // 상세로 갈 때 현재 상태 필터를 넘겨 "목록" 으로 돌아올 때 같은 필터를 복원한다.
  const detailHref = (postId: string) =>
    status === "ALL"
      ? `${meta.adminPath}/${postId}`
      : `${meta.adminPath}/${postId}?status=${encodeURIComponent(status)}`;

  return (
    <div className="space-y-4">
      <FilterBar right={<ResultCount total={total} page={page} totalPages={totalPages} />}>
        <SearchInput
          value={searchInput}
          onChange={(v) => {
            setSearchInput(v);
            if (v === "") flush("");
            else schedule(v);
          }}
          onEnter={() => flush(searchInput)}
          placeholder="제목 검색"
          ariaLabel="제목 검색"
        />
        <FilterChipGroup
          options={statusFilters}
          value={status}
          onChange={changeStatus}
          ariaLabel="상태 필터"
        />
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
        {posts.length === 0 ? (
          <AdminEmptyState
            title="등록된 글이 없습니다"
            description={searchRef.current ? "검색어나 상태 필터를 바꿔 보세요." : undefined}
            className={cn(isPending && "opacity-60")}
          />
        ) : (
          <ul className={cn("divide-y divide-gray-50 transition-opacity", isPending && "opacity-60")}>
            {posts.map((p) => (
              <li key={p.id} className={seenReady && !seen.has(p.id) ? "admin-unread-glow" : undefined}>
                {/* 호버=본문 미리보기(지연 조회, 읽음 표시 안 함). 클릭=상세 페이지 이동 */}
                <AdminHoverDetail
                  title={p.title}
                  load={() => getHelpPostHoverDetail(p.id)}
                  cacheKey={`help-post:${p.id}`}
                  click="none"
                >
                  <Link
                    href={detailHref(p.id)}
                    onClick={() => markSeen(p.id)}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50/60"
                  >
                    <div className="flex shrink-0 items-center gap-2">
                      {p.isPinned && (
                        <Pin className="size-3.5 fill-amber-500 text-amber-500" strokeWidth={2} aria-label="상단 고정" />
                      )}
                      <HelpStatusBadge options={statuses} value={p.status} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {p.isPrivate && <Lock className="size-3 shrink-0 text-gray-400" strokeWidth={2} aria-label="비밀글" />}
                        <span className="truncate text-[13px] font-semibold text-gray-900">{p.title}</span>
                        {p.hasOfficialAnswer && (
                          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" strokeWidth={2} aria-label="공식 답변 완료" />
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                        <span className="font-medium text-gray-500">{labelOf(categories, p.category)}</span>
                        <span>·</span>
                        <span>{p.authorName}</span>
                        <span>·</span>
                        <span>{formatRelativeTime(new Date(p.createdAt))}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-[11px] tabular-nums text-gray-400">
                      {board === "FEEDBACK" && (
                        <span className="flex items-center gap-1">
                          <ThumbsUp className="size-3" strokeWidth={2} aria-hidden />
                          {p.upvoteCount}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <MessageSquare className="size-3" strokeWidth={2} aria-hidden />
                        {p.replyCount}
                      </span>
                    </div>
                  </Link>
                </AdminHoverDetail>
              </li>
            ))}
          </ul>
        )}
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
