"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StickyNote, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/admin/member-detail/atoms";
import { updateMemberMemo } from "@/actions/admin-members";

const MAX_MEMO_LENGTH = 5000;

export function MemoSection({
  memberId,
  initialMemo,
}: {
  memberId: string;
  initialMemo: string | null;
}) {
  const router = useRouter();
  // `baseline` tracks the last-saved value so the Save button can disable when
  // there are no unsaved changes, and the "저장됨" badge can clear on edit.
  const [baseline, setBaseline] = useState(initialMemo ?? "");
  const [value, setValue] = useState(initialMemo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDirty = value !== baseline;

  function handleChange(next: string) {
    setValue(next);
    if (saved) setSaved(false);
    if (error) setError(null);
  }

  function handleSave() {
    if (!isDirty || isPending) return;
    setError(null);
    const trimmed = value.trim();
    startTransition(async () => {
      const res = await updateMemberMemo({ memberId, memo: value });
      if (!res.success) {
        setError(res.error);
        return;
      }
      // Mirror server normalization (trim + empty→null) into local state so the
      // dirty check stays accurate after saving.
      setBaseline(trimmed);
      setValue(trimmed);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <SectionCard
      title="메모"
      icon={<StickyNote />}
      action={
        saved && !isDirty ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
            <Check className="size-3.5" strokeWidth={2} aria-hidden />
            저장됨
          </span>
        ) : isDirty ? (
          <span className="text-[11px] text-amber-600 font-medium">
            저장되지 않음
          </span>
        ) : null
      }
    >
      <Textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        rows={6}
        maxLength={MAX_MEMO_LENGTH}
        placeholder="이 학원에 대한 메모를 남겨보세요. (첫 줄은 회원 목록에도 표시됩니다)"
        className="text-[13px] resize-y min-h-[120px]"
      />

      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-md bg-rose-50 border border-rose-100 px-3 py-2">
          <AlertCircle
            className="size-4 text-rose-500 shrink-0 mt-px"
            strokeWidth={2}
            aria-hidden
          />
          <p className="text-[12px] text-rose-700">{error}</p>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-gray-400 tabular-nums">
          {value.length.toLocaleString("ko-KR")} / {MAX_MEMO_LENGTH.toLocaleString("ko-KR")}
        </span>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || isPending}
          className="h-8 text-[12px] bg-blue-600 hover:bg-blue-700 min-w-[72px]"
        >
          {isPending ? (
            <>
              <Loader2
                className="size-3.5 mr-1.5 animate-spin"
                strokeWidth={2}
                aria-hidden
              />
              저장 중
            </>
          ) : (
            "저장"
          )}
        </Button>
      </div>
    </SectionCard>
  );
}
