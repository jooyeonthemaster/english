"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Search,
  GraduationCap,
  Trash2,
  Eye,
  Calendar,
} from "lucide-react";
import { deleteExam } from "@/actions/exams";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExamItem {
  id: string;
  title: string;
  type: string;
  status: string;
  examDate: string | Date | null;
  totalPoints: number;
  class: { id: string; name: string } | null;
  school: { id: string; name: string } | null;
  _count: { questions: number; submissions: number };
}

interface ClassOption {
  id: string;
  name: string;
}

interface Props {
  exams: ExamItem[];
  classes: ClassOption[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TYPE_LABELS: Record<string, string> = {
  OFFLINE: "오프라인",
  ONLINE: "온라인",
  VOCAB: "단어",
  MOCK: "모의",
};

const TYPE_COLORS: Record<string, string> = {
  OFFLINE: "bg-slate-100 text-slate-700",
  ONLINE: "bg-blue-100 text-blue-700",
  VOCAB: "bg-violet-100 text-violet-700",
  MOCK: "bg-orange-100 text-orange-700",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "초안",
  PUBLISHED: "배포됨",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  ARCHIVED: "보관",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  PUBLISHED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  ARCHIVED: "bg-gray-100 text-gray-500",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ExamListClient({ exams, classes }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Client-side filtering for instant response
  const filtered = exams.filter((exam) => {
    if (search && !exam.title.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (typeFilter !== "ALL" && exam.type !== typeFilter) return false;
    if (statusFilter !== "ALL" && exam.status !== statusFilter) return false;
    if (classFilter !== "ALL" && exam.class?.id !== classFilter) return false;
    return true;
  });

  async function handleDelete() {
    if (!deleteId) return;
    startTransition(async () => {
      const result = await deleteExam(deleteId);
      if (result.success) {
        toast.success("시험이 삭제되었습니다.");
        router.refresh();
      } else {
        toast.error(result.error || "삭제에 실패했습니다.");
      }
      setDeleteId(null);
    });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50">
            <GraduationCap className="size-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#191F28]">시험 관리</h1>
            <p className="text-sm text-[#8B95A1]">
              시험 생성, 문제 관리 및 성적 분석
            </p>
          </div>
        </div>
        <Button asChild className="bg-[#3182F6] hover:bg-[#1B64DA]">
          <Link href="/director/exams/create">
            <Plus className="size-4 mr-1.5" />
            시험 만들기
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8B95A1]" />
          <Input
            placeholder="시험명 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white border-[#E5E8EB]"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[130px] bg-white border-[#E5E8EB]">
            <SelectValue placeholder="유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 유형</SelectItem>
            <SelectItem value="OFFLINE">오프라인</SelectItem>
            <SelectItem value="ONLINE">온라인</SelectItem>
            <SelectItem value="VOCAB">단어</SelectItem>
            <SelectItem value="MOCK">모의</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] bg-white border-[#E5E8EB]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 상태</SelectItem>
            <SelectItem value="DRAFT">초안</SelectItem>
            <SelectItem value="PUBLISHED">배포됨</SelectItem>
            <SelectItem value="IN_PROGRESS">진행중</SelectItem>
            <SelectItem value="COMPLETED">완료</SelectItem>
            <SelectItem value="ARCHIVED">보관</SelectItem>
          </SelectContent>
        </Select>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-[150px] bg-white border-[#E5E8EB]">
            <SelectValue placeholder="반" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 반</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#E5E8EB] bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                시험명
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                유형
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                반
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                시험일
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs text-center">
                문제
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                상태
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs text-center">
                응시
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs text-right">
                관리
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-12 text-[#8B95A1]"
                >
                  {exams.length === 0
                    ? "등록된 시험이 없습니다."
                    : "검색 결과가 없습니다."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((exam) => (
                <TableRow
                  key={exam.id}
                  className="cursor-pointer hover:bg-[#F7F8FA]"
                  onClick={() =>
                    router.push(`/director/exams/${exam.id}`)
                  }
                >
                  <TableCell className="font-medium text-[#191F28]">
                    {exam.title}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        TYPE_COLORS[exam.type] || "bg-gray-100 text-gray-600"
                      )}
                    >
                      {TYPE_LABELS[exam.type] || exam.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-[#4E5968]">
                    {exam.class?.name || "-"}
                  </TableCell>
                  <TableCell className="text-[#4E5968]">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3.5 text-[#8B95A1]" />
                      {exam.examDate
                        ? formatDate(exam.examDate)
                        : "미정"}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-[#4E5968]">
                    {exam._count.questions}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        STATUS_COLORS[exam.status] ||
                          "bg-gray-100 text-gray-600"
                      )}
                    >
                      {STATUS_LABELS[exam.status] || exam.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-[#4E5968]">
                    {exam._count.submissions}
                  </TableCell>
                  <TableCell className="text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        asChild
                      >
                        <Link href={`/director/exams/${exam.id}`}>
                          <Eye className="size-4 text-[#6B7684]" />
                        </Link>
                      </Button>
                      {exam.status === "DRAFT" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setDeleteId(exam.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Dialog */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>시험을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 시험과 관련된 모든 문제가
              삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
              disabled={isPending}
            >
              {isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
