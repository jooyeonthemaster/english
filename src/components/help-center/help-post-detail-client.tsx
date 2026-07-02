"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/help-center/status-badge";
import { HelpPostFormDialog } from "@/components/help-center/help-post-form-dialog";
import { AttachmentGallery } from "@/components/help-center/attachment-gallery";
import { ImageAttachmentField } from "@/components/help-center/image-attachment-field";
import type { Attachment } from "@/lib/image-attachment";
import {
  getHelpPost,
  deleteHelpPost,
  toggleHelpUpvote,
  addHelpReply,
  type HelpPostDetail,
} from "@/actions/help-center";
import {
  boardCategories,
  boardStatuses,
  labelOf,
  statusOf,
  HELP_BOARD_META,
  type HelpBoard,
} from "@/lib/help-center";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowLeft,
  Lock,
  Pencil,
  Trash2,
  ThumbsUp,
  ShieldCheck,
  Inbox,
} from "lucide-react";

export function HelpPostDetailClient({ board, postId }: { board: HelpBoard; postId: string }) {
  const router = useRouter();
  const meta = HELP_BOARD_META[board];
  const categories = boardCategories(board);
  const statuses = boardStatuses(board);
  const isFeedback = board === "FEEDBACK";

  const [post, setPost] = useState<HelpPostDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "locked" | "notfound">("loading");
  const [password, setPassword] = useState("");
  const [reply, setReply] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<Attachment[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(
    (pw?: string) => {
      startTransition(async () => {
        const res = await getHelpPost(postId, pw);
        if (res.ok) {
          setPost(res.post);
          setState("ok");
        } else if (res.reason === "NOT_FOUND") {
          setState("notfound");
        } else if (res.reason === "WRONG_PASSWORD") {
          toast.error("비밀번호가 일치하지 않습니다.");
          setState("locked");
        } else {
          setState("locked");
        }
      });
    },
    [postId],
  );

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete() {
    if (!confirm("이 글을 삭제하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await deleteHelpPost(postId);
        toast.success("삭제되었습니다.");
        router.push(meta.path);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.");
      }
    });
  }

  async function handleUpvote() {
    if (!post) return;
    const res = await toggleHelpUpvote(post.id);
    setPost({
      ...post,
      upvoted: res.upvoted,
      upvoteCount: post.upvoteCount + (res.upvoted ? 1 : -1),
    });
  }

  function handleReply() {
    if (!reply.trim() && replyAttachments.length === 0) return;
    startTransition(async () => {
      try {
        await addHelpReply(postId, reply, replyAttachments);
        setReply("");
        setReplyAttachments([]);
        load();
        toast.success("댓글이 등록되었습니다.");
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  // ── Back bar (shared) ──
  const backBar = (
    <Button variant="ghost" size="sm" onClick={() => router.push(meta.path)}>
      <ArrowLeft className="size-4" />
      목록
    </Button>
  );

  if (state === "loading") {
    return (
      <div className="space-y-4">
        {backBar}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <div className="flex items-center justify-center py-16 text-muted-foreground">불러오는 중...</div>
        </div>
      </div>
    );
  }

  if (state === "notfound") {
    return (
      <div className="space-y-4">
        {backBar}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <div className="text-center py-16 text-muted-foreground">
            <Inbox className="size-12 mx-auto mb-3 opacity-30" />
            <p>글을 찾을 수 없습니다</p>
          </div>
        </div>
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div className="space-y-4">
        {backBar}
        <div className="bg-card rounded-2xl border border-border shadow-sm mx-auto max-w-md p-8 text-center">
          <Lock className="size-10 mx-auto mb-3 text-slate-300" />
          <h2 className="font-semibold text-slate-800">비밀글입니다</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            작성자가 설정한 비밀번호를 입력하세요
          </p>
          <div className="flex gap-2 max-w-xs mx-auto">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load(password)}
              placeholder="비밀번호"
            />
            <Button onClick={() => load(password)} disabled={isPending}>
              확인
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!post) return null;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        {backBar}
        {post.isMine && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5" />
              수정
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash2 className="size-3.5" />
              삭제
            </Button>
          </div>
        )}
      </div>

      {/* Single white panel: post + replies */}
      <div className="bg-card rounded-2xl border border-border shadow-sm">
        {/* Post */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={statusOf(statuses, post.status)} />
            <span className="text-xs font-medium text-slate-400">
              {labelOf(categories, post.category)}
            </span>
            {post.isPrivate && <Lock className="size-3.5 text-slate-400" />}
          </div>

          <h1 className="text-xl font-bold">{post.title}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{post.authorName}</span>
            <span>·</span>
            <span>{formatDateTime(new Date(post.createdAt))}</span>
            <span>·</span>
            <span>조회 {post.viewCount}</span>
          </div>

          <Separator />

          <div className="whitespace-pre-wrap leading-relaxed text-[15px]">{post.content}</div>

          {/* Attachments — 다운로드가 아닌 미리보기(클릭 시 라이트박스) */}
          <AttachmentGallery attachments={post.attachments} size={128} className="pt-2" />

          {/* Upvote (feedback) */}
          {isFeedback && (
            <div className="pt-2">
              <button
                onClick={handleUpvote}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  post.upvoted
                    ? "border-blue-300 bg-blue-50 text-blue-600"
                    : "border-slate-200 text-slate-500 hover:border-blue-200 hover:text-blue-500"
                }`}
              >
                <ThumbsUp className="size-4" />
                공감 {post.upvoteCount}
              </button>
            </div>
          )}
        </div>

        {/* Replies */}
        <div className="border-t border-slate-100 p-5 sm:p-6">
          <h2 className="font-semibold mb-4">
            답변 · 댓글 <span className="text-muted-foreground">{post.replies.length}</span>
          </h2>

        {post.replies.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">아직 답변이 없습니다</p>
        ) : (
          <div className="space-y-3">
            {post.replies.map((r) => (
              <div
                key={r.id}
                className={`rounded-xl border p-4 ${
                  r.isOfficial ? "border-emerald-200 bg-emerald-50/50" : "border-slate-150 bg-slate-50/60"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold">{r.authorName}</span>
                  {r.isOfficial && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      <ShieldCheck className="size-3" />
                      운영팀 공식답변
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDateTime(new Date(r.createdAt))}
                  </span>
                </div>
                {r.content && (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {r.content}
                  </div>
                )}
                <AttachmentGallery attachments={r.attachments} size={96} className="mt-2" />
              </div>
            ))}
          </div>
        )}

        {/* Follow-up reply (anyone) */}
        <div className="mt-4 space-y-2">
          <Separator />
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={
              post.isMine
                ? "추가로 남길 내용이 있다면 작성하세요"
                : "댓글을 남겨 보세요"
            }
            rows={3}
            className="resize-y mt-4"
          />
          <div className="flex items-center justify-between gap-2">
            <ImageAttachmentField value={replyAttachments} onChange={setReplyAttachments} />
            <Button
              size="sm"
              onClick={handleReply}
              disabled={isPending || (!reply.trim() && replyAttachments.length === 0)}
            >
              댓글 등록
            </Button>
          </div>
        </div>
        </div>
      </div>

      <HelpPostFormDialog
        board={board}
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) load();
        }}
        post={{ id: post.id, category: post.category, title: post.title, content: post.content }}
      />
    </div>
  );
}
