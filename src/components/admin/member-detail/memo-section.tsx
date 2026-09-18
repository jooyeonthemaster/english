"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { SaveButton } from "@/components/ui/save-button";
import { SectionCard } from "@/components/admin/kit";
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
  // baseline = 마지막 저장값. 변경이 없으면 저장 버튼을 비활성화한다.
  const [baseline, setBaseline] = useState(initialMemo ?? "");
  const [value, setValue] = useState(initialMemo ?? "");
  const [isPending, startTransition] = useTransition();

  const isDirty = value !== baseline;

  function handleSave() {
    if (!isDirty || isPending) return;
    const trimmed = value.trim();
    startTransition(async () => {
      const res = await updateMemberMemo({ memberId, memo: value });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      // 서버 정규화(trim·빈값→null)를 로컬에도 반영해 dirty 판정을 맞춘다.
      setBaseline(trimmed);
      setValue(trimmed);
      toast.success("메모를 저장했습니다");
      router.refresh();
    });
  }

  return (
    <SectionCard
      title="메모"
      icon={StickyNote}
      actions={
        isDirty ? (
          <span className="text-[11px] font-medium text-amber-600">저장되지 않음</span>
        ) : null
      }
    >
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        maxLength={MAX_MEMO_LENGTH}
        placeholder="이 학원에 대한 메모를 남겨보세요. (첫 줄은 회원 목록에도 표시됩니다)"
        className="min-h-[120px] resize-y text-[13px]"
      />

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] tabular-nums text-gray-400">
          {value.length.toLocaleString("ko-KR")} / {MAX_MEMO_LENGTH.toLocaleString("ko-KR")}
        </span>
        <SaveButton
          onClick={handleSave}
          saving={isPending}
          disabled={!isDirty}
          className="min-w-[72px]"
        />
      </div>
    </SectionCard>
  );
}
