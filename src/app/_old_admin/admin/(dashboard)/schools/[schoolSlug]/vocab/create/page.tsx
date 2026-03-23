"use client";

import { useState, useTransition } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createVocabList, bulkCreateVocabItems } from "@/actions/vocab";
import { GRADES, SEMESTERS } from "@/lib/constants";
import { ChevronRight, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PARTS_OF_SPEECH = [
  { value: "noun", label: "명사" },
  { value: "verb", label: "동사" },
  { value: "adjective", label: "형용사" },
  { value: "adverb", label: "부사" },
  { value: "preposition", label: "전치사" },
  { value: "conjunction", label: "접속사" },
  { value: "pronoun", label: "대명사" },
  { value: "interjection", label: "감탄사" },
  { value: "phrase", label: "숙어/구" },
] as const;

interface WordEntry {
  english: string;
  korean: string;
  partOfSpeech: string;
  exampleEn: string;
  exampleKr: string;
}

function emptyWord(): WordEntry {
  return {
    english: "",
    korean: "",
    partOfSpeech: "",
    exampleEn: "",
    exampleKr: "",
  };
}

export default function CreateVocabPage() {
  const router = useRouter();
  const params = useParams();
  const schoolSlug = params.schoolSlug as string;

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState("");
  const [semester, setSemester] = useState("");
  const [unit, setUnit] = useState("");
  const [words, setWords] = useState<WordEntry[]>(
    Array.from({ length: 5 }, () => emptyWord())
  );

  function addWord() {
    setWords((prev) => [...prev, emptyWord()]);
  }

  function removeWord(index: number) {
    setWords((prev) => prev.filter((_, i) => i !== index));
  }

  function updateWord(
    index: number,
    field: keyof WordEntry,
    value: string
  ) {
    setWords((prev) =>
      prev.map((w, i) => (i === index ? { ...w, [field]: value } : w))
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

    const validWords = words.filter(
      (w) => w.english.trim() && w.korean.trim()
    );

    if (validWords.length === 0) {
      setError("최소 1개 이상의 단어를 입력해주세요.");
      return;
    }

    startTransition(async () => {
      // Get schoolId from slug
      const res = await fetch(`/api/schools/${schoolSlug}`).catch(() => null);
      if (!res?.ok) {
        setError("학교 정보를 불러올 수 없습니다.");
        return;
      }
      const school = await res.json();

      const listResult = await createVocabList({
        schoolId: school.id,
        title: title.trim(),
        grade: parseInt(grade),
        semester,
        unit: unit.trim() || undefined,
      });

      if (!listResult.success || !listResult.id) {
        setError(listResult.error || "단어장 등록에 실패했습니다.");
        return;
      }

      const itemsResult = await bulkCreateVocabItems(
        listResult.id,
        validWords.map((w) => ({
          english: w.english.trim(),
          korean: w.korean.trim(),
          partOfSpeech: w.partOfSpeech || undefined,
          exampleEn: w.exampleEn.trim() || undefined,
          exampleKr: w.exampleKr.trim() || undefined,
        }))
      );

      if (!itemsResult.success) {
        setError(itemsResult.error || "단어 등록에 실패했습니다.");
        return;
      }

      router.push(`/admin/schools/${schoolSlug}/vocab`);
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
          href={`/admin/schools/${schoolSlug}/vocab`}
          className="transition-colors hover:text-[#3182F6]"
        >
          단어장 관리
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-[#191F28]">새 단어장 등록</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/admin/schools/${schoolSlug}/vocab`}>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-[#8B95A1] hover:text-[#191F28]"
          >
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-[24px] font-bold text-[#191F28]">
          새 단어장 등록
        </h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error && (
          <div className="rounded-lg border border-[#FEE2E2] bg-[#FFF5F5] px-4 py-3 text-[14px] text-[#F04452]">
            {error}
          </div>
        )}

        {/* Basic info */}
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
                placeholder="단어장 제목"
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
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
            </div>
          </div>
        </div>

        {/* Word entries */}
        <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-[#191F28]">
              단어 목록
              <span className="ml-2 text-[13px] font-normal text-[#8B95A1]">
                ({words.filter((w) => w.english.trim() && w.korean.trim()).length}
                개 입력됨)
              </span>
            </h2>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="gap-1.5 opacity-50"
                title="준비 중"
              >
                CSV 임포트
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addWord}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                단어 추가
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_1fr_120px_1fr_1fr_40px] gap-2 px-1 text-[12px] font-medium text-[#8B95A1]">
              <span>영어 *</span>
              <span>한국어 *</span>
              <span>품사</span>
              <span>예문 (영어)</span>
              <span>예문 (한국어)</span>
              <span />
            </div>

            {words.map((word, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_1fr_120px_1fr_1fr_40px] gap-2 rounded-lg border border-[#E5E8EB] bg-[#FAFBFC] p-2"
              >
                <Input
                  value={word.english}
                  onChange={(e) => updateWord(index, "english", e.target.value)}
                  placeholder="English"
                  className="h-8 text-[13px]"
                />
                <Input
                  value={word.korean}
                  onChange={(e) => updateWord(index, "korean", e.target.value)}
                  placeholder="한국어"
                  className="h-8 text-[13px]"
                />
                <Select
                  value={word.partOfSpeech}
                  onValueChange={(v) => updateWord(index, "partOfSpeech", v)}
                >
                  <SelectTrigger className="h-8 w-full text-[12px]">
                    <SelectValue placeholder="품사" />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTS_OF_SPEECH.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={word.exampleEn}
                  onChange={(e) =>
                    updateWord(index, "exampleEn", e.target.value)
                  }
                  placeholder="Example sentence"
                  className="h-8 text-[13px]"
                />
                <Input
                  value={word.exampleKr}
                  onChange={(e) =>
                    updateWord(index, "exampleKr", e.target.value)
                  }
                  placeholder="예문 번역"
                  className="h-8 text-[13px]"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeWord(index)}
                  className="size-8 text-[#ADB5BD] hover:text-[#F04452]"
                  disabled={words.length <= 1}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link href={`/admin/schools/${schoolSlug}/vocab`}>
            <Button type="button" variant="outline">
              취소
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isPending}
            className="bg-[#3182F6] text-white hover:bg-[#1B64DA]"
          >
            {isPending ? "등록 중..." : "단어장 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}
