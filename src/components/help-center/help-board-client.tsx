"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/help-center/status-badge";
import { HelpPostFormDialog } from "@/components/help-center/help-post-form-dialog";
import { OpenChatCta } from "@/components/help-center/open-chat-cta";
import { getHelpPosts, toggleHelpUpvote, type HelpPostListItem } from "@/actions/help-center";
import {
  boardCategories,
  boardStatuses,
  labelOf,
  statusOf,
  HELP_BOARD_META,
  type HelpBoard,
} from "@/lib/help-center";
import { formatRelativeTime } from "@/lib/utils";
import {
  Plus,
  Search,
  Lock,
  Pin,
  MessageSquare,
  ThumbsUp,
  CheckCircle2,
  Paperclip,
  Inbox,
  ListFilter,
  LayoutGrid,
  LayoutList,
} from "lucide-react";

interface HelpBoardClientProps {
  board: HelpBoard;
  initialPosts: HelpPostListItem[];
}

export function HelpBoardClient({ board, initialPosts }: HelpBoardClientProps) {
  const meta = HELP_BOARD_META[board];
  const categories = boardCategories(board);
  const statuses = boardStatuses(board);
  const isFeedback = board === "FEEDBACK";

  const [posts, setPosts] = useState<HelpPostListItem[]>(initialPosts);
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [sort, setSort] = useState<"recent" | "popular">("recent");
  const [view, setView] = useState<"list" | "grid">("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [composeDefaults, setComposeDefaults] = useState<
    { category?: string; title?: string; content?: string } | undefined
  >(undefined);
  const [isPending, startTransition] = useTransition();

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // 외부(예: 무통장입금 안내의 "문의하기")에서 ?compose=1 로 진입하면
  // 전달된 분류/제목/내용을 채운 새 글 작성 다이얼로그를 자동으로 연다.
  useEffect(() => {
    if (searchParams.get("compose") !== "1") return;
    setComposeDefaults({
      category: searchParams.get("category") || undefined,
      title: searchParams.get("title") || undefined,
      content: searchParams.get("content") || undefined,
    });
    setDialogOpen(true);
    router.replace(pathname); // 새로고침/재진입 시 다시 열리지 않도록 쿼리 제거
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtersActive = category !== "ALL" || status !== "ALL";

  function reload(overrides?: Partial<{ category: string; status: string; onlyMine: boolean; sort: "recent" | "popular" }>) {
    const next = { category, status, onlyMine, sort, ...overrides };
    startTransition(async () => {
      const data = await getHelpPosts({
        board,
        category: next.category,
        status: next.status,
        onlyMine: next.onlyMine,
        sort: next.sort,
        search: search || undefined,
      });
      setPosts(data);
    });
  }

  async function handleUpvote(e: React.MouseEvent, postId: string) {
    e.preventDefault();
    e.stopPropagation();
    const res = await toggleHelpUpvote(postId);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, upvoted: res.upvoted, upvoteCount: p.upvoteCount + (res.upvoted ? 1 : -1) }
          : p,
      ),
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{meta.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">{meta.subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <OpenChatCta />
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            글 작성
          </Button>
        </div>
      </div>

      {/* Toolbar: mine / sort + filter / search popovers + view toggle */}
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
        {/* 내 글만 */}
        <button
          type="button"
          onClick={() => {
            const v = !onlyMine;
            setOnlyMine(v);
            reload({ onlyMine: v });
          }}
          className={`flex h-7 shrink-0 items-center rounded-md border px-2.5 text-[11px] font-semibold shadow-sm transition-colors ${
            onlyMine
              ? "border-blue-300 bg-blue-50 text-blue-600"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800"
          }`}
        >
          내 글만
        </button>

        {/* 정렬 (피드백) */}
        {isFeedback && (
          <div className="flex shrink-0 items-center">
            {(["recent", "popular"] as const).map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSort(s);
                  reload({ sort: s });
                }}
                className={`flex h-7 shrink-0 items-center border px-2.5 text-[11px] font-semibold shadow-sm transition-colors ${
                  i === 0 ? "rounded-l-md" : "-ml-px rounded-r-md"
                } ${
                  sort === s
                    ? "z-10 border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                {s === "recent" ? "최신순" : "공감순"}
              </button>
            ))}
          </div>
        )}

        {/* 필터 popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="필터"
              aria-label="필터"
              className={`relative flex size-7 shrink-0 items-center justify-center rounded-md border bg-white shadow-sm transition-colors hover:bg-slate-50 ${
                filtersActive
                  ? "border-blue-300 text-blue-600"
                  : "border-slate-200 text-slate-600 hover:text-slate-800"
              }`}
            >
              <ListFilter className="size-3.5 shrink-0" />
              {filtersActive && (
                <span className="absolute -right-1 -top-1 size-2 rounded-full bg-blue-500 ring-2 ring-white" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3 p-3">
            {/* 분류 */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-400">분류</p>
              <div className="flex flex-wrap gap-1.5">
                {[{ value: "ALL", label: "전체 분류" }, ...categories].map((c) => (
                  <button
                    key={c.value}
                    onClick={() => {
                      setCategory(c.value);
                      reload({ category: c.value });
                    }}
                    className={`inline-flex h-7 shrink-0 items-center justify-center rounded-md border px-2.5 text-[11px] font-semibold shadow-sm transition-colors ${
                      category === c.value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 상태 */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-400">상태</p>
              <div className="flex flex-wrap gap-1.5">
                {[{ value: "ALL", label: "전체 상태", className: "" }, ...statuses].map((s) => (
                  <button
                    key={s.value}
                    onClick={() => {
                      setStatus(s.value);
                      reload({ status: s.value });
                    }}
                    className={`inline-flex h-7 shrink-0 items-center justify-center rounded-md border px-2.5 text-[11px] font-semibold shadow-sm transition-colors ${
                      status === s.value
                        ? "border-slate-800 bg-slate-800 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {s.label}
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
              className={`relative flex size-7 shrink-0 items-center justify-center rounded-md border bg-white shadow-sm transition-colors hover:bg-slate-50 ${
                search
                  ? "border-blue-300 text-blue-600"
                  : "border-slate-200 text-slate-600 hover:text-slate-800"
              }`}
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
                placeholder="제목 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && reload()}
                className="pl-9"
              />
            </div>
            <Button size="sm" className="mt-2 w-full" onClick={() => reload()}>
              검색
            </Button>
          </PopoverContent>
        </Popover>

        {/* 그리드 / 리스트 뷰 전환 */}
        <button
          type="button"
          onClick={() => setView((v) => (v === "list" ? "grid" : "list"))}
          aria-label={view === "list" ? "그리드 보기" : "리스트 보기"}
          title={view === "list" ? "그리드 보기 · 클릭하여 전환" : "리스트 보기 · 클릭하여 전환"}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
        >
          {view === "list" ? (
            <LayoutGrid className="size-4" />
          ) : (
            <LayoutList className="size-4" />
          )}
        </button>
      </div>

      {/* List */}
      <div
        className={
          view === "grid"
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
            : "space-y-3"
        }
      >
        {isPending && posts.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">불러오는 중...</div>
        )}
        {!isPending && posts.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <Inbox className="size-12 mx-auto mb-3 opacity-30" />
            <p>등록된 글이 없습니다</p>
          </div>
        )}

        {posts.map((p) => (
          <Link key={p.id} href={`${meta.path}/${p.id}`} className="block h-full">
            <div className="h-full rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:bg-slate-50/60 transition-colors">
              <div className="flex items-start gap-3">
                {/* Upvote (feedback) */}
                {isFeedback && (
                  <button
                    onClick={(e) => handleUpvote(e, p.id)}
                    className={`flex flex-col items-center justify-center rounded-lg border px-2.5 py-1.5 shrink-0 transition-colors ${
                      p.upvoted
                        ? "border-blue-300 bg-blue-50 text-blue-600"
                        : "border-slate-200 text-slate-400 hover:border-blue-200 hover:text-blue-500"
                    }`}
                  >
                    <ThumbsUp className="size-3.5" />
                    <span className="text-[11px] font-bold mt-0.5">{p.upvoteCount}</span>
                  </button>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {p.isPinned && <Pin className="size-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                    <StatusBadge status={statusOf(statuses, p.status)} />
                    <span className="text-[11px] font-medium text-slate-400">
                      {labelOf(categories, p.category)}
                    </span>
                    {p.locked && <Lock className="size-3 text-slate-400" />}
                    <h3 className="font-semibold text-sm truncate">{p.title}</h3>
                    {p.isMine && (
                      <span className="text-[10px] font-bold text-blue-500 bg-blue-50 rounded px-1.5 py-px shrink-0">
                        내 글
                      </span>
                    )}
                  </div>

                  {p.preview ? (
                    <p className="text-muted-foreground text-sm line-clamp-2 mb-2">{p.preview}</p>
                  ) : (
                    <p className="text-muted-foreground/70 text-sm italic mb-2 flex items-center gap-1.5">
                      <Lock className="size-3" /> 비밀글입니다
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{p.authorName}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(new Date(p.createdAt))}</span>
                    {p.replyCount > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="size-3" />
                        {p.replyCount}
                      </span>
                    )}
                    {p.attachmentCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Paperclip className="size-3" />
                        {p.attachmentCount}
                      </span>
                    )}
                    {p.hasOfficialAnswer && (
                      <span className="flex items-center gap-1 text-emerald-600 font-medium">
                        <CheckCircle2 className="size-3" />
                        운영팀 답변
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <HelpPostFormDialog
        board={board}
        open={dialogOpen}
        defaults={composeDefaults}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setComposeDefaults(undefined);
            reload();
          }
        }}
      />
    </div>
  );
}
