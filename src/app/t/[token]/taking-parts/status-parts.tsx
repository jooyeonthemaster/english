"use client";

// ============================================================================
// /t/[token] 태블릿 응시 — 상태 화면·오버레이 조각들
//
// 완료/잠금/중단 전체 화면, 미응답 확인 다이얼로그, 시간 종료 오버레이,
// 자동저장 상태 인디케이터. 점수·정오는 어떤 화면에도 없다(§6-1).
// ============================================================================

import type { ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  LogOut,
  PauseCircle,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDialogA11y } from "./use-dialog-a11y";

// ── 전체 화면 안내 ───────────────────────────────────────────────────────────

export function FullScreenNotice({
  icon,
  iconTone = "slate",
  title,
  description,
  children,
}: {
  icon: ReactNode;
  iconTone?: "slate" | "blue" | "emerald";
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#F7F8FA] px-6 text-center">
      <div className="w-full max-w-sm">
        <div
          className={cn(
            "mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl",
            iconTone === "emerald" && "bg-emerald-50 text-emerald-600",
            iconTone === "blue" && "bg-blue-50 text-[#3182F6]",
            iconTone === "slate" && "bg-slate-100 text-slate-400",
          )}
        >
          {icon}
        </div>
        <h1 className="text-lg font-semibold text-[#191F28]">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#8B95A1]">{description}</p>
        {children}
        <p className="mt-6 text-[11px] text-[#B0B8C1]">SMOAT 시험 응시</p>
      </div>
    </div>
  );
}

/** 제출 성공 완료 화면 — 점수·정오 절대 미노출 */
export function SubmitDoneScreen({
  examTitle,
  studentName,
  exitHref,
}: {
  examTitle: string;
  studentName: string;
  /** 과제 출처(?return=g) 진입에서만 — 학습 앱 복귀 버튼 목적지 */
  exitHref?: string | null;
}) {
  return (
    <FullScreenNotice
      icon={<CheckCircle2 className="h-7 w-7" />}
      iconTone="emerald"
      title="제출이 완료되었습니다"
      description="수고했습니다. 선생님이 확인한 뒤 결과를 안내합니다."
    >
      <div className="mt-5 rounded-xl border border-[#E5E8EB] bg-white px-4 py-3 text-left">
        <p className="truncate text-sm font-semibold text-[#191F28]">{examTitle}</p>
        <p className="mt-0.5 text-xs text-[#8B95A1]">{studentName}</p>
      </div>
      {exitHref && (
        <a
          href={exitHref}
          className="mt-5 flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          학습 앱으로 돌아가기
        </a>
      )}
    </FullScreenNotice>
  );
}

export function LockedScreen() {
  return (
    <FullScreenNotice
      icon={<Lock className="h-6 w-6" />}
      title="이미 제출된 시험입니다"
      description="이 링크의 시험은 이미 제출이 완료되어 더 이상 답을 입력할 수 없습니다."
    />
  );
}

export function DisabledScreen() {
  return (
    <FullScreenNotice
      icon={<PauseCircle className="h-6 w-6" />}
      title="응시가 중단된 링크입니다"
      description="선생님이 이 링크의 응시를 중단했습니다. 선생님께 문의해 주세요."
    />
  );
}

export function ExpiredScreen() {
  return (
    <FullScreenNotice
      icon={<AlertTriangle className="h-6 w-6" />}
      title="만료되었거나 잘못된 링크입니다"
      description="응시 링크가 더 이상 유효하지 않습니다. 선생님께 새 링크를 요청해 주세요."
    />
  );
}

// ── 미응답 확인 다이얼로그 ───────────────────────────────────────────────────

/** 번호 칩 노출 상한 — 초과분은 "외 N문항"으로 접는다 */
const MISSING_CHIP_LIMIT = 8;

