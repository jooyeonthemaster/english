"use client";

// ============================================================================
// Done-step — Post-commit action hub.
//
// Once a job is committed, this screen stops being a "we're done" terminus
// and becomes a launchpad for the six most-common follow-ups:
//
//   1. 5-layer 분석 일괄 실행     (sequential per-passage, all modes w/ passages)
//   2. 문제 생성                   (M1/M2/M4 — not M3) → /director/workbench/generate
//   3. 시험 조립                   (M2/M4 — needs questions) → PassageAddToExamDialog
//   4. 반 과제 배포                (needs class + first passage) → PassageAssignToClassDialog
//   5. 학습 세트 만들기            (M1/M2/M4 — not M3) → /director/workbench/generate-learning
//   6. 라이브러리에서 보기          (always) → /director/workbench/passages
//
// Cards #3 and #4 intentionally open in-place Dialogs (re-used from the
// library detail page) instead of navigating to `/director/exams/new` or
// `/director/assignments/new` — those routes do not exist. The dialogs
// handle their own createExam / createAssignment flow and redirect to the
// detail page on success.
//
// Cards that can't succeed in the current mode are disabled with an inline
// explanation + aria-describedby wiring so screen readers convey the reason.
// ============================================================================

import { useCallback, useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CheckCircle2,
  FolderOpen,
  GraduationCap,
  Layers,
  ListChecks,
  Plus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useExtractionStore } from "@/lib/extraction/store";
import { getModeConfig } from "@/lib/extraction/modes";
import { PassageAddToExamDialog } from "@/components/workbench/passage-add-to-exam-dialog";
import { PassageAssignToClassDialog } from "@/components/workbench/passage-assign-to-class-dialog";

import { ActionCard } from "./done-step/action-card";
import { buildSummaryCounts, formatElapsed } from "./done-step/helpers";

