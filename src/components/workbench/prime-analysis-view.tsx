"use client";

import { Loader2, PencilLine, Printer, RefreshCw, Send, Sparkle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnalysisReportDocument } from "@/components/workbench/analysis-report/AnalysisReportDocument";
import {
  AnalysisReportEditor,
  type ReportEditorToolbarState,
} from "@/components/workbench/analysis-report/AnalysisReportEditor";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import {
  AssignmentComposer,
  type ComposerPreset,
} from "@/components/study-assignments/assignment-composer";
import { useWorksheetAssignCreatedToast } from "@/components/workbench/use-worksheet-assign";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { notifyCreditsChanged } from "@/lib/credits-client";
import {
  isFinalOnepageReportShape,
  type AnalysisReport,
} from "@/lib/passage-report/analysis-report/schema";
import type { PassageAnalysisData } from "@/types/passage-analysis";

/** 이 뷰가 다루는 학습지 축 — 기본(PRIME 행) / 파이널 원페이지(PRIME_FINAL 행). */
type SheetVariant = "basic" | "final";

interface Props {
  passageId: string;
  /** 생성 직후 호출 (모달이 잔액 갱신 등 후처리할 수 있게) */
  onGenerated?: () => void;
  /** 기존 5-layer 분석 (PRIME 없을 때 옛 인터랙티브 뷰로 폴백 — 기존 유저 호환) */
  legacyAnalysisData?: PassageAnalysisData | null;
  passageContent?: string;
  /** 지문 제목 — "학생에게 배포" 프리셋의 부가 표시(meta)용. */
  passageTitle?: string;
  /** 편집기 저장 상태를 모달 헤더로 끌어올리기 위한 콜백. */
  onToolbarStateChange?: (state: ReportEditorToolbarState | null) => void;
}

/**
 * 분석 등록 모달 안에서 PRIME A4 분석 보고서를 생성/표시.
 * - 기존 보고서 있으면 바로 렌더
 * - 없으면 생성 버튼 (5크레딧) → 생성 → 렌더
 * - 파이널 원페이지(PRIME_FINAL) 행이 따로 있으면:
 *   · 둘 다 있음 → 상단 필 탭 [기본 학습지][파이널 원페이지] (기본 탭 우선)
 *   · final 만 있음 → final 문서를 바로 편집기로
 *   · 기본만 있음 → 기존과 완전 동일 (탭 UI 자체가 안 뜸 — 무회귀)
 */
