"use client";

// ============================================================================
// 문제 뱅크 → 문제 세트 과제 배포 (벌크 액션 버튼 + 컴포저 배선)
//
// 선택된 문항 id 를 클릭 시점에 스냅샷해 AssignmentComposer 의
// QUESTIONS preset 으로 넘긴다. 50문항 초과 선택 시 비활성 표시 + 안내
// 토스트(서버 createStudyAssignment 도 동일 상한을 이중 방어한다).
// 배포 성공 시 onAssigned(선택 해제)를 호출한다 — 성공 토스트는 컴포저가
// 자체 표시하므로 여기서 중복으로 띄우지 않는다.
//
// 2607 §8.5 (오답→변형→과제 흐름의 마지막 칸):
//  - defaultStudentIds: 생성 페이지가 `?student=` 로 물고 온 학생을 컴포저의
//    대상 선택에 프리셀렉트한다. 미전달이면 기존과 완전히 동일하게 동작한다.
//  - label/disabled/title: 소비처(생성 결과 패널 등)가 문맥에 맞는 라벨과
//    비활성 사유를 걸 수 있게 열어 둔 옵셔널 계약. 기본값은 기존 표기 유지.
// ============================================================================

import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import {
  AssignmentComposer,
  type ComposerPreset,
} from "@/components/study-assignments/assignment-composer";
import { CTA_LABELS } from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";

/** 서버 계약(createStudyAssignment)과 동일한 문제 세트 배포 상한 */
export const MAX_ASSIGN_QUESTIONS = 50;

export function AssignQuestionsAction({
  selectedIds,
  onAssigned,
  defaultStudentIds,
  label,
  disabled = false,
  title,
}: {
  /** 현재 선택된 문항 id — 클릭 시점에 배열로 스냅샷된다 */
  selectedIds: Set<string>;
  /** 배포 성공 시(선택 해제 등) */
  onAssigned: () => void;
  /**
   * 컴포저에서 미리 선택해 둘 학생 — 생성 페이지의 `?student=`(변형 딥링크)
   * 처럼 "누구에게 보낼지"가 이미 정해진 진입점에서 쓴다.
   */
  defaultStudentIds?: string[];
  /** 버튼 라벨 override — 미전달 시 「과제 보내기 (N문항)」 */
  label?: string;
  /** 소비처 사정으로 막을 때(선택 0건 등). 사유는 title 로 함께 넘긴다 */
  disabled?: boolean;
  /** 버튼 title — 비활성 사유 표기용. 상한 초과 시에는 상한 안내가 우선한다 */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [questionIds, setQuestionIds] = useState<string[]>([]);

  const count = selectedIds.size;
  const overLimit = count > MAX_ASSIGN_QUESTIONS;
  // 상한 초과와 소비처 비활성을 하나의 표시 축으로 합친다 — 둘 다 "지금은 못 누름"
  // 이지만, 상한 초과는 클릭을 살려 사유 토스트를 띄우는 쪽(아래 handleClick).
  const inactive = overLimit || disabled;

  // 컴포저는 open 전환 시점에만 preset 을 읽는다 — 참조 안정화만 해 둔다.
  const preset = useMemo<ComposerPreset>(
    () => ({ kind: "QUESTIONS", questionIds }),
    [questionIds],
  );

  const handleClick = () => {
    // disabled 는 소비처가 사유 title 과 함께 막은 상태 — 조용히 무시한다.
    if (disabled || count === 0) return;
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
        // 네이티브 disabled 대신 aria-disabled — (1) 상한 초과 시 클릭을 살려
        // 안내 토스트를 띄우고, (2) 비활성 상태에서도 사유 title 툴팁이 뜨게
        // 하기 위함(브라우저는 disabled 요소의 title 을 띄우지 않는다).
        aria-disabled={inactive}
        onClick={handleClick}
        title={
          overLimit
            ? `과제 배포는 최대 ${MAX_ASSIGN_QUESTIONS}문항까지 선택할 수 있습니다`
            : (title ?? "선택한 문항을 학생 과제로 보내기")
        }
        className={cn(
          "flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border bg-white px-2.5 text-[11px] font-semibold shadow-sm transition-colors",
          inactive
            ? "cursor-not-allowed border-slate-200 text-slate-300 shadow-none"
            : "cursor-pointer border-blue-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700",
        )}
      >
        <Send className="h-3.5 w-3.5" aria-hidden />
        {/* 좁은 폭(모바일 컨테이너)에서는 라벨을 숨겨 아이콘만 남긴다. */}
        <span className="@max-[30rem]:hidden">
          {/* 배포 동사는 글로서리 단일 어휘(「과제 보내기」) — 리터럴 금지 규범 */}
          {label ?? `${CTA_LABELS.SEND_TASK} (${count}문항)`}
        </span>
      </button>

      <AssignmentComposer
        open={open}
        onClose={() => setOpen(false)}
        preset={preset}
        defaultStudentIds={defaultStudentIds}
        onCreated={() => {
          // 성공 토스트는 컴포저가 표시 — 여기서는 선택 해제만.
          onAssigned();
        }}
      />
    </>
  );
}
