"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpenCheck,
  ImageIcon,
  Loader2,
  PencilLine,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { WebtoonPickerModal } from "@/components/workbench/analysis-report/webtoon-picker-modal";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { notifyCreditsChanged } from "@/lib/credits-client";
import { confirmNative } from "@/lib/browser-confirm";
import { formatDate } from "@/lib/utils";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";

import { KoreanReportModal } from "./korean-report-modal";

/**
 * 국어 지문 상세 — 학습 자료 패널 (분석 학습지 + 지문 웹툰).
 *
 * 학습지 생성은 기존 KO 게이트 라우트(POST /api/workbench/passage-reports/
 * prime/[passageId])만 호출한다 — 서버가 subject 로 PRIME_KO 생성기·마커를
 * 강제하므로 이 표면에는 영어 분석 파이프라인이 전혀 닿지 않는다. 웹툰도
 * 동일하게 서버(webtoon-processor)가 지문 subject 로 국어 프롬프트를 게이트한다.
 */
export function KoreanStudyMaterials({
  passageId,
  passageTitle,
}: {
  passageId: string;
  passageTitle: string;
}) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [webtoonOpen, setWebtoonOpen] = useState(false);

  // 기존 학습지 조회 — KO 게이트 GET(국어 지문이면 PRIME_KO 마커·KO 스키마 행만).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/workbench/passage-reports/prime/${passageId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.report) {
          setReport(j.report as AnalysisReport);
          setUpdatedAt(typeof j.updatedAt === "string" ? j.updatedAt : null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [passageId]);

  const generate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/workbench/passage-reports/prime/${passageId}`,
        { method: "POST" },
      );
      const j = await res.json().catch(() => ({}));
      if (res.status === 402) {
        toast.error(
          `크레딧이 부족합니다. 보유 ${j?.balance ?? "?"} / 필요 ${j?.required ?? "?"}`,
        );
        return;
      }
      if (!res.ok || !j?.report) {
        throw new Error(j?.error || "학습지 생성에 실패했습니다.");
      }
      setReport(j.report as AnalysisReport);
      setUpdatedAt(new Date().toISOString());
      toast.success("국어 분석 학습지가 완성되었습니다.");
      setReportOpen(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "학습지 생성에 실패했습니다.",
      );
    } finally {
      setGenerating(false);
      // 성공(차감)·실패(서버 자동 환불) 모두 잔액이 바뀌었을 수 있다 — 즉시 갱신.
      notifyCreditsChanged();
    }
  }, [generating, passageId]);

  const regenerate = useCallback(() => {
    const ok = confirmNative(
      "학습지를 새로 생성할까요?",
      "기존 학습지 내용(편집한 부분 포함)이 새 생성 결과로 대체됩니다. 이 작업은 되돌릴 수 없습니다.",
    );
    if (ok) void generate();
  }, [generate]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* ─── 국어 분석 학습지 ─── */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
              <BookOpenCheck className="size-4.5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-slate-800">
                국어 분석 학습지
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
                개관(갈래·주제·해제)부터 문단별 요지·핵심 개념어·구조도·예상 출제
                포인트까지 A4 학습지 한 부로 정리합니다.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
            {loading ? (
              <span className="flex items-center gap-1.5 text-[12px] text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                학습지 확인 중…
              </span>
            ) : report ? (
              <>
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  disabled={generating}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  학습지 열람·편집
                </button>
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={generating}
                  title="학습지를 새로 생성합니다 (기존 내용 대체)"
                  className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {generating ? "생성 중…" : "다시 생성"}
                  {!generating && (
                    <CreditCostChip
                      amount={CREDIT_COSTS.PASSAGE_ANALYSIS}
                      className="rounded bg-slate-100 px-1 py-px text-[10px] text-slate-600"
                    />
                  )}
                </button>
                {updatedAt ? (
                  <span className="ml-auto text-[11px] text-slate-400">
                    {formatDate(new Date(updatedAt))} 수정
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={generating}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BookOpenCheck className="h-3.5 w-3.5" />
                  )}
                  {generating ? "학습지 생성 중… (약 1~2분)" : "학습지 생성"}
                  {!generating && (
                    <CreditCostChip
                      amount={CREDIT_COSTS.PASSAGE_ANALYSIS}
                      className="rounded bg-white/20 px-1 py-px text-[10px]"
                    />
                  )}
                </button>
                {!generating ? (
                  <span className="text-[11px] text-slate-400">
                    생성에는 1~2분 정도 걸려요
                  </span>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* ─── 지문 웹툰 ─── */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
              <ImageIcon className="size-4.5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-slate-800">지문 웹툰</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
                지문의 내용과 흐름을 세로형 교육 웹툰 한 장으로 만들어 수업
                자료로 활용합니다.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setWebtoonOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              웹툰 만들기 · 보관함
            </button>
            <span className="text-[11px] text-slate-400">생성 약 3분 소요</span>
          </div>
        </div>
      </div>

      {/* 학습지 열람·편집 모달 (전체 화면) */}
      {reportOpen && report ? (
        <KoreanReportModal
          passageId={passageId}
          passageTitle={passageTitle}
          report={report}
          onClose={() => setReportOpen(false)}
          onSaved={(saved) => {
            setReport(saved);
            setUpdatedAt(new Date().toISOString());
          }}
        />
      ) : null}

      {/* 지문 웹툰 모달 — 기존 모달 재사용(국어 스코프: 이 지문 것만, 클릭=크게 보기) */}
      <WebtoonPickerModal
        open={webtoonOpen}
        passageId={passageId}
        subject="KOREAN"
        heading={{
          title: "국어 지문 웹툰",
          description:
            "이 지문으로 웹툰을 생성하거나, 완성된 웹툰을 확인합니다.",
        }}
        pickLabel="크게 보기 →"
        onClose={() => setWebtoonOpen(false)}
        onPick={(pick) => {
          // 상세 페이지에는 삽입할 문서가 없다 — 원본을 새 탭에서 크게 연다.
          window.open(pick.imageUrl, "_blank", "noopener,noreferrer");
        }}
      />
    </>
  );
}
