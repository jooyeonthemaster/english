"use client";

// ============================================================================
// 로스터 벌크 선택 바 — 체크한 학생으로 과제 배포 / 반 편성.
//
// 페이지·필터를 오가며 모은 선택이 그대로 유지되므로, 이름 칩(최대 5명+N)으로
// "지금 누구에게 배포되는지"를 항상 눈에 보이게 해 오배포를 방지한다.
// sticky bottom — SectionCard 는 overflow-hidden 이라 카드 밖(PageShell 직속)
// 에서 렌더해야 뷰포트 하단에 붙는다. 반 편성은 DIRECTOR 전용(서버에서도 검증).
// ============================================================================

import { useState, useTransition } from "react";
import { CheckSquare, ClipboardList, Loader2, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { enrollStudentsToClass } from "@/actions/classes";
import type { HubClass } from "@/app/(director)/director/tutor/_components/types";
import { cn } from "@/lib/utils";

const NAME_CHIP_MAX = 5;

export function RosterSelectionBar({
  selected,
  classes,
  isDirector,
  onAssign,
  onClear,
  onEnrolled,
}: {
  /** id → 이름 (부모 students-roster-client 가 페이지 전환에도 유지) */
  selected: ReadonlyMap<string, string>;
  classes: HubClass[];
  isDirector: boolean;
  /** 과제 배포 — AssignmentComposer 오픈(부모 소관) */
  onAssign: () => void;
  onClear: () => void;
  /** 반 편성 성공 후 — 부모가 선택 해제 + 목록 새로고침 */
  onEnrolled: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const names = [...selected.values()];
  const activeClasses = classes.filter((c) => c.isActive);

  function enroll(classId: string, className: string) {
    if (isPending) return;
    startTransition(async () => {
      const res = await enrollStudentsToClass(classId, [...selected.keys()]);
      if (res.success) {
        const skipped =
          res.alreadyCount && res.alreadyCount > 0
            ? ` (이미 재적 ${res.alreadyCount}명 제외)`
            : "";
        toast.success(`${res.enrolledCount}명을 ${className} 반에 편성했습니다.${skipped}`);
        setPickerOpen(false);
        onEnrolled();
      } else {
        toast.error(res.error || "반 편성에 실패했습니다.");
      }
    });
  }

  if (selected.size === 0) return null;

  return (
    <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center px-2">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg ring-1 ring-black/5">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[12px] font-bold text-blue-700 tabular-nums">
          <CheckSquare className="size-3.5" aria-hidden />
          선택 {selected.size}명
        </span>

        {/* 이름 칩 — 필터를 바꿔도 선택이 유지되므로 대상 실명을 상시 노출(오배포 방지) */}
        <div className="flex min-w-0 max-w-[420px] flex-wrap items-center gap-1">
          {names.slice(0, NAME_CHIP_MAX).map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="max-w-[96px] truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
            >
              {name}
            </span>
          ))}
          {names.length > NAME_CHIP_MAX ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-400 tabular-nums">
              +{names.length - NAME_CHIP_MAX}
            </span>
          ) : null}
        </div>

        {isDirector && activeClasses.length > 0 ? (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <UsersRound className="size-3.5" aria-hidden />
                반 편성
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="top"
              className="w-64 rounded-xl border-slate-200 p-0 shadow-lg"
            >
              <div className="border-b border-slate-100 px-3 py-2.5">
                <p className="text-sm font-bold text-slate-900">편성할 반 선택</p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                  선택한 {selected.size}명을 한 번에 편성합니다
                </p>
              </div>
              <div className="max-h-64 space-y-0.5 overflow-y-auto p-1.5">
                {activeClasses.map((c) => {
                  const full = c.enrolledCount >= c.capacity;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={isPending}
                      onClick={() => enroll(c.id, c.name)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="min-w-0 truncate text-[12.5px] font-semibold text-slate-700">
                        {c.name}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[11px] font-medium tabular-nums",
                          full ? "text-rose-600" : "text-slate-400",
                        )}
                      >
                        재적 {c.enrolledCount} / {c.capacity}
                      </span>
                    </button>
                  );
                })}
              </div>
              {isPending ? (
                <div className="flex items-center justify-center gap-1.5 border-t border-slate-100 px-3 py-2 text-[11.5px] text-slate-400">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  편성 중…
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
        ) : null}

        <button
          type="button"
          onClick={onAssign}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <ClipboardList className="size-3.5" aria-hidden />
          과제 배포
        </button>

        <button
          type="button"
          onClick={onClear}
          aria-label="선택 해제"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
