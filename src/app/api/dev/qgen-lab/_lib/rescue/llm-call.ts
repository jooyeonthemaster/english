// 구제 전략 LLM 콜(RESCUE-SPEC §4.1 lunaCall) — streamOnce 1콜 = AttemptRecord 1건(실패 콜도 transportError 로 남긴다).
// orchestrate-parts/attempt.ts runAttempt 와 같은 규칙: 콜 직전 번호 발급(host.nextN) · EMPTY_BODY + 예산 ≥60s → 1회 재전송 ·
// v2 표시 필터는 콜마다 새 인스턴스. 추가분: messages(여러 턴) 덮어쓰기 · stage 라벨 · 원장 note 머리표 "run=<runId> <stage>".
// kind "stage"(비평·수정·작가 등 소형 콜)는 attempt·r·c 이벤트를 흘리지 않고 끝날 때 stage 이벤트 하나만 낸다.
// 파싱·게이트는 여기서 하지 않는다 — 초안은 draft.ts draftItem, 코드 조립본은 assembleRecord.
import { GrammarKillerV2DisplayFilter } from "@/lib/md-qgen/grammar-killer-v2";
import type { LunaBridgeFieldSpec } from "@/lib/md-qgen/luna-stream-bridge";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import type { AttemptRecord, GenModelConfig, LabEvent } from "@/lib/qgen-lab/types";
import type { LabJsonSchema } from "../grammar-prompt";
import { assertLabBudget } from "../ledger";
import { sha1Hex, transportFailRecord } from "../orchestrate-parts/attempt";
import { streamOnce, type LabChatMessage, type StreamOnceResult } from "../stream-once";

/** 콜에 필요한 실행 문맥(StrategyContext 가 이것을 만족한다). */
export interface LlmHost {
  passageText: string;
  runId: string;
  /** 기본 생성 설정(팔 gen + params.effort 덮어쓰기). */
  gen: GenModelConfig;
  /** 270s 벽까지 남은 ms(route.ts:1214-1215). */
  budgetMs: () => number;
  emit: (e: LabEvent) => void;
  /** qgen-lab:<batch>:<arm> */
  phaseBase: string;
  /** 실행 공유 누적 — 실패 콜·가상 레코드도 여기로. */
  attempts: AttemptRecord[];
  nextN: () => number;
}

export type LlmCallKind = "gen" | "regen" | "stage";

export interface LlmCallOpts {
  /** 단계 라벨("draft#1", "regen", "crit", "writer" …) — AttemptRecord.stage·원장 note. */
  stage: string;
  kind: LlmCallKind;
  /** 단일 user 턴. messages 가 없으면 필수. */
  prompt?: string;
  /** prompt 경로에서만(luna-json 레인 system). */
  systemMessage?: string | null;
  /** 여러 턴 — 있으면 본문 messages 로 그대로 간다(prompt·systemMessage 는 본문에서 빠진다). */
  messages?: LabChatMessage[] | null;
  /** host.gen 위에 덮어쓸 필드(maxTokens·effort 등). */
  gen?: Partial<GenModelConfig>;
  jsonSchema?: LabJsonSchema | null;
  bridgeSpecs?: LunaBridgeFieldSpec[] | null;
  /** 본문 표시(gen/regen 만): "v2" = 킬러 v2 표시 필터(설계메모 숨김), "raw" = 그대로, "none" = 방류 안 함. 기본 "v2". */
  display?: "v2" | "raw" | "none";
  /** 기본 240s(attempt.ts 와 같음). 실제 상한은 min(이 값, 벽까지 남은 시간). */
  timeoutMs?: number;
  /** 원장 note 꼬리(선택). */
  note?: string;
}

export interface LlmCallOutcome {
  record: AttemptRecord;
  call: StreamOnceResult;
}

/** promptChars·promptSha1 — prompt 경로는 attempt.ts 와 같은 값(prompt 원문), messages 경로는 내용 합·JSON sha1. */
export function describeLlmRequest(o: Pick<LlmCallOpts, "prompt" | "messages">): { promptChars: number; promptSha1: string } {
  if (o.messages && o.messages.length > 0) {
    return {
      promptChars: o.messages.reduce((s, m) => s + m.content.length, 0),
      promptSha1: sha1Hex(JSON.stringify(o.messages)),
    };
  }
  const prompt = o.prompt ?? "";
  return { promptChars: prompt.length, promptSha1: sha1Hex(prompt) };
}

export function llmPhase(host: Pick<LlmHost, "phaseBase">, kind: LlmCallKind): string {
  return `${host.phaseBase}:${kind === "stage" ? "stage" : "gen"}`;
}

export function ledgerTag(host: Pick<LlmHost, "runId">, stage: string, note?: string): string {
  return `run=${host.runId} ${stage}${note ? ` ${note}` : ""}`;
}

