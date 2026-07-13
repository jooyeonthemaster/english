"use client";

// ============================================================================
// /t/[token] 태블릿 응시 — 상·하단 크롬(헤더/푸터) + 모드B 문항 카드 + 글자 크기
//
// tablet-taking-client 의 500줄 계약 회복을 위한 프레젠테이션 분리: 상태
// (inputs/자동저장/제출/타이머)는 전부 클라이언트 본체 소유 — 이 파일은 표시와
// 입력 콜백만 받는다. 이관 마크업의 토스 hex 는 그대로 유지(전면 정규화는 별도
// 후속 패스로 이연), 신규 요소(나가기·글자 크기·카운터 버튼)만 slate/blue 로.
// 정오·정답 데이터는 이 파일 props 에 구조적으로 존재하지 않는다(§6-1).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALargeSmall,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileText,
  Flag,
  Info,
  LayoutGrid,
  LogOut,
  Rows3,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TakingQuestion } from "@/lib/exam-scoring/taking-payload";
import type { StudentInput } from "@/lib/exam-scoring/types";
import { AnswerLayer } from "./answer-layer";
import { TabletQuestionView } from "./question-view";
import { SaveIndicator, type SaveIndicatorState } from "./status-parts";
import { formatTime } from "./use-countdown";

// ── 글자 크기 3단(가 100% → 115% → 130%) ────────────────────────────────────
//
// CSS zoom 으로 시트/카드 전체를 배율 — 클래스 픽셀 크기는 불변이라 모드A/모드B
// "본문 픽셀 일치" 계약을 깨지 않는다. zoom 미지원 브라우저는 배율 1 고정
// (토글 미노출). 저장 키는 토큰과 무관한 기기 설정.

const FONT_SCALE_KEY = "smoat.taking.fontScale";
const FONT_SCALES = [1, 1.15, 1.3] as const;

export function useFontScale(): {
  fontScale: number;
  fontScaleSupported: boolean;
  cycleFontScale: () => void;
} {
  const [fontScale, setFontScale] = useState(1);
  const [supported, setSupported] = useState(false);

  // 클라 마운트 후에만 판정·복원 — SSR 하이드레이션 불일치 방지.
  useEffect(() => {
    const ok =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("zoom", "1.15");
    setSupported(ok);
    if (!ok) return;
    try {
      const stored = Number(window.localStorage.getItem(FONT_SCALE_KEY));
      if ((FONT_SCALES as readonly number[]).includes(stored)) setFontScale(stored);
    } catch {
      // 무시 — 기본 배율 유지
    }
  }, []);

  const cycleFontScale = useCallback(() => {
    setFontScale((prev) => {
      const index = (FONT_SCALES as readonly number[]).indexOf(prev);
      const next = FONT_SCALES[(index + 1) % FONT_SCALES.length] ?? 1;
      try {
        window.localStorage.setItem(FONT_SCALE_KEY, String(next));
      } catch {
        // 무시
      }
      return next;
    });
  }, []);

  return { fontScale, fontScaleSupported: supported, cycleFontScale };
}

// ── 잔여 시간 경고(5분) — ref 가드로 최초 진입 1회만 ─────────────────────────
//
// 짧은 제한시간(≤5분) 시험은 시작 직후 뜰 수 있다(의도 — 남은 시간 고지가 목적).
// 60초 미만 solid 칩 강조는 헤더/검토 타이머 칩이 담당한다.

export function useTimeWarning(remaining: number | null): void {
  const warnedRef = useRef(false);
  useEffect(() => {
    if (remaining === null || warnedRef.current) return;
    if (remaining > 0 && remaining <= 300) {
      warnedRef.current = true;
      toast("남은 시간이 5분입니다. 답안을 확인해 주세요.", {
        position: "top-center",
        duration: 3000,
      });
    }
  }, [remaining]);
}

// ── 제외 문항 안내 배너(orderSnapshot 대비 삭제 문항) ─────────────────────────

export function RemovedNotice({ count }: { count: number }) {
  return (
    <div className="shrink-0 border-b border-[#E5E8EB] bg-white px-4 py-2">
      <p className="mx-auto flex w-full max-w-3xl items-center gap-1.5 text-xs text-[#8B95A1]">
        <Info className="h-3.5 w-3.5 shrink-0" />
        시험 구성 변경으로 {count}개 문항이 제외되었습니다. 화면에 보이는 문항만
        응시하면 됩니다.
      </p>
    </div>
  );
}

