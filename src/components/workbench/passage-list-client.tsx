"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Plus,
  Search,
  BookOpen,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, truncate, getSemesterLabel } from "@/lib/utils";
import { PassageImportDialog } from "@/components/workbench/passage-import-dialog";

interface PassageListProps {
  passagesData: {
    passages: Array<{
      id: string;
      title: string;
      content: string;
      grade: number | null;
      semester: string | null;
      unit: string | null;
      publisher: string | null;
      difficulty: string | null;
      tags: string | null;
      createdAt: Date;
      school: { id: string; name: string; type: string } | null;
      analysis: { id: string; updatedAt: Date } | null;
      _count: { questions: number; notes: number };
    }>;
    total: number;
    page: number;
    totalPages: number;
  };
  schools: Array<{
    id: string;
    name: string;
    type: string;
    publisher: string | null;
  }>;
  filters: {
    page: number;
    schoolId?: string;
    grade?: number;
    semester?: string;
    publisher?: string;
    search?: string;
  };
}

const DIFFICULTY_LABELS: Record<string, { label: string; className: string }> = {
  BEGINNER: { label: "초급", className: "bg-green-50 text-green-700" },
  ELEMENTARY: { label: "기초", className: "bg-emerald-50 text-emerald-700" },
  INTERMEDIATE: { label: "중급", className: "bg-blue-50 text-blue-700" },
  UPPER_INTERMEDIATE: { label: "중상", className: "bg-indigo-50 text-indigo-700" },
  ADVANCED: { label: "고급", className: "bg-orange-50 text-orange-700" },
  EXPERT: { label: "최상급", className: "bg-red-50 text-red-700" },
};

export function PassageListClient({
  passagesData,
  schools,
  filters,
}: PassageListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(filters.search || "");
  const [importOpen, setImportOpen] = useState(false);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "ALL") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/director/workbench/passages?${params.toString()}`);
  }

  function handleSearch() {
    updateFilter("search", searchValue);
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`/director/workbench/passages?${params.toString()}`);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/director/workbench">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              지문 관리
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              총 {passagesData.total}개 지문
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="border-blue-200 text-blue-600 hover:bg-blue-50"
          >
            <FileText className="w-4 h-4 mr-1.5" />
            일괄 등록
          </Button>
          <Link href="/director/workbench/passages/create">
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-1.5" />
              지문 등록
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <Select
              value={filters.schoolId || "ALL"}
              onValueChange={(v) => updateFilter("schoolId", v)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="학교" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체 학교</SelectItem>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.grade ? String(filters.grade) : "ALL"}
              onValueChange={(v) => updateFilter("grade", v)}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="학년" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체 학년</SelectItem>
                <SelectItem value="1">1학년</SelectItem>
                <SelectItem value="2">2학년</SelectItem>
                <SelectItem value="3">3학년</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.semester || "ALL"}
              onValueChange={(v) => updateFilter("semester", v)}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="학기" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체 학기</SelectItem>
                <SelectItem value="FIRST">1학기</SelectItem>
                <SelectItem value="SECOND">2학기</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <Input
                placeholder="지문 검색..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-[220px]"
              />
              <Button variant="outline" size="icon" onClick={handleSearch}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Passage Cards */}
      {passagesData.passages.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">등록된 지문이 없습니다</p>
          <p className="text-sm text-slate-400 mt-1">
            지문을 등록하여 AI 문제 생성을 시작하세요
          </p>
          <Link href="/director/workbench/passages/create">
            <Button className="mt-4 bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-1.5" />
              첫 지문 등록
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {passagesData.passages.map((passage) => {
            const tags: string[] = passage.tags
              ? JSON.parse(passage.tags)
              : [];
            return (
              <Link
                key={passage.id}
                href={`/director/workbench/passages/${passage.id}`}
              >
                <Card className="h-full hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group">
                  <CardContent className="p-5 space-y-3">
                    {/* Title + badges */}
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-1">
                        {passage.title}
                      </h3>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {passage.analysis && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-50 text-emerald-600 border-emerald-200"
                          >
                            <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                            분석완료
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Preview text */}
                    <p className="text-sm text-slate-500 font-mono leading-relaxed line-clamp-3">
                      {truncate(passage.content, 150)}
                    </p>

                    {/* Meta row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {passage.school && (
                        <Badge variant="outline" className="text-[10px]">
                          {passage.school.name}
                        </Badge>
                      )}
                      {passage.grade && (
                        <Badge variant="secondary" className="text-[10px]">
                          {passage.grade}학년
                        </Badge>
                      )}
                      {passage.semester && (
                        <Badge variant="secondary" className="text-[10px]">
                          {getSemesterLabel(passage.semester)}
                        </Badge>
                      )}
                      {passage.difficulty &&
                        DIFFICULTY_LABELS[passage.difficulty] && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              DIFFICULTY_LABELS[passage.difficulty].className
                            }`}
                          >
                            {DIFFICULTY_LABELS[passage.difficulty].label}
                          </Badge>
                        )}
                      {tags.slice(0, 3).map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-[10px] text-slate-500"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {tags.length > 3 && (
                        <span className="text-[10px] text-slate-400">
                          +{tags.length - 3}
                        </span>
                      )}
                    </div>

                    {/* Bottom row */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-xs text-slate-400">
                        {formatDate(passage.createdAt)}
                      </span>
                      <span className="text-xs text-slate-500">
                        문제 {passage._count.questions}개 · 노트{" "}
                        {passage._count.notes}개
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {passagesData.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={passagesData.page <= 1}
            onClick={() => goToPage(passagesData.page - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-slate-600 px-3">
            {passagesData.page} / {passagesData.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={passagesData.page >= passagesData.totalPages}
            onClick={() => goToPage(passagesData.page + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
      <PassageImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
