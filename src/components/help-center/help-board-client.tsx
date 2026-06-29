"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/help-center/status-badge";
import { HelpPostFormDialog } from "@/components/help-center/help-post-form-dialog";
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{meta.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">{meta.subtitle}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          글 작성
        </Button>
      </div>

      {/* Search + sort/mine */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="제목 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && reload()}
            className="pl-9"
          />
        </div>
        <Button
          variant={onlyMine ? "default" : "outline"}
          size="sm"
          onClick={() => {
            const v = !onlyMine;
            setOnlyMine(v);
            reload({ onlyMine: v });
          }}
        >
          내 글만
        </Button>
        {isFeedback && (
          <div className="flex rounded-lg border p-0.5">
            {(["recent", "popular"] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSort(s);
                  reload({ sort: s });
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  sort === s ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "recent" ? "최신순" : "공감순"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filters: category + status */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {[{ value: "ALL", label: "전체 분류" }, ...categories].map((c) => (
            <button
              key={c.value}
              onClick={() => {
                setCategory(c.value);
                reload({ category: c.value });
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                category === c.value
                  ? "border-blue-500 bg-blue-50 text-blue-600"
                  : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ value: "ALL", label: "전체 상태", className: "" }, ...statuses].map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setStatus(s.value);
                reload({ status: s.value });
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
      <div className="space-y-3">
        {isPending && posts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
        )}
        {!isPending && posts.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Inbox className="size-12 mx-auto mb-3 opacity-30" />
            <p>등록된 글이 없습니다</p>
          </div>
        )}

        {posts.map((p) => (
          <Link key={p.id} href={`${meta.path}/${p.id}`} className="block">
            <div className="rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:bg-slate-50/60 transition-colors">
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
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) reload();
        }}
      />
    </div>
  );
}
