"use client";

// ============================================================================
// 학생 시험 리포트 v3 — 스텝 2: 정오표(verdict-board) · 핵심 신규 화면
//
// 좌측: 문항별 정오표 테이블(AI 판독 프리필 + 강사 4상태 토글/부분점수).
// 우측: 'AI 확인 요청 N건' 패널(질문 → 행 점프) + 원본 사진 뷰어(Sheet).
// 하단 고정 액션바: 정오 카운트 + 저장 상태 + [점수 확정](UNKNOWN 잔존 경고 모달).
// 점수는 학부모 공유 리포트에 실리므로 강사 1회 확정이 오독 방어선이다.
// ============================================================================

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ImageIcon,
  Loader2,
  MessageCircleQuestion,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { computeScoreSummary, round2 } from "@/lib/exam-report/grading";
import type {
  ExamMap,
  ReadUncertainty,
  ResponseStatus,
  StudentResponse,
} from "@/lib/exam-report/types";
import type { ExamSourceFile } from "../ui-contracts";
import {
  STATUS_STYLE,
  autoUnreviewedCountOf,
  isStudentSubmitted,
  numberKey,
  orderedQuestions,
  studentSubmittedCountOf,
  unknownCountOf,
} from "./grading-shared";
import type { SaveState } from "./use-verdict-state";
import { VerdictRow } from "./verdict-row";
import { StudentSourceViewer } from "./student-source-viewer";

interface VerdictBoardProps {
  examMap: ExamMap;
  responses: StudentResponse[];
  uncertainties: ReadUncertainty[];
  studentId: string;
  sourceFiles: ExamSourceFile[];
  saveState: SaveState;
  gradingConfirmed: boolean;
  confirming: boolean;
  onSetStatus: (number: string, status: ResponseStatus) => void;
  onSetPartial: (number: string, pts: number | null) => void;
  onReset: (number: string) => void;
  /** MC 선지 직접 입력(①~⑤) — chosenChoice + 정답 대조 자동 정오 파생. */
  onSetChoice: (number: string, choice: string) => void;
  /** 일괄 마킹("남은 문항 모두 정답/오답" 툴바) — markMany 경유. */
  onMarkMany: (numbers: string[], status: ResponseStatus) => void;
  /** 확정 처리(gradingConfirmed:true 저장). 성공 시 true. */
  onConfirm: () => Promise<boolean>;
  /** 리포트 스텝으로 진행. */
  onProceed: () => void;
  /** 판독 스텝으로 복귀. */
  onBack: () => void;
}

