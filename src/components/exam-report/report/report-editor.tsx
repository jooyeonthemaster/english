"use client";

// ============================================================================
// 학생 시험 리포트 — 리포트 에디터 (채점 ↔ 리포트 탭 중 리포트)
//
// reportStatus 분기:
//   NONE       → 빈 상태(채점 탭에서 생성 유도)
//   GENERATING → 진행 단계 레일 + 문서 스켈레톤 + 폴링(완료 시 onStudentChange)
//   FAILED     → 에러 카드 + 환불 안내
//   GENERATED  → 에디터(중앙 report-document[edit] + 우측 side-panel)
//
// 인쇄(PDF 저장): visibility/:has()/절대배치 해킹 전면 폐기 —
// ReportPrintPortal(body 직속, mode="view")이 단일 경로다. hidden 섹션 제외·
// 페이지네이션·폰트 대기가 포털에서 구조적으로 보장된다(상세 주석은 포털 파일).
//
// 상태/저장/롤백/재생성/폴링 로직은 use-report-editor-state 훅으로 분리했다
// (파일 500줄 상한). 이 파일은 툴바·패널·상태 분기 렌더링(UI)만 담당한다.
// ============================================================================

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileText,
  Loader2,
  Printer,
  RotateCcw,
} from "lucide-react";
import type { ReportEditorProps } from "../ui-contracts";
import { ReportDocument } from "./report-document";
import { ReportPrintPortal, EDITOR_PRINT_CSS } from "./report-print-portal";
import { EditorSidePanel } from "./editor-side-panel";
import { DevicePreviewToggle } from "./device-preview-toggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useReportEditorState, type SaveState } from "./use-report-editor-state";

export function ReportEditor({ student, onStudentChange }: ReportEditorProps) {
  const {
    doc,
    saveState,
    device,
    setDevice,
    regenerating,
    handleDocChange,
    handleRollback,
    handleRegenerate,
  } = useReportEditorState({ student, onStudentChange });

  // 인쇄 포털 표시 여부 — true 인 동안 body 직속에 클린 view 문서가 뜬다.
  const [printing, setPrinting] = useState(false);

  // ── 상태 분기 렌더 ─────────────────────────────────────────────────────────
  if (student.reportStatus === "NONE") {
    return (
      <EmptyState
        title="아직 리포트가 없어요"
        body="채점 탭에서 응답을 입력한 뒤 '리포트 생성'을 눌러 학생 상담 리포트를 만드세요."
      />
    );
  }

  if (student.reportStatus === "FAILED") {
    return <FailedState />;
  }

  if (student.reportStatus === "GENERATING") {
    return <GeneratingState />;
  }

  // GENERATED
  if (!doc) {
    return (
      <EmptyState
        title="리포트를 불러오지 못했어요"
        body="리포트 문서를 읽는 중 문제가 발생했습니다. 새로고침 후 다시 시도해 주세요."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <style>{EDITOR_PRINT_CSS}</style>
      {printing && (
        <ReportPrintPortal doc={doc} onDone={() => setPrinting(false)} />
      )}

      <div className="flex flex-col gap-4 xl:flex-row">
        {/* 문서 카드: 툴바(헤더 스트립) + 리포트 문서 */}
        <section className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white shadow-sm">
          {/* 툴바 = 카드 헤더 스트립 */}
          {/* 워크스페이스 고정 헤더(--ws-head-h, 모바일은 셸 헤더 +56px) 바로 아래에 쌓인다 */}
          <div className="sticky top-[calc(var(--ws-head-h,0px)+56px)] z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-lg border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur md:top-[var(--ws-head-h,0px)]">
            <div className="flex items-center gap-3">
              <DevicePreviewToggle value={device} onChange={setDevice} />
              <SaveIndicator state={saveState} />
            </div>
            <div className="flex items-center gap-1.5">
              {student.hasPreviousReport && (
                <RollbackButton onConfirm={handleRollback} />
              )}
              <button
                type="button"
                onClick={() => setPrinting(true)}
                disabled={printing}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                {printing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                {printing ? "인쇄 준비 중" : "PDF 저장"}
              </button>
              {/* xl 미만: 우측 패널 드로어 */}
              <Sheet>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 xl:hidden"
                  >
                    <FileText className="h-4 w-4" />
                    설정
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[min(92vw,24rem)]">
                  <SheetHeader>
                    <SheetTitle>리포트 설정</SheetTitle>
                  </SheetHeader>
                  <div className="overflow-y-auto px-4 pb-6">
                    <EditorSidePanel
                      doc={doc}
                      onDocChange={handleDocChange}
                      student={student}
                      onStudentChange={onStudentChange}
                      onRegenerate={handleRegenerate}
                      regenerating={regenerating}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* 본문: 리포트 문서(화면 편집용 — 인쇄는 포털이 담당) */}
          <div className="p-4">
            <div
              className={cn(
                device === "mobile" &&
                  "mx-auto max-w-[420px] rounded-2xl border border-slate-200 shadow-sm",
              )}
            >
              <div className="relative">
                <ReportDocument doc={doc} mode="edit" onDocChange={handleDocChange} />
                {regenerating && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-white/70 backdrop-blur-sm">
                    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      리포트를 다시 생성하고 있어요…
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 우측 패널 카드 */}
        <aside className="hidden w-[380px] shrink-0 xl:block">
          <div className="sticky top-[calc(var(--ws-head-h,0px)+1rem)] max-h-[calc(100vh-var(--ws-head-h,0px)-2rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <EditorSidePanel
              doc={doc}
              onDocChange={handleDocChange}
              student={student}
              onStudentChange={onStudentChange}
              onRegenerate={handleRegenerate}
              regenerating={regenerating}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── 보조 컴포넌트 ────────────────────────────────────────────────────────────

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        저장 중
      </span>
    );
  }
  if (state === "conflict") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-500">
        <AlertTriangle className="h-3.5 w-3.5" />
        충돌 · 새로고침
      </span>
    );
  }
  if (state === "dirty") {
    return <span className="text-xs text-slate-400">변경됨</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
      <Check className="h-3.5 w-3.5" />
      저장됨
    </span>
  );
}

