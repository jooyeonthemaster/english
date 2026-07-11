"use client";

// ============================================================================
// 로스터 반 칩 — 폴더 관리 문법(문제 뱅크 폴더 칩 미러)
//
// 반을 폴더처럼 다룬다: 칩 클릭=필터, [+ 반 추가]=인라인 생성, 칩 hover ⋯
// 메뉴=이름 변경·삭제, 학생 행을 끌어 칩에 놓으면 편성(드롭), 미배정 칩에
// 놓으면 모든 반에서 제외. 서버 액션은 기존 classes.ts CRUD 재사용 —
// 편성 정책(정원 전체거부·이미 재적 제외)은 서버가 정본.
// ============================================================================

import { useState, useTransition, type DragEvent, type ReactNode } from "react";
import {
  Check,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  createClass,
  deleteClass,
  enrollStudentsToClass,
  updateClass,
} from "@/actions/classes";
import { updateStudentClassAssignments } from "@/actions/students";
import {
  UNASSIGNED_CLASS_ID,
  type HubClass,
  type HubFilters,
  type UpdateParams,
} from "@/app/(director)/director/tutor/_components/types";
import { cn } from "@/lib/utils";

/** 로스터 행 → 반 칩 드래그 페이로드 MIME (roster-table 이 발신) */
export const STUDENT_DRAG_MIME = "application/x-smoat-students";

export interface StudentDragPayload {
  students: { id: string; name: string }[];
}

