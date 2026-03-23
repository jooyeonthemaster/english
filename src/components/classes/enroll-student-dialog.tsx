"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Search, UserPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { searchStudents, enrollStudent } from "@/actions/classes";
import { getInitials, getGradeLabel } from "@/lib/utils";

interface EnrollStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  academyId: string;
  enrolledStudentIds: string[];
}

interface StudentResult {
  id: string;
  name: string;
  studentCode: string;
  grade: number;
  avatarUrl: string | null;
}

export function EnrollStudentDialog({
  open,
  onOpenChange,
  classId,
  academyId,
  enrolledStudentIds,
}: EnrollStudentDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  const handleSearch = useCallback(
    async (value: string) => {
      setQuery(value);
      if (value.length < 1) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const students = await searchStudents(academyId, value);
        setResults(students);
      } catch {
        toast.error("검색에 실패했습니다.");
      } finally {
        setSearching(false);
      }
    },
    [academyId]
  );

  async function handleEnroll(studentId: string) {
    setEnrollingId(studentId);
    try {
      const result = await enrollStudent(classId, studentId);
      if (result.success) {
        toast.success("학생이 등록되었습니다.");
        setResults((prev) => prev.filter((s) => s.id !== studentId));
      } else {
        toast.error(result.error || "등록에 실패했습니다.");
      }
    } catch {
      toast.error("등록에 실패했습니다.");
    } finally {
      setEnrollingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-900">
            학생 등록
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="학생 이름 또는 코드로 검색..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="h-10 pl-9"
              autoFocus
            />
          </div>

          {/* Results */}
          <div className="max-h-[320px] overflow-y-auto space-y-1">
            {searching && (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}

            {!searching && query.length > 0 && results.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">
                검색 결과가 없습니다.
              </p>
            )}

            {!searching &&
              results.map((student) => {
                const isEnrolled = enrolledStudentIds.includes(student.id);
                return (
                  <div
                    key={student.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-blue-50 text-blue-600 text-xs font-bold">
                          {getInitials(student.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {student.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {student.studentCode} &middot;{" "}
                          {getGradeLabel(student.grade)}
                        </p>
                      </div>
                    </div>

                    {isEnrolled ? (
                      <Badge
                        variant="secondary"
                        className="text-xs bg-gray-100 text-gray-500"
                      >
                        등록됨
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleEnroll(student.id)}
                        disabled={enrollingId === student.id}
                        className="h-8 text-xs gap-1 bg-blue-500 hover:bg-blue-600"
                      >
                        {enrollingId === student.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <UserPlus className="h-3 w-3" />
                        )}
                        등록
                      </Button>
                    )}
                  </div>
                );
              })}

            {!searching && query.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">
                학생 이름 또는 코드를 입력하여 검색하세요.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
