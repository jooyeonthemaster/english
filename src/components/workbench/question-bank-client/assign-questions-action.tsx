"use client";

// ============================================================================
// 문제 뱅크 → 문제 세트 과제 배포 (벌크 액션 버튼 + 컴포저 배선)
//
// 선택된 문항 id 를 클릭 시점에 스냅샷해 AssignmentComposer 의
// QUESTIONS preset 으로 넘긴다. 50문항 초과 선택 시 비활성 표시 + 안내
// 토스트(서버 createStudyAssignment 도 동일 상한을 이중 방어한다).
// 배포 성공 시 onAssigned(선택 해제)를 호출한다 — 성공 토스트는 컴포저가
// 자체 표시하므로 여기서 중복으로 띄우지 않는다.
// ============================================================================

import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import {
  AssignmentComposer,
  type ComposerPreset,
} from "@/components/study-assignments/assignment-composer";
import { cn } from "@/lib/utils";

/** 서버 계약(createStudyAssignment)과 동일한 문제 세트 배포 상한 */
export const MAX_ASSIGN_QUESTIONS = 50;

export function AssignQuestionsAction({
  selectedIds,
  onAssigned,
}: {
  /** 현재 선택된 문항 id — 클릭 시점에 배열로 스냅샷된다 */
  selectedIds: Set<string>;
  /** 배포 성공 시(선택 해제 등) */
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [questionIds, setQuestionIds] = useState<string[]>([]);

  const count = selectedIds.size;
  const overLimit = count > MAX_ASSIGN_QUESTIONS;

  // 컴포저는 open 전환 시점에만 preset 을 읽는다 — 참조 안정화만 해 둔다.
  const preset = useMemo<ComposerPreset>(
    () => ({ kind: "QUESTIONS", questionIds }),
    [questionIds],
  );

  const handleClick = () => {
    if (count === 0) return;
    if (overLimit) {
      toast.error(
        `과제 배포는 한 번에 최대 ${MAX_ASSIGN_QUESTIONS}문항까지 가능합니다. 현재 ${count}문항이 선택되어 있습니다.`,
      );
      return;
    }
    setQuestionIds(Array.from(selectedIds));
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        // 초과 시 네이티브 disabled 대신 aria-disabled — 클릭을 살려 두어
        // 눌렀을 때 상한 안내 토스트를 띄운다(시험지 생성 버튼과 동일 패턴).
        aria-disabled={overLimit}
        onClick={handleClick}
        title={
          overLimit
            ? `과제 배포는 최대 ${MAX_ASSIGN_QUESTIONS}문항까지 선택할 수 있습니다`
            : "선택한 문항을 학생 과제로 배포"
        }
        className={cn(
          "flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border bg-white px-2.5 text-[11px] font-semibold shadow-sm transition-colors",
          overLimit
            ? "cursor-not-allowed border-slate-200 text-slate-300 shadow-none"
            : "cursor-pointer border-blue-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700",
        )}
      >
        <Send className="h-3.5 w-3.5" aria-hidden />
        {/* 좁은 폭(모바일 컨테이너)에서는 라벨을 숨겨 아이콘만 남긴다. */}
        <span className="@max-[30rem]:hidden">
          과제로 배포 ({count}문항)
        </span>
      </button>

      <AssignmentComposer
        open={open}
        onClose={() => setOpen(false)}
        preset={preset}
        onCreated={() => {
          // 성공 토스트는 컴포저가 표시 — 여기서는 선택 해제만.
          onAssigned();
        }}
      />
    </>
  );
}