export function PrimeAnalysisView({ passageId, onGenerated, legacyAnalysisData, passageContent, passageTitle, onToolbarStateChange }: Props) {
  // 기본(PRIME) / 파이널(PRIME_FINAL) 문서를 병행 보관 — 편집기 key 를 variant 로 갈라
  // 히스토리·dirty 가 탭 사이에서 섞이지 않게 한다.
  const [basicReport, setBasicReport] = useState<AnalysisReport | null>(null);
  const [basicReportId, setBasicReportId] = useState<string | null>(null);
  const [finalReport, setFinalReport] = useState<AnalysisReport | null>(null);
  const [finalReportId, setFinalReportId] = useState<string | null>(null);
  const [variant, setVariant] = useState<SheetVariant>("basic");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 모달 진입 시 편집 모드 기본 활성화 (요청)
  const [mode, setMode] = useState<"view" | "edit">("edit");
  // "학생에게 배포" — 과제 컴포저 (U6)
  const [assignOpen, setAssignOpen] = useState(false);
  const onAssignCreated = useWorksheetAssignCreatedToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // 지문이 바뀌면 이전 지문의 문서가 남지 않게 전부 비운다 — 특히 stale finalReport 가
    // 남으면 새 지문에서 탭이 잘못 뜬다(로딩 중에는 스피너가 화면을 덮어 깜빡임 없음).
    setBasicReport(null);
    setBasicReportId(null);
    setFinalReport(null);
    setFinalReportId(null);
    setVariant("basic");
    const loadBasic = fetch(`/api/workbench/passage-reports/prime/${passageId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.report) setBasicReport(j.report as AnalysisReport);
        if (typeof j?.reportId === "string") setBasicReportId(j.reportId);
      })
      .catch(() => {});
    const loadFinal = fetch(`/api/workbench/passage-reports/prime/${passageId}?variant=final`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        // 서버가 variant 파라미터를 모르는(구버전) 경우 기본 보고서가 그대로 돌아올 수
        // 있다 — 실제 final 모양일 때만 받아들여 탭 오염을 막는다.
        if (j?.report && isFinalOnepageReportShape(j.report as AnalysisReport)) {
          setFinalReport(j.report as AnalysisReport);
          if (typeof j?.reportId === "string") setFinalReportId(j.reportId);
        }
      })
      .catch(() => {});
    void Promise.allSettled([loadBasic, loadFinal]).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [passageId]);

  // 탭 실효값 — 기본 탭 우선, final 만 있으면 final 로 강제.
  const effectiveVariant: SheetVariant =
    variant === "final"
      ? finalReport
        ? "final"
        : "basic"
      : basicReport || !finalReport
        ? "basic"
        : "final";
  const report = effectiveVariant === "final" ? finalReport : basicReport;
  // 배포 프리셋의 refId — StudyAssignment(WORKSHEET)는 PassageReport.id 를 참조.
  // 현재 탭 문서의 행 id 를 쓴다(final GET 응답의 reportId 를 따로 저장).
  const reportId = effectiveVariant === "final" ? finalReportId : basicReportId;

  // 탭 전환 시 미저장 편집 경고용 — 편집기 툴바 상태를 이 계층에서도 들여다본 뒤
  // 부모(모달 헤더)로 그대로 전달한다. 부모가 콜백을 안 줬으면 기존처럼 undefined 를
  // 편집기에 넘겨야 한다(편집기가 인라인 저장 버튼 노출 여부를 콜백 유무로 판정 — 무회귀).
  const toolbarStateRef = useRef<ReportEditorToolbarState | null>(null);
  const handleToolbarStateChange = useCallback(
    (state: ReportEditorToolbarState | null) => {
      toolbarStateRef.current = state;
      onToolbarStateChange?.(state);
    },
    [onToolbarStateChange],
  );

  const switchVariant = useCallback(
    (next: SheetVariant) => {
      if (next === effectiveVariant) return;
      // 편집기는 탭별 key 로 갈아끼우므로 저장하지 않은 편집은 전환 시 사라진다 — 먼저 확인.
      if (
        toolbarStateRef.current?.dirty &&
        !window.confirm("저장하지 않은 편집이 있어요. 탭을 전환하면 사라집니다. 계속할까요?")
      )
        return;
      setVariant(next);
    },
    [effectiveVariant],
  );

  // 기본 학습지 생성/재생성 — POST 는 PRIME(기본) 행 전용 엔드포인트라 결과를 basic 에만 반영.
  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/workbench/passage-reports/prime/${passageId}`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "생성에 실패했습니다.");
      setBasicReport(j.report as AnalysisReport);
      if (typeof j?.reportId === "string") setBasicReportId(j.reportId);
      onGenerated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
      // 성공(차감)·실패(서버 자동 환급) 모두 잔액이 바뀌었을 수 있으니 사이드바 뱃지 즉시 갱신
      notifyCreditsChanged();
    }
  }, [passageId, onGenerated]);

  // 배포 프리셋 — 현재 탭 문서의 보고서 id 가 있을 때만(레거시 분석만 있으면 버튼 자체를 숨김).
  const assignPreset = useMemo<ComposerPreset | null>(() => {
    if (!reportId || !report) return null;
    const rawTitle = (report as { meta?: { titleKo?: string } }).meta?.titleKo;
    return {
      kind: "WORKSHEET",
      content: {
        refId: reportId,
        title: rawTitle?.trim() || passageTitle || "학습지",
        meta: passageTitle ?? "",
      },
    };
  }, [reportId, report, passageTitle]);

  // 둘 다 있을 때만 필 탭 — 기본만 있으면 탭 UI 자체가 안 뜬다(무회귀).
  const variantTabs =
    basicReport && finalReport ? (
      <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-1.5">
        {(
          [
            ["basic", "기본 학습지"],
            ["final", "파이널 원페이지"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => switchVariant(key)}
            aria-pressed={effectiveVariant === key}
            className={
              effectiveVariant === key
                ? "inline-flex h-7 items-center rounded-full bg-blue-600 px-3 text-[12px] font-semibold text-white"
                : "inline-flex h-7 items-center rounded-full border border-slate-200 px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
            }
          >
            {label}
          </button>
        ))}
      </div>
    ) : null;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400 gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }

  // PRIME 없음 + 기존 5-layer 분석 있음 → 옛 인터랙티브 뷰 그대로 (기존 유저 호환)
  if (!report && legacyAnalysisData) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-blue-50/60">
          <span className="text-[12px] font-medium text-slate-600">기존 분석 (인터랙티브 보기)</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-blue-600 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkle className="w-3.5 h-3.5" />}
            {generating ? "생성 중…" : "지문 학습자료로 새로 만들기"}
            {!generating && (
              <CreditCostChip
                amount={CREDIT_COSTS.PASSAGE_ANALYSIS}
                className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]"
              />
            )}
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">
          <InteractivePassageView content={passageContent ?? ""} analysisData={legacyAnalysisData} />
        </div>
        {error ? <p className="px-4 py-1 text-xs text-red-500">{error}</p> : null}
      </div>
    );
  }

  // PRIME 없음 + 기존 분석도 없음 → 생성 CTA
  if (!report) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-sm text-slate-500 max-w-md">
          이 지문으로 <b>A4 심층 분석 보고서</b>를 생성합니다.<br />
          원문·해석, 구조도, 어법, 출제포인트, 어휘, 구문분석이 학생 눈높이로 한 번에 정리돼요.
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkle className="w-4 h-4" />}
          {generating ? "생성 중… (20~30초 소요)" : "A4 분석 보고서 생성"}
          {!generating && (
            <CreditCostChip
              amount={CREDIT_COSTS.PASSAGE_ANALYSIS}
              className="rounded bg-white/20 px-1.5 py-0.5 text-[11px]"
            />
          )}
        </button>
        {error ? <p className="text-xs text-red-500 max-w-md">{error}</p> : null}
      </div>
    );
  }

  // 편집 모드 — 레이아웃 편집기 (보기와 동일한 렌더러를 edit 컨텍스트로 구동)
  if (mode === "edit") {
    const editor = (
      <AnalysisReportEditor
        // 탭별로 편집기 인스턴스를 분리(히스토리·dirty·선택 상태 오염 방지).
        key={effectiveVariant}
        passageId={passageId}
        initialReport={report}
        // 활동 생성 소스는 "지문"이지 "문서"가 아니다 — 파이널 탭에서만 이미 로드된
        // 기본(PRIME) 문서를 소스로 전달. 기본 문서가 없으면 null(편집기가 T1 폴백으로
        // 강등). 기본 탭에는 전달하지 않는다(undefined = 현행 렌더와 동일).
        activitySource={effectiveVariant === "final" ? basicReport : undefined}
        onSaved={(saved) => {
          // 저장 결과는 그 variant 상태만 갱신한다(다른 탭 문서는 불변).
          if (effectiveVariant === "final") setFinalReport(saved);
          else setBasicReport(saved);
          onGenerated?.();
        }}
        onExit={() => setMode("view")}
        onToolbarStateChange={onToolbarStateChange ? handleToolbarStateChange : undefined}
      />
    );
    if (!variantTabs) return editor;
    return (
      <div className="flex h-full flex-col">
        {variantTabs}
        <div className="min-h-0 flex-1">{editor}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {variantTabs}
      <div className="prime-view-toolbar flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-white">
        <span className="text-[12px] font-semibold text-slate-600">
          {effectiveVariant === "final" ? "파이널 원페이지" : "A4 분석 보고서"}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setMode("edit")}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-blue-200 text-[12px] font-semibold text-blue-600 hover:bg-blue-50"
        >
          <PencilLine className="w-3.5 h-3.5" /> 레이아웃 편집
        </button>
        {/* 재생성 POST 는 기본(PRIME) 행 전용 엔드포인트 — 파이널 탭에서는 숨긴다. */}
        {effectiveVariant === "basic" ? (
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-200 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            재생성
          </button>
        ) : null}
        {/* 학생에게 배포 — 학생 앱(/g) 과제로 이 학습지를 보낸다 (U6). */}
        {assignPreset ? (
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            title="학생 앱으로 배포"
            aria-label="학생 앱으로 배포"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-blue-200 text-[12px] font-semibold text-blue-600 hover:bg-blue-50"
          >
            <Send className="w-3.5 h-3.5" /> 학생에게 배포
          </button>
        ) : null}
        <button
          type="button"
          onClick={() =>
            // 인쇄 전 웹폰트 로드 완료 대기 — 미로드 상태 인쇄로 인한 프린트 준비 지연 방지.
            void document.fonts.ready.then(() => window.print())
          }
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-blue-600 text-[12px] font-semibold text-white hover:bg-blue-700"
        >
          <Printer className="w-3.5 h-3.5" /> 인쇄 / PDF
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-slate-200 py-6">
        <AnalysisReportDocument report={report} />
      </div>
      {error ? <p className="px-4 py-1 text-xs text-red-500">{error}</p> : null}

      {/* 과제 배포 컴포저 (U6) */}
      <AssignmentComposer
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        preset={assignPreset}
        onCreated={onAssignCreated}
      />
    </div>
  );
}
