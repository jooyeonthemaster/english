"use client";

import { useState, useTransition } from "react";
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
import { toast } from "sonner";
import { Lock, Paperclip, X } from "lucide-react";

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 1.5 * 1024 * 1024; // 1.5MB

interface Attachment {
  name: string;
  url: string; // data URL
  size?: number;
  type?: string;
}

interface ExistingPost {
  id: string;
  category: string;
  title: string;
  content: string;
}

interface HelpPostFormDialogProps {
  board: HelpBoard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post?: ExistingPost | null;
}

export function HelpPostFormDialog({
  board,
  open,
  onOpenChange,
  post,
}: HelpPostFormDialogProps) {
  const isEdit = !!post;
  const categories = boardCategories(board);
  const showAttachments = board === "SUPPORT";

  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState(post?.category || categories[0].value);
  const [title, setTitle] = useState(post?.title || "");
  const [content, setContent] = useState(post?.content || "");
  // 고객지원은 비공개 기본, 피드백은 공개 기본.
  const [isPrivate, setIsPrivate] = useState(board === "SUPPORT");
  const [password, setPassword] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const remaining = MAX_ATTACHMENTS - attachments.length;
    const list = Array.from(files).slice(0, remaining);
    for (const file of list) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name}: 1.5MB 이하만 첨부할 수 있습니다.`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          { name: file.name, url: String(reader.result), size: file.size, type: file.type },
        ]);
      };
      reader.readAsDataURL(file);
    }
  }

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
              className="resize-y"
            />
          </div>

          {/* Attachments (support only) */}
          {showAttachments && !isEdit && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Paperclip className="size-3.5" />
                첨부파일
                <span className="text-xs font-normal text-muted-foreground">
                  (이미지 최대 {MAX_ATTACHMENTS}개 · 1.5MB 이하)
                </span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 rounded-md border bg-slate-50 px-2 py-1 text-xs"
                  >
                    <Paperclip className="size-3 text-slate-400" />
                    <span className="max-w-[140px] truncate">{a.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {attachments.length < MAX_ATTACHMENTS && (
                  <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                    <Paperclip className="size-3.5" />
                    파일 추가
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        handleFiles(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
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
