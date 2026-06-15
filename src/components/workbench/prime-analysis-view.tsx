"use client";

import { Loader2, PencilLine, Printer, RefreshCw, Sparkle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AnalysisReportDocument } from "@/components/workbench/analysis-report/AnalysisReportDocument";
import { AnalysisReportEditor } from "@/components/workbench/analysis-report/AnalysisReportEditor";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { notifyCreditsChanged } from "@/lib/credits-client";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import type { PassageAnalysisData } from "@/types/passage-analysis";

interface Props {
  passageId: string;
  /** 생성 직후 호출 (모달이 잔액 갱신 등 후처리할 수 있게) */
  onGenerated?: () => void;
  /** 기존 5-layer 분석 (PRIME 없을 때 옛 인터랙티브 뷰로 폴백 — 기존 유저 호환) */
  legacyAnalysisData?: PassageAnalysisData | null;
  passageContent?: string;
}

/**
 * 분석 등록 모달 안에서 PRIME A4 분석 보고서를 생성/표시.
 * - 기존 보고서 있으면 바로 렌더
 * - 없으면 생성 버튼 (5크레딧) → 생성 → 렌더
 */
export function PrimeAnalysisView({ passageId, onGenerated, legacyAnalysisData, passageContent }: Props) {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 모달 진입 시 편집 모드 기본 활성화 (요청)
  const [mode, setMode] = useState<"view" | "edit">("edit");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/workbench/passage-reports/prime/${passageId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.report) setReport(j.report as AnalysisReport);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [passageId]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/workbench/passage-reports/prime/${passageId}`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "생성에 실패했습니다.");
      setReport(j.report as AnalysisReport);
      onGenerated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
      // 성공(차감)·실패(서버 자동 환급) 모두 잔액이 바뀌었을 수 있으니 사이드바 뱃지 즉시 갱신
      notifyCreditsChanged();
    }
  }, [passageId, onGenerated]);

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
    return (
      <AnalysisReportEditor
        passageId={passageId}
        initialReport={report}
        onSaved={(saved) => {
          setReport(saved);
          onGenerated?.();
        }}
        onExit={() => setMode("view")}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="prime-view-toolbar flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-white">
        <span className="text-[12px] font-semibold text-slate-600">A4 분석 보고서</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setMode("edit")}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-blue-200 text-[12px] font-semibold text-blue-600 hover:bg-blue-50"
        >
          <PencilLine className="w-3.5 h-3.5" /> 레이아웃 편집
        </button>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-200 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          재생성
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-blue-600 text-[12px] font-semibold text-white hover:bg-blue-700"
        >
          <Printer className="w-3.5 h-3.5" /> 인쇄 / PDF
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-slate-200 py-6">
        <AnalysisReportDocument report={report} />
      </div>
      {error ? <p className="px-4 py-1 text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
