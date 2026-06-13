"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, FlaskConical, Layers, Loader2, Play } from "lucide-react";

import { CustomLayoutRenderer } from "@/components/workbench/custom-layout-renderer";
import {
  composeQuestionTextFromLayoutDoc,
  flattenLayoutChoices,
  projectLayoutDocWithSpec,
} from "@/lib/custom-question-types/layout-doc";
import type { CompiledCustomType } from "@/lib/custom-question-types/types";
import { cn } from "@/lib/utils";

// 라이브 미리보기 — [형식 미리보기]: workingSpec.format 을 원본 sourceLayout 에 결정적으로 투영
// (LLM 없음, 스펙 변경 즉시 반영). [AI 샘플]: sample-generation 으로 실제 1문항 동기 생성(저장 안 함).

type PreviewMode = "format" | "sample";

interface SampleResult {
  question: Record<string, unknown>;
  subType: string;
  tier: string;
  llmAttempts: number;
  elapsedMs: number;
}

export function LivePreview({ typeId, spec }: { typeId: string; spec: CompiledCustomType }) {
  const [mode, setMode] = useState<PreviewMode>("format");
  const [passage, setPassage] = useState("");
  const [passageOpen, setPassageOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sample, setSample] = useState<SampleResult | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);

  // 형식 미리보기 — 스펙 변경에 즉시 반응(useMemo, LLM 호출 없음).
  const previewQ = useMemo(() => {
    if (!spec.format) return null;
    const projected = projectLayoutDocWithSpec(spec.sourceLayout, spec.format);
    return {
      _typeId: "CUSTOM_LAYOUT",
      layout: projected,
      questionText: composeQuestionTextFromLayoutDoc(projected),
      options: projected.choices ? flattenLayoutChoices(projected.choices) : [],
      correctAnswer: "",
    };
  }, [spec]);

  // 생성 중 경과 시간 표시.
  useEffect(() => {
    if (!generating) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - started), 250);
    return () => clearInterval(timer);
  }, [generating]);

  const generate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setSampleError(null);
    setElapsedMs(0);
    try {
      const res = await fetch("/api/custom-question-types/sample-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          typeId,
          spec,
          ...(passage.trim() ? { passage: passage.trim() } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<SampleResult> & { error?: string };
      if (!res.ok) throw new Error(json?.error || "샘플 생성에 실패했습니다.");
      setSample(json as SampleResult);
    } catch (err) {
      setSampleError(err instanceof Error ? err.message : "샘플 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  }, [generating, typeId, spec, passage]);

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-3 p-4">
      {/* 모드 토글 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {(
            [
              { value: "format" as const, label: "형식 미리보기", icon: Layers },
              { value: "sample" as const, label: "AI 샘플", icon: FlaskConical },
            ]
          ).map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-bold transition-colors",
                mode === m.value ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              <m.icon className="size-3.5" />
              {m.label}
            </button>
          ))}
        </div>
        {mode === "format" ? (
          <p className="text-[10.5px] text-slate-400">스펙 변경이 즉시 반영됩니다 (AI 호출 없음)</p>
        ) : null}
      </div>

      {mode === "format" ? (
        /* ── 형식 미리보기: 투영된 LayoutDoc 을 시험지 풍 카드로 ── */
        <div className="mx-auto max-w-[720px] rounded-md bg-white p-8 shadow-sm ring-1 ring-slate-200">
          {previewQ ? (
            <CustomLayoutRenderer q={previewQ} />
          ) : (
            <p className="py-10 text-center text-[12px] text-slate-400">형식 스펙이 없습니다.</p>
          )}
        </div>
      ) : (
        /* ── AI 샘플: 작업 중 스펙으로 실제 1문항 생성 ── */
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setPassageOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
            >
              <span className="text-[11.5px] font-bold text-slate-700">
                지문 입력 <span className="font-medium text-slate-400">(비우면 원본 분석 지문으로 생성)</span>
              </span>
              <ChevronDown className={cn("size-3.5 text-slate-400 transition-transform", passageOpen && "rotate-180")} />
            </button>
            {passageOpen ? (
              <div className="px-3 pb-3">
                <textarea
                  value={passage}
                  onChange={(e) => setPassage(e.target.value)}
                  rows={6}
                  placeholder="샘플 생성에 쓸 새 지문을 붙여넣으세요."
                  className="w-full resize-y rounded-md border border-slate-300 px-2.5 py-2 text-[12px] leading-relaxed placeholder:text-slate-300"
                />
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {generating ? `생성 중… ${(elapsedMs / 1000).toFixed(1)}s` : "샘플 생성"}
          </button>

          {generating ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-4 text-center">
              <p className="text-[12px] font-semibold text-blue-700">
                작업 중 스펙으로 실제 문항을 생성하고 있습니다…
              </p>
              <p className="mt-0.5 text-[11px] text-blue-500">{(elapsedMs / 1000).toFixed(1)}초 경과 (보통 10~40초)</p>
            </div>
          ) : null}

          {sampleError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] leading-relaxed text-red-600">
              {sampleError}
            </div>
          ) : null}

          {sample && !generating ? (
            <>
              <p className="text-[10.5px] text-slate-400">
                LLM 시도 {sample.llmAttempts}회 · {(sample.elapsedMs / 1000).toFixed(1)}초 ·{" "}
                {sample.subType === "CUSTOM_LAYOUT" ? "구조화(v2)" : "평문(v1)"} · 저장되지 않는 실험 샘플
              </p>
              <div className="mx-auto max-w-[720px] rounded-md bg-white p-8 shadow-sm ring-1 ring-slate-200">
                <CustomLayoutRenderer q={sample.question} />
              </div>
            </>
          ) : null}

          {!sample && !generating && !sampleError ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-8 text-center text-[12px] text-slate-400">
              [샘플 생성] 을 누르면 지금 만지고 있는 스펙으로 실제 AI 문항 1개를 생성해 보여줍니다.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
