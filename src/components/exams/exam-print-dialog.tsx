"use client";

// ============================================================================
// 목록 카드 「인쇄」 대화상자 — 같은 문서 안에서 보이는 미리보기로 인쇄한다.
//
// 종전(26-09-29 폐기): 카드가 0×0 · visibility:hidden 숨김 iframe 에 상세 화면(?print=1)을 띄웠다.
// 창이 0×0 이라 IntersectionObserver 가 돌지 않아 2쪽 뒤가 백지로 나갔고, 인쇄 1회마다 원장 콘솔
// 문서를 새로 부팅해 3~13초 무반응이었다.
//
// 지금:
//  1) 클릭 즉시 대화상자가 열린다. 여는 상태는 목록 컴포넌트 state 가 아니라 작은 스토어
//     (createExamPrintDialogStore)에 둔다 — 목록 state 로 두면 카드 수십 장(각자 첫 장 조판)이 통째로
//     다시 렌더되어 대화상자가 1초 가까이 늦게 떴다(26-09-30 개발 서버 실측 84장 · 906~1017ms).
//  2) 썸네일과 공유하는 캐시(exam-preview-data-cache)에서 데이터를 받는다(적중하면 네트워크 0).
//     무거운 미리보기 조판은 대화상자 첫 페인트 **다음**에 그린다(rAF → 메시지 태스크 = 페인트 뒤).
//  3) <ExamDetailPaperPreview autoPrint printEntry="card-dialog"> — 상세 · 빠른보기와 같은 조판 · 가드 ·
//     usePrintPortal(#exam-print-host) 경로. 인쇄는 인쇄 컨트롤러가 준비 완료 신호를 보고 부른다.
//  4) 인쇄 창이 닫히면(afterprint — 인쇄 창에서 취소한 경우 포함) 대화상자를 닫는다. blocked 면 열어
//     둔다(상태 표시줄이 사유와 [다시 시도]를 보여 준다). 닫기 · Esc 는 본문 언마운트로 잡을 취소한다.
// ============================================================================

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Loader2, RotateCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExamDetailPaperPreview } from "./exam-detail-paper-preview";
import { loadExamPreviewData } from "./exam-preview-data-cache";
import type { ExamDetail } from "./exam-detail-client-parts/types";
import type { ExamPrintFinish } from "./paper-builder/print/use-exam-print-controller";

export interface ExamPrintDialogJob {
  examId: string;
  title: string;
  /** 목록의 exam.updatedAt — 썸네일과 같은 캐시 키 */
  updatedAt?: string | Date | null;
}

/** 대화상자 열림 상태 — 목록은 open() 만 부르고 다시 렌더되지 않는다. */
export interface ExamPrintDialogStore {
  get: () => ExamPrintDialogJob | null;
  /** 새 객체를 넣을 때마다 한 번 인쇄한다. null = 닫기 */
  set: (job: ExamPrintDialogJob | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createExamPrintDialogStore(): ExamPrintDialogStore {
  let current: ExamPrintDialogJob | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (job) => {
      if (job === current) return;
      current = job;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const getNoJob = () => null;

/** 다음 페인트 뒤에 한 번 부른다(rAF 는 페인트 직전 → 거기서 보낸 메시지 태스크는 페인트 뒤). */
function afterNextPaint(callback: () => void): () => void {
  let cancelled = false;
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    channel.port1.close();
    if (!cancelled) callback();
  };
  const raf = window.requestAnimationFrame(() => channel.port2.postMessage(null));
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf);
    channel.port1.close();
  };
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; exam: ExamDetail }
  | { status: "error"; message: string };

const ACTION_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3182F6]/60 focus-visible:ring-offset-2";

export function ExamPrintDialog({ store }: { store: ExamPrintDialogStore }) {
  const job = useSyncExternalStore(store.subscribe, store.get, getNoJob);
  const close = useCallback(() => store.set(null), [store]);
  // 닫힘 애니메이션 동안 제목을 유지한다(렌더 중 상태 조정 — 이전 값 기억 패턴).
  const [lastJob, setLastJob] = useState<ExamPrintDialogJob | null>(job);
  if (job && job !== lastJob) setLastJob(job);
  const shown = job ?? lastJob;

  return (
    <Dialog
      open={job !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none lg:h-[calc(100dvh-2rem)] lg:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-5 pb-2 pt-3 pr-14 text-left">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-base font-bold text-slate-900">
            <span className="truncate">{shown?.title || "시험지"}</span>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              인쇄
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            시험지를 불러와 준비가 끝나면 인쇄 창을 엽니다. 인쇄 창을 닫으면 이 창도 닫힙니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 px-2 pb-2 pt-2 lg:px-3">
          {/* 닫히면 즉시 본문을 내린다 — 준비 중이던 인쇄 잡이 닫힘 애니메이션 동안 인쇄하지 않게. */}
          {job ? <PrintDialogBody key={job.examId} job={job} onClose={close} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PrintDialogBody({ job, onClose }: { job: ExamPrintDialogJob; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const { examId, updatedAt } = job;

  useEffect(() => {
    let cancelled = false;
    let cancelPaint: (() => void) | null = null;
    loadExamPreviewData(examId, updatedAt).then(
      (data) => {
        if (cancelled) return;
        const next: LoadState = data
          ? { status: "ready", exam: data as unknown as ExamDetail }
          : { status: "error", message: "시험지를 찾을 수 없습니다. 삭제되었거나 접근 권한이 없습니다." };
        // 조판은 무겁다 — 대화상자 · 스피너가 먼저 페인트된 뒤에 그린다(캐시 적중이면 같은 프레임에 온다).
        cancelPaint = afterNextPaint(() => setLoad(next));
      },
      () => {
        if (!cancelled) setLoad({ status: "error", message: "시험지를 불러오지 못했습니다." });
      },
    );
    return () => {
      cancelled = true;
      cancelPaint?.();
    };
  }, [examId, updatedAt, attempt]);

  const handleFinished = useCallback(
    (finish: ExamPrintFinish) => {
      // blocked 는 열어 둔다 — 상태 표시줄이 사유와 [다시 시도]를 보여 준다.
      if (finish.outcome !== "blocked") onClose();
    },
    [onClose],
  );

  if (load.status === "ready") {
    return (
      <ExamDetailPaperPreview
        exam={load.exam}
        autoPrint
        printEntry="card-dialog"
        onPrintFinished={handleFinished}
        className="min-h-0 flex-1"
      />
    );
  }

  if (load.status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div
          role="alert"
          className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-7 text-center shadow-sm"
        >
          <AlertTriangle className="size-6 text-rose-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-800">{load.message}</p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLoad({ status: "loading" });
                setAttempt((n) => n + 1);
              }}
              className={`${ACTION_BUTTON} bg-[#3182F6] text-white hover:bg-[#1b64da]`}
            >
              <RotateCw className="size-4" aria-hidden="true" />
              다시 시도
            </button>
            <Link
              href={`/director/exams/${examId}`}
              className={`${ACTION_BUTTON} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              상세 화면 열기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div
        role="status"
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm"
      >
        <Loader2 className="size-4 text-[#3182F6] motion-safe:animate-spin" aria-hidden="true" />
        시험지 불러오는 중
      </div>
    </div>
  );
}
