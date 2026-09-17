"use client";

// ============================================================================
// 레일 학생 아코디언 — **학생 리포트 공유 존**(표시 전용).
//
// 26-09-05: OMR 답안 링크 존을 **통째로 걷어냈다**(사용자 지시 "직접 입력을 누른
// 시점에서 필요 없네"). 아코디언은 강사가 답을 넣는 자리이고, 링크를 만들고 보는
// 일은 목록 행의 [OMR 링크] 버튼과 그 아래 인라인 링크 패널(RailRowLink)이 든다 —
// 답을 손으로 넣는 중에 「학생에게 링크를 보내세요」 카드가 떠 있는 건 모순이었다.
// 제출 일시는 아코디언 상단 줄로 옮겼다(정보 손실 0).
//
// · 공유 존: 학생 개인 리포트(/r/[token]) — 완성된 리포트가 있을 때만.
//   ⚠ 끄기는 토큰 회수(rotate)라 이미 보낸 링크가 영구 사망 → 2단 확인.
// · OMR 존: 답안 입력 링크(/a/[token]) — **INTERNAL 포함 전 분석 공통**(26-09-04
//   사용자 지시). 26-09-05 개편 4건:
//   ① 「모바일 OMR 로 자동 채점」을 푸른 카드로 크게 — 이 존의 목적을 한 줄로
//      말한다(종전엔 회색 각주 한 줄이라 아무도 안 읽었다).
//   ② 카카오톡 전송을 링크 입력칸 **옆**으로(복사와 같은 줄 — 보내는 수단끼리 붙인다).
//   ③ **[링크 끄기] 철거** — 무엇을 끄는지 모호했고, 제출이 최종이 된 뒤로는
//      끌 이유 자체가 없다(사용자 지시).
//   ④ **제출은 최종**(answerSubmittedAt) — 제출 일시를 칩으로 박는다.
//   ⑤ 26-09-05: 「답 직접 입력」 버튼 철거 — **지금 열려 있는 이 아코디언 자체가
//      직접 입력 창**이다(위 OMR 답안지). 같은 화면 안에서 그 화면으로 가라는
//      버튼은 잡음이다(사용자 지적).
// ============================================================================

import { Copy, Loader2 } from "lucide-react";
import type { ExamStudentDetail } from "@/components/exam-report/ui-contracts";
import { RailConfirmButton } from "./rail-confirm-button";

export function RailStudentLinks({
  st,
  reportStatus,
  shareEnabled,
  shareBusy,
  onCopyText,
  onShareOn,
  onShareOff,
}: {
  st: ExamStudentDetail;
  /** 낙관 반영된 표시용 상태(부모의 generating 합성 포함) */
  reportStatus: string;
  shareEnabled: boolean;
  shareBusy: boolean;
  onCopyText: (text: string, okMsg: string) => void | Promise<void>;
  onShareOn: () => void;
  onShareOff: () => void;
}) {
  return (
    <>
      {/* 공유 존(리포트 완성 시) */}
      {reportStatus === "GENERATED" ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {shareEnabled && st.shareToken ? (
            <>
              <button
                type="button"
                disabled={shareBusy}
                onClick={() =>
                  void onCopyText(
                    `${window.location.origin}/r/${st.shareToken}`,
                    "공유 링크를 복사했어요.",
                  )
                }
                className="inline-flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
              >
                <Copy className="size-3 shrink-0" aria-hidden="true" />
                공유 링크 복사
              </button>
              <RailConfirmButton
                label="공유 끄기"
                confirmLabel="한 번 더 → 링크 무효화"
                tone="danger"
                busy={shareBusy}
                onConfirm={onShareOff}
              />
            </>
          ) : (
            <button
              type="button"
              disabled={shareBusy}
              onClick={onShareOn}
              className="inline-flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            >
              {shareBusy ? (
                <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <Copy className="size-3 shrink-0" aria-hidden="true" />
              )}
              공유 켜고 링크 복사
            </button>
          )}
        </div>
      ) : null}

    </>
  );
}