function jumpToRow(number: string) {
  // 행 id 는 numberKey(공백 정규화) 기반 — "서답형 4"/"서답형4" 드리프트에서도 점프(A6).
  const el = document.getElementById(`verdict-row-${numberKey(number)}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function VerdictBoard({
  examMap,
  responses,
  uncertainties,
  studentId,
  sourceFiles,
  saveState,
  gradingConfirmed,
  confirming,
  onSetStatus,
  onSetPartial,
  onReset,
  onSetChoice,
  onMarkMany,
  onConfirm,
  onProceed,
  onBack,
}: VerdictBoardProps) {
  const [warnOpen, setWarnOpen] = useState(false);

  const responseByNumber = useMemo(
    () => new Map(responses.map((r) => [r.number, r])),
    [responses],
  );
  const uncertaintyKeys = useMemo(
    () => new Set(uncertainties.map((u) => numberKey(u.number))),
    [uncertainties],
  );
  const ordered = useMemo(() => orderedQuestions(examMap), [examMap]);
  const summary = useMemo(
    () => computeScoreSummary(examMap, responses),
    [examMap, responses],
  );
  const unknownCount = unknownCountOf(responses);
  const pendingCount = autoUnreviewedCountOf(responses);
  // 미상(UNKNOWN) 문항 번호 — 일괄 마킹 대상.
  const unknownNumbers = useMemo(
    () => responses.filter((r) => r.status === "UNKNOWN").map((r) => r.number),
    [responses],
  );
  // 답안 출처 카운트 — 사진판독(aiRead) / 학생제출(링크, 미확인) / 직접입력(강사 확정).
  const sourceCounts = useMemo(
    () => ({
      ai: responses.filter((r) => r.aiRead != null).length,
      student: studentSubmittedCountOf(responses),
      manual: responses.filter(
        (r) =>
          r.source === "MANUAL" && r.reviewed && r.status !== "UNKNOWN" && r.aiRead == null,
      ).length,
    }),
    [responses],
  );

  async function handleConfirm() {
    setWarnOpen(false);
    const ok = await onConfirm();
    if (ok) onProceed();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 xl:flex-row">
        {/* 좌: 정오표 테이블 */}
        <section className="min-w-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onBack}
                aria-label="답안 수집으로 돌아가기"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h2 className="text-[14px] font-bold text-slate-900">정오표 확인</h2>
                <p className="text-[12px] font-medium text-slate-400">
                  수집한 답안을 검토·입력하고 정오를 확정하세요.
                </p>
              </div>
            </div>
            <SaveIndicator state={saveState} />
          </div>

          {/* 상단 요약 스트립: 정오 카운트 + 점수 미리보기 + 답안 출처 + 일괄 액션 */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
              <CountChip label="정답" n={summary.correctCount} status="CORRECT" />
              <CountChip label="오답" n={summary.wrongCount} status="WRONG" />
              <CountChip label="부분" n={summary.partialCount} status="PARTIAL" />
              <CountChip label="미채점" n={summary.unknownCount} status="UNKNOWN" />
              <span className="whitespace-nowrap text-[12px] font-bold tabular-nums text-slate-700">
                점수{" "}
                {summary.totalScore != null ? round2(summary.totalScore) : "—"}
                {summary.maxScore != null ? (
                  <span className="font-medium text-slate-400"> / {round2(summary.maxScore)}</span>
                ) : null}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {sourceCounts.ai > 0 && (
                <SourceChip className="border-indigo-200 bg-indigo-50 text-indigo-700">
                  사진 판독 {sourceCounts.ai}
                </SourceChip>
              )}
              {sourceCounts.student > 0 && (
                <SourceChip className="border-blue-200 bg-blue-50 text-blue-700">
                  학생 제출 {sourceCounts.student}
                </SourceChip>
              )}
              {sourceCounts.manual > 0 && (
                <SourceChip className="border-slate-200 bg-white text-slate-500">
                  직접 입력 {sourceCounts.manual}
                </SourceChip>
              )}
              {!gradingConfirmed && unknownCount > 0 && (
                <div className="ml-1 inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onMarkMany(unknownNumbers, "CORRECT")}
                    className="h-7 whitespace-nowrap rounded-md border border-emerald-200 bg-white px-2 text-[11.5px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                  >
                    남은 {unknownCount}문항 모두 정답
                  </button>
                  <button
                    type="button"
                    onClick={() => onMarkMany(unknownNumbers, "WRONG")}
                    className="h-7 whitespace-nowrap rounded-md border border-rose-200 bg-white px-2 text-[11.5px] font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                  >
                    모두 오답
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">문항</th>
                  <th className="px-2 py-2 text-center font-semibold">배점</th>
                  <th className="px-2 py-2 font-semibold">학생답</th>
                  <th className="px-2 py-2 font-semibold">정답</th>
                  <th className="px-2 py-2 font-semibold">정오</th>
                  <th className="px-2 py-2 font-semibold">부분</th>
                  <th className="px-3 py-2 text-right font-semibold">신뢰도</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((entry) => {
                  const r =
                    responseByNumber.get(entry.number) ??
                    // 표시 전용 기본행 — normalizeResponses 발명행과 동일하게
                    // reviewed:false(강사가 판정한 적 없음)로 계약을 맞춘다.
                    ({
                      number: entry.number,
                      status: "UNKNOWN",
                      source: "MANUAL",
                      reviewed: false,
                    } as StudentResponse);
                  const hasUncertainty = uncertaintyKeys.has(numberKey(entry.number));
                  // 학생 링크 제출분(reviewed:false MANUAL + 답 데이터)도 강사 확인
                  // 전까지 파랑 하이라이트로 유도한다.
                  const ambiguous =
                    r.status === "UNKNOWN" ||
                    r.aiRead?.confidence === "LOW" ||
                    hasUncertainty ||
                    isStudentSubmitted(r);
                  return (
                    <VerdictRow
                      key={entry.number}
                      entry={entry}
                      response={r}
                      ambiguous={ambiguous}
                      hasUncertainty={hasUncertainty}
                      onSetStatus={onSetStatus}
                      onSetPartial={onSetPartial}
                      onReset={onReset}
                      onSetChoice={onSetChoice}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* 우: AI 확인 요청 + 원본 사진 */}
        <aside className="shrink-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:w-[340px] xl:self-start xl:overflow-y-auto">
          <div className="flex flex-col gap-4">
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <MessageCircleQuestion className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-bold text-slate-900">
                    AI 확인 요청 {uncertainties.length}건
                  </h2>
                  <p className="text-[12px] font-medium text-slate-400">
                    모호한 마킹입니다. 사진을 보고 정정하세요.
                  </p>
                </div>
              </div>
              <div className="p-3">
                {uncertainties.length === 0 ? (
                  <p className="px-1 py-3 text-center text-[12.5px] text-slate-400">
                    확인 요청이 없습니다.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {uncertainties.map((u, i) => (
                      <li key={`${u.number}-${i}`}>
                        <button
                          type="button"
                          onClick={() => jumpToRow(u.number)}
                          className="flex w-full items-start gap-2 rounded-md border border-blue-100 bg-blue-50/40 px-2.5 py-2 text-left transition-colors hover:bg-blue-50"
                        >
                          <span className="mt-0.5 flex h-5 min-w-[1.75rem] items-center justify-center rounded bg-white px-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
                            {u.number}
                          </span>
                          <span className="min-w-0 flex-1 text-[12px] leading-snug text-slate-600">
                            {u.question}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* 원본 사진 뷰어 (Sheet) */}
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
                >
                  <ImageIcon className="h-4 w-4" />
                  학생 시험지 원본 보기
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[min(92vw,32rem)] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>학생 시험지 원본</SheetTitle>
                </SheetHeader>
                <div className="px-4 pb-6">
                  <StudentSourceViewer
                    studentId={studentId}
                    sourceFiles={sourceFiles}
                    variant="stack"
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </aside>
      </div>

      {/* 하단 고정 액션바 */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          <CountChip label="정답" n={summary.correctCount} status="CORRECT" />
          <CountChip label="오답" n={summary.wrongCount} status="WRONG" />
          <CountChip label="부분" n={summary.partialCount} status="PARTIAL" />
          <CountChip label="미상" n={summary.unknownCount} status="UNKNOWN" />
          {pendingCount > 0 && (
            <span className="text-[11px] text-blue-600">· 미확정 {pendingCount}</span>
          )}
        </div>

        {gradingConfirmed ? (
          <button
            type="button"
            onClick={onProceed}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            리포트로 이동
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (unknownCount > 0 ? setWarnOpen(true) : void handleConfirm())}
            disabled={confirming}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            점수 확정
          </button>
        )}
      </div>

      {/* UNKNOWN 잔존 경고 */}
      <AlertDialog open={warnOpen} onOpenChange={setWarnOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              미상 {unknownCount}문항
            </AlertDialogTitle>
            <AlertDialogDescription>
              미상(미확인) 문항은 채점 집계에서 제외됩니다. 그대로 점수를 확정할까요?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>더 확인하기</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirm()} disabled={confirming}>
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              확정하고 진행
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CountChip({
  label,
  n,
  status,
}: {
  label: string;
  n: number;
  status: ResponseStatus;
}) {
  const style = STATUS_STYLE[status];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      <span className="text-slate-400">{label}</span>
      <span className={cn("font-bold", style.text)}>{n}</span>
    </span>
  );
}

/** 답안 출처 뱃지(사진 판독/학생 제출/직접 입력). */
function SourceChip({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        className,
      )}
    >
      {children}
    </span>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        저장 중
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
        <CheckCircle2 className="h-3 w-3" />
        저장됨
      </span>
    );
  }
  return null;
}