function RollbackButton({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800"
        >
          <RotateCcw className="h-4 w-4" />
          이전 버전
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>이전 버전으로 되돌릴까요?</AlertDialogTitle>
          <AlertDialogDescription>
            현재 편집본은 직전 버전과 자리가 바뀝니다. 되돌린 뒤에도 다시 앞뒤로
            전환할 수 있어요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>되돌리기</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** 빈 상태 — 장식 아이콘 대신 산출물(리포트 지면)의 실루엣을 보여준다. */
function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-6 py-20">
      <div className="mx-auto max-w-sm text-center">
        <div
          className="mx-auto mb-6 h-20 w-[60px] rounded-md border border-slate-200 bg-slate-50 p-2.5 text-left"
          aria-hidden
        >
          <div className="h-1.5 w-8 rounded-sm bg-slate-300" />
          <div className="mt-2 space-y-1">
            <div className="h-1 w-full rounded-sm bg-slate-200" />
            <div className="h-1 w-full rounded-sm bg-slate-200" />
            <div className="h-1 w-2/3 rounded-sm bg-slate-200" />
          </div>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Student Report
        </p>
        <h3 className="mt-1.5 text-base font-semibold text-slate-700">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{body}</p>
      </div>
    </div>
  );
}

function FailedState() {
  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <div className="overflow-hidden rounded-xl border border-rose-200 bg-white">
        <div className="h-1 w-full bg-rose-500" aria-hidden />
        <div className="flex items-start gap-3 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-800">
              리포트 생성에 실패했습니다
            </p>
            <p className="text-sm leading-relaxed text-slate-500">
              사용한 크레딧은 자동 환불됩니다. 채점 탭에서 다시 생성해 주세요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// 생성 진행 단계 — 실제 파이프라인 순서(판독 확인 → 결정론 집계 → 분석 →
// 내러티브 작성 → 조립)를 경과 시간 기준으로 근사해 보여준다.
const GENERATION_STAGES: { untilSec: number; label: string; detail: string }[] = [
  { untilSec: 6, label: "채점 데이터 확인", detail: "정오표와 응답 기록을 불러오고 있어요" },
  { untilSec: 16, label: "수치 집계", detail: "유형·난이도별 성취를 계산하고 있어요" },
  { untilSec: 40, label: "오답·함정 분석", detail: "틀린 문항의 원인과 함정 패턴을 살펴보고 있어요" },
  { untilSec: 85, label: "상담 문장 작성", detail: "문항 번호를 인용한 컨설팅 문장을 쓰고 있어요" },
  { untilSec: Number.POSITIVE_INFINITY, label: "문서 조립", detail: "표지와 섹션을 조립해 마무리하고 있어요" },
];

function GeneratingState() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const found = GENERATION_STAGES.findIndex((st) => elapsed < st.untilSec);
  const current = found === -1 ? GENERATION_STAGES.length - 1 : found;
  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <p className="text-sm font-semibold text-slate-700">
            리포트를 생성하고 있어요
          </p>
        </div>
        <p className="text-xs tabular-nums text-slate-400">
          경과 {minutes}:{seconds} · 보통 1~2분 정도 걸려요
        </p>
      </div>

      <div className="grid md:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        {/* 진행 단계 레일 */}
        <ol className="border-b border-slate-100 p-5 md:border-b-0 md:border-r">
          {GENERATION_STAGES.map((st, i) => {
            const state = i < current ? "done" : i === current ? "active" : "pending";
            return (
              <li key={st.label} className="relative flex gap-3 pb-5 last:pb-0">
                {i < GENERATION_STAGES.length - 1 && (
                  <span
                    className="absolute left-[9px] top-6 h-[calc(100%-1.5rem)] w-px bg-slate-200"
                    aria-hidden
                  />
                )}
                <span className="relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center">
                  {state === "done" ? (
                    <span className="flex h-[19px] w-[19px] items-center justify-center rounded-full bg-blue-600">
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </span>
                  ) : state === "active" ? (
                    <Loader2 className="h-[19px] w-[19px] animate-spin text-blue-600" />
                  ) : (
                    <span className="h-[19px] w-[19px] rounded-full border-2 border-slate-200 bg-white" />
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      state === "pending" ? "text-slate-400" : "text-slate-700",
                    )}
                  >
                    {st.label}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-xs leading-relaxed",
                      state === "pending" ? "text-slate-300" : "text-slate-500",
                    )}
                  >
                    {st.detail}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* 문서 스켈레톤 — 커버 밴드 + 번호 섹션 스텁(새 문서 해부도를 예고) */}
        <div className="p-5" aria-hidden>
          <div className="space-y-4">
            <div className="h-28 animate-pulse rounded-lg bg-slate-100" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-md bg-slate-100" />
                <div className="min-w-0 flex-1 space-y-2 pt-1">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                  <div className="h-2.5 w-full animate-pulse rounded bg-slate-100" />
                  <div className="h-2.5 w-4/5 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
