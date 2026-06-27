"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SaveButton } from "@/components/ui/save-button";
import { updateStudentClassAssignments } from "@/actions/students";
import { createClass } from "@/actions/classes";
import type { HubClass } from "./types";

export function InlineClassAssignPopover({
  studentId,
  studentName,
  classes,
  enrolledClassIds,
}: {
  studentId: string;
  studentName: string;
  classes: HubClass[];
  enrolledClassIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(enrolledClassIds));
  const [isPending, startTransition] = useTransition();
  const [isCreating, startCreate] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  // Classes created inline (optimistic) — merged until router.refresh lands them.
  const [extraClasses, setExtraClasses] = useState<HubClass[]>([]);
  const createInFlight = useRef(false);

  useEffect(() => {
    if (!open) {
      setSelected(new Set(enrolledClassIds));
      setCreating(false);
      setNewClassName("");
      setExtraClasses([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrolledClassIds.join(","), open]);

  const activeClasses = classes.filter((c) => c.isActive);
  const activeIds = new Set(activeClasses.map((c) => c.id));
  const mergedClasses = [
    ...activeClasses,
    ...extraClasses.filter((c) => !activeIds.has(c.id)),
  ];

  function toggle(classId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }

  function createCls() {
    const name = newClassName.trim();
    if (!name || createInFlight.current) return;
    createInFlight.current = true;
    startCreate(async () => {
      try {
        const result = await createClass("__CURRENT__", {
          name,
          capacity: 20,
          fee: 0,
          schedule: [],
          isActive: true,
        });
        if (result.success && result.id) {
          const created: HubClass = {
            id: result.id,
            name,
            teacherId: null,
            teacherName: null,
            capacity: 20,
            fee: 0,
            room: null,
            isActive: true,
            enrolledCount: 0,
            schedule: [],
          };
          setExtraClasses((prev) => [...prev, created]);
          setSelected((prev) => new Set(prev).add(created.id));
          setNewClassName("");
          setCreating(false);
          router.refresh();
          toast.success(`${name} 반을 만들었어요. 저장하면 배정됩니다.`);
        } else {
          toast.error(result.error || "반 생성에 실패했어요.");
        }
      } finally {
        createInFlight.current = false;
      }
    });
  }

  function save() {
    startTransition(async () => {
      const result = await updateStudentClassAssignments(studentId, Array.from(selected));
      if (result.success) {
        if (result.waitlisted?.length) {
          toast.success(
            `${studentName} 학생 반 배정을 업데이트했어요. 정원 초과로 ${result.waitlisted.join(", ")}은(는) 대기열에 추가됐어요.`,
          );
        } else {
          toast.success(`${studentName} 학생의 반 배정을 업데이트했어요.`);
        }
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error || "반 배정에 실패했어요.");
      }
    });
  }

  const showCreateForm = creating || mergedClasses.length === 0;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSelected(new Set(enrolledClassIds));
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="반 배정"
          className="flex size-5 items-center justify-center rounded-md border border-dashed border-[#D1D6DB] text-[#AEB5BC] transition hover:border-blue-300 hover:text-blue-600"
        >
          <Plus className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 rounded-xl border-[#E5E8EB] p-0 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#F2F4F6] px-3 py-2.5">
          <p className="text-sm font-bold text-[#191F28]">반 배정</p>
          <p className="mt-0.5 text-[11px] font-medium text-[#8B95A1]">{studentName} · 여러 반 선택 가능</p>
        </div>

        <div className="max-h-60 overflow-y-auto p-1.5">
          {mergedClasses.length === 0 ? (
            <p className="px-2 pb-1 pt-3 text-center text-xs font-medium text-[#8B95A1]">
              아직 만든 반이 없어요. 아래에서 바로 만들 수 있어요.
            </p>
          ) : (
            mergedClasses.map((cls) => {
              const checked = selected.has(cls.id);
              const wasEnrolled = enrolledClassIds.includes(cls.id);
              const full = !wasEnrolled && cls.enrolledCount >= cls.capacity;
              return (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => toggle(cls.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-[#F7F8FA]"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[#191F28]">{cls.name}</span>
                    <span className="block text-[11px] font-medium text-[#8B95A1]">
                      {cls.enrolledCount}/{cls.capacity}명
                      {full && <span className="text-[#F04452]"> · 정원초과(대기)</span>}
                    </span>
                  </span>
                  {checked && <Check className="size-4 shrink-0 text-blue-600" />}
                </button>
              );
            })
          )}

          {/* Inline "new class" — create right here without leaving the popover. */}
          <div className={cn(mergedClasses.length > 0 && "mt-1 border-t border-[#F2F4F6] pt-1.5")}>
            {showCreateForm ? (
              <div className="flex items-center gap-1.5 px-1 py-1">
                <Input
                  autoFocus
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createCls();
                    } else if (e.key === "Escape" && mergedClasses.length > 0) {
                      setCreating(false);
                      setNewClassName("");
                    }
                  }}
                  maxLength={30}
                  placeholder="새 반 이름 (예: 고2 심화)"
                  className="h-8 rounded-lg text-sm"
                />
                <Button
                  size="sm"
                  onClick={createCls}
                  disabled={isCreating || !newClassName.trim()}
                  className="h-8 shrink-0 rounded-lg bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
                >
                  {isCreating ? <Loader2 className="size-3.5 animate-spin" /> : "만들기"}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-bold text-[#3182F6] transition hover:bg-blue-50"
              >
                <Plus className="size-4" />
                새 반 만들기
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#F2F4F6] px-3 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-lg text-xs font-bold text-[#6B7684]"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            취소
          </Button>
          <SaveButton onClick={save} saving={isPending} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
