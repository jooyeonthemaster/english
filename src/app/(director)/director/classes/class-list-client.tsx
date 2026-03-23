"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Users,
  Clock,
  MapPin,
  CreditCard,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClassFormDialog } from "@/components/classes/class-form-dialog";
import { deleteClass } from "@/actions/classes";
import { formatCurrency, getInitials, formatScheduleLabel } from "@/lib/utils";
import type { ScheduleEntry } from "@/actions/classes";

interface ClassItem {
  id: string;
  name: string;
  teacherId: string | null;
  teacherName: string | null;
  teacherAvatar: string | null;
  schedule: ScheduleEntry[];
  capacity: number;
  fee: number;
  room: string | null;
  isActive: boolean;
  enrolledCount: number;
  createdAt: Date;
}

interface ClassListClientProps {
  classes: ClassItem[];
  academyId: string;
}

export function ClassListClient({ classes, academyId }: ClassListClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editData, setEditData] = useState<ClassItem | null>(null);

  function handleEdit(cls: ClassItem) {
    setEditData(cls);
    setDialogOpen(true);
  }

  function handleAdd() {
    setEditData(null);
    setDialogOpen(true);
  }

  async function handleDelete(classId: string, className: string) {
    if (!confirm(`"${className}" 반을 삭제하시겠습니까?`)) return;
    const result = await deleteClass(classId);
    if (result.success) {
      toast.success("반이 삭제되었습니다.");
    } else {
      toast.error(result.error || "삭제에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            반 관리
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            총 {classes.length}개 반이 운영 중입니다.
          </p>
        </div>
        <Button
          onClick={handleAdd}
          className="h-10 gap-2 bg-blue-500 hover:bg-blue-600 shadow-sm"
        >
          <Plus className="h-4 w-4" />
          반 추가
        </Button>
      </div>

      {/* Grid */}
      {classes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 mb-4">
            <Users className="h-8 w-8 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            등록된 반이 없습니다
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            첫 번째 반을 추가하여 학생 관리를 시작하세요.
          </p>
          <Button
            onClick={handleAdd}
            className="mt-4 gap-2 bg-blue-500 hover:bg-blue-600"
          >
            <Plus className="h-4 w-4" />
            반 추가하기
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {classes.map((cls) => {
            const fillRate =
              cls.capacity > 0
                ? Math.round((cls.enrolledCount / cls.capacity) * 100)
                : 0;

            return (
              <div
                key={cls.id}
                className="group relative rounded-xl border border-gray-200 bg-white p-5 shadow-card transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5"
              >
                {/* Top row: Name + Status + Menu */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/director/classes/${cls.id}`}
                      className="text-[16px] font-bold text-gray-900 hover:text-blue-600 transition-colors truncate block"
                    >
                      {cls.name}
                    </Link>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Badge
                      variant={cls.isActive ? "default" : "secondary"}
                      className={
                        cls.isActive
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px]"
                          : "bg-gray-100 text-gray-500 text-[11px]"
                      }
                    >
                      {cls.isActive ? "운영중" : "비활성"}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="h-4 w-4 text-gray-400" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(cls)}>
                          <Pencil className="h-4 w-4" />
                          수정
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleDelete(cls.id, cls.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                          삭제
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Teacher */}
                <div className="flex items-center gap-2 mb-4">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-blue-50 text-blue-600 text-[10px] font-bold">
                      {cls.teacherName ? getInitials(cls.teacherName) : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-gray-600">
                    {cls.teacherName || "강사 미지정"}
                  </span>
                </div>

                {/* Info rows */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">
                      {formatScheduleLabel(cls.schedule)}
                    </span>
                  </div>
                  {cls.room && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span>{cls.room}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <CreditCard className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span>{formatCurrency(cls.fee)}/월</span>
                  </div>
                </div>

                {/* Capacity bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      수강 인원
                    </span>
                    <span className="font-semibold text-gray-700">
                      {cls.enrolledCount}/{cls.capacity}명
                    </span>
                  </div>
                  <Progress
                    value={fillRate}
                    className="h-2"
                  />
                </div>

                {/* Clickable overlay */}
                <Link
                  href={`/director/classes/${cls.id}`}
                  className="absolute inset-0 rounded-xl"
                  aria-label={`${cls.name} 상세보기`}
                  style={{ zIndex: 0 }}
                />
                {/* Raise interactive elements above the overlay */}
                <style>{`
                  .group button, .group [role="menuitem"], .group a:not([aria-label]) {
                    position: relative;
                    z-index: 1;
                  }
                `}</style>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Dialog */}
      <ClassFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        academyId={academyId}
        editData={
          editData
            ? {
                id: editData.id,
                name: editData.name,
                teacherId: editData.teacherId,
                capacity: editData.capacity,
                fee: editData.fee,
                room: editData.room,
                schedule: editData.schedule,
                isActive: editData.isActive,
              }
            : null
        }
      />
    </div>
  );
}
