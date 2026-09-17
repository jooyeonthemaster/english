"use client";

// ============================================================================
// 레일 하단 도크 「시험지 분석 리포트 공유」 블록 (26-09-03, 리포트 2관점 분리)
// 정본: docs/exam-analysis-v4-spec.md §7
//
// 리포트는 두 관점이다 — ① 시험지 **자체**를 분석한 「시험지 분석 리포트」(이 블록)
// ② 학생이 시험을 치른 뒤의 「학생 리포트」(rail-next-step 퍼널 블록). 사용자 지시:
// "[총평] 탭의 그 버튼이 리포트 공유 버튼이 돼야 하고, [학생] 탭에서 학생 리포트
// 생성이 나와야 한다. 두 개를 구분해 줘." 어느 블록이 도크를 드는지는
// next-step.ts resolveRailDockPerspective 하나가 판정한다(UI 복제 금지).
//
// 동작(전부 레일 안): 공유 켜기(무과금 — 분석이 곧 리포트) → 링크 자동 복사 ·
// [복사] · [카카오톡](카드 자구 리포트용 오버라이드, 미션 보상 기록 0) ·
// [다른 앱으로](navigator.share 지원 기기만) · [미리보기](§1-8 예외 셀렉터
// data-rail-escape-allowed — 공개 링크 확인은 원본 사진 열람과 같은 「파일 열람」급).
// **[공유 끄기]는 화면에서 뺐다**(26-09-04 사용자 지시) — disableExamAnalysisShare
// 액션은 계약으로 남아 있으니 되살릴 땐 이 블록에 다시 달면 된다.
// 낙관 반영은 콘솔 patchDetailAnalysisShare(학생 축 patchDetailStudent 와 별개).
// 서버 게이트(status ANALYZED) 미러 — 아니면 CTA 비활성.
// 공개 페이지는 정답을 검수 확정 문항만 보인다(외부 시험지) — 게이트 미완이면
// 여기서 그 사실을 한 줄로 예고한다(학부모가 「정답이 없다」고 문의하는 사고 방지).
// 폭 플로어 296px: 링크 input truncate · 버튼 2열 grid · whitespace-nowrap.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { enableExamAnalysisShare } from "@/actions/exam-report";
import type { ExamAnalysisDetail } from "@/components/exam-report/ui-contracts";
import { KakaoShareButton } from "@/components/growth/kakao-share-button";
import { cn } from "@/lib/utils";
import type { AnalysisConsoleApi } from "./use-analysis-console";

/** 공개 라우트 접두 — src/app/r/exam/[token]/page.tsx 와 한 쌍. */
export const EXAM_SHARE_PATH_PREFIX = "/r/exam/";

export function examShareUrl(token: string, origin: string): string {
  return `${origin}${EXAM_SHARE_PATH_PREFIX}${token}`;
}