/** luna(또는 팔 모델) 1콜 — 전송 재시도 포함. 성공 레코드는 gateIssues [] 로 host.attempts 에 들어간다(호출측이 채운다). */
export async function lunaCall(host: LlmHost, o: LlmCallOpts): Promise<LlmCallOutcome> {
  const hasMessages = !!o.messages && o.messages.length > 0;
  if (!hasMessages && typeof o.prompt !== "string") throw new Error(`[rescue] ${o.stage}: prompt·messages 둘 다 없음`);
  const gen: GenModelConfig = { ...host.gen, ...(o.gen ?? {}) };
  const { kind, stage } = o;
  const quiet = kind === "stage" || o.display === "none";
  const { promptChars, promptSha1 } = describeLlmRequest(o);
  const phase = llmPhase(host, kind);
  const ledgerNote = ledgerTag(host, stage, o.note);
  // 소형 콜·무표시 = r/c 차단(그 밖 이벤트는 통과). 표시 방류 실패는 생성을 멈추지 않는다(streamOnce 가 삼킨다).
  const emit = quiet
    ? (e: LabEvent) => {
        if (e.t !== "r" && e.t !== "c") host.emit(e);
      }
    : host.emit;
  const makeDisplayFilter = () =>
    !quiet && (o.display ?? "v2") === "v2"
      ? new GrammarKillerV2DisplayFilter((textOut) => host.emit({ t: "c", d: sanitizeAiModelDisclosureText(textOut) }))
      : null;

  const t0 = Date.now();
  const callOnce = async (): Promise<{ call: StreamOnceResult; n: number }> => {
    assertLabBudget(phase);
    const n = host.nextN();
    if (kind !== "stage") host.emit({ t: "attempt", n, kind, model: gen.model, promptChars });
    const tc = Date.now();
    try {
      const call = await streamOnce({
        prompt: o.prompt ?? "",
        messages: hasMessages ? o.messages : null,
        gen,
        systemMessage: o.systemMessage ?? null,
        jsonSchema: o.jsonSchema ?? null,
        bridgeSpecs: o.bridgeSpecs ?? null,
        displayFilter: makeDisplayFilter(),
        timeoutMs: Math.min(o.timeoutMs ?? 240_000, host.budgetMs()),
        emit,
        phase,
        ledgerNote,
      });
      return { call, n };
    } catch (err) {
      const rec = transportFailRecord({ n, kind, model: gen.model, promptChars, promptSha1 }, Date.now() - tc, err);
      host.attempts.push({ ...rec, stage });
      throw err;
    }
  };

  const stageFailed = (err: unknown): void => {
    if (kind !== "stage") return;
    const message = err instanceof Error ? err.message : String(err);
    host.emit({ t: "stage", name: stage, ms: Date.now() - t0, note: `실패: ${message.slice(0, 80)}` });
  };
  let sent: { call: StreamOnceResult; n: number };
  try {
    sent = await callOnce();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.startsWith("EMPTY_BODY") || host.budgetMs() < 60_000) {
      stageFailed(err);
      throw err;
    }
    console.warn(`[qgen-lab] ${stage}: EMPTY_BODY — 전송 재시도 1회`);
    if (kind !== "stage") host.emit({ t: "retry", reason: "빈 응답 — 다시 생성합니다" });
    try {
      sent = await callOnce();
    } catch (err2) {
      stageFailed(err2);
      throw err2;
    }
  }
  const { call, n } = sent;
  const record: AttemptRecord = {
    n,
    kind,
    stage,
    model: gen.model,
    provider: call.provider,
    promptChars,
    promptSha1,
    ttfbMs: call.ttfbMs,
    firstReasoningMs: call.firstReasoningMs,
    firstContentMs: call.firstContentMs,
    durationMs: call.durationMs,
    finishReason: call.finishReason,
    errorChunk: call.errorChunk,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    reasoningTokens: call.reasoningTokens,
    costUsd: call.costUsd,
    text: call.text,
    gateIssues: [],
    adopted: false,
    verify: null,
    servedModel: call.model,
    generationId: call.generationId,
  };
  host.attempts.push(record);
  if (kind === "stage") host.emit({ t: "stage", name: stage, ms: Date.now() - t0 });
  return { record, call };
}

/** 코드 조립·수정 적용 결과의 가상 레코드(kind "assemble", model "assembler", costUsd 0) — 콜 없음.
 *  text 는 조립된 v2 원문(파싱·게이트는 호출측), gateIssues 는 그 게이트 결과. */
export function assembleRecord(
  host: Pick<LlmHost, "attempts" | "nextN">,
  a: { stage: string; text: string; gateIssues: string[] },
): AttemptRecord {
  const record: AttemptRecord = {
    n: host.nextN(),
    kind: "assemble",
    stage: a.stage,
    model: "assembler",
    provider: null,
    promptChars: 0,
    promptSha1: sha1Hex(""),
    ttfbMs: null,
    firstReasoningMs: null,
    firstContentMs: null,
    durationMs: 0,
    finishReason: null,
    errorChunk: null,
    inputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    costUsd: 0,
    text: a.text,
    gateIssues: [...a.gateIssues],
    adopted: false,
    verify: null,
    servedModel: null,
    generationId: null,
  };
  host.attempts.push(record);
  return record;
}
