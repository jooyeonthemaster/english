"use client";

// ============================================================================
// /t/[token] 태블릿 응시 — 응시 인트로 화면 (ASSIGNED 전용)
//
// 링크를 여는 순간 타이머가 기동하던 문제의 방어면: 미시작(ASSIGNED) 세션은
// 이 화면에서 시험 정보·학생명을 확인하고 [응시 시작]을 눌러야 응시(taking)로
// 진입한다 — 카운트다운 기산점은 시작 버튼 클릭 시각(tablet-taking-client 관리).
// 학생 공개면 — TakingSession 의 화이트리스트 메타만 표시, 정답성 데이터 없음.
// 문구는 합니다체(§1). 색은 slate/blue 계열만(신규 코드 토스 hex 금지).
// ============================================================================

import { ClipboardList, Play } from "lucide-react";
import type { TakingMode } from "@/lib/exam-scoring/taking-payload";

export function TakingIntroScreen({
  examTitle,
  studentName,
  totalQuestions,
  duration,
  mode,
  instructions,
  dueLabel,
  onStart,
}: {
  examTitle: string;
  studentName: string;
  totalQuestions: number;
  /** 제한시간(분) — null 이면 무제한(타이머 없음) */
  duration: number | null;
  mode: TakingMode;
  /** 과제 안내문(합니다체) — 브리지 없는 DIRECT 배포는 null(표시 생략) */
  instructions?: string | null;
  /** 과제 마감 표기(서버 Asia/Seoul 포맷 완료본) — 예: "7월 14일 23:59" */
  dueLabel?: string | null;
  onStart: () => void;
}) {
  const metaParts = [
    `${totalQuestions}문항`,
    ...(duration ? [`제한 ${duration}분`] : []),
    mode === "OMR" ? "OMR 입력" : "태블릿 응시",
    ...(dueLabel ? [`마감 ${dueLabel}`] : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <ClipboardList className="h-7 w-7" />
        </div>
        <h1 className="text-center text-lg font-semibold leading-snug text-slate-900">
          {examTitle}
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500 tabular-nums">
          {metaParts.join(" · ")}
        </p>

        <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left">
          <p className="text-[11px] font-medium text-slate-400">응시 학생</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-800">{studentName}</p>
          <p className="mt-1 text-xs text-slate-500">
            본인이 맞는지 확인한 뒤 시작해 주세요.
          </p>
        </div>

        {/* 과제 안내문 — 브리지 컨텍스트가 있을 때만(DIRECT 배포는 미표시) */}
        {instructions && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left">
            <p className="text-[11px] font-medium text-slate-400">선생님 안내</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
              {instructions}
            </p>
          </div>
        )}

        {/* 유의 안내 1줄 — 타이머 유무에 따라 문구 분기(합니다체) */}
        <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
          {duration
            ? "응시 시작을 누르는 순간부터 제한 시간이 시작되며, 답안은 자동으로 저장됩니다."
            : "답안은 자동으로 저장되며, 제출한 뒤에는 수정할 수 없습니다."}
        </p>

        <button
          type="button"
          onClick={onStart}
          className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-base font-bold text-white transition-colors hover:bg-blue-700"
        >
          <Play className="h-5 w-5" fill="currentColor" />
          응시 시작
        </button>

        <p className="mt-6 text-center text-[11px] text-slate-400">SMOAT 시험 응시</p>
      </div>
    </div>
  );
}
