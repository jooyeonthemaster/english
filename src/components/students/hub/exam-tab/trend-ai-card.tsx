"use client";

// 시험 탭 — AI 추세 분석 카드 (v3 대개편 A-1, v3 design §D1-3 시험 와이어 [D] 2행 우)
//
// 구 exam-history-parts/trend-report-section.tsx 로직 이식 — 데이터 계약 무변경:
//  - GET /api/students/{id}/exam-trend 자급자족 로드, POST(5cr — confirm 고지) 생성.
//  - 서버 GENERATING(다른 세션 생성 중 포함) 보고 시 5초 폴링 — R6 의 명시 예외
//    「AI 추세 생성 중 5초 폴링은 생성 진행 한정」 그대로 유지.
//  - 렌더는 ExamTrendReportEnvelope.doc 방어적 파싱(형태 어긋난 배열은 조용히 생략).
// UI 만 재작성: ui/Button·Skeleton·토스 hex 제거 → kit AnalyticsCard 셸 +
// slate/blue/emerald/rose 토큰(R2·R5 — 약점 rose · 강점 emerald).

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Loader2,
  RotateCcw,
} from "lucide-react";
import type { ExamTrendReportEnvelope } from "@/lib/exam-scoring/trend";
import { AnalyticsCard, fmtAt } from "../analytics/kit";

type Phase = "loading" | "idle" | "generating";

/** GENERATING 폴링 간격 — 라우트 maxDuration(300s) 안에서 완료를 기다린다(R6 예외) */
const POLL_INTERVAL_MS = 5000;

// ── 방어적 파싱(서버 jsonb → 렌더 안전 형태 — 구 구현 그대로) ────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** doc.overall(문자열)만 필수로 보고 나머지는 렌더에서 배열 검사한다 */
function parseEnvelope(raw: unknown): ExamTrendReportEnvelope | null {
  const rec = asRecord(raw);
  const doc = rec ? asRecord(rec.doc) : null;
  if (!doc || typeof doc.overall !== "string" || !doc.overall) return null;
  return raw as ExamTrendReportEnvelope;
}

function labeledList(value: unknown): { typeLabel: string; evidence: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const rec = asRecord(item);
      if (!rec || typeof rec.typeLabel !== "string" || typeof rec.evidence !== "string") {
        return null;
      }
      return { typeLabel: rec.typeLabel, evidence: rec.evidence };
    })
    .filter((item): item is { typeLabel: string; evidence: string } => item != null);
}

function transitionList(
  value: unknown,
): { typeLabel: string; from: string; to: string; evidence: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const rec = asRecord(item);
      if (
        !rec ||
        typeof rec.typeLabel !== "string" ||
        typeof rec.from !== "string" ||
        typeof rec.to !== "string" ||
        typeof rec.evidence !== "string"
      ) {
        return null;
      }
      return {
        typeLabel: rec.typeLabel,
        from: rec.from,
        to: rec.to,
        evidence: rec.evidence,
      };
    })
    .filter(
      (item): item is { typeLabel: string; from: string; to: string; evidence: string } =>
        item != null,
    );
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

