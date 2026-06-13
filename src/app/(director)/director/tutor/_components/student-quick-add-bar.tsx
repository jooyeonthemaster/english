"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GRADES } from "@/lib/constants";
import { createStudent } from "@/actions/students";

/**
 * Clean "quick add" bar below the roster — type a name, pick grade (sticks),
 * Enter → student created + code issued + input refocused. No modal per student.
 */
export function StudentQuickAddBar() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(1);
  const [isPending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const trimmed = name.trim();
    if (inFlight.current || !trimmed) {
      if (!trimmed) inputRef.current?.focus();
      return;
    }
    inFlight.current = true;
    startTransition(async () => {
      try {
        const result = await createStudent("__CURRENT__", { name: trimmed, grade });
        if (result.success && result.studentCode) {
          toast.success(`${trimmed} 등록 · 코드 ${result.studentCode}`, {
            action: {
              label: "코드 복사",
              onClick: () => void navigator.clipboard?.writeText(result.studentCode as string),
            },
          });
          setName("");
          router.refresh();
          inputRef.current?.focus();
        } else {
          toast.error(result.error || "등록에 실패했어요.");
          inputRef.current?.focus();
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-[#F2F4F6] bg-[#FBFCFD] px-4 py-2.5">
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-[#6B7684]">
        <span className="flex size-5 items-center justify-center rounded-md bg-blue-50 text-[#3182F6]">
          <Plus className="size-3.5" />
        </span>
        빠른 추가
      </span>

      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        maxLength={50}
        placeholder="학생 이름"
        className="h-9 w-full min-w-[160px] flex-1 rounded-lg text-sm sm:max-w-xs"
      />

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-xs font-medium text-[#8B95A1]">학년</span>
        <div role="radiogroup" aria-label="학년" className="flex gap-1">
          {GRADES.map((g) => {
            const on = grade === g.value;
            return (
              <button
                key={g.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setGrade(g.value)}
                className={cn(
                  "h-9 w-9 rounded-lg border text-xs font-bold transition",
                  on
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-[#E5E8EB] text-[#6B7684] hover:bg-white",
                )}
              >
                {g.value}
              </button>
            );
          })}
        </div>
      </div>

      <Button
        onClick={submit}
        disabled={isPending}
        className="h-9 shrink-0 rounded-lg bg-blue-600 text-sm font-bold text-white hover:bg-blue-700"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        추가
      </Button>

      <span className="hidden text-[11px] font-medium text-[#AEB5BC] sm:inline">
        Enter로도 추가 · 학년 유지
      </span>
    </div>
  );
}
