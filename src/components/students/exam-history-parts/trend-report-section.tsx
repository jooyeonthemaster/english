"use client";

// AI 추세변화 분석 섹션 (유닛 V5, 설계문서 §4.4·§5-V5)
//
// GET /api/students/{id}/exam-trend 로 기존 리포트를 자급자족 로드하고,
// POST(5cr — confirm 비용 고지 후)로 생성/재생성한다. 서버가 GENERATING
// 상태(다른 세션 생성 중 포함)를 보고하면 5초 간격 폴링으로 완료를 기다린다.
// 렌더는 저장 계약 ExamTrendReportEnvelope.doc(overall·transitions·weaknesses·
// strengths·prescription) — 필드별 방어적 파싱(형태 어긋난 배열은 조용히 생략).

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExamTrendReportEnvelope } from "@/lib/exam-scoring/trend";

type Phase = "loading" | "idle" | "generating";

/** GENERATING 폴링 간격 — 라우트 maxDuration(300s) 안에서 완료를 기다린다 */
const POLL_INTERVAL_MS = 5000;

// ── 방어적 파싱(서버 jsonb → 렌더 안전 형태) ─────────────────────────────────

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

function labeledList(
  value: unknown,
): { typeLabel: string; evidence: string }[] {
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

function formatGeneratedAt(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

export function TrendReportSection({ studentId }: { studentId: string }) {
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
  const generatedAt = formatGeneratedAt(report?.generatedAt);

  return (
    <section className="rounded-xl border border-[#E5E8EB] bg-white p-5">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#191F28]">
            <BrainCircuit className="size-4 text-[#3182F6]" />
            AI 추세변화 분석
          </h3>
          <p className="mt-1 text-xs text-[#8B95A1]">
            {report && generatedAt
              ? `마지막 생성 ${generatedAt}`
              : "응시 이력을 근거로 성적 추세와 약점→강점 전환, 학습 처방을 분석합니다."}
          </p>
        </div>
        {phase === "idle" && (
          <Button
            onClick={handleGenerate}
            variant={report ? "outline" : "default"}
            className={
              report
                ? "h-11 border-[#E5E8EB] px-4 text-[#4E5968] hover:bg-[#F7F8FA]"
                : "h-11 bg-[#3182F6] px-4 text-white hover:bg-[#1B64DA]"
            }
          >
            {report ? <RotateCcw className="size-4" /> : <BrainCircuit className="size-4" />}
            {report ? "다시 분석 · 5cr" : "AI 추세변화 분석 · 5cr"}
          </Button>
        )}
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-red-500">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      {/* 본문 */}
      {phase === "loading" ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : phase === "generating" ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#E5E8EB] bg-[#F7F8FA] p-4">
          <Loader2 className="size-5 shrink-0 animate-spin text-[#3182F6]" />
          <div>
            <p className="text-sm font-medium text-[#191F28]">분석 중입니다… 최대 1분</p>
            <p className="mt-0.5 text-xs text-[#8B95A1]">완료되면 자동으로 표시됩니다.</p>
          </div>
        </div>
      ) : doc ? (
        <div className="mt-4 space-y-5">
          {/* 종합 추세 */}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#333D4B]">
            {doc.overall}
          </p>

          {/* 약점 → 강점 전환 하이라이트 */}
          {transitions.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-[#8B95A1]">약점 → 강점 전환</h4>
              <div className="space-y-2">
                {transitions.map((t, i) => (
                  <div
                    key={`${t.typeLabel}-${i}`}
                    className="rounded-lg border border-[#E5E8EB] border-l-4 border-l-[#3182F6] bg-white p-4"
                  >
                    <p className="text-sm font-semibold text-[#191F28]">{t.typeLabel}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-[#8B95A1]">{t.from}</span>
                      <ArrowRight className="size-3.5 text-[#8B95A1]" />
                      <span className="font-semibold text-[#3182F6]">{t.to}</span>
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#4E5968]">{t.evidence}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 약점 / 강점 2컬럼 */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[#E5E8EB] p-4">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#4E5968]">
                <AlertCircle className="size-3.5 text-slate-500" /> 현재 약점
              </h4>
              {weaknesses.length > 0 ? (
                <ul className="space-y-2">
                  {weaknesses.map((w, i) => (
                    <li key={`${w.typeLabel}-${i}`} className="text-xs leading-relaxed">
                      <span className="font-semibold text-[#191F28]">{w.typeLabel}</span>
                      <span className="text-[#4E5968]"> — {w.evidence}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#8B95A1]">표시할 약점이 없습니다.</p>
              )}
            </div>
            <div className="rounded-lg border border-[#E5E8EB] p-4">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#4E5968]">
                <CheckCircle2 className="size-3.5 text-[#3182F6]" /> 현재 강점
              </h4>
              {strengths.length > 0 ? (
                <ul className="space-y-2">
                  {strengths.map((s, i) => (
                    <li key={`${s.typeLabel}-${i}`} className="text-xs leading-relaxed">
                      <span className="font-semibold text-[#191F28]">{s.typeLabel}</span>
                      <span className="text-[#4E5968]"> — {s.evidence}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#8B95A1]">표시할 강점이 없습니다.</p>
              )}
            </div>
          </div>

          {/* 학습 처방 */}
          {prescription.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-[#8B95A1]">학습 처방</h4>
              <ol className="space-y-2">
                {prescription.map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E8F3FF] text-[11px] font-semibold text-[#3182F6]">
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-[#333D4B]">{line}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-[#E5E8EB] bg-[#F7F8FA] p-6 text-center">
          <p className="text-sm text-[#4E5968]">아직 생성된 추세 분석이 없습니다.</p>
          <p className="mt-1 text-xs text-[#8B95A1]">
            위 응시 이력을 근거로 AI가 성적 추세를 분석합니다. 분석 1회에 5크레딧이 차감됩니다.
          </p>
        </div>
      )}
    </section>
  );
}
