"use client";

import { useState, useTransition } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createPassage } from "@/actions/passages";
import { GRADES, SEMESTERS } from "@/lib/constants";
import { ChevronRight, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const NOTE_TYPES = [
  { value: "EMPHASIS", label: "강조" },
  { value: "GRAMMAR", label: "문법" },
  { value: "VOCAB", label: "어휘" },
  { value: "TIP", label: "팁" },
] as const;

interface NoteEntry {
  noteType: string;
  content: string;
}

export default function CreatePassagePage() {
  const router = useRouter();
  const params = useParams();
  const schoolSlug = params.schoolSlug as string;

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState("");
  const [semester, setSemester] = useState("");
  const [unit, setUnit] = useState("");
  const [source, setSource] = useState("");
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState<NoteEntry[]>([]);

  function addNote() {
    setNotes((prev) => [...prev, { noteType: "EMPHASIS", content: "" }]);
  }

  function removeNote(index: number) {
    setNotes((prev) => prev.filter((_, i) => i !== index));
  }

  function updateNote(index: number, field: keyof NoteEntry, value: string) {
    setNotes((prev) =>
      prev.map((note, i) => (i === index ? { ...note, [field]: value } : note))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    if (!grade) {
      setError("학년을 선택해주세요.");
      return;
    }
    if (!semester) {
      setError("학기를 선택해주세요.");
      return;
    }
    if (!content.trim()) {
      setError("지문 내용을 입력해주세요.");
      return;
    }

    startTransition(async () => {
      // We need schoolId — resolve it from slug via a hidden fetch approach:
      // Instead, we pass schoolId from server. But since this is client,
      // we'll call a modified server action that looks up by slug.
      // For simplicity, let's make createPassage accept slug and resolve internally.
      // Actually, looking at the existing pattern, we need to get schoolId first.

      // Fetch school by slug
      const res = await fetch(`/api/schools/${schoolSlug}`).catch(() => null);
      let schoolId: string | null = null;

      if (res?.ok) {
        const data = await res.json();
        schoolId = data.id;
      }

      // If the API doesn't exist yet, use an alternate approach: resolve via action
      if (!schoolId) {
        // Fallback: try to look up directly via the server action
        // We'll pass slug information and let the action resolve
        setError(
          "학교 정보를 불러올 수 없습니다. 페이지를 새로고침해주세요."
        );
        return;
      }

      const filteredNotes = notes.filter((n) => n.content.trim());

      const result = await createPassage({
        schoolId,
        title: title.trim(),
        content: content.trim(),
        source: source.trim() || undefined,
        grade: parseInt(grade),
        semester,
        unit: unit.trim() || undefined,
        notes: filteredNotes.length > 0 ? filteredNotes : undefined,
      });

      if (result.success) {
        router.push(`/admin/schools/${schoolSlug}/passages`);
      } else {
        setError(result.error || "등록에 실패했습니다.");
      }
    });
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
        <Link
          href={`/admin/schools/${schoolSlug}/passages`}
          className="transition-colors hover:text-[#3182F6]"
        >
          지문 관리
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-[#191F28]">새 지문 등록</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/admin/schools/${schoolSlug}/passages`}>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-[#8B95A1] hover:text-[#191F28]"
          >
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-[24px] font-bold text-[#191F28]">새 지문 등록</h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error && (
          <div className="rounded-lg border border-[#FEE2E2] bg-[#FFF5F5] px-4 py-3 text-[14px] text-[#F04452]">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
          <h2 className="mb-4 text-[16px] font-semibold text-[#191F28]">
            기본 정보
          </h2>
          <div className="flex flex-col gap-4">
            <div>
              <Label className="text-[13px] font-medium text-[#4E5968]">
                제목 <span className="text-[#F04452]">*</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="지문 제목"
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <Label className="text-[13px] font-medium text-[#4E5968]">
                  학년 <span className="text-[#F04452]">*</span>
                </Label>
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger className="mt-1.5 w-full">
                    <SelectValue placeholder="학년" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map((g) => (
                      <SelectItem key={g.value} value={String(g.value)}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[13px] font-medium text-[#4E5968]">
                  학기 <span className="text-[#F04452]">*</span>
                </Label>
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger className="mt-1.5 w-full">
                    <SelectValue placeholder="학기" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEMESTERS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[13px] font-medium text-[#4E5968]">
                  단원
                </Label>
                <Input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="예: Lesson 1"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-[13px] font-medium text-[#4E5968]">
                  출처
                </Label>
                <Input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="예: 교과서 p.24"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label className="text-[13px] font-medium text-[#4E5968]">
                지문 내용 <span className="text-[#F04452]">*</span>
              </Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="지문 전체 내용을 입력하세요..."
                className="mt-1.5 min-h-[200px]"
              />
            </div>
          </div>
        </div>

        {/* Teacher Notes */}
        <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-[#191F28]">
              학습 노트
            </h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addNote}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              노트 추가
            </Button>
          </div>

          {notes.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[#ADB5BD]">
              등록된 노트가 없습니다. &quot;노트 추가&quot; 버튼을 클릭하여
              학습 노트를 추가하세요.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {notes.map((note, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-[#E5E8EB] bg-[#F7F8FA] p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[12px]">
                        노트 {index + 1}
                      </Badge>
                      <Select
                        value={note.noteType}
                        onValueChange={(v) =>
                          updateNote(index, "noteType", v)
                        }
                      >
                        <SelectTrigger className="h-7 w-auto text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NOTE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeNote(index)}
                      className="size-7 text-[#ADB5BD] hover:text-[#F04452]"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <Textarea
                    value={note.content}
                    onChange={(e) =>
                      updateNote(index, "content", e.target.value)
                    }
                    placeholder="노트 내용을 입력하세요..."
                    className="min-h-[80px] bg-white"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link href={`/admin/schools/${schoolSlug}/passages`}>
            <Button type="button" variant="outline">
              취소
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isPending}
            className="bg-[#3182F6] text-white hover:bg-[#1B64DA]"
          >
            {isPending ? "등록 중..." : "지문 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}
