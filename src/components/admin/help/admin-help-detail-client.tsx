"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, MessageSquare, Pin, ShieldCheck, ThumbsUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  adminGetHelpPost,
  adminReplyHelpPost,
  adminUpdateHelpStatus,
  adminToggleHelpPin,
  adminDeleteHelpPost,
  type AdminHelpPostDetail,
} from "@/actions/admin-help-center";
import {
  AdminEmptyState,
  AdminPageSkeleton,
  BackLink,
  FilterChipGroup,
  PageHeader,
  SectionCard,
  useConfirm,
} from "@/components/admin/kit";
import { AttachmentGallery } from "@/components/help-center/attachment-gallery";
import { ImageAttachmentField } from "@/components/help-center/image-attachment-field";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  boardStatuses,
  boardCategories,
  labelOf,
  HELP_BOARD_META,
  type HelpBoard,
} from "@/lib/help-center";
import type { Attachment } from "@/lib/image-attachment";
import { cn, formatDateTime } from "@/lib/utils";
import { HelpStatusBadge } from "./help-status-badge";

// ui/select 는 빈 문자열 값을 허용하지 않아 "상태 변경 안 함" 은 별도 키로 둔다.
const KEEP_STATUS = "__keep__";

export function AdminHelpDetailClient({
  board,
  postId,
  listStatus,
}: {
  board: HelpBoard;
  postId: string;
  /** 목록에서 넘어온 상태 필터 — 돌아갈 때 그대로 복원 */
  listStatus?: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const meta = HELP_BOARD_META[board];
  const statuses = boardStatuses(board);
  const categories = boardCategories(board);
  const listHref = listStatus
    ? `${meta.adminPath}?status=${encodeURIComponent(listStatus)}`
    : meta.adminPath;

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
    if (!post || post.status === status) return;
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

  async function remove() {
    const ok = await confirm({
      title: "이 글을 삭제할까요?",
      description: "글과 답변이 모두 삭제되며 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await adminDeleteHelpPost(postId);
        toast.success("삭제되었습니다.");
        router.push(listHref);
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <BackLink href={listHref} label="목록" />
        <AdminPageSkeleton stats={0} rows={6} />
      </div>
    );
  }
  if (!post) {
    return (
      <div className="space-y-4">
        <PageHeader title="글을 찾을 수 없습니다" back={{ href: listHref, label: "목록" }} />
        <AdminEmptyState
          icon={MessageSquare}
          title="글을 찾을 수 없습니다"
          description="삭제됐거나 주소가 잘못됐을 수 있습니다."
        />
      </div>
    );
  }

  const statusOptions = statuses.map((s) => ({ key: s.value, label: s.label }));

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={post.title}
        back={{ href: listHref, label: "목록" }}
        crumbs={[{ label: post.title }]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={togglePin}
              disabled={isPending}
              aria-pressed={post.isPinned}
              className={cn(
                post.isPinned && "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800",
              )}
            >
              <Pin className={cn("size-4", post.isPinned && "fill-amber-500 text-amber-500")} strokeWidth={2} />
              {post.isPinned ? "고정됨" : "상단 고정"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={remove}
              disabled={isPending}
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <Trash2 className="size-4" strokeWidth={2} />
              삭제
            </Button>
          </>
        }
      />

      {/* 본문 */}
      <SectionCard>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-400">
            <HelpStatusBadge options={statuses} value={post.status} />
            <span className="font-medium">{labelOf(categories, post.category)}</span>
            {post.isPrivate && (
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3" strokeWidth={2} aria-hidden /> 비밀글
              </span>
            )}
            {board === "FEEDBACK" && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <ThumbsUp className="size-3" strokeWidth={2} aria-hidden /> {post.upvoteCount}
              </span>
            )}
          </div>
          <div className="text-[12px] text-gray-400">
            {post.authorName} · {formatDateTime(new Date(post.createdAt))} · 조회 {post.viewCount}
            {post.academyId ? ` · 학원ID ${post.academyId.slice(0, 8)}…` : ""}
          </div>
          <div className="border-t border-gray-100" />
          <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">
            {post.content}
          </div>
          <AttachmentGallery attachments={post.attachments} size={112} className="pt-1" />
        </div>
      </SectionCard>

      {/* 상태 변경 */}
      <SectionCard title="상태 변경" description="누르면 즉시 저장됩니다.">
        <div className={cn("transition-opacity", isPending && "pointer-events-none opacity-60")}>
          <FilterChipGroup
            options={statusOptions}
            value={post.status}
            onChange={changeStatus}
            ariaLabel="글 상태"
          />
        </div>
      </SectionCard>

      {/* 답변 · 댓글 */}
      <SectionCard
        title={
          <>
            답변 · 댓글 <span className="tabular-nums text-gray-400">{post.replies.length}</span>
          </>
        }
      >
        {post.replies.length === 0 ? (
          <AdminEmptyState compact icon={MessageSquare} title="아직 답변이 없습니다" />
        ) : (
          <div className="space-y-3">
            {post.replies.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "rounded-xl border p-4",
                  r.isOfficial ? "border-emerald-200 bg-emerald-50/50" : "border-gray-100 bg-gray-50/60",
                )}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-gray-900">{r.authorName}</span>
                  {r.isOfficial && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <ShieldCheck className="size-3" strokeWidth={2} aria-hidden />
                      공식답변
                    </span>
                  )}
                  <span className="ml-auto text-[12px] text-gray-400">
                    {formatDateTime(new Date(r.createdAt))}
                  </span>
                </div>
                {r.content && (
                  <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">
                    {r.content}
                  </div>
                )}
                <AttachmentGallery attachments={r.attachments} size={96} className="mt-2" />
              </div>
            ))}
          </div>
        )}

        {/* 공식 답변 작성 */}
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="운영팀 공식 답변을 작성하세요"
            rows={4}
            className="min-h-24 resize-y text-[13px]"
            aria-label="공식 답변"
          />
          <ImageAttachmentField value={replyAttachments} onChange={setReplyAttachments} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Select
              value={replyStatus || KEEP_STATUS}
              onValueChange={(v) => setReplyStatus(v === KEEP_STATUS ? "" : v)}
            >
              <SelectTrigger size="sm" className="w-auto min-w-52 text-[13px]" aria-label="답변과 함께 변경할 상태">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP_STATUS}>답변과 함께 상태 변경 안 함</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    → {s.label}(으)로 변경
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={submitReply}
              disabled={isPending || (!reply.trim() && replyAttachments.length === 0)}
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              답변 등록
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
