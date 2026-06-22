"use client";

import { useState } from "react";
import { GraduationCap } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExamPassagePick } from "@/lib/exam-passages/types";
import { ExamPassageLibrary } from "./index";

interface ExamPassagePickerModalProps {
  /** 선택 지문을 호스트로 전달. false 반환 시 모달 유지(실패). */
  onPick: (
    picks: ExamPassagePick[],
  ) => boolean | void | Promise<boolean | void>;
  /** 런처 버튼 라벨(기본 "수능 기출 불러오기"). */
  triggerLabel?: string;
  /** 모달 안 불러오기 버튼 라벨(기본 "선택한 지문 불러오기"). */
  pickLabel?: string;
  /** 런처 버튼 추가 클래스. */
  triggerClassName?: string;
  /** 호스트 지속 처리 중. */
  busy?: boolean;
}

/**
 * 모달 런처 — FormSection 2-pane(학습지생성·웹툰) 호스트용.
 * 버튼 클릭 → 큰 다이얼로그에 ExamPassageLibrary 를 띄우고, 불러오면 닫는다.
 */
export function ExamPassagePickerModal({
  onPick,
  triggerLabel = "수능 기출 불러오기",
  pickLabel = "선택한 지문 불러오기",
  triggerClassName = "",
  busy = false,
}: ExamPassagePickerModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50/60 px-3 text-[12px] font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50",
          triggerClassName,
        )}
      >
        <GraduationCap className="size-3.5" />
        {triggerLabel}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[86vh] w-[94vw] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3 pr-10">
            <span className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <GraduationCap className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-[14px] font-bold text-slate-800">
                수능·모평·학평 영어 기출 지문
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-400">
                고1·고2·고3 · 2003~2027학년도 · 정답 기반 복원된 완전한 지문
              </DialogDescription>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <ExamPassageLibrary
              busy={busy}
              pickLabel={pickLabel}
              onPick={async (picks) => {
                const result = await onPick(picks);
                if (result !== false) setOpen(false);
                return result;
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
