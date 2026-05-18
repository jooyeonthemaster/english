// @ts-nocheck
"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Filters {
  page: number;
  status: string;
  schoolId?: string;
  grade?: number;
  search?: string;
}

interface StudentListPaginationProps {
  studentsData: any;
  filters: Filters;
  onUpdateParams: (updates: Record<string, string | undefined>) => void;
}

export function StudentListPagination({
  studentsData,
  filters,
  onUpdateParams,
}: StudentListPaginationProps) {
  if (studentsData.totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-xs text-[#8B95A1]">
        {(studentsData.page - 1) * studentsData.pageSize + 1} -{" "}
        {Math.min(
          studentsData.page * studentsData.pageSize,
          studentsData.total
        )}{" "}
        / {studentsData.total}건
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={studentsData.page <= 1}
          onClick={() =>
            onUpdateParams({
              page: (studentsData.page - 1).toString(),
              status: filters.status,
              schoolId: filters.schoolId,
              grade: filters.grade?.toString(),
              search: filters.search,
            })
          }
        >
          <ChevronLeft className="size-4" />
        </Button>
        {Array.from(
          { length: Math.min(studentsData.totalPages, 7) },
          (_, i) => {
            let pageNum: number;
            if (studentsData.totalPages <= 7) {
              pageNum = i + 1;
            } else if (studentsData.page <= 4) {
              pageNum = i + 1;
            } else if (studentsData.page >= studentsData.totalPages - 3) {
              pageNum = studentsData.totalPages - 6 + i;
            } else {
              pageNum = studentsData.page - 3 + i;
            }
            return (
              <Button
                key={pageNum}
                variant={
                  pageNum === studentsData.page ? "default" : "outline"
                }
                size="icon"
                className={cn(
                  "size-8 text-xs",
                  pageNum === studentsData.page &&
                    "bg-[#191F28] text-white hover:bg-[#333D4B]"
                )}
                onClick={() =>
                  onUpdateParams({
                    page: pageNum.toString(),
                    status: filters.status,
                    schoolId: filters.schoolId,
                    grade: filters.grade?.toString(),
                    search: filters.search,
                  })
                }
              >
                {pageNum}
              </Button>
            );
          }
        )}
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={studentsData.page >= studentsData.totalPages}
          onClick={() =>
            onUpdateParams({
              page: (studentsData.page + 1).toString(),
              status: filters.status,
              schoolId: filters.schoolId,
              grade: filters.grade?.toString(),
              search: filters.search,
            })
          }
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