export function ConfirmIncompleteDialog({
  missingOrderNums,
  submitting,
  onCancel,
  onConfirm,
  onJump,
}: {
  /** 미응답 문항 번호 목록 — 클라 계산분 또는 서버 INCOMPLETE missing */
  missingOrderNums: number[];
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** 번호 칩 탭 — 다이얼로그를 닫고 해당 문항으로 이동 */
  onJump: (orderNum: number) => void;
}) {
  const { containerRef, initialFocusRef } = useDialogA11y({
    onClose: submitting ? undefined : onCancel,
  });
  const shown = missingOrderNums.slice(0, MISSING_CHIP_LIMIT);
  const restCount = missingOrderNums.length - shown.length;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      role="alertdialog"
      aria-modal="true"
      aria-label="미응답 문항 확인"
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={onCancel}
        className="absolute inset-0 bg-black/40"
        disabled={submitting}
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-[#191F28]">
          미응답 문항이 있습니다
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#4E5968]">
          미응답{" "}
          <span className="font-semibold text-rose-600">
            {missingOrderNums.length}문항
          </span>
          이 있습니다. 그래도 제출할까요? 제출하면 답을 더 이상 수정할 수 없습니다.
        </p>
        {shown.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {shown.map((orderNum) => (
              <button
                key={orderNum}
                type="button"
                onClick={() => onJump(orderNum)}
                disabled={submitting}
                aria-label={`${orderNum}번 문항으로 이동`}
                className="flex h-8 min-w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60 tabular-nums"
              >
                {orderNum}번
              </button>
            ))}
            {restCount > 0 && (
              <span className="text-xs text-[#8B95A1] tabular-nums">
                외 {restCount}문항
              </span>
            )}
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <button
            ref={initialFocusRef}
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-11 flex-1 rounded-xl border border-[#E5E8EB] bg-white text-sm font-semibold text-[#4E5968] transition-colors hover:bg-[#F7F8FA] disabled:opacity-60"
          >
            계속 풀기
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#3182F6] text-sm font-semibold text-white transition-colors hover:bg-[#1B64DA] disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            그대로 제출
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 저장 후 나가기 확인 다이얼로그(과제 출처 ?return=g 전용) ──────────────────

export function ExitConfirmDialog({
  hasTimer,
  exiting,
  onCancel,
  onConfirm,
}: {
  /** 제한시간 존재 여부 — 있으면 "시간이 계속 갑니다" 고지(분쟁 차단) */
  hasTimer: boolean;
  exiting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { containerRef, initialFocusRef } = useDialogA11y({
    onClose: exiting ? undefined : onCancel,
  });

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      role="alertdialog"
      aria-modal="true"
      aria-label="저장하고 나가기 확인"
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={onCancel}
        className="absolute inset-0 bg-black/40"
        disabled={exiting}
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <LogOut className="h-5 w-5 -scale-x-100" />
        </div>
        <h2 className="mt-3 text-base font-semibold text-[#191F28]">
          시험에서 잠시 나가시겠습니까?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#4E5968]">
          지금까지 입력한 답안은 저장되었습니다.{" "}
          {hasTimer
            ? "제한 시간이 있는 시험은 나가 있는 동안에도 시간이 계속 갑니다."
            : "언제든 이 시험으로 돌아와 이어서 응시할 수 있습니다."}
        </p>
        <div className="mt-5 flex gap-2">
          <button
            ref={initialFocusRef}
            type="button"
            onClick={onCancel}
            disabled={exiting}
            className="h-11 flex-1 rounded-xl border border-[#E5E8EB] bg-white text-sm font-semibold text-[#4E5968] transition-colors hover:bg-[#F7F8FA] disabled:opacity-60"
          >
            계속 응시
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={exiting}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {exiting && <Loader2 className="h-4 w-4 animate-spin" />}
            저장하고 나가기
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 오프라인 배너 — OFFLINE 실패 코드 또는 브라우저 offline 이벤트 ────────────

export function OfflineBanner() {
  return (
    <div className="shrink-0 border-b border-rose-100 bg-rose-50 px-4 py-2" role="status">
      <p className="mx-auto flex w-full max-w-3xl items-center gap-1.5 text-xs font-medium text-rose-600">
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
        네트워크 연결이 끊어졌습니다. 연결이 복구되면 답안을 자동으로 다시 저장합니다.
      </p>
    </div>
  );
}

// ── 시간 종료 오버레이 ───────────────────────────────────────────────────────

export function TimeUpOverlay({
  failed,
  onRetry,
}: {
  failed: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
      role="alertdialog"
      aria-modal="true"
      aria-label="시험 시간 종료"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Clock className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold text-[#191F28]">
          시험 시간이 종료되었습니다
        </h2>
        {failed ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-[#4E5968]">
              네트워크 문제로 제출하지 못했습니다. 연결을 확인한 뒤 다시 제출해
              주세요.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#3182F6] text-sm font-semibold text-white transition-colors hover:bg-[#1B64DA]"
            >
              <RefreshCw className="h-4 w-4" />
              다시 제출
            </button>
          </>
        ) : (
          <p className="mt-2 flex items-center justify-center gap-2 text-sm text-[#4E5968]">
            <Loader2 className="h-4 w-4 animate-spin" />
            작성한 답안을 자동으로 제출합니다.
          </p>
        )}
      </div>
    </div>
  );
}

// ── 자동저장 인디케이터 ──────────────────────────────────────────────────────

export type SaveIndicatorState = "idle" | "saving" | "saved" | "error";

export function SaveIndicator({
  state,
  onRetry,
}: {
  state: SaveIndicatorState;
  onRetry: () => void;
}) {
  if (state === "idle") return null;
  if (state === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex h-8 items-center gap-1 whitespace-nowrap rounded-full bg-rose-50 px-2.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-100"
      >
        <RefreshCw className="h-3 w-3" />
        저장 실패 · 재시도
      </button>
    );
  }
  return (
    <span
      aria-live="polite"
      className={cn(
        "flex h-8 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium",
        state === "saving" ? "bg-[#F7F8FA] text-[#8B95A1]" : "bg-blue-50 text-[#3182F6]",
      )}
    >
      {state === "saving" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          저장 중
        </>
      ) : (
        <>
          <Check className="h-3 w-3" />
          저장됨
        </>
      )}
    </span>
  );
}
