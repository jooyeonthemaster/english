"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createHelpPost, updateHelpPost } from "@/actions/help-center";
import { boardCategories, type HelpBoard } from "@/lib/help-center";
import { ImageAttachmentField } from "@/components/help-center/image-attachment-field";
import { MAX_ATTACHMENTS, type Attachment } from "@/lib/image-attachment";
import { toast } from "sonner";
import { Lock, Paperclip } from "lucide-react";

interface ExistingPost {
  id: string;
  category: string;
  title: string;
  content: string;
}

/** 새 글 작성 시 미리 채워둘 값(예: 결제건 문의 진입 시 주문번호 자동 기입). */
interface ComposeDefaults {
  category?: string;
  title?: string;
  content?: string;
}

interface HelpPostFormDialogProps {
  board: HelpBoard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post?: ExistingPost | null;
  defaults?: ComposeDefaults;
}

export function HelpPostFormDialog({
  board,
  open,
  onOpenChange,
  post,
  defaults,
}: HelpPostFormDialogProps) {
  const isEdit = !!post;
  const categories = boardCategories(board);
  const showAttachments = true; // 피드백·문의 게시판 모두 이미지 첨부 허용

  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState(
    post?.category || defaults?.category || categories[0].value,
  );
  const [title, setTitle] = useState(post?.title || defaults?.title || "");
  const [content, setContent] = useState(post?.content || defaults?.content || "");
  // 고객지원은 비공개 기본, 피드백은 공개 기본.
  const [isPrivate, setIsPrivate] = useState(board === "SUPPORT");
  const [password, setPassword] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // 새 글 작성 모드에서 다이얼로그가 열릴 때마다 폼을 초기화한다.
  // defaults 가 있으면 그 값으로 채우고(결제건 문의 등), 없으면 빈 폼으로 되돌린다.
  useEffect(() => {
    if (!open || isEdit) return;
    setCategory(defaults?.category || categories[0].value);
    setTitle(defaults?.title || "");
    setContent(defaults?.content || "");
    setIsPrivate(board === "SUPPORT");
    setPassword("");
    setAttachments([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit() {
    if (!title.trim() || !content.trim()) {
      toast.error("제목과 내용을 입력하세요.");
      return;
    }
    if (!isEdit && isPrivate && password.trim().length < 4) {
      toast.error("비밀글 비밀번호는 4자 이상이어야 합니다.");
      return;
    }

    startTransition(async () => {
      try {
        if (isEdit && post) {
          await updateHelpPost(post.id, { category, title, content });
          toast.success("수정되었습니다.");
        } else {
          await createHelpPost({
            board,
            category,
            title,
            content,
            isPrivate,
            password: isPrivate ? password : undefined,
            attachments: showAttachments ? attachments : undefined,
          });
          toast.success("등록되었습니다.");
        }
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "글 수정" : "글 작성"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Category */}
          <div className="space-y-2">
            <Label>분류</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="help-title">제목</Label>
            <Input
              id="help-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목을 입력하세요"
              maxLength={200}
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="help-content">내용</Label>
            <Textarea
              id="help-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                board === "FEEDBACK"
                  ? "개선되었으면 하는 점을 구체적으로 적어 주세요"
                  : "문의 내용을 구체적으로 적어 주세요"
              }
              rows={8}
              className="h-48 resize-none overflow-y-auto [field-sizing:fixed]"
            />
          </div>

          {/* Attachments (support only) */}
          {showAttachments && !isEdit && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Paperclip className="size-3.5" />
                첨부파일
                <span className="text-xs font-normal text-muted-foreground">
                  (이미지 최대 {MAX_ATTACHMENTS}개 · 업로드 시 자동 최적화)
                </span>
              </Label>
              <ImageAttachmentField value={attachments} onChange={setAttachments} />
            </div>
          )}

          {/* Private (create only) */}
          {!isEdit && (
            <div className="space-y-3 rounded-lg border bg-slate-50/60 p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="help-private"
                  checked={isPrivate}
                  onCheckedChange={(c) => setIsPrivate(!!c)}
                />
                <Label
                  htmlFor="help-private"
                  className="font-normal cursor-pointer flex items-center gap-1.5"
                >
                  <Lock className="size-3.5" />
                  비밀글 (작성자 본인과 운영자만 열람)
                </Label>
              </div>
              {isPrivate && (
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호 (4자 이상)"
                  className="max-w-xs"
                />
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending ? "저장 중..." : isEdit ? "수정" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