export function DoneStep() {
  const router = useRouter();
  const job = useExtractionStore((s) => s.job);
  const drafts = useExtractionStore((s) => s.drafts);
  const mode = useExtractionStore((s) => s.mode);
  const sourceMaterial = useExtractionStore((s) => s.sourceMaterial);
  const lastCommitResult = useExtractionStore((s) => s.lastCommitResult);
  const completedAt = useExtractionStore((s) => s.completedAt);
  const reset = useExtractionStore((s) => s.reset);

  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [examDialogOpen, setExamDialogOpen] = useState(false);

  // 5-layer 분석 일괄 — client-side sequential fan-out over single-passage
  // endpoint. Swap to a single batch endpoint when /api/ai/passage-analysis/batch
  // ships; the UI contract stays identical.
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0); // 0.0 – 1.0

  // ── beforeUnload guard ───────────────────────────────────────────────────
  // The 5-layer batch is non-transactional and can run for minutes. If the
  // teacher closes/refreshes the tab mid-flight, the half-processed passages
  // silently fail — and the toast summary never fires. We surface the browser's
  // native "leave site?" prompt while `analysisRunning` is true so they get a
  // chance to stay. Removed on unmount / when the run completes.
  useEffect(() => {
    if (!analysisRunning) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the message but require `returnValue` to be set
      // for the prompt to appear at all.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [analysisRunning]);

  // ── Derived counts ────────────────────────────────────────────────────────

  const savedPassages = useMemo(() => {
    if (lastCommitResult?.createdPassageIds?.length) {
      return lastCommitResult.createdPassageIds.length;
    }
    const savedDrafts = drafts.filter((d) => d.status === "SAVED").length;
    return savedDrafts || drafts.length;
  }, [drafts, lastCommitResult]);

  const savedQuestions = lastCommitResult?.createdQuestionIds?.length ?? 0;
  // Real count from the commit response (populated in review-step on success).
  const bundleCount = lastCommitResult?.createdBundleIds?.length ?? 0;
  // Server-returned "kept rows" (teacher edits preserved) — surfaced in the
  // hero summary so the counts match what the teacher sees in the library.
  const skippedPassages = lastCommitResult?.skippedPassageIds?.length ?? 0;
  const skippedQuestions = lastCommitResult?.skippedQuestionIds?.length ?? 0;

  const summaryLine = buildSummaryCounts({
    mode,
    savedPassages,
    savedQuestions,
    bundleCount,
    skippedPassages,
    skippedQuestions,
  });

  // ── Source material title (falls back to job filename, then a generic label)
  const sourceTitle =
    sourceMaterial?.title || job?.originalFileName || "업로드 파일";

  const elapsed = formatElapsed(
    job?.startedAt ?? null,
    completedAt ?? job?.completedAt ?? null,
  );
  const creditsConsumed = job?.creditsConsumed ?? 0;
  const creditsRefunded = job?.creditsRefunded ?? 0;

  // ── Shared deep-link query (passages CSV) ────────────────────────────────

  const passageIds = useMemo(
    () => lastCommitResult?.createdPassageIds ?? [],
    [lastCommitResult],
  );
  const passageIdsCsv = useMemo(() => passageIds.join(","), [passageIds]);
  const hasPassageIds = passageIdsCsv.length > 0;
  const sourceMaterialId = lastCommitResult?.sourceMaterialId ?? null;
  const collectionId = lastCommitResult?.collectionId ?? null;

  // ── Single-passage dialog props ─────────────────────────────────────────
  // PassageAddToExamDialog / PassageAssignToClassDialog operate on ONE
  // passage at a time. We use the first created passage as the primary
  // target and surface an inline note when `savedPassages > 1` so the
  // teacher knows the remaining passages need to be attached in the exam /
  // assignment detail page (both already support multi-passage attach).
  const primaryPassageId = passageIds[0] ?? null;
  const primaryPassageTitle = useMemo(() => {
    // Prefer the first saved draft's title so the dialog uses the teacher's
    // reviewed label rather than the raw source-material filename.
    const firstSaved = drafts.find((d) => d.status === "SAVED");
    return (
      firstSaved?.title ||
      sourceMaterial?.title ||
      job?.originalFileName ||
      "저장된 지문"
    );
  }, [drafts, sourceMaterial?.title, job?.originalFileName]);
  const academyId = job?.academyId ?? sourceMaterial?.academyId ?? null;

  // ── Mode-gated disables ──────────────────────────────────────────────────

  const modeIsPassageOnly = mode === "PASSAGE_ONLY";
  const modeIsExplanation = mode === "EXPLANATION";

  // "시험 조립" — the in-place PassageAddToExamDialog handles the rest
  // (새 시험 생성 / 기존 DRAFT 추가 + createExam → addQuestionsToExam).
  // We still gate on M1/M3 (no questions) and the availability of an
  // academyId + at least one committed passage.
  const examAssembleDisabled =
    modeIsPassageOnly ||
    modeIsExplanation ||
    !hasPassageIds ||
    !academyId ||
    !primaryPassageId;
  const examAssembleReason = modeIsPassageOnly
    ? "이 모드에는 문제가 없어 시험 조립이 불가합니다. M2/M4 모드로 재업로드해 주세요."
    : modeIsExplanation
      ? "해설 자료 모드에서는 시험 조립이 지원되지 않습니다."
      : !hasPassageIds
        ? "대상 지문이 없습니다."
        : !academyId
          ? "학원 정보를 확인할 수 없어 시험 조립을 시작할 수 없습니다."
          : undefined;

  // "문제 생성" / "학습 세트" — M3(EXPLANATION) 모드는 지문/문제 재생성 대상이 아님.
  const generateDisabled = modeIsExplanation || !hasPassageIds;
  const generateReason = modeIsExplanation
    ? "해설 자료 모드에서는 지원되지 않습니다."
    : !hasPassageIds
      ? "대상 지문이 없습니다."
      : undefined;

  const learningDisabled = modeIsExplanation || !hasPassageIds;
  const learningReason = modeIsExplanation
    ? "해설 자료 모드에서는 지원되지 않습니다."
    : !hasPassageIds
      ? "대상 지문이 없습니다."
      : undefined;

  // "5-layer 분석" — 지문이 없으면(예: M3 해설 모드) 의미 없음.
  const analysisDisabled = !hasPassageIds || analysisRunning;
  const analysisReason = !hasPassageIds
    ? "분석 대상 지문이 없습니다."
    : analysisRunning
      ? "분석이 진행 중입니다."
      : undefined;

  // ── Card handlers ────────────────────────────────────────────────────────

  const onRunAnalysis = useCallback(async () => {
    if (!hasPassageIds || analysisRunning) return;
    setAnalysisRunning(true);
    setAnalysisProgress(0);

    const total = passageIds.length;
    let done = 0;
    let failed = 0;

    for (const id of passageIds) {
      try {
        const res = await fetch(`/api/ai/passage-analysis/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
      done += 1;
      setAnalysisProgress(done / total);
    }

    setAnalysisRunning(false);
    const success = total - failed;
    if (failed === 0) {
      toast.success(`${success}/${total}개 지문 분석 완료`);
    } else if (success === 0) {
      toast.error(`분석 실패 (${failed}/${total})`);
    } else {
      toast.warning(`${success}/${total}개 완료, ${failed}개 실패`);
    }
  }, [hasPassageIds, analysisRunning, passageIds]);

  const onGoGenerate = useCallback(() => {
    if (generateDisabled) return;
    router.push(`/director/workbench/generate?passageIds=${passageIdsCsv}`);
  }, [generateDisabled, passageIdsCsv, router]);

  const onGoAssemble = useCallback(() => {
    if (examAssembleDisabled) return;
    setExamDialogOpen(true);
  }, [examAssembleDisabled]);

  const onGoLearning = useCallback(() => {
    if (learningDisabled) return;
    router.push(
      `/director/workbench/generate-learning?passageIds=${passageIdsCsv}`,
    );
  }, [learningDisabled, passageIdsCsv, router]);

  const onGoLibrary = useCallback(() => {
    if (sourceMaterialId) {
      router.push(
        `/director/workbench/passages?sourceMaterialId=${sourceMaterialId}`,
      );
      return;
    }
    if (collectionId) {
      router.push(
        `/director/workbench/passages?collectionId=${collectionId}`,
      );
      return;
    }
    router.push(`/director/workbench/passages`);
  }, [sourceMaterialId, collectionId, router]);

  // ── Hero state ───────────────────────────────────────────────────────────

  const modeLabel = mode ? getModeConfig(mode).label : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-slate-50">
      {/* ─── Full-bleed dashboard: hero (left) + actions (right) ──────────── */}
      <section
        aria-labelledby="done-hero-title"
        className="grid min-h-0 flex-1 grid-cols-[380px_1fr] border-y border-slate-200 bg-white"
      >
        {/* ─── LEFT: Hero panel ─────────────────────────────────────────── */}
        <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-gradient-to-b from-slate-50/60 via-white to-white px-8 py-8">
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"
            aria-hidden
          >
            <CheckCircle2 className="size-6" strokeWidth={1.8} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              시험지 인식 · 완료
            </span>
            {modeLabel ? (
              <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">
                {modeLabel}
              </span>
            ) : null}
          </div>

          <h2
            id="done-hero-title"
            className="mt-3 line-clamp-2 text-[20px] font-bold leading-snug tracking-tight text-slate-900"
          >
            {sourceTitle}
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">
            {summaryLine}
          </p>

          {/* Stats grid — 3 compact tiles */}
          <dl className="mt-6 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <dt className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400">
                크레딧
              </dt>
              <dd className="mt-0.5 text-[15px] font-bold tabular-nums text-slate-900">
                {creditsConsumed.toLocaleString("ko-KR")}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <dt className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400">
                환불
              </dt>
              <dd className="mt-0.5 text-[15px] font-bold tabular-nums text-slate-900">
                {creditsRefunded.toLocaleString("ko-KR")}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <dt className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400">
                소요 시간
              </dt>
              <dd className="mt-0.5 text-[15px] font-bold tabular-nums text-slate-900">
                {elapsed}
              </dd>
            </div>
          </dl>

          {/* Bottom-pinned secondary action */}
          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
              aria-label="다른 시험지 추가 등록 — 모드 선택으로"
            >
              <Plus className="size-4" strokeWidth={1.8} />
              다른 시험지 추가 등록
            </button>
          </div>
        </aside>

        {/* ─── RIGHT: Action grid ────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-col px-8 py-8">
          <div className="mb-5 flex items-center gap-3">
            <h3 className="text-[13px] font-bold tracking-tight text-slate-800">
              바로 이어서 하기
            </h3>
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] font-medium text-slate-400">
              6개 액션 · 클릭하여 진행
            </span>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-3">
            <ActionCard
              icon={BarChart3}
              iconTone="sky"
              title="5-layer 분석 일괄 실행"
              description="모든 지문에 5단계 자동 분석을 순차 실행합니다."
              actionLabel={
                analysisRunning
                  ? `실행 중 ${Math.round(analysisProgress * 100)}%`
                  : "실행"
              }
              onAction={onRunAnalysis}
              disabled={analysisDisabled}
              disabledReason={analysisReason}
              ariaLabel="5-layer 분석 일괄 실행"
              primary
              progress={analysisRunning ? analysisProgress : null}
            />

            <ActionCard
              icon={ListChecks}
              iconTone="sky"
              title="문제 생성"
              description="등록된 지문으로 새 문제를 바로 출제합니다."
              actionLabel="이동"
              onAction={onGoGenerate}
              disabled={generateDisabled}
              disabledReason={generateReason}
              ariaLabel="문제 생성 페이지로 이동"
            />

            <ActionCard
              icon={GraduationCap}
              iconTone="sky"
              title="시험 조립"
              description={
                savedPassages > 1
                  ? `첫 지문으로 시험을 만듭니다. 나머지 ${savedPassages - 1}개는 시험 상세에서 추가.`
                  : "문제를 골라 시험지를 조립합니다."
              }
              actionLabel="이동"
              onAction={onGoAssemble}
              disabled={examAssembleDisabled}
              disabledReason={examAssembleReason}
              ariaLabel="시험 조립 페이지로 이동"
            />

            <ActionCard
              icon={Users}
              iconTone="emerald"
              title="반 과제 배포"
              description={
                savedPassages > 1
                  ? `첫 지문으로 과제 생성 (총 ${savedPassages}개, 나머지는 과제 상세에서 첨부)`
                  : "선택한 반에 이번 지문을 과제로 내보냅니다."
              }
              actionLabel="반 선택"
              onAction={() => {
                if (!hasPassageIds || !academyId || !primaryPassageId) return;
                setClassDialogOpen(true);
              }}
              disabled={!hasPassageIds || !academyId || !primaryPassageId}
              disabledReason={
                !hasPassageIds
                  ? "배포할 지문이 없습니다."
                  : !academyId
                    ? "학원 정보를 확인할 수 없어 과제 배포를 시작할 수 없습니다."
                    : undefined
              }
              ariaLabel="반 과제 배포 — 반 선택 창 열기"
            />

            <ActionCard
              icon={Layers}
              iconTone="emerald"
              title="학습 세트 만들기"
              description="개별 학생용 학습 문제 세트를 자동 생성합니다."
              actionLabel="만들기"
              onAction={onGoLearning}
              disabled={learningDisabled}
              disabledReason={learningReason}
              ariaLabel="학습 세트 만들기 페이지로 이동"
            />

            <ActionCard
              icon={FolderOpen}
              iconTone="emerald"
              title="라이브러리에서 보기"
              description="이번에 저장된 지문을 지문 라이브러리에서 확인합니다."
              actionLabel="이동"
              onAction={onGoLibrary}
              ariaLabel="지문 라이브러리에서 보기"
            />
          </div>
        </div>
      </section>

      {/* ─── Exam assemble dialog (D1 re-use) ────────────────────────────── */}
      {/* Mounted lazily so it only fetches draft-exam data on open. */}
      {academyId && primaryPassageId ? (
        <PassageAddToExamDialog
          open={examDialogOpen}
          onOpenChange={setExamDialogOpen}
          academyId={academyId}
          passageId={primaryPassageId}
          passageTitle={primaryPassageTitle}
        />
      ) : null}

      {/* ─── Class-assignment dialog (D1 re-use) ─────────────────────────── */}
      {academyId && primaryPassageId ? (
        <PassageAssignToClassDialog
          open={classDialogOpen}
          onOpenChange={setClassDialogOpen}
          academyId={academyId}
          passageId={primaryPassageId}
          passageTitle={primaryPassageTitle}
        />
      ) : null}
    </div>
  );
}
