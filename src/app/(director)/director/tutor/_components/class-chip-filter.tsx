"use client";

import { MoreVertical, Pencil, Plus, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { HubClass, HubFilters, UpdateParams } from "./types";
import { UNASSIGNED_CLASS_ID } from "./types";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition",
        active
          ? "bg-[#191F28] text-white"
          : "bg-[#F2F4F6] text-[#6B7684] hover:bg-[#E5E8EB]",
      )}
    >
      {children}
    </button>
  );
}

function CountBadge({ active, count }: { active: boolean; count: number }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 text-[10px] font-black tabular-nums",
        active ? "bg-white/20 text-white" : "bg-white text-[#8B95A1]",
      )}
    >
      {count}
    </span>
  );
}

export function ClassChipFilter({
  classes,
  filters,
  updateParams,
  onAddClass,
  onEditClass,
  onDeleteClass,
}: {
  classes: HubClass[];
  filters: HubFilters;
  updateParams: UpdateParams;
  onAddClass: () => void;
  onEditClass: (cls: HubClass) => void;
  onDeleteClass: (cls: HubClass) => void;
}) {
  const activeClasses = classes.filter((c) => c.isActive);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip
        active={!filters.classId}
        onClick={() => updateParams({ classId: undefined, page: undefined })}
      >
        전체
      </Chip>
      <Chip
        active={filters.classId === UNASSIGNED_CLASS_ID}
        onClick={() =>
          updateParams({ classId: UNASSIGNED_CLASS_ID, billing: undefined, page: undefined })
        }
      >
        미배정
      </Chip>

      {activeClasses.map((cls) => {
        const active = filters.classId === cls.id;
        return (
          <div key={cls.id} className="group/chip relative inline-flex items-center">
            <button
              type="button"
              onClick={() =>
                updateParams({ classId: cls.id, billing: undefined, page: undefined })
              }
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full pl-3 pr-2 text-xs font-bold transition",
                active
                  ? "bg-[#191F28] text-white"
                  : "bg-[#F2F4F6] text-[#6B7684] hover:bg-[#E5E8EB]",
              )}
            >
              {cls.name}
              <CountBadge active={active} count={cls.enrolledCount} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`${cls.name} 반 메뉴`}
                  className={cn(
                    "ml-0.5 flex size-6 items-center justify-center rounded-full text-[#AEB5BC] transition hover:bg-[#E5E8EB] hover:text-[#4E5968]",
                  )}
                >
                  <MoreVertical className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => onEditClass(cls)}>
                  <Pencil className="size-4" />
                  반 수정
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => onDeleteClass(cls)}>
                  <Trash2 className="size-4" />
                  반 삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAddClass}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-dashed border-[#D1D6DB] px-3 text-xs font-bold text-[#8B95A1] transition hover:border-blue-300 hover:text-blue-600"
      >
        <Plus className="size-3.5" />
        반 추가
      </button>

      {activeClasses.length === 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#AEB5BC]">
          <Users className="size-3.5" />
          아직 만든 반이 없어요
        </span>
      )}
    </div>
  );
}
