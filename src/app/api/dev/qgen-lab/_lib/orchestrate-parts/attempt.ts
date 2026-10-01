// qgen-lab 생성 시도 1회 = 프롬프트 조립 → (전송 재시도 포함) 스트림 → 파싱·게이트(+절단 표식).
// 복제: md-stream/route.ts:1375-1405(makeDisplayFilter·streamWithTransportRetry). 절단 표식(:1409-1422)은 parse-gate 사본.
// HTTP 콜 1번 = AttemptRecord 1건 — EMPTY_BODY 등으로 버려진 콜도 transportError 로 남긴다(원가·시간 추적).
// 시도 번호 n 은 콜 직전에 ctx.nextN() 으로 발급 — best-of-N 병렬 후보가 같은 카운터를 써서 n 이 겹치지 않는다
// (records 는 완료순으로 쌓이니 RunResult 조립 전에 n 순으로 정렬한다).
import crypto from "node:crypto";

import { GrammarKillerV2DisplayFilter } from "@/lib/md-qgen/grammar-killer-v2";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import type {
  AttemptRecord,
  GenModelConfig,
  LabDifficulty,
  LabEvent,
} from "@/lib/qgen-lab/types";
import { buildLabGrammarPrompt } from "../grammar-prompt";
import { assertLabBudget } from "../ledger";
import { labParseAndGate, withTruncationHint, type LabParsed } from "../parse-gate";
import { streamOnce, StreamOnceError, type StreamOnceResult } from "../stream-once";

export type TeacherPointWire = { text: string; unit: "word" | "phrase"; tag?: string; note?: string };

export interface AttemptContext {
  passageText: string;
  difficulty: LabDifficulty;
  seed: number;
  teacherPoints: TeacherPointWire[];
  planBlock: string | null;
  budgetMs: () => number;
  emit: (e: LabEvent) => void;
  phase: string;
  /** 공유 누적 — 실패 콜도 여기로 들어간다(예외 후에도 호출측이 기록 가능). */
  attempts: AttemptRecord[];
  /** 시도 번호 발급(HTTP 콜 1번 = 1개, 1부터). */
  nextN: () => number;
}

export interface AttemptOutcome {
  record: AttemptRecord;
  parsed: LabParsed;
  call: StreamOnceResult;
}

export function sha1Hex(s: string): string {
  return crypto.createHash("sha1").update(s, "utf8").digest("hex");
}

/** 실패 콜 기록 — StreamOnceError.partial(실패 시점까지 계측)이 있으면 그 값으로 채운다(구제 llm-call 도 공유). */
export function transportFailRecord(
  base: Pick<AttemptRecord, "n" | "kind" | "model" | "promptChars" | "promptSha1">,
  durationMs: number,
  err: unknown,
): AttemptRecord {
  const message = err instanceof Error ? err.message : String(err);
  const p = err instanceof StreamOnceError ? err.partial : null;
  return {
    ...base,
    provider: p?.provider ?? null,
    ttfbMs: p?.ttfbMs ?? null,
    firstReasoningMs: p?.firstReasoningMs ?? null,
    firstContentMs: p?.firstContentMs ?? null,
    durationMs: p?.durationMs ?? durationMs,
    finishReason: p?.finishReason ?? null,
    errorChunk: p?.errorChunk ?? null,
    inputTokens: p?.inputTokens ?? null,
    outputTokens: p?.outputTokens ?? null,
    reasoningTokens: p?.reasoningTokens ?? null,
    costUsd: p?.costUsd ?? null,
    text: p?.text ?? "",
    gateIssues: [],
    adopted: false,
    transportError: message,
    verify: null,
    servedModel: p?.model ?? null,
    generationId: p?.generationId ?? null,
  };
}

export async function runAttempt(
  ctx: AttemptContext,
  opts: {
    kind: AttemptRecord["kind"];
    gen: GenModelConfig;
    feedback: string | null;
    /** 넛지 시드 덮어쓰기 — 재생성은 프로덕션처럼 재추첨(orchestrate labRegenSeed). 없으면 ctx.seed. */
    seed?: number;
  },
): Promise<AttemptOutcome> {
  const { gen, kind } = opts;
  const lp = buildLabGrammarPrompt({
    passage: ctx.passageText,
    difficulty: ctx.difficulty,
    format: gen.format,
    seed: opts.seed ?? ctx.seed,
    teacherPoints: ctx.teacherPoints.length > 0 ? ctx.teacherPoints : undefined,
    planBlock: ctx.planBlock,
    feedback: opts.feedback,
  });
  const promptSha1 = sha1Hex(lp.prompt);

  // v2 표시 필터 — 콜(시도)마다 새 인스턴스(줄 상태기계 초기화). route.ts:1375-1380.
  const makeDisplayFilter = () =>
    lp.grammarKillerV2
      ? new GrammarKillerV2DisplayFilter((textOut) =>
          ctx.emit({ t: "c", d: sanitizeAiModelDisclosureText(textOut) }),
        )
      : null;

  const callOnce = async (): Promise<{ call: StreamOnceResult; n: number }> => {
    assertLabBudget(ctx.phase);
    const n = ctx.nextN();
    ctx.emit({ t: "attempt", n, kind, model: gen.model, promptChars: lp.prompt.length });
    const t0 = Date.now();
    try {
      const call = await streamOnce({
        prompt: lp.prompt,
        gen,
        systemMessage: lp.systemMessage,
        jsonSchema: lp.jsonSchema,
        bridgeSpecs: lp.bridgeSpecs,
        displayFilter: makeDisplayFilter(),
        timeoutMs: Math.min(240_000, ctx.budgetMs()),
        emit: ctx.emit,
        phase: ctx.phase,
      });
      return { call, n };
    } catch (err) {
      ctx.attempts.push(
        transportFailRecord(
          { n, kind, model: gen.model, promptChars: lp.prompt.length, promptSha1 },
          Date.now() - t0,
          err,
        ),
      );
      throw err;
    }
  };

  // route.ts:1381-1405 — EMPTY_BODY 이고 예산 ≥60s 면 retry 이벤트 후 1회 재전송, 아니면 그대로 throw.
  let sent: { call: StreamOnceResult; n: number };
  try {
    sent = await callOnce();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.startsWith("EMPTY_BODY") || ctx.budgetMs() < 60_000) throw err;
    console.warn("[qgen-lab] EMPTY_BODY — 전송 재시도 1회");
    ctx.emit({ t: "retry", reason: "빈 응답 — 다시 생성합니다" });
    sent = await callOnce();
  }
  const { call, n } = sent;

  const parsed = withTruncationHint(
    labParseAndGate({
      text: call.text,
      passage: ctx.passageText,
      format: gen.format,
      grammarKillerV2: lp.grammarKillerV2,
      difficulty: ctx.difficulty,
      teacherPoints: ctx.teacherPoints.length > 0 ? ctx.teacherPoints : undefined,
    }),
    call.finishReason,
  );

  const record: AttemptRecord = {
    n,
    kind,
    model: gen.model,
    provider: call.provider,
    promptChars: lp.prompt.length,
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
    gateIssues: [...parsed.gateIssues],
    adopted: false,
    verify: null,
    servedModel: call.model,
    generationId: call.generationId,
  };
  ctx.attempts.push(record);
  return { record, parsed: { ...parsed, gateIssues: [...parsed.gateIssues] }, call };
}
