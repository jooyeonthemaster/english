"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, GraduationCap, KeyRound, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { updateStudentClassAssignments } from "@/actions/students";
import type { HubClass } from "@/app/(director)/director/tutor/_components/types";

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Shown inside the registration dialog right after a student is created:
 * surfaces the issued code (copy) and lets the director assign classes
 * without leaving the modal.
 */
export function StudentFormSuccessStep({
  studentId,
  studentName,
  studentCode,
  classes,
  onAddAnother,
  onClose,
}: {
  studentId: string;
  studentName: string;
  studentCode: string;
  classes: HubClass[];
  onAddAnother: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const copyRef = useRef<HTMLButtonElement>(null);
  const activeClasses = classes.filter((c) => c.isActive);

  // Focus the copy button on mount so the issued code is one Enter away.
  useEffect(() => {
    copyRef.current?.focus();
  }, []);

  async function copy() {
    const ok = await copyToClipboard(studentCode);
    if (ok) {
      setCopied(true);
      toast.success("학생 코드를 복사했어요.", {
        action: { label: "다시 복사", onClick: () => void copyToClipboard(studentCode) },
      });
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("복사하지 못했어요. 코드를 직접 선택해 복사해 주세요.");
    }
  }

  function toggle(classId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }

  function finish(then: () => void) {
    if (inFlight.current) return;
    inFlight.current = true;
    if (selected.size === 0) {
      router.refresh();
      then();
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateStudentClassAssignments(studentId, Array.from(selected));
        if (result.success) {
          if (result.waitlisted?.length) {
            toast.success(`반 배정 완료 — 정원 초과로 ${result.waitlisted.join(", ")}은(는) 대기열에 추가됐어요.`);
          } else {
            toast.success("반 배정을 완료했어요.");
          }
        } else {
          toast.error(result.error || "반 배정에 실패했어요.");
        }
        router.refresh();
        then();
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center pt-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Check className="size-6" />
        </div>
        <p className="mt-3 text-base font-black text-[#191F28]">
          {studentName} 학생이 등록되었어요
        </p>
        <p className="mt-0.5 text-sm font-medium text-[#6B7684]">
          이어서 반을 배정하거나, 학생에게 코드를 알려주세요.
        </p>
      </div>

      {/* Issued code */}
      <div className="rounded-xl border border-[#E5E8EB] bg-[#F7F8FA] p-4">
        <p className="flex items-center gap-1.5 text-xs font-bold text-[#6B7684]">
          <KeyRound className="size-3.5 text-[#3182F6]" />
          학생 코드
        </p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="font-mono text-2xl font-black tracking-[0.3em] text-[#191F28]">
            {studentCode}
          </span>
          <Button
            ref={copyRef}
            onClick={copy}
            variant="outline"
            className="h-9 shrink-0 rounded-lg border-[#E5E8EB] text-sm font-bold text-[#4E5968] hover:bg-white"
          >
            {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
            {copied ? "복사됨" : "복사"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] font-medium text-[#8B95A1]">
          학생이 앱에서 학원코드와 함께 이 코드를 입력하면 로그인돼요. (기기 2대까지)
        </p>
      </div>

      {/* Inline class assignment */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#6B7684]">
          <GraduationCap className="size-3.5" />
          반 배정 <span className="font-medium text-[#AEB5BC]">(선택)</span>
        </p>
        {activeClasses.length === 0 ? (
          <p className="rounded-lg bg-[#F7F8FA] px-3 py-2.5 text-xs font-medium text-[#8B95A1]">
            아직 만든 반이 없어요. 나중에 목록에서 배정할 수 있어요.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {activeClasses.map((cls) => {
              const on = selected.has(cls.id);
              return (
                <button
                  key={cls.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => toggle(cls.id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition disabled:opacity-50",
                    on ? "bg-[#191F28] text-white" : "bg-[#F2F4F6] text-[#6B7684] hover:bg-[#E5E8EB]",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                  {cls.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#F2F4F6] pt-4">
        <Button
          onClick={() => finish(onAddAnother)}
          variant="outline"
          disabled={isPending}
          className="h-9 rounded-lg border-[#E5E8EB] text-sm font-bold text-[#4E5968] hover:bg-[#F7F8FA]"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          한 명 더 등록
        </Button>
        <Button
          onClick={() => finish(onClose)}
          disabled={isPending}
          className="h-9 rounded-lg bg-blue-600 text-sm font-bold text-white hover:bg-blue-700"
        >
          {isPending && <Loader2 className="size-4 animate-spin" />}
          완료
        </Button>
      </div>
    </div>
  );
}