export function TrendAiCard({
  studentId,
  className,
}: {
  studentId: string;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [report, setReport] = useState<ExamTrendReportEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** GENERATING 폴링 재가동 트리거(409 ALREADY_GENERATING 등) */
  const [pollKey, setPollKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const res = await fetch(`/api/students/${studentId}/exam-trend`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setError("추세 분석 정보를 불러오지 못했습니다.");
          setPhase("idle");
          return;
        }
        const json = (await res.json()) as { report?: unknown; status?: string | null };
        if (cancelled) return;
        const envelope = parseEnvelope(json.report);
        if (envelope) setReport(envelope);
        if (json.status === "GENERATING") {
          setPhase("generating");
          timer = setTimeout(load, POLL_INTERVAL_MS);
        } else {
          setPhase("idle");
        }
      } catch {
        if (cancelled) return;
        setError("추세 분석 정보를 불러오지 못했습니다.");
        setPhase("idle");
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [studentId, pollKey]);

  const handleGenerate = async () => {
    const message = report
      ? "AI 추세변화 분석을 다시 생성합니다.\n5크레딧이 차감되며 기존 분석이 대체됩니다. 진행하시겠습니까?"
      : "AI 추세변화 분석을 생성합니다.\n5크레딧이 차감됩니다. 진행하시겠습니까?";
    if (!window.confirm(message)) return;

    setError(null);
    setPhase("generating");
    try {
      const res = await fetch(`/api/students/${studentId}/exam-trend`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as {
        report?: unknown;
        error?: string;
        code?: string;
        balance?: number;
        required?: number;
      } | null;

      if (res.ok) {
        const envelope = parseEnvelope(json?.report);
        if (envelope) {
          setReport(envelope);
          setPhase("idle");
          return;
        }
        // 성공 응답이지만 형태 해석 실패 — 저장본 재조회로 수습.
        setPollKey((k) => k + 1);
        return;
      }
      if (res.status === 402) {
        const detail =
          typeof json?.balance === "number" && typeof json?.required === "number"
            ? ` (보유 ${json.balance}크레딧 · 필요 ${json.required}크레딧)`
            : "";
        setError(`크레딧이 부족합니다${detail}. 크레딧을 충전한 후 다시 시도해 주십시오.`);
        setPhase("idle");
        return;
      }
      if (res.status === 409 && json?.code === "ALREADY_GENERATING") {
        // 다른 세션에서 이미 생성 중 — 무과금. 폴링으로 완료를 기다린다.
        setPollKey((k) => k + 1);
        return;
      }
      setError(
        typeof json?.error === "string" && json.error
          ? json.error
          : "추세 분석 생성에 실패하였습니다. 잠시 후 다시 시도해 주십시오.",
      );
      setPhase("idle");
    } catch {
      setError("네트워크 오류로 추세 분석을 생성하지 못했습니다. 잠시 후 다시 시도해 주십시오.");
      setPhase("idle");
    }
  };

  const doc = report?.doc;
  const transitions = transitionList(doc?.transitions);
  const weaknesses = labeledList(doc?.weaknesses);
  const strengths = labeledList(doc?.strengths);
  const prescription = stringList(doc?.prescription);
  const generatedAt = report?.generatedAt ? fmtAt(report.generatedAt) : null;

  return (
    <AnalyticsCard
      className={className}
      icon={<BrainCircuit className="size-4 text-blue-600" aria-hidden />}
      title="AI 추세 분석"
      aside={
        phase === "idle" ? (
          <button
            type="button"
            onClick={handleGenerate}
            className={
              report
                ? "inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                : "inline-flex h-7 items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
            }
          >
            {report ? (
              <RotateCcw className="size-3.5" aria-hidden />
            ) : (
              <BrainCircuit className="size-3.5" aria-hidden />
            )}
            {report ? "다시 분석 · 5cr" : "분석 생성 · 5cr"}
          </button>
        ) : null
      }
    >
      {generatedAt ? (
        <p className="mb-2 text-[11px] tabular-nums text-slate-400">
          마지막 생성 {generatedAt}
        </p>
      ) : null}

      {error && (
        <p className="mb-3 flex items-start gap-1.5 text-xs text-rose-500">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {phase === "loading" ? (
        <div className="space-y-2 pt-1">
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        </div>
      ) : phase === "generating" ? (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <Loader2 className="size-5 shrink-0 animate-spin text-blue-600" aria-hidden />
          <div>
            <p className="text-sm font-medium text-slate-900">분석 중입니다… 최대 1분</p>
            <p className="mt-0.5 text-xs text-slate-400">완료되면 자동으로 표시됩니다.</p>
          </div>
        </div>
      ) : doc ? (
        <div className="space-y-5">
          {/* 종합 추세 */}
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
            {doc.overall}
          </p>

          {/* 약점 → 강점 전환 하이라이트 */}
          {transitions.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-slate-400">약점 → 강점 전환</h4>
              <div className="space-y-2">
                {transitions.map((t, i) => (
                  <div
                    key={`${t.typeLabel}-${i}`}
                    className="rounded-lg border border-slate-200 border-l-4 border-l-blue-600 bg-white p-3.5"
                  >
                    <p className="text-[13px] font-semibold text-slate-900">{t.typeLabel}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-slate-400">{t.from}</span>
                      <ArrowRight className="size-3.5 text-slate-300" aria-hidden />
                      <span className="font-semibold text-blue-600">{t.to}</span>
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                      {t.evidence}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 약점 / 강점 2컬럼 — 약점 rose · 강점 emerald(R5 톤 정합) */}
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3.5">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <AlertCircle className="size-3.5 text-rose-400" aria-hidden /> 현재 약점
              </h4>
              {weaknesses.length > 0 ? (
                <ul className="space-y-2">
                  {weaknesses.map((w, i) => (
                    <li key={`${w.typeLabel}-${i}`} className="text-xs leading-relaxed">
                      <span className="font-semibold text-slate-900">{w.typeLabel}</span>
                      <span className="text-slate-500"> — {w.evidence}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">표시할 약점이 없습니다.</p>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 p-3.5">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <CheckCircle2 className="size-3.5 text-emerald-500" aria-hidden /> 현재 강점
              </h4>
              {strengths.length > 0 ? (
                <ul className="space-y-2">
                  {strengths.map((s, i) => (
                    <li key={`${s.typeLabel}-${i}`} className="text-xs leading-relaxed">
                      <span className="font-semibold text-slate-900">{s.typeLabel}</span>
                      <span className="text-slate-500"> — {s.evidence}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">표시할 강점이 없습니다.</p>
              )}
            </div>
          </div>

          {/* 학습 처방 */}
          {prescription.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-slate-400">학습 처방</h4>
              <ol className="space-y-2">
                {prescription.map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700">
                      {i + 1}
                    </span>
                    <span className="text-[13px] leading-relaxed text-slate-700">{line}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
          <p className="text-[13px] text-slate-500">아직 생성된 추세 분석이 없습니다.</p>
          <p className="mt-1 text-xs text-slate-400">
            응시 기록을 근거로 AI가 성적 추세와 약점→강점 전환, 학습 처방을 분석합니다.
            분석 1회에 5크레딧이 차감됩니다.
          </p>
        </div>
      )}
    </AnalyticsCard>
  );
}
