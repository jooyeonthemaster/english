"use client";

// ============================================================================
// OMR 보조 화면·배지 — 완료 화면 / 기능 비활성 화면 / 저장 상태 배지 (V3 소유)
//
// 완료 화면은 제출 사실·시각만 표기한다 — 점수·정오는 세션 페이로드에 아예
// 없고(§6-1), 여기서도 어떤 형태로도 그리지 않는다.
// ============================================================================

import { AlertCircle, Check, CheckCircle2, Loader2 } from "lucide-react";
import type { SaveState } from "./omr-shared";

/** ENABLE_EXAM_DEPLOYMENT off — 공개면 전체 차단 안내. */
export function OmrDisabledScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center">
      <p className="text-sm leading-relaxed text-slate-500">
        현재 응시 기능을 이용할 수 없습니다. 선생님께 문의해 주세요.
      </p>
    </div>
  );
}

/**
 * 제출 완료 화면 — 점수·정오 미노출.
 * lockedNotice: 이 기기 제출이 아니라 LOCKED(다른 기기 제출·강사 확정)로 도달.
 */
export function OmrDoneScreen({
  lockedNotice,
  submittedLabel,
  exitHref,
}: {
  lockedNotice: boolean;
  submittedLabel: string | null;
  /** 과제 출처(?return=g) 진입에서만 — 학습 앱 복귀 버튼 목적지 */
  exitHref?: string | null;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <div className="w-full max-w-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-semibold text-slate-800">
          {lockedNotice && !submittedLabel
            ? "이미 제출이 완료된 시험입니다"
            : "제출이 완료되었습니다"}
        </h1>
        {submittedLabel && (
          <p className="mt-2 text-sm text-slate-500 tabular-nums">
            {submittedLabel} 제출
          </p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          제출한 답안은 선생님이 확인합니다. 이 화면은 닫으셔도 됩니다.
        </p>
        {exitHref && (
          <a
            href={exitHref}
            className="mt-5 flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            학습 앱으로 돌아가기
          </a>
        )}
        <p className="mt-6 text-[11px] text-slate-400">SMOAT OMR 답안 입력</p>
      </div>
    </div>
  );
}

/** 상단 저장 상태 표시 — 저장 중/저장됨(시각)/실패(자동 재시도). */
export function SaveStatusBadge({
  state,
  savedAtLabel,
}: {
  state: SaveState;
  savedAtLabel: string | null;
}) {
  if (state === "pending" || state === "saving") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        저장 중
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600">
        <Check className="h-3 w-3" />
        {savedAtLabel ? `${savedAtLabel} 저장됨` : "저장됨"}
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-rose-500">
        <AlertCircle className="h-3 w-3" />
        저장 실패 · 자동 재시도
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[11px] font-medium text-slate-400">
      자동 저장
    </span>
  );
}