const SMALL_BTN =
  "inline-flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-default disabled:opacity-50";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function RailExamShareBlock({
  detail,
  gateOpen,
  isInternal,
  console: api,
}: {
  detail: ExamAnalysisDetail;
  /** 정답·배점 검수 게이트(getMapGateStatus.open) — 공개 페이지 정답 노출 예고용. */
  gateOpen: boolean;
  /** INTERNAL(자체 시험지) — 정답이 시험지 확정값이라 검수 예고를 하지 않는다.
   *  판정은 요약 행(row.sourceType) 소관 — detail.sourceType 의 유니온엔 INTERNAL 이 없다. */
  isInternal: boolean;
  console: AnalysisConsoleApi;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [canWebShare, setCanWebShare] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanWebShare(typeof navigator.share === "function");
  }, []);

  const enabled = detail.shareEnabled && !!detail.shareToken;
  const url = enabled && detail.shareToken ? examShareUrl(detail.shareToken, origin) : "";
  // 서버 게이트 미러(enableExamAnalysisShare: status ANALYZED 만).
  const canShare = detail.status === "ANALYZED";
  const shareTitle = `${detail.title} — 시험지 분석 리포트`;

  const handleEnable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { token } = await enableExamAnalysisShare(detail.id);
      api.patchDetailAnalysisShare({
        shareToken: token,
        shareEnabled: true,
        sharedAt: new Date().toISOString(),
      });
      const link = examShareUrl(token, window.location.origin);
      const ok = await copyText(link);
      toast.success(
        ok
          ? "공유 링크를 만들고 복사했어요. 학생·학부모에게 전달하세요."
          : "공유 링크를 만들었어요.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "공유 링크 발급에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, detail.id, api]);

  const handleCopy = useCallback(async () => {
    if (!url) return;
    const ok = await copyText(url);
    if (ok) {
      setCopied(true);
      toast.success("공유 링크를 복사했어요.");
      window.setTimeout(() => setCopied(false), 1600);
    } else {
      toast.error("복사에 실패했습니다. 링크를 직접 선택해 주세요.");
    }
  }, [url]);

  const handleWebShare = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.share({
        title: shareTitle,
        text: "시험 총평·난이도·유형·문항별 분석 리포트입니다.",
        url,
      });
    } catch (error) {
      // 사용자가 공유 시트를 닫은 것(AbortError)은 실패가 아니다.
      if (error instanceof DOMException && error.name === "AbortError") return;
      const ok = await copyText(url);
      toast[ok ? "success" : "error"](
        ok ? "공유 링크를 복사했어요." : "공유에 실패했습니다.",
      );
    }
  }, [url, shareTitle]);

  return (
    <div
      data-exam-share-block
      data-exam-share-state={enabled ? "on" : "off"}
      className="min-w-0 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2.5"
    >
      {/* 【26-09-04 사용자 지시】 켜짐 상태는 머리말 3줄(아이브로우·제목·설명)을 전부
          걷어낸다 — 링크 입력과 공유 버튼이 이미 상태를 말하고 있어 도크 세로만 먹었다.
          꺼짐 상태는 무엇을 만드는 버튼인지 말해야 하므로 아이브로우+제목만 남기고
          설명 문단은 같이 걷어낸다(관점 자체는 탭 본문 첫 줄 관점 캡션이 이미 말한다). */}
      {!enabled ? (
        <>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            시험지 분석 리포트
          </p>
          <p
            data-exam-share-title
            className="mt-0.5 break-keep text-[13px] font-semibold leading-snug text-slate-900"
          >
            학생·학부모에게 공유하세요
          </p>
        </>
      ) : null}
      {!gateOpen && !isInternal ? (
        <p
          className={cn(
            "break-keep text-[11px] leading-relaxed text-amber-600",
            // 켜짐 상태엔 위에 머리말이 없다 — 첫 요소이므로 윗여백을 주지 않는다.
            enabled ? "mb-1.5" : "mt-1",
          )}
        >
          정답·배점 검수 전 문항은 공개 리포트에 정답이 표시되지 않습니다.
        </p>
      ) : null}

      {!enabled ? (
        <button
          type="button"
          data-exam-share-cta
          disabled={busy || !canShare}
          onClick={() => void handleEnable()}
          className="mt-2.5 flex h-10 w-full min-w-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg bg-blue-600 text-[12.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:cursor-default disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <Link2 className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          리포트 공유 링크 만들기
        </button>
      ) : (
        <>
          {/* 켜짐 상태의 첫 요소 — 위에 머리말이 없으므로 윗여백 0(도크 세로 절약). */}
          <div className="flex min-w-0 items-stretch gap-1.5">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="시험지 분석 리포트 공유 링크"
              data-exam-share-url
              className="h-8 min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            {/* 미리보기 — 26-09-04 사용자 지시로 [복사] **왼쪽 버튼**으로 승격
                (구 하단 텍스트 링크 폐기). 새 탭은 §1-8 예외 셀렉터 유지. */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              data-rail-escape-allowed
              data-exam-share-preview
              className={cn(SMALL_BTN, "shrink-0")}
            >
              <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
              미리보기
            </a>
            <button
              type="button"
              data-exam-share-copy
              onClick={() => void handleCopy()}
              className={cn(
                SMALL_BTN,
                "shrink-0",
                copied && "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-50",
              )}
            >
              {copied ? (
                <Check className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              {copied ? "복사됨" : "복사"}
            </button>
          </div>

          {/* 전송 줄. 26-09-04 사용자 지시로 [공유 끄기]는 **없앴다** — 회수 액션
              (disableExamAnalysisShare)은 계약으로 살아 있지만 화면에 노출하지 않는다.
              미리보기는 링크 줄로 올라갔다(복사 왼쪽). */}
          <div
            className={cn(
              "mt-1.5 grid min-w-0 gap-1.5",
              canWebShare ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            <KakaoShareButton
              link={url}
              label="카카오톡"
              title={shareTitle}
              description="시험 총평·난이도·유형·문항별 분석 리포트를 확인하세요"
              buttonTitle="리포트 보기"
              recordMission={false}
              iconClassName="size-3.5"
              className="h-8 min-w-0 whitespace-nowrap rounded-md px-2.5 text-[12px] font-semibold"
            />
            {canWebShare ? (
              <button
                type="button"
                data-exam-share-more
                onClick={() => void handleWebShare()}
                className={SMALL_BTN}
              >
                <Share2 className="size-3.5 shrink-0" aria-hidden="true" />
                다른 앱으로
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