// ── 상단 슬림 고정 바 ────────────────────────────────────────────────────────

export function TakingHeader({
  examTitle,
  isPaper,
  currentIdx,
  totalCount,
  answeredCount,
  progressPct,
  remaining,
  saveState,
  fontScale,
  fontScaleSupported,
  onCycleFontScale,
  onToggleView,
  onOpenNavigator,
  onRetrySave,
  onExit,
}: {
  examTitle: string;
  isPaper: boolean;
  currentIdx: number;
  totalCount: number;
  answeredCount: number;
  progressPct: number;
  remaining: number | null;
  saveState: SaveIndicatorState;
  fontScale: number;
  fontScaleSupported: boolean;
  onCycleFontScale: () => void;
  onToggleView: () => void;
  onOpenNavigator: () => void;
  onRetrySave: () => void;
  /** 저장 후 나가기(과제 출처 ?return=g 진입에서만 전달) — 없으면 버튼 미렌더 */
  onExit?: (() => void) | null;
}) {
  return (
    <header className="shrink-0 border-b border-[#E5E8EB] bg-white pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-2">
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            aria-label="저장하고 나가기"
            title="저장하고 나가기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5 -scale-x-100" />
          </button>
        )}
        <h1
          className="min-w-0 flex-1 truncate text-sm font-semibold text-[#191F28]"
          title={examTitle}
        >
          {examTitle}
        </h1>
        {/* 진행 카운터 — 탭하면 문항 네비게이터(두 모드 공통 진입점) */}
        <button
          type="button"
          onClick={onOpenNavigator}
          aria-label="문항 목록 열기"
          className="whitespace-nowrap rounded-full px-1.5 py-1 text-xs text-[#8B95A1] tabular-nums transition-colors hover:bg-[#F7F8FA] hover:text-[#4E5968]"
        >
          {isPaper
            ? `${answeredCount} / ${totalCount} 응답`
            : `${currentIdx + 1} / ${totalCount} · ${answeredCount} 응답`}
        </button>
        <button
          type="button"
          onClick={onToggleView}
          aria-label={isPaper ? "한 문제씩 보기로 전환" : "시험지 전체 보기로 전환"}
          title={isPaper ? "한 문제씩 보기" : "시험지 전체 보기"}
          className="flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#E5E8EB] bg-white px-2.5 text-xs font-semibold text-[#4E5968] transition-colors hover:bg-[#F7F8FA]"
        >
          {isPaper ? (
            <>
              <Rows3 className="h-3.5 w-3.5" />
              한 문제씩
            </>
          ) : (
            <>
              <FileText className="h-3.5 w-3.5" />
              시험지
            </>
          )}
        </button>
        {fontScaleSupported && (
          <button
            type="button"
            onClick={onCycleFontScale}
            aria-label={`글자 크기 변경 (현재 ${Math.round(fontScale * 100)}%)`}
            title={`글자 크기 ${Math.round(fontScale * 100)}%`}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
              fontScale > 1
                ? "border-blue-200 bg-blue-50 text-blue-600"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
            )}
          >
            <ALargeSmall className="h-4 w-4" />
          </button>
        )}
        {remaining !== null && (
          <span
            aria-live="polite"
            aria-label={`남은 시간 ${formatTime(remaining)}`}
            className={cn(
              "flex h-8 items-center gap-1 whitespace-nowrap rounded-full px-2.5 font-mono text-xs font-semibold",
              // 경고는 rose 만(주황 금지): 5분 미만 soft, 1분 미만 solid+pulse.
              remaining < 60
                ? "animate-pulse bg-rose-600 text-white"
                : remaining < 300
                  ? "bg-rose-50 text-rose-600"
                  : "bg-[#F7F8FA] text-[#4E5968]",
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            {formatTime(remaining)}
          </span>
        )}
        <SaveIndicator state={saveState} onRetry={onRetrySave} />
      </div>
      {/* 진행률 바 — 두 모드 모두 응답 수 기준(응시 진척의 단일 진실) */}
      <div
        className="h-1 bg-[#F2F4F6]"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-[#3182F6] transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </header>
  );
}

// ── 하단 고정 바 — 시험지 보기는 네비게이터+제출 검토, 한 문제씩은 이전/목록/다음

export function TakingFooter({
  isPaper,
  isLast,
  currentIdx,
  onPrev,
  onNext,
  onOpenNavigator,
  onReview,
}: {
  isPaper: boolean;
  isLast: boolean;
  currentIdx: number;
  onPrev: () => void;
  onNext: () => void;
  onOpenNavigator: () => void;
  onReview: () => void;
}) {
  return (
    <footer className="shrink-0 border-t border-[#E5E8EB] bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
        {isPaper ? (
          <>
            <button
              type="button"
              onClick={onOpenNavigator}
              aria-label="문항 목록 열기"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#E5E8EB] bg-white text-[#4E5968] transition-colors hover:bg-[#F7F8FA]"
            >
              <LayoutGrid className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onReview}
              className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#3182F6] text-sm font-semibold text-white transition-colors hover:bg-[#1B64DA]"
            >
              <ClipboardCheck className="h-4 w-4" />
              제출 검토
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onPrev}
              disabled={currentIdx === 0}
              className="flex h-12 flex-1 items-center justify-center gap-1 rounded-xl border border-[#E5E8EB] bg-white text-sm font-semibold text-[#4E5968] transition-colors hover:bg-[#F7F8FA] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              이전
            </button>
            <button
              type="button"
              onClick={onOpenNavigator}
              aria-label="문항 목록 열기"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#E5E8EB] bg-white text-[#4E5968] transition-colors hover:bg-[#F7F8FA]"
            >
              <LayoutGrid className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              className="flex h-12 flex-[1.3] items-center justify-center gap-1 rounded-xl bg-[#3182F6] text-sm font-semibold text-white transition-colors hover:bg-[#1B64DA]"
            >
              {isLast ? (
                <>
                  <ClipboardCheck className="h-4 w-4" />
                  제출 검토
                </>
              ) : (
                <>
                  다음
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </>
        )}
      </div>
    </footer>
  );
}

// ── 모드B(한 문제씩) 문항 카드 — 본문·응답 위젯은 모드A 와 동일 컴포넌트 공유 ──

export function SingleQuestionCard({
  question,
  input,
  isFlagged,
  disabled,
  fontScale,
  onChange,
  onToggleFlag,
}: {
  question: TakingQuestion;
  input: StudentInput | null;
  isFlagged: boolean;
  disabled: boolean;
  fontScale: number;
  onChange: (input: StudentInput | null) => void;
  onToggleFlag: () => void;
}) {
  return (
    <div className="px-4 py-5">
      <div className="mx-auto w-full max-w-3xl">
        <div
          className="rounded-2xl border border-[#E5E8EB] bg-white p-5"
          style={{ zoom: fontScale }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-[#3182F6] px-2 text-sm font-bold text-white tabular-nums">
                {question.orderNum}
              </span>
              <span className="text-xs text-[#8B95A1] tabular-nums">
                {question.points}점
              </span>
            </div>
            <button
              type="button"
              onClick={onToggleFlag}
              aria-pressed={isFlagged}
              aria-label="나중에 다시 볼 문항으로 표시"
              className={cn(
                "flex h-11 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-colors",
                isFlagged
                  ? "bg-blue-50 text-[#3182F6]"
                  : "bg-[#F7F8FA] text-[#8B95A1] hover:bg-blue-50 hover:text-[#3182F6]",
              )}
            >
              <Flag className="h-3.5 w-3.5" fill={isFlagged ? "currentColor" : "none"} />
              {isFlagged ? "표시됨" : "표시"}
            </button>
          </div>

          <div className="mt-4">
            <TabletQuestionView safe={question.safe} />
          </div>

          <div className="mt-5">
            <AnswerLayer
              questionOrderNum={question.orderNum}
              subType={question.safe.subType}
              answerUi={question.answerUi}
              options={question.safe.options}
              blanks={question.safe.safeData?.blanks}
              input={input}
              disabled={disabled}
              onChange={onChange}
            />
          </div>
        </div>
        {/* 가상 키보드·하단 바 여유 공간 */}
        <div className="h-10" />
      </div>
    </div>
  );
}