export function readStudentDrag(e: DragEvent): StudentDragPayload | null {
  try {
    const raw = e.dataTransfer.getData(STUDENT_DRAG_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudentDragPayload;
    if (!Array.isArray(parsed.students) || parsed.students.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hasStudentDrag(e: DragEvent): boolean {
  return [...e.dataTransfer.types].includes(STUDENT_DRAG_MIME);
}

const chipBase =
  "h-7 whitespace-nowrap rounded-full border px-3 text-[12px] font-semibold transition-colors";
const chipActive = "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm";
const chipIdle = "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600";
const chipDropReady = "border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-200/60";

export function RosterClassChips({
  filters,
  classes,
  isDirector,
  updateParams,
  onMutated,
}: {
  filters: HubFilters;
  classes: HubClass[];
  isDirector: boolean;
  updateParams: UpdateParams;
  /** 생성·수정·삭제·편성 후 목록 새로고침 */
  onMutated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const activeClasses = classes.filter((c) => c.isActive);
  // 반이 하나도 없어도 원장에게는 [+ 반 추가]가 보여야 한다(첫 반 생성 진입점)
  if (activeClasses.length === 0 && !isDirector) return null;

  const submitCreate = () => {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    startTransition(async () => {
      const res = await createClass("__CURRENT__", {
        name,
        capacity: 20,
        fee: 0,
        schedule: [],
      });
      if (res.success) {
        toast.success(`"${name}" 반을 만들었습니다.`);
        setNewName("");
        setAdding(false);
        onMutated();
      } else {
        toast.error(res.error ?? "반 생성에 실패했습니다.");
      }
    });
  };

  const submitRename = (id: string, prevName: string) => {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name || name === prevName) return;
    startTransition(async () => {
      const res = await updateClass(id, { name });
      if (res.success) {
        toast.success(`반 이름을 "${name}"으로 변경했습니다.`);
        onMutated();
      } else {
        toast.error(res.error ?? "이름 변경에 실패했습니다.");
      }
    });
  };

  const submitDelete = (cls: HubClass) => {
    setMenuOpenId(null);
    setConfirmDeleteId(null);
    startTransition(async () => {
      const res = await deleteClass(cls.id);
      if (res.success) {
        toast.success(`"${cls.name}" 반을 삭제했습니다.`);
        if (filters.classId === cls.id) updateParams({ classId: undefined, page: undefined });
        onMutated();
      } else {
        toast.error(res.error ?? "반 삭제에 실패했습니다.");
      }
    });
  };

  const dropEnroll = (cls: HubClass, e: DragEvent) => {
    e.preventDefault();
    setDragOverId(null);
    const payload = readStudentDrag(e);
    if (!payload) return;
    startTransition(async () => {
      const res = await enrollStudentsToClass(
        cls.id,
        payload.students.map((s) => s.id),
      );
      if (res.success) {
        const skipped =
          res.alreadyCount && res.alreadyCount > 0
            ? ` (이미 재적 ${res.alreadyCount}명 제외)`
            : "";
        toast.success(`${res.enrolledCount}명을 ${cls.name} 반에 편성했습니다.${skipped}`);
        onMutated();
      } else {
        toast.error(res.error ?? "반 편성에 실패했습니다.");
      }
    });
  };

  const dropUnassign = (e: DragEvent) => {
    e.preventDefault();
    setDragOverId(null);
    const payload = readStudentDrag(e);
    if (!payload) return;
    startTransition(async () => {
      const results = await Promise.all(
        payload.students.map((s) => updateStudentClassAssignments(s.id, [])),
      );
      const ok = results.filter((r) => r.success).length;
      if (ok > 0) {
        toast.success(`${ok}명을 모든 반에서 제외했습니다.`);
        onMutated();
      } else {
        toast.error("반 배정 해제에 실패했습니다.");
      }
    });
  };

  const dropProps = (id: string, onDrop: (e: DragEvent) => void) =>
    isDirector
      ? {
          onDragOver: (e: DragEvent) => {
            if (!hasStudentDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDragOverId(id);
          },
          onDragLeave: () => setDragOverId((cur) => (cur === id ? null : cur)),
          onDrop,
        }
      : {};

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[11px] font-semibold text-slate-400">반</span>

      <FilterChipButton
        active={!filters.classId}
        onClick={() => updateParams({ classId: undefined, page: undefined })}
      >
        전체 반
      </FilterChipButton>

      {/* 미배정 — 필터 + (원장) 드롭 시 모든 반에서 제외 */}
      <button
        type="button"
        onClick={() =>
          updateParams({
            classId:
              filters.classId === UNASSIGNED_CLASS_ID ? undefined : UNASSIGNED_CLASS_ID,
            status: filters.classId === UNASSIGNED_CLASS_ID ? undefined : "ACTIVE",
            page: undefined,
          })
        }
        title={isDirector ? "학생을 끌어다 놓으면 모든 반에서 제외됩니다" : undefined}
        className={cn(
          chipBase,
          dragOverId === UNASSIGNED_CLASS_ID
            ? "border-rose-300 bg-rose-50 text-rose-600 ring-2 ring-rose-200/60"
            : filters.classId === UNASSIGNED_CLASS_ID
              ? chipActive
              : chipIdle,
        )}
        {...dropProps(UNASSIGNED_CLASS_ID, dropUnassign)}
      >
        미배정
      </button>

      {activeClasses.map((c) =>
        renamingId === c.id ? (
          <span key={c.id} className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename(c.id, c.name);
                if (e.key === "Escape") setRenamingId(null);
              }}
              onBlur={() => submitRename(c.id, c.name)}
              aria-label="반 이름 변경"
              className="h-7 w-32 rounded-full border border-blue-300 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none focus:border-blue-500"
            />
          </span>
        ) : (
          <span key={c.id} className="group/chip relative inline-flex">
            <button
              type="button"
              onClick={() =>
                updateParams({
                  classId: filters.classId === c.id ? undefined : c.id,
                  page: undefined,
                })
              }
              title={isDirector ? "학생을 끌어다 놓으면 이 반에 편성됩니다" : undefined}
              className={cn(
                chipBase,
                isDirector && "pr-6",
                dragOverId === c.id
                  ? chipDropReady
                  : filters.classId === c.id
                    ? chipActive
                    : chipIdle,
              )}
              {...dropProps(c.id, (e) => dropEnroll(c, e))}
            >
              {c.name}
              <span className="ml-1 text-[11px] tabular-nums opacity-70">
                {c.enrolledCount}
              </span>
            </button>
            {isDirector ? (
              <Popover
                open={menuOpenId === c.id}
                onOpenChange={(open) => {
                  setMenuOpenId(open ? c.id : null);
                  if (!open) setConfirmDeleteId(null);
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${c.name} 반 관리 메뉴`}
                    className={cn(
                      "absolute right-1 top-1/2 flex size-4.5 -translate-y-1/2 items-center justify-center rounded-full text-slate-300 opacity-0 transition-opacity hover:bg-white hover:text-slate-600 focus-visible:opacity-100 group-hover/chip:opacity-100",
                      menuOpenId === c.id && "opacity-100",
                    )}
                  >
                    <MoreHorizontal className="size-3" aria-hidden />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-52 rounded-xl border-slate-200 p-1.5 shadow-lg">
                  {confirmDeleteId === c.id ? (
                    <div className="px-1 py-0.5">
                      <p className="px-1.5 text-[12.5px] font-bold text-slate-800">
                        &quot;{c.name}&quot; 반을 삭제할까요?
                      </p>
                      <p className="mt-0.5 px-1.5 text-[11.5px] leading-relaxed text-slate-400">
                        재적 {c.enrolledCount}명의 반 배정이 함께 해제됩니다. 학생
                        정보는 삭제되지 않습니다.
                      </p>
                      <div className="mt-2 flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="h-7 rounded-md px-2.5 text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-50"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => submitDelete(c)}
                          className="h-7 rounded-md bg-rose-600 px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <MenuItem
                        icon={<Pencil className="size-3.5" aria-hidden />}
                        onClick={() => {
                          setMenuOpenId(null);
                          setRenameValue(c.name);
                          setRenamingId(c.id);
                        }}
                      >
                        이름 변경
                      </MenuItem>
                      <MenuItem
                        icon={<Trash2 className="size-3.5" aria-hidden />}
                        tone="rose"
                        onClick={() => setConfirmDeleteId(c.id)}
                      >
                        반 삭제
                      </MenuItem>
                    </>
                  )}
                </PopoverContent>
              </Popover>
            ) : null}
          </span>
        ),
      )}

      {/* [+ 반 추가] — 폴더 "추가" 버튼 미러(인라인 생성) */}
      {isDirector ? (
        adding ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCreate();
                if (e.key === "Escape") {
                  setNewName("");
                  setAdding(false);
                }
              }}
              placeholder="새 반 이름"
              aria-label="새 반 이름"
              className="h-7 w-32 rounded-full border border-blue-300 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none placeholder:font-normal placeholder:text-slate-300 focus:border-blue-500"
            />
            <button
              type="button"
              disabled={pending}
              onClick={submitCreate}
              aria-label="반 만들기"
              className="flex size-6 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : (
                <Check className="size-3" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setNewName("");
                setAdding(false);
              }}
              aria-label="반 추가 취소"
              className="flex size-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-blue-200 bg-white px-2.5 text-[12px] font-semibold text-blue-500 transition-colors hover:border-blue-300 hover:bg-blue-50/70"
          >
            <Plus className="size-3" aria-hidden />
            반 추가
          </button>
        )
      ) : null}

      {isDirector && activeClasses.length > 0 ? (
        <span className="ml-1 hidden text-[11px] text-slate-300 lg:inline">
          학생 행을 끌어 반 칩에 놓으면 편성됩니다
        </span>
      ) : null}
    </div>
  );
}

function FilterChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={cn(chipBase, active ? chipActive : chipIdle)}>
      {children}
    </button>
  );
}

function MenuItem({
  icon,
  tone,
  onClick,
  children,
}: {
  icon: ReactNode;
  tone?: "rose";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-semibold transition-colors",
        tone === "rose"
          ? "text-rose-600 hover:bg-rose-50"
          : "text-slate-600 hover:bg-slate-50",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
