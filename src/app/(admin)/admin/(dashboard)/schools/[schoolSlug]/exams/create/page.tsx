"use client";

import { useState, useTransition } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createExam } from "@/actions/exams";
import { GRADES, SEMESTERS, EXAM_TYPES } from "@/lib/constants";
import { ChevronRight, ArrowLeft } from "lucide-react";
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

export default function CreateExamPage() {
  const router = useRouter();
  const params = useParams();
  const schoolSlug = params.schoolSlug as string;

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState("");
  const [semester, setSemester] = useState("");
  const [examType, setExamType] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("시험명을 입력해주세요.");
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
    if (!examType) {
      setError("시험 유형을 선택해주세요.");
      return;
    }
    if (!year || isNaN(parseInt(year))) {
      setError("연도를 입력해주세요.");
      return;
    }

    startTransition(async () => {
      const res = await fetch(`/api/schools/${schoolSlug}`).catch(() => null);
      if (!res?.ok) {
        setError("학교 정보를 불러올 수 없습니다.");
        return;
      }
      const school = await res.json();

      const result = await createExam({
        schoolId: school.id,
        title: title.trim(),
        grade: parseInt(grade),
        semester,
        examType,
        year: parseInt(year),
      });

      if (result.success && result.id) {
        router.push(
          `/admin/schools/${schoolSlug}/exams/${result.id}/questions`
        );
      } else {
        setError(result.error || "시험 등록에 실패했습니다.");
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
          href={`/admin/schools/${schoolSlug}/exams`}
          className="transition-colors hover:text-[#3182F6]"
        >
          시험 관리
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-[#191F28]">새 시험 등록</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/admin/schools/${schoolSlug}/exams`}>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-[#8B95A1] hover:text-[#191F28]"
          >
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-[24px] font-bold text-[#191F28]">새 시험 등록</h1>
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
            시험 정보
          </h2>
          <div className="flex flex-col gap-4">
            <div>
              <Label className="text-[13px] font-medium text-[#4E5968]">
                시험명 <span className="text-[#F04452]">*</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 2026년 1학기 중간고사"
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
                  유형 <span className="text-[#F04452]">*</span>
                </Label>
                <Select value={examType} onValueChange={setExamType}>
                  <SelectTrigger className="mt-1.5 w-full">
                    <SelectValue placeholder="유형" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXAM_TYPES.map((e) => (
                      <SelectItem key={e.value} value={e.value}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[13px] font-medium text-[#4E5968]">
                  연도 <span className="text-[#F04452]">*</span>
                </Label>
                <Input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2026"
                  min={2020}
                  max={2030}
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href={`/admin/schools/${schoolSlug}/exams`}>
            <Button type="button" variant="outline">
              취소
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isPending}
            className="bg-[#3182F6] text-white hover:bg-[#1B64DA]"
          >
            {isPending ? "등록 중..." : "시험 등록 후 문항 관리"}
          </Button>
        </div>
      </form>
    </div>
  );
}
