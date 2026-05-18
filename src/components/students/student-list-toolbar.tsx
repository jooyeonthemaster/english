// @ts-nocheck
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { STUDENT_STATUSES, GRADES } from "@/lib/constants";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  Users,
  UserCheck,
  UserX,
} from "lucide-react";

interface Filters {
  page: number;
  status: string;
  schoolId?: string;
  grade?: number;
  search?: string;
}

interface StudentListToolbarProps {
  total: number;
  isDirector: boolean;
  schools: any[];
  filters: Filters;
  selectedCount: number;
  defaultSearch: string;
  onSearch: (value: string) => void;
  onUpdateParams: (updates: Record<string, string | undefined>) => void;
  onOpenNewStudent: () => void;
  onBulkStatus: (status: string) => void;
}

export function StudentListToolbar({
  total,
  isDirector,
  schools,
  filters,
  selectedCount,
  defaultSearch,
  onSearch,
  onUpdateParams,
  onOpenNewStudent,
  onBulkStatus,
}: StudentListToolbarProps) {
  const [searchValue, setSearchValue] = useState(defaultSearch);

  function handleSearch() {
    onSearch(searchValue);
  }

  return (
    <div className="border-b border-[#F2F4F6] bg-white px-8 py-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="size-6 text-[#3182F6]" />
          <h1 className="text-xl font-bold text-[#191F28]">학생 관리</h1>
          <span className="text-sm text-[#8B95A1]">총 {total}명</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8B95A1]" />
            <Input
              placeholder="이름 또는 학생코드 검색"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-64 pl-9 h-9 text-sm"
            />
          </div>
          {isDirector && (
            <Button
              onClick={onOpenNewStudent}
              className="bg-[#3182F6] hover:bg-[#1B64DA] text-white h-9 px-4 text-sm"
            >
              <Plus className="size-4 mr-1.5" />
              학생 등록
            </Button>
          )}
        </div>
      </div>

      {/* ===== Filters Row ===== */}
      <div className="flex items-center gap-3 mt-4">
        {/* Status filter */}
        <div className="flex items-center gap-1">
          {[{ value: "ALL", label: "전체" }, ...STUDENT_STATUSES].map(
            (status) => (
              <button
                key={status.value}
                onClick={() => onUpdateParams({ status: status.value })}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  filters.status === status.value
                    ? "bg-[#191F28] text-white"
                    : "bg-[#F2F4F6] text-[#6B7684] hover:bg-[#E5E8EB]"
                )}
              >
                {status.label}
              </button>
            )
          )}
        </div>

        <div className="h-5 w-px bg-[#E5E8EB]" />

        {/* School filter */}
        <Select
          value={filters.schoolId || "ALL"}
          onValueChange={(val) =>
            onUpdateParams({ schoolId: val === "ALL" ? undefined : val })
          }
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="학교 전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">학교 전체</SelectItem>
            {schools.map((school) => (
              <SelectItem key={school.id} value={school.id}>
                {school.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Grade filter */}
        <Select
          value={filters.grade?.toString() || "ALL"}
          onValueChange={(val) =>
            onUpdateParams({ grade: val === "ALL" ? undefined : val })
          }
        >
          <SelectTrigger className="h-8 w-[100px] text-xs">
            <SelectValue placeholder="학년 전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">학년 전체</SelectItem>
            {GRADES.map((g) => (
              <SelectItem key={g.value} value={g.value.toString()}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Bulk Actions */}
        {isDirector && selectedCount > 0 && (
          <>
            <div className="h-5 w-px bg-[#E5E8EB]" />
            <span className="text-xs text-[#3182F6] font-medium">
              {selectedCount}명 선택
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  상태 변경
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => onBulkStatus("ACTIVE")}>
                  <UserCheck className="size-4 mr-2 text-emerald-600" />
                  재원으로 변경
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkStatus("PAUSED")}>
                  <UserX className="size-4 mr-2 text-amber-600" />
                  휴원으로 변경
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkStatus("WITHDRAWN")}>
                  <UserX className="size-4 mr-2 text-gray-500" />
                  퇴원으로 변경
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </div>
  );
}
