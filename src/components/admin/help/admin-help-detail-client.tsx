"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  adminGetHelpPost,
  adminReplyHelpPost,
  adminUpdateHelpStatus,
  adminToggleHelpPin,
  adminDeleteHelpPost,
  type AdminHelpPostDetail,
} from "@/actions/admin-help-center";
import {
  boardStatuses,
  boardCategories,
  labelOf,
  statusOf,
  HELP_BOARD_META,
  type HelpBoard,
} from "@/lib/help-center";
import { StatusBadge } from "@/components/help-center/status-badge";
import { AttachmentGallery } from "@/components/help-center/attachment-gallery";
import { ImageAttachmentField } from "@/components/help-center/image-attachment-field";
import type { Attachment } from "@/lib/image-attachment";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Lock, Pin, Trash2, ShieldCheck, ThumbsUp } from "lucide-react";

export function AdminHelpDetailClient({ board, postId }: { board: HelpBoard; postId: string }) {
  const router = useRouter();
  const meta = HELP_BOARD_META[board];
  const statuses = boardStatuses(board);
  const categories = boardCategories(board);

  const [post, setPost] = useState<AdminHelpPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [replyStatus, setReplyStatus] = useState<string>("");
  const [replyAttachments, setReplyAttachments] = useState<Attachment[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const data = await adminGetHelpPost(postId);
      setPost(data);
      setLoading(false);
    });
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  function submitReply() {
    if (!reply.trim() && replyAttachments.length === 0) {
      toast.error("답변 내용 또는 이미지를 입력하세요.");
      return;
    }
    startTransition(async () => {
      try {
        await adminReplyHelpPost(postId, reply, replyStatus || undefined, replyAttachments);
        setReply("");
        setReplyStatus("");
        setReplyAttachments([]);
        load();
        toast.success("답변이 등록되었습니다. 작성자에게 알림이 발송됩니다.");
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  function changeStatus(status: string) {
    startTransition(async () => {
      try {
        await adminUpdateHelpStatus(postId, status);
        load();
        toast.success("상태가 변경되었습니다.");
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  function togglePin() {
    startTransition(async () => {
      try {
        const res = await adminToggleHelpPin(postId);
        load();
        toast.success(res.isPinned ? "상단 고정되었습니다." : "고정 해제되었습니다.");
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  function remove() {
    if (!confirm("이 글을 삭제하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await adminDeleteHelpPost(postId);
        toast.success("삭제되었습니다.");
        router.push(meta.adminPath);
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  const back = (
    <button
      onClick={() => router.push(meta.adminPath)}
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900"
    >
      <ArrowLeft className="size-4" />
      목록
    </button>
  );

  if (loading) {
    return (
      <div className="space-y-5">
        {back}
        <div className="py-20 text-center text-gray-400 text-sm">불러오는 중...</div>
      </div>
    );
  }
  if (!post) {
    return (
      <div className="space-y-5">
        {back}
        <div className="py-20 text-center text-gray-400 text-sm">글을 찾을 수 없습니다</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        {back}
        <div className="flex items-center gap-2">
          <button
            onClick={togglePin}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${
              post.isPinned
                ? "border-amber-200 bg-amber-50 text-amber-600"
                : "border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            <Pin className={`size-3.5 ${post.isPinned ? "fill-amber-500 text-amber-500" : ""}`} />
            {post.isPinned ? "고정됨" : "상단 고정"}
          </button>
          <button
            onClick={remove}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 text-rose-600 hover:bg-rose-50"
          >
            <Trash2 className="size-3.5" />
            삭제
          </button>
        </div>
      </div>

      {/* Post */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={statusOf(statuses, post.status)} />
          <span className="text-xs font-medium text-slate-400">{labelOf(categories, post.category)}</span>
          {post.isPrivate && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <Lock className="size-3" /> 비밀글
            </span>
          )}
          {board === "FEEDBACK" && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <ThumbsUp className="size-3" /> {post.upvoteCount}
            </span>
          )}
        </div>
        <h1 className="text-lg font-bold text-gray-900">{post.title}</h1>
        <div className="text-xs text-gray-400">
          {post.authorName} · {formatDateTime(new Date(post.createdAt))} · 조회 {post.viewCount}
          {post.academyId ? ` · 학원ID ${post.academyId.slice(0, 8)}…` : ""}
        </div>
        <div className="border-t border-gray-50" />
        <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-gray-700">
          {post.content}
        </div>
        <AttachmentGallery attachments={post.attachments} size={112} className="pt-1" />
      </div>

      {/* Quick status */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <div className="text-xs font-semibold text-gray-500 mb-2">상태 변경</div>
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <button
              key={s.value}
              onClick={() => changeStatus(s.value)}
              disabled={post.status === s.value}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors disabled:opacity-100 ${
                post.status === s.value
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Replies */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6">
        <h2 className="font-semibold text-gray-900 mb-4 text-[15px]">
          답변 · 댓글 <span className="text-gray-400">{post.replies.length}</span>
        </h2>
        {post.replies.length === 0 ? (
          <p className="text-sm text-gray-400 py-3 text-center">아직 답변이 없습니다</p>
        ) : (
          <div className="space-y-3">
            {post.replies.map((r) => (
              <div
                key={r.id}
                className={`rounded-xl border p-4 ${
                  r.isOfficial ? "border-emerald-200 bg-emerald-50/50" : "border-gray-100 bg-gray-50/60"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold">{r.authorName}</span>
                  {r.isOfficial && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      <ShieldCheck className="size-3" />
                      공식답변
                    </span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">
                    {formatDateTime(new Date(r.createdAt))}
                  </span>
                </div>
                {r.content && (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{r.content}</div>
                )}
                <AttachmentGallery attachments={r.attachments} size={96} className="mt-2" />
              </div>
            ))}
          </div>
        )}

        {/* Official reply box */}
        <div className="mt-4 space-y-2 border-t border-gray-50 pt-4">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="운영팀 공식 답변을 작성하세요"
            rows={4}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm resize-y focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none"
          />
          <ImageAttachmentField value={replyAttachments} onChange={setReplyAttachments} />
          <div className="flex items-center justify-between gap-2">
            <select
              value={replyStatus}
              onChange={(e) => setReplyStatus(e.target.value)}
              className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-[13px] text-gray-600 outline-none focus:border-blue-500"
            >
              <option value="">답변과 함께 상태 변경 안 함</option>
              {statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  → {s.label}(으)로 변경
                </option>
              ))}
            </select>
            <button
              onClick={submitReply}
              disabled={isPending || (!reply.trim() && replyAttachments.length === 0)}
              className="h-9 px-4 rounded-xl bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              답변 등록
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
