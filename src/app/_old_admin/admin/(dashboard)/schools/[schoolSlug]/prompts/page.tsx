"use client";

import { useState, useEffect, useTransition } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
} from "@/actions/prompts";
import {
  ChevronRight,
  ArrowLeft,
  Plus,
  Trash2,
  Power,
  PowerOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

const PROMPT_TYPES = [
  { value: "GENERAL", label: "일반" },
  { value: "GRAMMAR", label: "문법" },
  { value: "VOCAB", label: "어휘" },
  { value: "EXAM_FOCUS", label: "시험 대비" },
] as const;

const promptTypeColorMap: Record<string, { bg: string; text: string }> = {
  GENERAL: { bg: "#F7F8FA", text: "#4E5968" },
  GRAMMAR: { bg: "#E8F3FF", text: "#3182F6" },
  VOCAB: { bg: "#E8FAF0", text: "#00C471" },
  EXAM_FOCUS: { bg: "#FFF3E8", text: "#F97316" },
};

interface PromptItem {
  id: string;
  schoolId: string;
  passageId: string | null;
  content: string;
  promptType: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  passage: { id: string; title: string } | null;
}

interface PassageOption {
  id: string;
  title: string;
}

export default function PromptsPage() {
  const params = useParams();
  const schoolSlug = params.schoolSlug as string;

  const [isPending, startTransition] = useTransition();
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [passages, setPassages] = useState<PassageOption[]>([]);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form state
  const [newPromptType, setNewPromptType] = useState("GENERAL");
  const [newPassageId, setNewPassageId] = useState("");
  const [newContent, setNewContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    try {
      const schoolRes = await fetch(`/api/schools/${schoolSlug}`);
      if (!schoolRes.ok) return;
      const school = await schoolRes.json();
      setSchoolId(school.id);

      const [promptsData, passagesRes] = await Promise.all([
        getPrompts(school.id),
        fetch(`/api/schools/${schoolSlug}/passages`).catch(() => null),
      ]);

      setPrompts(promptsData as PromptItem[]);

      if (passagesRes?.ok) {
        const passagesData = await passagesRes.json();
        setPassages(passagesData);
      }
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolSlug]);

  function handleCreate() {
    setError(null);
    if (!newContent.trim()) {
      setError("프롬프트 내용을 입력해주세요.");
      return;
    }
    if (!schoolId) return;

    startTransition(async () => {
      const result = await createPrompt({
        schoolId,
        promptType: newPromptType,
        content: newContent.trim(),
        passageId: newPassageId && newPassageId !== "none" ? newPassageId : undefined,
      });

      if (result.success) {
        setCreateOpen(false);
        setNewPromptType("GENERAL");
        setNewPassageId("");
        setNewContent("");
        await loadData();
      } else {
        setError(result.error || "등록에 실패했습니다.");
      }
    });
  }

  function handleToggleActive(prompt: PromptItem) {
    startTransition(async () => {
      await updatePrompt(prompt.id, { isActive: !prompt.isActive });
      await loadData();
    });
  }

  function handleDelete(promptId: string) {
    startTransition(async () => {
      await deletePrompt(promptId);
      await loadData();
    });
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-5 w-48 animate-pulse rounded bg-[#F2F4F6]" />
        <div className="h-10 w-64 animate-pulse rounded bg-[#F2F4F6]" />
        <div className="h-64 animate-pulse rounded-xl bg-[#F2F4F6]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[13px] text-[#8B95A1]">
        <Link
          href="/admin/schools"
          className="transition-colors hover:text-[#3182F6]"
        >
          학교 관리
        </Link>
        <ChevronRight className="size-3.5" />
        <Link
          href={`/admin/schools/${schoolSlug}`}
          className="transition-colors hover:text-[#3182F6]"
        >
          학교
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-[#191F28]">AI 프롬프트 관리</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/admin/schools/${schoolSlug}`}>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 text-[#8B95A1] hover:text-[#191F28]"
            >
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-[24px] font-bold text-[#191F28]">
              AI 프롬프트 관리
            </h1>
            <p className="mt-1 text-[14px] text-[#8B95A1]">
              총 {prompts.length}개 프롬프트
            </p>
          </div>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-[#3182F6] text-white hover:bg-[#1B64DA]">
              <Plus className="size-4" />새 프롬프트 등록
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>새 프롬프트 등록</DialogTitle>
              <DialogDescription>
                AI 학습 도우미에서 사용할 프롬프트를 등록합니다.
              </DialogDescription>
            </DialogHeader>

            {error && (
              <div className="rounded-lg border border-[#FEE2E2] bg-[#FFF5F5] px-4 py-3 text-[14px] text-[#F04452]">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-4">
              <div>
                <Label className="text-[13px] font-medium text-[#4E5968]">
                  프롬프트 유형
                </Label>
                <Select
                  value={newPromptType}
                  onValueChange={setNewPromptType}
                >
                  <SelectTrigger className="mt-1.5 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROMPT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {passages.length > 0 && (
                <div>
                  <Label className="text-[13px] font-medium text-[#4E5968]">
                    관련 지문 (선택)
                  </Label>
                  <Select
                    value={newPassageId}
                    onValueChange={setNewPassageId}
                  >
                    <SelectTrigger className="mt-1.5 w-full">
                      <SelectValue placeholder="지문 선택 (선택사항)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">선택 없음</SelectItem>
                      {passages.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="text-[13px] font-medium text-[#4E5968]">
                  프롬프트 내용 <span className="text-[#F04452]">*</span>
                </Label>
                <Textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="AI에게 전달할 프롬프트 내용을 입력하세요..."
                  className="mt-1.5 min-h-[120px]"
                />
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">취소</Button>
              </DialogClose>
              <Button
                onClick={handleCreate}
                disabled={isPending}
                className="bg-[#3182F6] text-white hover:bg-[#1B64DA]"
              >
                {isPending ? "등록 중..." : "등록"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Prompt cards */}
      {prompts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#F2F4F6] bg-white py-16 text-center">
          <p className="text-[14px] text-[#8B95A1]">
            등록된 프롬프트가 없습니다.
          </p>
          <p className="mt-1 text-[13px] text-[#ADB5BD]">
            &quot;새 프롬프트 등록&quot; 버튼을 클릭하여 프롬프트를
            등록하세요.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {prompts.map((prompt) => {
            const typeColor = promptTypeColorMap[prompt.promptType] || {
              bg: "#F7F8FA",
              text: "#4E5968",
            };
            const typeLabel =
              PROMPT_TYPES.find((t) => t.value === prompt.promptType)?.label ||
              prompt.promptType;

            return (
              <div
                key={prompt.id}
                className={`rounded-xl border bg-white p-5 transition-colors ${
                  prompt.isActive
                    ? "border-[#F2F4F6] hover:border-[#E5E8EB]"
                    : "border-[#F2F4F6] bg-[#FAFBFC] opacity-60"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        style={{
                          backgroundColor: typeColor.bg,
                          color: typeColor.text,
                        }}
                        className="hover:opacity-90"
                      >
                        {typeLabel}
                      </Badge>
                      {prompt.passage && (
                        <Badge
                          variant="secondary"
                          className="bg-[#F3EEFF] text-[#8B5CF6] hover:bg-[#F3EEFF]"
                        >
                          {prompt.passage.title}
                        </Badge>
                      )}
                      <Badge
                        variant="secondary"
                        className={
                          prompt.isActive
                            ? "bg-[#E8FAF0] text-[#00C471] hover:bg-[#E8FAF0]"
                            : "bg-[#F7F8FA] text-[#ADB5BD] hover:bg-[#F7F8FA]"
                        }
                      >
                        {prompt.isActive ? "활성" : "비활성"}
                      </Badge>
                    </div>

                    <p className="mt-3 text-[14px] leading-relaxed text-[#4E5968]">
                      {prompt.content.length > 200
                        ? `${prompt.content.slice(0, 200)}...`
                        : prompt.content}
                    </p>

                    <p className="mt-2 text-[12px] text-[#ADB5BD]">
                      {new Date(prompt.createdAt).toLocaleDateString("ko-KR")}
                    </p>
                  </div>

                  <div className="ml-4 flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-[#8B95A1] hover:text-[#191F28]"
                      onClick={() => handleToggleActive(prompt)}
                      disabled={isPending}
                      title={prompt.isActive ? "비활성화" : "활성화"}
                    >
                      {prompt.isActive ? (
                        <Power className="size-4" />
                      ) : (
                        <PowerOff className="size-4" />
                      )}
                    </Button>

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-[#ADB5BD] hover:text-[#F04452]"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>프롬프트 삭제</DialogTitle>
                          <DialogDescription>
                            이 프롬프트를 삭제하시겠습니까? 이 작업은 되돌릴
                            수 없습니다.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline">취소</Button>
                          </DialogClose>
                          <Button
                            onClick={() => handleDelete(prompt.id)}
                            disabled={isPending}
                            className="bg-[#F04452] text-white hover:bg-[#E5333F]"
                          >
                            삭제
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
