"use client";

import { useCallback, useRef, useState } from "react";

import {
  autoSnapGrammarMarks,
  gateMdQuestion,
  parseMdBlank,
  parseMdGrammar,
  type MdQuestion,
} from "@/lib/md-lab/parser";

export type QType = "blank" | "grammar";
export type ExplanationMode = "full" | "answer-only";

export interface RunStats {
  thinkSec: number;
  genSec: number;
  totalSec: number;
  reasoningTokens: number | null;
  outputTokens: number | null;
  costKrw: number | null;
}

export interface RunRecord {
  id: string;
  ts: string;
  modelId: string;
  effort: string;
  qtype: QType;
  /** 구버전 기록엔 없을 수 있음 — 기본 full 로 해석. */
  explanationMode?: ExplanationMode;
  passage: string;
  raw: string;
  question: MdQuestion;
  gateIssues: string[];
  /** 0원 자동 보정 내역 (예: 'to justify' → 'to perhaps justify') */
  corrections?: string[];
  stats: RunStats | null;
}

export interface LiveRun {
  id: string;
  modelId: string;
  effort: string;
  qtype: QType;
  passage: string;
  t0: number;
  tFirstContent: number | null;
  raw: string;
  reasoningText: string;
  phase: "thinking" | "generating";
  error: string | null;
}

export const MAX_CONCURRENT_RUNS = 4;

/** md-lab 병렬 생성 훅 — 실행마다 독립 SSE 스트림, 완료 시 onComplete 로 기록 전달. */
export function useMdLabGeneration(onComplete: (record: RunRecord) => void) {
  const [liveRuns, setLiveRuns] = useState<LiveRun[]>([]);
  const abortMapRef = useRef<Map<string, AbortController>>(new Map());

  const patchRun = useCallback((id: string, patch: Partial<LiveRun>) => {
    setLiveRuns((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }, []);

  const removeRun = useCallback((id: string) => {
    abortMapRef.current.get(id)?.abort();
    abortMapRef.current.delete(id);
    setLiveRuns((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const startRun = useCallback(
    (config: {
      passage: string;
      qtype: QType;
      modelId: string;
      effort: string;
      explanationMode: ExplanationMode;
    }):
      | { ok: true }
      | { ok: false; error: string } => {
      if (config.passage.trim().length < 200) {
        return { ok: false, error: "지문을 200자 이상 입력해주세요." };
      }
      if (abortMapRef.current.size >= MAX_CONCURRENT_RUNS) {
        return {
          ok: false,
          error: `동시 실행은 최대 ${MAX_CONCURRENT_RUNS}개입니다. 진행 중 실행이 끝나면 다시 시도하세요.`,
        };
      }
      const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const passage = config.passage.trim();
      const ac = new AbortController();
      abortMapRef.current.set(id, ac);
      const run: LiveRun = {
        id,
        modelId: config.modelId,
        effort: config.effort,
        qtype: config.qtype,
        passage,
        t0: Date.now(),
        tFirstContent: null,
        raw: "",
        reasoningText: "",
        phase: "thinking",
        error: null,
      };
      setLiveRuns((prev) => [run, ...prev]);

      void (async () => {
        let text = "";
        let reasoning = "";
        let tFirstContent: number | null = null;
        let usage: {
          cost?: number;
          completion_tokens?: number;
          completion_tokens_details?: { reasoning_tokens?: number };
        } | null = null;
        try {
          const res = await fetch("/api/md-lab/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              passage,
              qtype: config.qtype,
              modelId: config.modelId,
              effort: config.effort,
              explanationMode: config.explanationMode,
            }),
            signal: ac.signal,
          });
          if (!res.ok || !res.body) {
            const data = await res.json().catch(() => ({}));
            throw new Error(
              [data.error, data.detail].filter(Boolean).join(" — ") ||
                `요청 실패 (${res.status})`,
            );
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const j = JSON.parse(payload);
                const delta = j.choices?.[0]?.delta ?? {};
                const reasoningDelta: string =
                  delta.reasoning ?? delta.reasoning_content ?? "";
                if (reasoningDelta) {
                  reasoning += reasoningDelta;
                  patchRun(id, { reasoningText: reasoning });
                }
                const contentDelta: string = delta.content ?? "";
                if (contentDelta) {
                  if (tFirstContent == null) {
                    tFirstContent = Date.now();
                    patchRun(id, { tFirstContent, phase: "generating" });
                  }
                  text += contentDelta;
                  patchRun(id, { raw: text });
                }
                if (j.usage) usage = j.usage;
              } catch {
                /* partial line noise */
              }
            }
          }
          if (!text.trim()) {
            throw new Error(
              "모델이 본문 출력을 내지 않았습니다 (사고 설정을 확인해보세요).",
            );
          }
          const end = Date.now();
          const firstContent = tFirstContent ?? end;
          let question: MdQuestion =
            config.qtype === "blank" ? parseMdBlank(text) : parseMdGrammar(text);
          let corrections: string[] = [];
          if (question.kind === "grammar") {
            const snapped = autoSnapGrammarMarks(question, passage);
            question = snapped.question;
            corrections = snapped.corrections;
          }
          const record: RunRecord = {
            id,
            ts: new Date().toISOString(),
            modelId: config.modelId,
            effort: config.effort,
            qtype: config.qtype,
            explanationMode: config.explanationMode,
            passage,
            raw: text,
            question,
            gateIssues: gateMdQuestion(question, passage, {
              requireWrong: config.explanationMode !== "answer-only",
            }),
            corrections,
            stats: {
              thinkSec: (firstContent - run.t0) / 1000,
              genSec: (end - firstContent) / 1000,
              totalSec: (end - run.t0) / 1000,
              reasoningTokens:
                usage?.completion_tokens_details?.reasoning_tokens ?? null,
              outputTokens: usage?.completion_tokens ?? null,
              costKrw:
                typeof usage?.cost === "number" && usage.cost > 0
                  ? Math.round(usage.cost * 1400)
                  : null,
            },
          };
          abortMapRef.current.delete(id);
          setLiveRuns((prev) => prev.filter((r) => r.id !== id));
          // 서버 로그(분석용) — 실패해도 UX 무영향.
          void fetch("/api/md-lab/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(record),
          }).catch(() => {});
          onComplete(record);
        } catch (e) {
          if (ac.signal.aborted) return;
          abortMapRef.current.delete(id);
          patchRun(id, {
            error: e instanceof Error ? e.message : "생성 실패",
          });
        }
      })();

      return { ok: true };
    },
    [onComplete, patchRun],
  );

  return { liveRuns, startRun, removeRun };
}
