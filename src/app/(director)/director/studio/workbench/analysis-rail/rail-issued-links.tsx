"use client";

// ============================================================================
// 레일 [학생] 탭 — **발급된 답안 링크 표시**(26-09-05 재배치).
//
// 사용자 지시: "[OMR 링크]를 누르면 이게 펼쳐지는거지" — 링크는 **누른 그 행 아래**
// 에서 펴진다(RailRowLink). 목록 맨 위 한곳에 모아 두면 방금 누른 행과 멀어져
// 「어느 학생 링크인지」가 흐려졌다.
//
// 왜 남겨 두는가(26-09-04 사용자 지적 "갑자기 그 링크가 없어져버리는 거야?"):
// 링크를 발급하면 그 학생 상태가 바뀌며 행이 자리를 옮긴다. 그 순간 방금 만든
// 링크가 화면에서 증발했다(일괄 발급은 애초에 클립보드에만 넣었다). 발급 결과는
// 셸(useAnalysisConsole.issuedLinks)이 들고, 행에서 보내든 픽바로 여러 명을 보내든
// 같은 목록에 쌓인다 — 여러 명이면 아래 표 복사 바가 함께 뜬다.
// ============================================================================

import { Copy, X } from "lucide-react";
import { toast } from "sonner";
import { KakaoShareButton } from "@/components/growth/kakao-share-button";
import { buildLinkTable, copyToClipboard } from "./use-analysis-bulk";
import type { AnalysisConsoleApi, IssuedAnswerLink } from "./use-analysis-console";

/** 행 바로 아래 인라인 링크 — 주소·복사·카카오톡·닫기. */
export function RailRowLink({
  link,
  onClose,
}: {
  link: IssuedAnswerLink;
  onClose: () => void;
}) {
  return (
    <div
      data-rail-row-link={link.studentId}
      className="flex min-w-0 items-stretch gap-1.5 rounded-b-lg border border-t-0 border-blue-200 bg-blue-50/60 px-2 py-1.5"
    >
      <input
        readOnly
        value={link.url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`${link.name} 학생 OMR 답안 링크`}
        data-answer-link-url
        className="h-7 min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/30"
      />
      <button
        type="button"
        onClick={() =>
          void copyToClipboard(link.url).then((ok) =>
            ok
              ? toast.success("링크를 복사했어요.")
              : toast.error("복사에 실패했습니다."),
          )
        }
        className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
      >
        <Copy className="size-3 shrink-0" aria-hidden="true" />
        복사
      </button>
      <KakaoShareButton
        link={link.url}
        label="카카오톡"
        title={`${link.name} 학생 답안 입력`}
        description="아래 링크에서 답안을 입력해 주세요"
        buttonTitle="답안 입력하기"
        recordMission={false}
        iconClassName="size-3.5"
        className="h-7 shrink-0 whitespace-nowrap rounded-md px-2 text-[11.5px] font-semibold"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="링크 닫기"
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** 여러 명에게 한꺼번에 보냈을 때만 — 「이름\t링크」 표 복사 한 줄. */
export function RailIssuedLinks({ console: api }: { console: AnalysisConsoleApi }) {
  const issued = api.issuedLinks;
  if (issued.length < 2) return null;
  return (
    <div
      data-rail-roster-issued
      className="flex min-w-0 items-center gap-1.5 rounded-md border border-blue-100 bg-blue-50/40 px-2.5 py-1.5"
    >
      <p className="min-w-0 flex-1 break-keep text-[11px] font-semibold text-slate-600">
        방금 {issued.length}명에게 링크를 만들었어요
      </p>
      <button
        type="button"
        data-rail-roster-recopy
        onClick={() =>
          void copyToClipboard(
            buildLinkTable(issued.map((x) => ({ name: x.name, url: x.url }))),
          ).then((ok) =>
            ok
              ? toast.success(`이름·링크 표 ${issued.length}명분을 복사했어요.`)
              : toast.error("복사에 실패했습니다."),
          )
        }
        className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
      >
        <Copy className="size-3 shrink-0" aria-hidden="true" />
        이름·링크 표 복사
      </button>
      <button
        type="button"
        onClick={() => api.clearIssuedLinks()}
        aria-label="닫기"
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
