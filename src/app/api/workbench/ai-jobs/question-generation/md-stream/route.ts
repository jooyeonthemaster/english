import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { isKoreanSubject } from "@/lib/korean/core/passage-meta";
import {
  ATLAS_PREMIUM_QGEN_MODEL_ID,
  ATLAS_STANDARD_QGEN_MODEL_ID,
} from "@/lib/atlas-ai";
import {
  clampTeacherPoints,
  type TeacherPointPayload,
} from "@/app/(director)/director/workbench/generate/generation-config-panel-parts/point-picker-config";
import { buildTeacherPointsPromptBlock } from "@/lib/question-generation-prompt-contract";
import {
  buildBlankPointGuidance,
  buildMultiBlankPointGuidance,
} from "@/lib/blank-point-catalog";
import { buildGrammarPointGuidance } from "@/lib/grammar-point-catalog";
import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";
import { InsufficientCreditsError, refundCredits } from "@/lib/credits";
import {
  providerFromModel,
  recordPlatformApiUsageCost,
} from "@/lib/platform-api-costs";
import {
  getQuestionGenerationCreditCost,
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  resolveEffectiveGenerationPlan,
  sanitizeAiModelDisclosureText,
} from "@/lib/question-generation-plans";
import { toUserFacingQuestionGenerationError } from "@/lib/question-generation-llm";
import { saveGeneratedQuestionsForJob } from "@/lib/question-generation-persistence";
import { prisma } from "@/lib/prisma";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";
import { preflightQuestionFeasibility, validateQuestionQuality } from "@/lib/question-quality";
import { postProcessQuestion } from "@/lib/question-postprocess";
import { shuffleQuestionOptionsForDiversity } from "@/lib/question-diversity";
import {
  readQuestionTypeDifficultySetting,
  resolveQuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import {
  buildBlankMdSharedSelfcheck,
  buildGrammarMdSharedSelfcheck,
  buildMdBlankPrompt,
  buildMdGrammarPrompt,
  buildMdMultiBlankPrompt,
  type MdDifficulty,
} from "@/lib/md-qgen/prompts";
import {
  autoSnapBlankExpression,
  autoSnapGrammarMarks,
  autoSnapMultiBlankExpressions,
  gateMdMultiBlank,
  gateMdQuestion,
  normalizeWs,
  parseMdBlank,
  parseMdGrammar,
  parseMdMultiBlank,
  type MdAnyQuestion,
} from "@/lib/md-qgen/parser";
import {
  adaptMdBlankToAiQuestion,
  adaptMdGrammarToAiQuestion,
  adaptMdMultiBlankToAiQuestion,
} from "@/lib/md-qgen/adapter";
import { getMdLane, MD_LANE_SUBTYPES } from "@/lib/md-qgen/lane-registry";
import {
  GrammarKillerV2DisplayFilter,
  buildGrammarKillerV2Prompt,
  isGrammarKillerV2Enabled,
  processGrammarKillerV2Quotes,
  stripGrammarKillerV2Plan,
} from "@/lib/md-qgen/grammar-killer-v2";
import { gateGrammarKillerDeadDecoys } from "@/lib/md-qgen/gate-grammar-killer-decoys";
import { gateBlankKillerOptions } from "@/lib/md-qgen/gate-blank-killer-options";
import { gateGrammarKillerOverdrilledAnswer } from "@/lib/md-qgen/gate-grammar-killer-overdrilled";
import { gateGrammarKillerDecoyDepth } from "@/lib/md-qgen/gate-grammar-killer-decoy-depth";
import { gateGrammarKillerAnswerSite } from "@/lib/md-qgen/gate-grammar-killer-answer-site";
import { getLunaExt, getLunaExtForSelfcheck } from "@/lib/md-qgen/luna-ext-registry";
import type { MdLaneContext, MdLaneParsed } from "@/lib/md-qgen/lane-types";
import {
  adaptLunaBlankJson,
  adaptLunaGrammarJson,
  adaptLunaGrammarJsonNK,
  adaptLunaMultiBlankJson,
  buildLunaGrammarJsonSchemaNK,
  buildLunaGrammarSelfcheckNK,
  buildLunaMultiBlankJsonSchema,
  buildLunaMultiBlankSelfcheck,
  isLunaQgenEligible,
  renumberGrammarByAppearance,
  LUNA_BLANK_JSON_SCHEMA,
  LUNA_BLANK_SELFCHECK,
  LUNA_GRAMMAR_JSON_SCHEMA,
  LUNA_GRAMMAR_SELFCHECK,
  LUNA_QGEN_MAX_TOKENS,
  LUNA_QGEN_MODEL_ID,
  LUNA_QGEN_SYSTEM_MESSAGE,
} from "@/lib/md-qgen/luna-lane";
import {
  LUNA_BLANK_BRIDGE_SPECS,
  LUNA_GRAMMAR_BRIDGE_SPECS,
  LUNA_GRAMMAR_NK_BRIDGE_SPECS,
  LUNA_MULTIBLANK_BRIDGE_SPECS,
  LunaJsonMdBridge,
  type LunaBridgeFieldSpec,
} from "@/lib/md-qgen/luna-stream-bridge";
import { TYPE_LABELS } from "@/app/api/ai/generate-questions-auto/_lib/constants";

// ============================================================================
// md-stream — 빈칸·어법 전용 "마크다운 원큐 + SSE 스트리밍" 생성 라우트.
// (26-07-21 심플 스택 1·2단계) 기존 fast 라우트는 바이트 무변경으로 두고, 적격
// 요청(빈칸 1~3개 / 어법 5~10마커·1~N정답 — 26-07-23 스펙 v1로 다중 빈칸·어법
// 비표준 확장)만 클라이언트가 이 라우트로 보낸다. 교사 지정 포인트(포인트
// 짚어주기)도 이 레인이 처리한다(26-07-23 — 프롬프트 강제 공유 블록 + 결정론
// 준수 게이트). 부적격·오류 시 클라이언트는 fast 로 폴백한다
// (서버는 400 MD_STREAM_INELIGIBLE).
//
// 과금·저장·원장·환불은 fast 라우트와 동일 규약:
//   잔액 게이트 → 잡 PROCESSING → ensureWorkbenchAiJobCharged → 생성(스트림)
//   → saveGeneratedQuestionsForJob → 잡 COMPLETED / 실패 시 refundCredits+FAILED.
// 검수리·E-gate 는 이 레인에 없다(사용자 결정: 원큐 + 0원 게이트만). 품질 검증기
// 결과는 차단 없이 result.qualityIssues 로 기록만 한다.
//
// 클라이언트 이탈: 스트림 emit 실패는 무시하고 생성·저장을 계속 시도한다. 단
// 서버리스 런타임이 연결 종료 후 실행을 회수할 수 있으므로 완주는 보장이 아니라
// 최선 시도다 — 회수돼 PROCESSING 고아가 되면 stale-cleanup(10분, fastPath 규칙)이
// FAILED+환불로 정리하고, 완주했다면 세션 큐 DB 복원이 카드를 되살린다.
//
// 예산 원장(question-generation-assignment-budget)은 의도적으로 미경유 — 그 원장은
// 엔진 경유 콜의 예산 상한 계측용이고, md 레인은 콜이 최대 2회로 고정이라 폭주
// 여지가 없다(실지출은 platformApiUsageCost 로 전액 기록).
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 정본 2유형 + 레인 디스크립터로 승차한 신형 유형(26-07-26). 신규 승차는
// lane-registry 에 등록하는 것만으로 이 집합에 자동 합류한다.
const MD_STREAM_SUBTYPES = new Set([
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  ...MD_LANE_SUBTYPES,
]);

const requestSchema = z.object({
  passageId: z.string().min(1),
  mode: z.literal("MANUAL").default("MANUAL"),
  count: z.number().int().min(1).max(1).default(1),
  questionType: z.string(),
  questionTypeSettings: z.unknown().optional(),
  difficulty: z.string().default("INTERMEDIATE"),
  customPrompt: z.string().max(4000).optional(),
  generationPlan: z.unknown().optional(),
  // 같은 배치에서 병렬 생성되는 N개 중 몇 번째인지 — 표적 분산 힌트로 프롬프트에 주입.
  variantIndex: z.number().int().min(0).max(99).optional(),
  variantCount: z.number().int().min(1).max(99).optional(),
  clientTempId: z.string().min(1).max(200).optional(),
});

interface StreamCallResult {
  text: string;
  reasoningChars: number;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /** 업스트림 finish_reason(26-08-18 O223 A축) — "length"면 출력 예산 절단.
   * 종전에는 미캡처라 절단이 "JSON 파싱 실패"로 위장돼 원인 진단이 불가했다. */
  finishReason: string | null;
  /** 스트림 중 도착한 error 청크(있으면 앞 300자) — 502 빈응답 계통 포렌식. */
  errorChunk: string | null;
}

function sseEncode(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

async function recordCostSafely(input: {
  sourceKey: string;
  sourceId: string;
  sourceDetail: string;
  academyId: string;
  model: string;
  operationType: OperationType;
  inputTokens: number;
  outputTokens: number;
  recordedCostUsd: number | null;
  metadata: Record<string, unknown>;
}) {
  try {
    await recordPlatformApiUsageCost({
      sourceKey: input.sourceKey,
      sourceType: "WORKBENCH_AI_JOB",
      sourceId: input.sourceId,
      sourceDetail: input.sourceDetail,
      academyId: input.academyId,
      provider: providerFromModel(input.model),
      model: input.model,
      operationType: input.operationType,
      unitType: "TOKENS",
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      recordedCostUsd: input.recordedCostUsd,
      usageAt: new Date(),
      metadata: input.metadata as Prisma.InputJsonValue,
    });
  } catch (error) {
    console.warn("[md-stream] Failed to record API cost", error);
  }
}

/** OpenRouter 직접 스트림 1콜 — 사고/본문 델타를 emit 으로 흘리고 최종 usage 를 회수.
 * luna 옵션(O217 시공): json_schema strict + system 형식계약 + OpenAI 공급자 고정 +
 * JSON→md 점진 렌더 브릿지(본문 델타를 md 동형 텍스트로 변환해 방류 — 클라 계약
 * 무변경). 파싱·게이트는 원본 JSON 누적본(text)으로 별도 수행한다. */
async function streamOnce(args: {
  prompt: string;
  modelId: string;
  timeoutMs: number;
  emit: (payload: Record<string, unknown>) => void;
  luna?: {
    jsonSchema: { name: string; strict: boolean; schema: unknown };
    bridgeSpecs: LunaBridgeFieldSpec[];
    /** 유형별 출력 예산(미지정이면 LUNA_QGEN_MAX_TOKENS). */
    maxTokens?: number;
  };
  /** 어법 KILLER v2(26-08-17): 표시 델타를 필터(설계메모 은닉·인용 절단) 경유로
   * 방류한다 — 파싱용 내부 누적 text 는 원문 그대로 유지. 콜마다 새 인스턴스. */
  displayFilter?: GrammarKillerV2DisplayFilter;
}): Promise<StreamCallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");
  const startedAt = Date.now();
  const body: Record<string, unknown> = {
    model: args.modelId,
    messages: args.luna
      ? [
          { role: "system", content: LUNA_QGEN_SYSTEM_MESSAGE },
          { role: "user", content: args.prompt },
        ]
      : [{ role: "user", content: args.prompt }],
    // 사고+출력이 상한을 공유한다 — 6k 절단 실측(O208 계열) 후 14k.
    // luna 도 14k 기본: 20k 는 사고가 10k+ 로 팽창해 시간 2배(O217 프로브).
    // 단 지문 전체를 재작성하는 유형은 14k 로 절단되므로 ext 가 상한을 올린다.
    max_tokens: args.luna
      ? args.luna.maxTokens ?? LUNA_QGEN_MAX_TOKENS
      : 14_000,
    stream: true,
    usage: { include: true },
    reasoning: { enabled: true, effort: "high", exclude: false },
  };
  if (args.luna) {
    body.response_format = { type: "json_schema", json_schema: args.luna.jsonSchema };
    // Azure 폴백 ~10배 이중가격 차단(O214) — OpenAI 직접 서빙만.
    body.provider = { order: ["openai"], allow_fallbacks: false };
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(10_000, args.timeoutMs)),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`generation upstream ${res.status}: ${detail.slice(0, 200)}`);
  }
  // 표시 전용 브릿지 — 예외는 표시만 포기(생성·파싱은 계속).
  let bridge: LunaJsonMdBridge | null = args.luna
    ? new LunaJsonMdBridge(args.luna.bridgeSpecs, (delta) =>
        args.emit({ t: "c", d: sanitizeAiModelDisclosureText(delta) }),
      )
    : null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let reasoningChars = 0;
  let provider: string | null = null;
  let finishReason: string | null = null;
  let errorChunk: string | null = null;
  let usage: {
    cost?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  } | null = null;
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
        if (typeof j.provider === "string" && !provider) provider = j.provider;
        if (j.error && !errorChunk)
          errorChunk = JSON.stringify(j.error).slice(0, 300);
        const choice = j.choices?.[0];
        if (choice?.finish_reason) finishReason = String(choice.finish_reason);
        const delta = choice?.delta ?? {};
        const reasoningDelta: string =
          delta.reasoning ?? delta.reasoning_content ?? "";
        if (reasoningDelta) {
          reasoningChars += reasoningDelta.length;
          // 모델명 은닉 정책 — 사고/본문 스트림에 프로바이더·모델명이 노출될 수
          // 있어 표시용 델타만 마스킹한다(파싱에 쓰는 내부 누적 text 는 원문 유지).
          args.emit({ t: "r", d: sanitizeAiModelDisclosureText(reasoningDelta) });
        }
        const contentDelta: string = delta.content ?? "";
        if (contentDelta) {
          text += contentDelta;
          if (bridge) {
            try {
              bridge.push(contentDelta);
            } catch (bridgeErr) {
              console.warn("[md-stream] luna bridge failed — 표시 중단", bridgeErr);
              bridge = null;
            }
          } else if (args.displayFilter) {
            // v2 표시 필터 — 예외는 표시만 포기(생성·파싱은 계속, 브릿지와 동일 정책).
            try {
              args.displayFilter.push(contentDelta);
            } catch (filterErr) {
              console.warn("[md-stream] killer-v2 display filter failed", filterErr);
              args.displayFilter = undefined;
            }
          } else if (!args.luna) {
            args.emit({ t: "c", d: sanitizeAiModelDisclosureText(contentDelta) });
          }
        }
        if (j.usage) usage = j.usage;
      } catch {
        /* partial SSE line */
      }
    }
  }
  try {
    args.displayFilter?.flush();
  } catch {
    /* 표시 전용 — 무시 */
  }
  if (!text.trim()) {
    // 계통 표식(EMPTY_BODY) — 호출부가 전송 계층 재시도로 흡수한다. 26-08-14
    // 캠페인 실측: 이 계통은 luna 462행 중 16행(3.5%)이고 gemini 는 0행이라
    // 모델 고유 결함이며, 재시도 없이 두면 그대로 잡 실패·환불이 된다.
    // finish=length 는 사고가 예산 전량을 잠식한 절단(O223 스모크 실측:
    // reasoning 14000/14000·본문 0) — 원인 표식을 붙여 포렌식을 살린다.
    throw new Error(
      `EMPTY_BODY: 모델이 본문 출력을 내지 않았습니다.${
        finishReason ? ` (finish=${finishReason})` : ""
      }${errorChunk ? ` (error=${errorChunk.slice(0, 120)})` : ""}`,
    );
  }
  // 원가 가드(O214 공급자 이중가격) — allow_fallbacks:false 라 이론상 불발이지만
  // 계측은 남긴다.
  if (args.luna && provider && provider !== "OpenAI") {
    console.warn(`[md-stream] luna provider drift: ${provider}`);
  }
  return {
    text,
    reasoningChars,
    costUsd:
      typeof usage?.cost === "number" && usage.cost > 0 ? usage.cost : null,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    durationMs: Date.now() - startedAt,
    finishReason,
    errorChunk,
  };
}

/**
 * 교사 지정 포인트를 fast 레인과 동일 계약으로 방어적으로 읽는다 — 클라 캡 =
 * 서버 클램프 단일 규칙(clampTeacherPoints) + 지문 축자 포함된 것만(프롬프트
 * 강제·준수 게이트 모두 축자 계약 위에서 동작).
 */
function readMdTeacherPoints(
  questionType: string,
  typeSettings: unknown,
  passageContent: string,
): TeacherPointPayload[] {
  if (typeof typeSettings !== "object" || typeSettings === null) return [];
  const raw = (typeSettings as Record<string, unknown>).teacherPoints;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const candidates = raw.filter(
    (point): point is TeacherPointPayload =>
      typeof point === "object" &&
      point !== null &&
      typeof (point as { text?: unknown }).text === "string",
  );
  if (candidates.length === 0) return [];
  return clampTeacherPoints(questionType, typeSettings, candidates).filter(
    (point) =>
      point.text.trim().length > 0 && passageContent.includes(point.text),
  );
}

/**
 * 교사 지정 준수의 결정형 게이트(0원) — 프롬프트 강제만으로는 이행이 보장되지
 * 않으므로 기계 검사한다. 빈칸: 빈칸원문이 지정 구간과 포함 관계(정규화 양방향)
 * 여야 한다. 다중 빈칸(26-07-23 스펙 v1): 지정 구간마다 빈칸원문 중 하나와 포함
 * 관계(정규화 양방향)여야 한다. 어법: 지정 표현마다 밑줄 중 하나에 포함돼야
 * 한다(원형·표시형 모두 허용). 위반은 무결성 게이트와 동일 경로 — 어법·다중
 * 빈칸은 1회 재생성 피드백으로 전달되고, 단일 빈칸은 원큐 규약대로 실패·환불된다.
 */
function teacherPointComplianceIssues(
  q: MdAnyQuestion,
  points: TeacherPointPayload[],
): string[] {
  if (points.length === 0) return [];
  const issues: string[] = [];
  if (q.kind === "blank") {
    const oe = normalizeWs(q.originalExpression ?? "");
    const ok =
      oe.length > 0 &&
      points.some((p) => {
        const pt = normalizeWs(p.text);
        return pt.length > 0 && (oe.includes(pt) || pt.includes(oe));
      });
    if (!ok) {
      issues.push(
        `교사 지정 표적 미준수 — 빈칸원문이 지정 구간('${points[0].text.slice(0, 60)}')과 불일치`,
      );
    }
  } else if (q.kind === "multiBlank") {
    for (const p of points) {
      const pt = normalizeWs(p.text);
      if (!pt) continue;
      const hit = q.blanks.some((b) => {
        const be = normalizeWs(b.expression);
        return be.length > 0 && (be.includes(pt) || pt.includes(be));
      });
      if (!hit) {
        issues.push(`교사 지정 구간이 빈칸에 없음: '${p.text.slice(0, 60)}'`);
      }
    }
  } else {
    for (const p of points) {
      const pt = normalizeWs(p.text);
      if (!pt) continue;
      const hit = q.marks.some((m) => {
        const orig = normalizeWs(m.original);
        const shown = normalizeWs(m.shown);
        return (
          orig.includes(pt) ||
          pt.includes(orig) ||
          shown.includes(pt) ||
          pt.includes(shown)
        );
      });
      if (!hit) {
        issues.push(`교사 지정 표현이 밑줄에 없음: '${p.text.slice(0, 60)}'`);
      }
    }
  }
  return issues;
}

function parseAndGate(
  subType: string,
  text: string,
  passage: string,
  teacherPoints: TeacherPointPayload[],
  // 형식 파라미터(26-07-23 스펙 v1) — 기본 5·1·단일이면 종전 동작과 동일.
  counts: { blankCount: number; markerCount: number; answerCount: number },
  // 어법 KILLER v2(26-08-17): 설계메모 절단 + 인용 앵커 검증·절단.
  // requestedDifficulty(26-08-21): 판단깊이 게이트는 KILLER 에서만 발화하는
  // 자기게이트라 요청 난이도를 받아야 한다(미전달 시 항상 통과).
  opts?: { grammarKillerV2?: boolean; requestedDifficulty?: string },
): { question: MdAnyQuestion; gateIssues: string[]; corrections: string[] } {
  if (subType === "BLANK_INFERENCE") {
    if (counts.blankCount >= 2) {
      // 다중 빈칸(26-07-23 스펙 v1): 라벨식 신형 섹션 파싱 + 빈칸별 스냅 +
      // 전용 게이트. blankCount 는 설정 실값으로 강제(파싱 개수 드리프트 반려).
      let q = parseMdMultiBlank(text);
      const snapped = autoSnapMultiBlankExpressions(q, passage);
      q = snapped.question;
      return {
        question: q,
        gateIssues: [
          ...gateMdMultiBlank(q, passage, { blankCount: counts.blankCount }),
          ...teacherPointComplianceIssues(q, teacherPoints),
        ],
        corrections: snapped.corrections,
      };
    }
    let q = parseMdBlank(text);
    // 0원 자동 보정(어법 스냅의 빈칸 대칭) — 반려 주계통 "빈칸원문 축자 부재"를
    // 보수 가드 하에 지문 축자로 교정한다. 실패하면 그대로 게이트가 반려.
    const snapped = autoSnapBlankExpression(q, passage);
    q = snapped.question;
    return {
      question: q,
      gateIssues: [
        ...gateMdQuestion(q, passage),
        // 대입 파손 선지 집행(26-08-21) — 빈칸 문장이 이미 이유를 말하는데 선지도
        // 이유를 말하면 학생이 지문을 안 읽고 소거한다. 수능·평가원 224문항 실측
        // 충돌 0건. 킬스위치 QGEN_BLANK_KILLER_OPTION_GATE=off.
        ...gateBlankKillerOptions(q, passage),
        ...teacherPointComplianceIssues(q, teacherPoints),
      ],
      corrections: snapped.corrections,
    };
  }
  let q = parseMdGrammar(
    opts?.grammarKillerV2 ? stripGrammarKillerV2Plan(text) : text,
  );
  // 라벨 등장순 재번호(26-08-14, O217 R3): gemini 도 밑줄 라벨을 등장순과 다르게
  // 붙이는 결함이 실측됐다(paired 20지문 중 2건 — 인쇄본 형식 파손). 0원 결정형
  // 재정렬로 양 레인 공통 봉합한다(marks·answer·fixes·wrong 동기 치환).
  q = renumberGrammarByAppearance(q).question;
  const snapped = autoSnapGrammarMarks(q, passage);
  q = snapped.question;
  // v2 인용 앵커(26-08-17, O221·O222): 해설·오답의 원문「…」 인용을 검증하고
  // 표시·저장용 분석부만 남긴다 — 위반은 게이트 사유로 병합돼 재생성이 흡수.
  const quoteIssues: string[] = [];
  if (opts?.grammarKillerV2) {
    const processed = processGrammarKillerV2Quotes(q, passage);
    q = processed.question;
    quoteIssues.push(...processed.issues);
    // 죽은 미끼 집행(26-08-21) — v2 프롬프트 3단계가 이미 실격시킨 자리(관사 옆·
    // 지시대상 붙은 대명사·by -ing·조동사 사이 부사)를 결정론으로 확인한다.
    // 임계 2는 실기출 156문항에서 "2개 이상 = 0건" 실측에서 왔고, 같은 코퍼스
    // 오반려율 0.0%. 킬스위치 QGEN_GRAMMAR_KILLER_DECOY_GATE=off.
    quoteIssues.push(...gateGrammarKillerDeadDecoys(q));
    // 과훈련 정답 사전(26-08-21) — be/have + 보고동사(found·said·believed…) + to 관용은
    // "be found to 는 수동" 한 줄 암기로 끝나 문장 구조를 전혀 읽지 않는 자리다.
    // core 모드 기출 156건 오반려 0.0%. 킬스위치 QGEN_GRAMMAR_KILLER_OVERDRILL_GATE=off.
    quoteIssues.push(
      ...gateGrammarKillerOverdrilledAnswer(q, {
        requestedDifficulty: opts?.requestedDifficulty,
      }),
    );
    // 미끼 판단깊이(26-08-21) — 미끼 4개가 전부 공식 자리(사역동사+원형·계사+보어·
    // what 절·축약 분사)면 판단이 분기하지 않아 실질 선택지가 1개로 붕괴한다.
    // 실측: 같은 지문 산출물이 살아있는 선택지 1.00/5(실기출 중앙 2.00)까지 떨어졌다.
    // 기출 156건 오반려 0.0%. 킬스위치 QGEN_GRAMMAR_KILLER_DECOY_DEPTH_GATE=off.
    quoteIssues.push(
      ...gateGrammarKillerDecoyDepth(q, opts?.requestedDifficulty),
    );
    // 정답 자리(26-08-22) — 정답이 첫 밑줄 + 접속사/전치사류면 단서가 인접해
    // 즉시 판정되고, 읽기 순서상 최초 자리라 나머지 검토가 전멸한다(A/B 실측:
    // 미끼 생존 0.00 vs 기출 0.79). 「①+접속사류」 복합 조건만 반려 — 기출
    // 156건 오반려 0.0%. 킬스위치 QGEN_GRAMMAR_KILLER_ANSWER_SITE_GATE=off.
    quoteIssues.push(...gateGrammarKillerAnswerSite(q));
  }
  return {
    question: q,
    gateIssues: [
      // 어법 비표준(마커 5~10·정답 1~N, 26-07-23 스펙 v1) — 게이트에 설정
      // 실값을 전달한다(기본 5·1이면 종전 검사와 완전 동일).
      ...gateMdQuestion(q, passage, {
        markerCount: counts.markerCount,
        answerCount: counts.answerCount,
      }),
      ...quoteIssues,
      ...teacherPointComplianceIssues(q, teacherPoints),
    ],
    corrections: snapped.corrections,
  };
}

export async function POST(req: NextRequest) {
  const requestStartedAt = Date.now();
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const config = {
    ...parsed.data,
    generationPlan: normalizeQuestionGenerationPlan(parsed.data.generationPlan),
  };
  const subType = config.questionType;

  // ── md 적격성 — 부적격은 400 으로 즉시 반환해 클라이언트가 fast 로 폴백한다 ──
  // 서버측 런타임 킬스위치 — 인시던트 시 재빌드 없이 md 레인을 끈다(클라 플래그는
  // 빌드타임이라 즉시성이 없음). off 면 전 요청이 fast 로 폴백된다.
  if (process.env.QGEN_MD_STREAM?.trim().toLowerCase() === "off") {
    return NextResponse.json(
      { error: "md-stream disabled", code: "MD_STREAM_INELIGIBLE" },
      { status: 400 },
    );
  }
  if (!MD_STREAM_SUBTYPES.has(subType)) {
    return NextResponse.json(
      { error: "md-stream ineligible type", code: "MD_STREAM_INELIGIBLE" },
      { status: 400 },
    );
  }
  const effectiveDifficulty = readQuestionTypeDifficultySetting(
    config.questionTypeSettings,
    config.difficulty,
  );
  const resolvedSettings = resolveQuestionTypeGenerationSettings(
    subType,
    config.questionTypeSettings,
    effectiveDifficulty,
  );
  const blankCount =
    (resolvedSettings as { blankInferenceBlankCount?: number | null })
      .blankInferenceBlankCount ?? 1;
  const markerCount =
    (resolvedSettings as { grammarMarkerCount?: number | null })
      .grammarMarkerCount ?? 5;
  const answerCount =
    (resolvedSettings as { grammarAnswerCount?: number | null })
      .grammarAnswerCount ?? 1;
  // ── 유형 세부 설정 소비(26-07-23 — "설정 무시" 계열 구멍 봉합) ──────────────
  // 실사용 신고: '빈칸 변형' OFF 인데 정답이 패러프레이즈로 나옴 — md 레인이
  // 설정을 안 읽고 PARAPHRASE 고정이었다. fast 와 동일한 결정 소스(dispatcher
  // resolved)를 읽어 계약을 지킨다.
  const blankParaphrase = Boolean(
    (resolvedSettings as { blankInferenceParaphraseAnswer?: boolean })
      .blankInferenceParaphraseAnswer,
  );
  const blankDoubleNegative = Boolean(
    (resolvedSettings as { blankInferenceDoubleNegative?: boolean })
      .blankInferenceDoubleNegative,
  );
  const blankGranularity =
    (resolvedSettings as { blankInferenceGranularity?: string })
      .blankInferenceGranularity ?? "auto";
  const blankPointFocus = Boolean(
    (resolvedSettings as { blankPointFocus?: boolean }).blankPointFocus,
  );
  const grammarPointFocus = Boolean(
    (resolvedSettings as { grammarPointFocus?: boolean }).grammarPointFocus,
  );
  // ── 신형 유형(26-07-26 승차) — 레인 디스크립터 위임 ─────────────────────────
  // 빈칸·어법은 lane === null 이라 아래 기존 분기가 그대로 실행된다(바이트 무회귀).
  const mdLane = getMdLane(subType);
  // 26-07-23 교사 포인트 md 승차: "포인트 짚어주기" 생성도 md 스트리밍 레인을
  // 탄다(기존엔 fast 로 보내 스트리밍이 없었음 — 실사용 지적). 포인트는 아래에서
  // fast 와 동일 계약(클램프+축자 필터)으로 읽어 프롬프트 강제 + 결정론 준수
  // 게이트로 집행한다.
  // 26-07-23 부정-부정 md 승차(사용자 확정: "빈칸·어법은 어떤 설정이든 무조건
  // 신형"): DN 공예를 md 모드 블록으로 탑재 — fast 라우팅 제외를 철회한다.
  // 26-07-23 스펙 v1: 다중 빈칸(blankCount 2~3)·어법 비표준(마커 5~10·정답 1~N)
  // 도 md 승차 — 전용 프롬프트 빌더·파서·게이트·어댑터가 신설돼 형식 차이를
  // 커버한다(설정 범위 밖 값만 fast 폴백).
  const mdEligible = mdLane
    ? mdLane.isEligible(resolvedSettings as unknown as Record<string, unknown>)
    : (subType === "BLANK_INFERENCE" && blankCount >= 1 && blankCount <= 3) ||
      (subType === "GRAMMAR_ERROR" &&
        markerCount >= 5 &&
        markerCount <= 10 &&
        answerCount >= 1 &&
        answerCount <= markerCount);
  if (!mdEligible) {
    return NextResponse.json(
      { error: "md-stream ineligible settings", code: "MD_STREAM_INELIGIBLE" },
      { status: 400 },
    );
  }

  // 26-08-18 난이도 기반 티어: KILLER → PREMIUM(3.7·2배), 그 외 → STANDARD(luna).
  // 요청 generationPlan 은 무시된다(question-generation-plans.ts 참조).
  const effectiveGenerationPlan = resolveEffectiveGenerationPlan(
    config.generationPlan,
    effectiveDifficulty,
  );

  const passage = await prisma.passage.findFirst({
    where: { id: config.passageId, academyId: staff.academyId },
    select: { id: true, title: true, content: true, subject: true },
  });
  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }
  // KO(국어) 지문은 md 레인 비대상 — 기존 경로로.
  if (isKoreanSubject(passage.subject)) {
    return NextResponse.json(
      { error: "md-stream ineligible subject", code: "MD_STREAM_INELIGIBLE" },
      { status: 400 },
    );
  }

  await cleanupStaleWorkbenchAiJobs({
    academyId: staff.academyId,
    domain: "QUESTION_GENERATION",
    passageId: passage.id,
  });

  const feas = preflightQuestionFeasibility(
    subType,
    effectiveDifficulty,
    passage.content,
  );
  if (!feas.ok) {
    return NextResponse.json(
      { error: feas.error, code: feas.code, ...feas.detail },
      { status: 400 },
    );
  }

  // 과금 유형은 레인이 결정한다 — fast 레인 getOperationType 과 동일 규칙.
  // 하드코딩을 유지하면 어휘 계열(ANTONYM 등, QUESTION_GEN_VOCAB = 1크레딧)이
  // 2크레딧으로 이중 청구되고 클라이언트 견적(1)과도 어긋난다.
  const operationType: OperationType =
    mdLane?.operationType ?? "QUESTION_GEN_SINGLE";
  const creditCost = getQuestionGenerationCreditCost(
    CREDIT_COSTS[operationType],
    effectiveGenerationPlan,
  );
  const preflightBalance = await prisma.creditBalance.findUnique({
    where: { academyId: staff.academyId },
    select: { balance: true },
  });
  if ((preflightBalance?.balance ?? 0) < creditCost) {
    return NextResponse.json(
      {
        error: "Insufficient credits",
        balance: preflightBalance?.balance ?? 0,
        required: creditCost,
      },
      { status: 402 },
    );
  }

  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: "QUESTION_GENERATION",
      status: "PROCESSING",
      title: passage.title,
      passageId: passage.id,
      mode: config.mode,
      questionType: subType,
      generationPlan: effectiveGenerationPlan,
      difficulty: effectiveDifficulty,
      requestedCount: 1,
      startedAt: new Date(),
      config: {
        mode: config.mode,
        count: 1,
        questionType: subType,
        questionTypeSettings: config.questionTypeSettings ?? null,
        difficulty: effectiveDifficulty,
        customPrompt: config.customPrompt ?? "",
        generationPlan: effectiveGenerationPlan,
        requestedGenerationPlan: config.generationPlan,
        fastPath: true,
        mdStream: true,
        clientTempId: config.clientTempId ?? null,
      },
    },
  });

  // ── luna 레인 (26-08-14, O217 확증런 근거) ──────────────────────────────────
  // 26-08-19 전 라인업 3.7 통일(사용자 결정, O226 벤치 귀결):
  //   KILLER   → 3.7-flash(어법 5·1 은 v2 프롬프트+인용 게이트) + 요금 2배
  //   그 외    → 3.7-flash(STANDARD 기본값) — gemini md 경로 + 공용/ext 검산
  // luna 레인(정본 2유형 + luna-ext 22유형)은 코드 전량 보존하되 **옵트인**
  // (env QGEN_LUNA_LANE=on 일 때만 활성 — isLunaQgenEligible·getLunaExt 가 판정).
  // 근거(O226, INT paired 20지문×4유형): 3.7 이 paired 50:25 우세·원가 동급
  // (₩11.6 vs 12.2)·속도 2.3배·luna 지칭 사고 팽창 잡실패 4/20. 어법 INT 의
  // 3.7 해설 사실 오류 계통은 공용 검산의 오답 해설 사실 규칙으로 봉합(동일 커밋).
  //
  // 26-08-18 난이도 기반 티어(O223 캠페인 귀결): 플랜 상품 폐지 — effective
  // GenerationPlan 은 난이도가 유도한다(KILLER → PREMIUM = 요금 2배).
  // 비상 복귀: env QGEN_DIFFICULTY_TIER=off (요청 플랜·단일상품 클램프 종전 규칙).
  const isPremiumPlan = effectiveGenerationPlan === "PREMIUM";
  const lunaExt = mdLane && !isPremiumPlan ? getLunaExt(subType) : null;
  const lunaLane =
    !isPremiumPlan &&
    (isLunaQgenEligible({
      subType,
      blankCount,
      markerCount,
      answerCount,
      hasMdLane: Boolean(mdLane),
    }) ||
      lunaExt !== null);
  const mdDifficulty: MdDifficulty =
    effectiveDifficulty === "BASIC" || effectiveDifficulty === "INTERMEDIATE"
      ? effectiveDifficulty
      : "KILLER";
  // 모델 분기 — 구조(프롬프트·파서·게이트·재생성 정책)는 동일, 모델만 다르다.
  // 기본형상(26-08-19): luna 레인 off → KILLER 는 PREMIUM_QGEN(3.7), 그 외는
  // STANDARD_QGEN(코드 기본 3.7 — 프로덕션 env 핀 갱신 필요). luna 는 옵트인.
  const modelId = lunaLane
    ? LUNA_QGEN_MODEL_ID
    : isPremiumPlan || mdDifficulty === "KILLER"
      ? ATLAS_PREMIUM_QGEN_MODEL_ID
      : ATLAS_STANDARD_QGEN_MODEL_ID;

  // ── 어법 KILLER v2 (26-08-17 시공, O219~O222 벤치 확정 형상) ──────────────
  // gemini(비-luna) 어법 표준형(5·1) × KILLER 만 신형 프롬프트+인용 앵커+게이트로
  // 간다. BASIC/INTERMEDIATE·비표준(N·K)·luna 레인은 종전 그대로.
  // 킬스위치 QGEN_GRAMMAR_KILLER_V2=off.
  const grammarKillerV2 =
    !lunaLane &&
    !mdLane &&
    subType === "GRAMMAR_ERROR" &&
    markerCount === 5 &&
    answerCount === 1 &&
    mdDifficulty === "KILLER" &&
    isGrammarKillerV2Enabled();

  // 교사 지정 포인트(포인트 짚어주기) — fast 동일 계약으로 읽는다. 있으면
  // 프롬프트 강제 블록 + 결정론 준수 게이트가 함께 작동한다.
  const teacherPoints = readMdTeacherPoints(
    subType,
    config.questionTypeSettings,
    passage.content,
  );

  // ── 교사 지정 구간 × 빈칸 단위 모순 해소 (26-07-27, 실사용 사고 근거) ──────
  // 세미나 실측: 한 교사가 포인트로 단어 하나('Evidence')를 지정하면서 '빈칸 단위'
  // 는 절(clause)로 둔 조합으로 **3연속 실패**했다. 절 단위 빈칸을 뽑으면 지정 단어와
  // 겹칠 수 없어 준수 게이트가 매번 반려하는데, 사용자에게는 이유가 보이지 않아
  // 같은 설정으로 계속 재시도했다(세미나 실패 20건 중 3건이 이 한 건).
  // 교사가 지문에서 직접 드래그한 구간이 일반 단위 설정보다 구체적인 의사표시이므로,
  // 포인트가 있으면 그 단위가 이긴다. 포인트가 없으면 설정이 그대로 유효하다.
  const teacherPointUnit = teacherPoints[0]?.unit;
  const effectiveBlankGranularity =
    subType === "BLANK_INFERENCE" &&
    teacherPoints.length > 0 &&
    (teacherPointUnit === "word" ||
      teacherPointUnit === "phrase" ||
      teacherPointUnit === "clause")
      ? teacherPointUnit
      : blankGranularity;

  // 레인 컨텍스트 — 신형 유형의 프롬프트·게이트·어댑터가 공유하는 단일 입력.
  const laneCtx: MdLaneContext | null = mdLane
    ? {
        passage: passage.content,
        difficulty: mdDifficulty,
        rawDifficulty: effectiveDifficulty,
        resolved: resolvedSettings as unknown as Record<string, unknown>,
        rawTypeSettings: config.questionTypeSettings ?? null,
        teacherPoints,
        variantIndex: config.variantIndex ?? 0,
        variantCount: config.variantCount ?? 1,
      }
    : null;

  // ── 다양성(축약판) — md 레인은 엔진의 diversity 컨텍스트를 안 타므로, 같은
  // 지문+유형의 기존 표적(빈칸원문·어법 정답 표현)을 회피 목록으로 프롬프트에
  // 직접 주입한다. 병렬 배치(variantCount>1)는 분산 힌트를 추가한다. 조회 실패는
  // 생성 자체를 막지 않는다.
  let diversityBlock = "";
  try {
    const recent = await prisma.question.findMany({
      where: {
        academyId: staff.academyId,
        passageId: passage.id,
        subType,
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { structuredData: true },
    });
    const targets: string[] = [];
    for (const q of recent) {
      try {
        const data =
          typeof q.structuredData === "string"
            ? JSON.parse(q.structuredData)
            : q.structuredData;
        const record = (data ?? {}) as Record<string, unknown>;
        if (typeof record.originalExpression === "string" && record.originalExpression.trim()) {
          targets.push(record.originalExpression.trim().slice(0, 90));
        }
        // 다중 빈칸(26-07-23 스펙 v1): blanks[] 의 빈칸원문 전부 회피 표적.
        if (Array.isArray(record.blanks)) {
          for (const b of record.blanks as Array<Record<string, unknown>>) {
            if (typeof b?.originalExpression === "string" && b.originalExpression.trim()) {
              targets.push(b.originalExpression.trim().slice(0, 90));
            }
          }
        }
        if (Array.isArray(record.markedExpressions)) {
          // 복수 정답(26-07-23 스펙 v1): isError 전부 수집 — find 단일 수집이던
          // 것을 filter 로(K≥2 문항의 정답 자리를 빠짐없이 회피).
          const errs = (record.markedExpressions as Array<Record<string, unknown>>).filter(
            (m) => m?.isError === true,
          );
          for (const err of errs) {
            if (typeof err?.expression === "string" && err.expression.trim()) {
              targets.push(err.expression.trim().slice(0, 90));
            }
          }
        }
        // 신형 유형은 자기 표적 필드를 레인이 안다(어댑터 필드가 유형마다 다름).
        if (mdLane) {
          for (const target of mdLane.diversityTargets(record)) {
            const s = target.trim();
            if (s) targets.push(s.slice(0, 90));
          }
        }
      } catch {
        /* 개별 문항 파싱 실패 무시 */
      }
    }
    // 교사 지정 구간과 겹치는 회피 표적은 제외한다(정규화 양방향 포함) —
    // "이미 출제된 자리 회피"가 교사 지시를 밀어내면 안 된다(fast 동일 규칙,
    // 공유 블록의 '다양성 회피 목록보다 우선' 선언과 이중 방어).
    const teacherNorm = teacherPoints
      .map((p) => normalizeWs(p.text))
      .filter(Boolean);
    const unique = [...new Set(targets)]
      .filter((t) => {
        const tn = normalizeWs(t);
        return !teacherNorm.some((p) => tn.includes(p) || p.includes(tn));
      })
      .slice(0, 8);
    const parts: string[] = [];
    if (unique.length > 0) {
      parts.push(
        `## 표적 회피 — 이 지문에서 이미 출제된 자리(정답·빈칸이 겹치지 않게 하라)\n${unique.map((t) => `- ${t}`).join("\n")}`,
      );
    }
    if ((config.variantCount ?? 1) > 1) {
      parts.push(
        `이 요청은 같은 지문의 병렬 생성 ${(config.variantIndex ?? 0) + 1}/${config.variantCount}번째다 — 다른 병렬 문항과 표적·정답 자리가 겹치지 않도록 지문의 서로 다른 부분을 노려라.`,
      );
    }
    diversityBlock = parts.join("\n\n");
  } catch (error) {
    console.warn("[md-stream] diversity context failed", error);
  }

  const buildPrompt = (feedback: string | null): string => {
    const base =
      laneCtx && mdLane
        ? mdLane.buildBasePrompt(laneCtx)
        : subType === "BLANK_INFERENCE"
        ? blankCount >= 2
          ? // 다중 빈칸(26-07-23 스펙 v1) — 전용 빌더. answerMode 는 '빈칸 변형'
            // 설정(blankParaphrase)으로 갈리고, DN 은 설정 리졸버가 단일 전용으로
            // 강제하므로(blankCount≥2 면 항상 false) 여기서 고려하지 않는다.
            buildMdMultiBlankPrompt(
              passage.content,
              "full",
              mdDifficulty,
              blankCount === 3 ? 3 : 2,
              blankParaphrase ? "PARAPHRASE" : "SOURCE_EXACT",
            )
          : buildMdBlankPrompt(passage.content, "full", mdDifficulty)
        : grammarKillerV2
          ? // 어법 KILLER v2 — 실물 해부+자리 카탈로그+설계메모+인용 앵커가 종전
            // base+포인트 가이드+공용 검산을 통째로 대체한다(O220~O222 실측).
            buildGrammarKillerV2Prompt(passage.content)
          : buildMdGrammarPrompt(passage.content, "full", mdDifficulty, {
            // 어법 비표준(26-07-23 스펙 v1) — 기본 5·1이면 기존 프롬프트와 바이트 동일.
            markerCount,
            answerCount,
          });
    const extras: string[] = [];
    // ── 유형 세부 설정 블록(26-07-23) — fast 와 같은 계약을 md 프롬프트로 집행 ──
    if (laneCtx && mdLane) {
      // 신형 유형의 설정 모드 블록은 레인이 전담한다(유형마다 노브가 다름).
      extras.push(...mdLane.buildExtras(laneCtx));
    } else if (subType === "BLANK_INFERENCE" && blankCount >= 2) {
      // 다중 빈칸: 단일 전용 모드 블록(부정-부정·'빈칸 변형 OFF' 축자 정답 절)은
      // 주입하지 않는다 — 정답 모드는 위 빌더의 자체 절이 집행한다. 빈칸 단위·
      // 포인트 집중은 프로덕션 계약대로 다중에도 적용(정찰 multiBlank §2-2).
      if (effectiveBlankGranularity !== "auto") {
        const label =
          effectiveBlankGranularity === "word"
            ? "단어"
            : effectiveBlankGranularity === "clause"
              ? "절"
              : "구";
        extras.push(
          `## 빈칸 단위 (교사 설정, 필수)\n- 각 빈칸원문은 반드시 ${label} 단위로 잡아라.`,
        );
      }
      if (blankPointFocus) {
        // 다중 빈칸은 프로덕션과 동일하게 빈칸별 코어 논리 분산 가이드를 쓴다.
        const guidance = buildMultiBlankPointGuidance(blankCount, {
          pointFocus: true,
        });
        if (guidance) extras.push(guidance);
      }
    } else if (subType === "BLANK_INFERENCE") {
      if (blankDoubleNegative) {
        // 부정-부정(부정 패러프레이즈) — 구형 dispatcher 계약의 핵심 증류판.
        extras.push(
          [
            "## 정답 형식: 부정-부정 빈칸 (필수 — 위의 정답 형식 지시를 이 절이 대체한다)",
            "- 정답 선지는 빈칸원문의 의미를 정확히 보존하는 **부정/결여 패러프레이즈**다: not+반대 개념, without, lack(ing), fail to, prevent/keep ... from, cannot ... without, free from, non-/un-/in- 계열 중 **명확한 부정 기제 1개**를 사용하라.",
            "- 빈칸원문은 여전히 지문 축자 그대로 뽑는다(변형은 정답 선지에서만 일어난다).",
            "- 표적은 논리적 동작·관계를 담은 구(동사구·동명사구·분사구·수식 명사구)로 잡아라 — 단일 추상명사, 구두점 포함 구간, 예시 나열 자리(such as/including 뒤)는 금지.",
            "- 부정 기제 사슬 금지: not...without 꼬임, fail 중복, 'No 주어 + 부정 술어' 구조는 만들지 마라. 정답을 빈칸에 끼운 완성문이 자연스럽고 원문과 논리 등가(축소·과장·반전 없음)인지 소리 내어 검산하라.",
            "- 문법 슬롯 보존: 전치사 뒤 빈칸이면 정답이 또 전치사로 시작하면 안 되고, be동사 뒤면 보어구여야 한다.",
            "- 오답 설계: **최소 2개의 오답에도 부정/결여 표현을 넣어** 부정어 유무만으로 정답이 식별되지 않게 하라. 오답은 지문 키워드·같은 의미장을 재활용하되 극성·범위·인과 역할·논지 방향의 미세한 이동으로 틀리게 만든다. 형식·길이·추상 층위는 다섯 선지 평행.",
          ].join("\n"),
        );
      } else if (!blankParaphrase) {
        extras.push(
          `## 정답 형식 (필수 — 위의 '추상 패러프레이즈' 지시보다 우선한다)\n- '빈칸 변형' 미사용 설정이다: 정답 선지는 빈칸원문을 **한 글자도 바꾸지 말고 그대로** 써라.\n- 오답 4개는 정답과 같은 문법 형식·길이·추상 층위로 설계해, 원문 축자 정답이 형식만으로 표나지 않게 하라. 오답 기제 4종 규칙은 그대로 적용한다.`,
        );
      }
      if (effectiveBlankGranularity !== "auto") {
        const label =
          effectiveBlankGranularity === "word"
            ? "단어"
            : effectiveBlankGranularity === "clause"
              ? "절"
              : "구";
        extras.push(
          `## 빈칸 단위 (교사 설정, 필수)\n- 빈칸원문은 반드시 ${label} 단위로 잡아라.`,
        );
      }
      if (blankPointFocus) {
        const guidance = buildBlankPointGuidance({ pointFocus: true });
        if (guidance) extras.push(guidance);
      }
    } else if (grammarPointFocus && !grammarKillerV2) {
      // 26-08-17 P0(해부 F1-9·PG-2 확정): 난이도·모드·정답 수를 넘긴다. 종전엔
      // 미전달이라 KILLER 문항에도 '중' 프로필("수식어를 한 번 걷어내야 보이는
      // 구조")이 주입되고 KILLER 정답 격("한눈 비문 금지")·KILLER 디코이 규율
      // ("한눈에 옳음이 보이는 자리는 함정 가치 없음")은 빠졌다 — 두 플랜 공통.
      // v2 레인은 이 블록을 넣지 않는다 — 규칙 목록 제거가 A+B 2→16 도약의
      // 요인이었다(O220 lean vs base 실측).
      const guidance = buildGrammarPointGuidance({
        pointFocus: true,
        requestedDifficulty: effectiveDifficulty,
        mode: "judgment",
        answerCount,
      });
      if (guidance) extras.push(guidance);
    }
    // 교사 지정 블록은 fast 레인과 같은 공유 계약을 그대로 쓴다 — 블록 자체가
    // "다양성 회피 목록보다 우선"을 선언한다.
    const teacherBlock = buildTeacherPointsPromptBlock(teacherPoints);
    if (teacherBlock) extras.push(teacherBlock);
    if (diversityBlock) extras.push(diversityBlock);
    if (config.customPrompt?.trim()) {
      extras.push(`## 교사 추가 지시\n${config.customPrompt.trim()}`);
    }
    // luna 검산 블록(O217) — 어법 F 30%→5.3% 소멸의 주역. 항상 말미(반려 피드백
    // 직전)에 두어 GPT-5 계열 "사고 중 형식 유실" 결함(O216 리서치)을 상쇄한다.
    // 형식별 분기(26-08-14 확장): 표준형은 검증된 상수, 비표준·다중은 동적 빌더,
    // 레인 유형은 자기 ext 가 게이트 반려 조건을 전사한 검산 블록을 낸다.
    if (lunaLane && laneCtx && lunaExt) {
      extras.push(lunaExt.buildSelfcheck(laneCtx));
    } else if (!lunaLane && laneCtx && mdLane) {
      // 26-08-18 난이도 기반 티어: 레인 유형 KILLER 는 gemini md 로 가는데 종전엔
      // 검산 블록이 0 이었다(luna-ext 검산이 luna 경로에만 붙음 — 인벤토리 격차).
      // ext 검산은 "0원 게이트 반려 조건 + 기출 형식 + 사다리" 라 모델 무관이므로
      // gemini 경로에도 그대로 붙인다(레지스트리 등록 유형만 — 미등록이면 종전대로).
      const extForSelfcheck = getLunaExtForSelfcheck(subType);
      if (extForSelfcheck) extras.push(extForSelfcheck.buildSelfcheck(laneCtx));
    } else if (lunaLane) {
      extras.push(
        subType === "GRAMMAR_ERROR"
          ? markerCount === 5 && answerCount === 1
            ? LUNA_GRAMMAR_SELFCHECK
            : buildLunaGrammarSelfcheckNK(markerCount, answerCount)
          : blankCount >= 2
            ? buildLunaMultiBlankSelfcheck(blankCount === 3 ? 3 : 2)
            : LUNA_BLANK_SELFCHECK,
      );
    } else if (subType === "GRAMMAR_ERROR" && !grammarKillerV2) {
      // 26-08-17 P0: gemini md 어법 경로에도 모델 무관 검산(위치 분산·단어 단위·
      // 해설 사실성·문체)을 붙인다 — luna 블록이 이미 포함하는 절이라 lunaLane 에는
      // 중복 주입하지 않고, v2 레인은 자체 규칙(설계 절차·인용 앵커)이 대체한다.
      extras.push(buildGrammarMdSharedSelfcheck(markerCount));
    } else if (subType === "BLANK_INFERENCE") {
      // O223 A축: gemini(프리미엄) 빈칸 경로는 검산 블록이 전무했다 — 해설
      // 사실성·완성문 검산·문체가 luna 검산에만 있어 프리미엄 빈칸이 무방비.
      // 모델 무관 절만 담은 공용 블록을 주입한다(luna 는 자기 블록 유지).
      extras.push(buildBlankMdSharedSelfcheck());
    }
    if (feedback) {
      // 누설·정답 시비 계열 반려는 **지문 원문이 그 표현을 이미 포함**해서 난다 —
      // 지문은 수정 금지라 같은 자리·같은 후보쌍을 고집하면 반드시 재반려된다.
      // (26-08-11 RCA: 재생성이 같은 strictly|strict 쌍을 다시 골라 확정 실패·환불.
      //  일반 지시 "위반을 해소하라"만으로는 모델이 표적 교체까지 도달하지 못했다.)
      const needsRelocation = /누설|정답 시비|네모 밖|밑줄 밖|그대로 남아/.test(
        feedback,
      );
      // 인접 반려(26-08-14 실사용 신고)는 양보 방향을 명시한다 — 제약 과적으로
      // 재생성이 같은 배치를 반복하는 RCA 계통(26-08-11) 예방: 위치 분산이 포인트
      // 다양성보다 우선임을 알려 실제 탈출구(코드 2회 허용)를 열어 준다.
      const needsSpread = /인접/.test(feedback);
      const needsNarrow = /구·절/.test(feedback);
      // v2 인용 게이트 반려(26-08-17): 인용이 축자가 아니거나 위치 서술이 어순과
      // 다르다는 뜻 — 재복사·사실 서술로 탈출구를 명시한다.
      const needsQuote = /인용|바로 앞/.test(feedback);
      extras.push(
        `[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${feedback}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라.${
          needsRelocation
            ? " 누설·정답 시비 사유는 지문 원문이 그 표현을 이미 포함하고 있다는 뜻이다 — 같은 자리·같은 후보쌍으로는 절대 해소되지 않으니, 지적된 표적을 버리고 **다른 문장의 다른 포인트로 교체**해 설계하라(지문 본문 수정은 금지)."
            : ""
        }${
          needsSpread
            ? " 인접 사유는 밑줄 배치 문제다 — 붙어 있는 두 밑줄 중 하나를 지문의 떨어진 다른 부분의 확정적 포인트로 옮겨라. 포인트 다양성(코드 종류)을 줄이는 한이 있어도 위치 분산이 우선이다(같은 코드 2회까지 허용)."
            : ""
        }${
          needsNarrow
            ? " 구·절 사유는 밑줄 범위 문제다 — 포인트를 교체할 필요 없이, 판정을 결정짓는 핵심 단어 1개(불가피하면 2단어)로 밑줄을 좁혀 다시 그어라."
            : ""
        }${
          needsQuote
            ? " 인용·바로 앞 사유는 해설이 지문을 그대로 베끼지 않았거나 위치 서술이 실제 어순과 다르다는 뜻이다 — 해당 밑줄 주변을 지문(해설은 화면 표시 형태)에서 다시 찾아 한 글자도 바꾸지 말고 복사하고, 인용에 보이는 사실만 서술하라."
            : ""
        }`,
      );
    }
    return extras.length > 0 ? `${base}\n\n${extras.join("\n\n")}` : base;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit = (payload: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(sseEncode(payload));
        } catch {
          // 클라이언트 이탈 — 이후 emit 은 무시하고 생성·저장은 계속한다.
          closed = true;
        }
      };
      const finish = () => {
        if (closed) return;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        closed = true;
      };
      // 스트림 개통 즉시 주석 프레임 — 일부 프록시/런타임의 초기 버퍼링을 뚫어
      // 클라이언트가 헤더+첫 바이트를 지체 없이 받게 한다.
      try {
        controller.enqueue(new TextEncoder().encode(": open\n\n"));
      } catch {
        closed = true;
      }

      void (async () => {
        let creditTxId: string | null = null;
        const callResults: StreamCallResult[] = [];
        try {
          const credit = await ensureWorkbenchAiJobCharged({
            jobId: job.id,
            academyId: job.academyId,
            staffId: job.createdById,
            operationType,
            metadata: {
              passageId: passage.id,
              mode: config.mode,
              questionType: subType,
              count: 1,
              generationPlan: effectiveGenerationPlan,
              difficulty: effectiveDifficulty,
              creditCost,
              fastPath: true,
              mdStream: true,
            },
            creditCost,
          });
          creditTxId = credit.transactionId;
          emit({ t: "meta", jobId: job.id });

          // ── 생성 정책 (26-07-22 사용자 확정): 단일 빈칸 = 원큐(스냅 보정이
          // 주계통 커버, 48h 실패율 7%) / 어법 = 게이트 반려 시 1회 자동 재생성
          // (반려가 품질이 아니라 기계 파손이고 콜당 ~10~20% 확률 꼬리라, 실패
          // 카드 대신 재생성으로 흡수 — 48h 실패율 21% 근거).
          // 26-07-23 스펙 v1: 다중 빈칸(blankCount≥2)도 1회 재생성 허용 — 신형식
          // (라벨식 빈칸원문·조합 선지)이라 초기 게이트 반려율 실측이 없어, 어법
          // 도입기와 같은 보수 정책(실패 카드 대신 재생성 1회 흡수)으로 시작한다.
          // 실측 누적 후 단일 빈칸처럼 원큐로 좁힐지 재결정한다.
          // 시간 예산: Vercel maxDuration 300s. 콜 타임아웃은 270s 벽까지 남은
          // 시간으로 잘라 함수 강제종료(잡 고아 → 환불 누락)를 막는다
          // (fast 라우트 deadlineAt 안전판 등가).
          const elapsed = () => Date.now() - requestStartedAt;
          const budgetMs = () => 270_000 - elapsed();
          // 실지출 원장은 게이트·저장 성공 여부와 무관하게 각 콜 직후 기록한다 —
          // 반려·재생성 타임아웃·어댑터 실패 시에도 OpenRouter 과금은 이미
          // 발생했다(fast 순서 정합).
          const recordGenerationCost = async (
            idx: number,
            result: StreamCallResult,
          ) => {
            await recordCostSafely({
              sourceKey: `workbench_ai_job:${job.id}:generation:${idx}`,
              sourceId: job.id,
              sourceDetail: `QUESTION_GENERATION:${subType}`,
              academyId: job.academyId,
              model: modelId,
              operationType,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              recordedCostUsd: result.costUsd,
              metadata: {
                passageId: passage.id,
                generationPlan: effectiveGenerationPlan,
                difficulty: effectiveDifficulty,
                fastPath: true,
                mdStream: true,
                lunaLane,
                durationMs: result.durationMs,
                // O223 A축: 절단(length) 포렌식 — 원장에서 예산 결함과 품질
                // 결함을 구분할 수 있게 한다.
                finishReason: result.finishReason,
              },
            });
          };
          // luna 레인 콜 옵션 — json_schema·표시 브릿지 스펙(형식별 4분기).
          // 표준형(어법 5·1, 단일 빈칸)은 O217 검증 상수, 비표준·다중은 동적 빌더.
          const lunaGrammarStandard = markerCount === 5 && answerCount === 1;
          const lunaOpts = !lunaLane
            ? undefined
            : laneCtx && lunaExt
              ? {
                  jsonSchema: lunaExt.buildJsonSchema(laneCtx) as unknown as {
                    name: string;
                    strict: boolean;
                    schema: unknown;
                  },
                  bridgeSpecs: lunaExt.bridgeSpecs,
                  maxTokens: lunaExt.maxTokens,
                }
              : subType === "GRAMMAR_ERROR"
              ? lunaGrammarStandard
                ? {
                    jsonSchema: LUNA_GRAMMAR_JSON_SCHEMA as unknown as {
                      name: string;
                      strict: boolean;
                      schema: unknown;
                    },
                    bridgeSpecs: LUNA_GRAMMAR_BRIDGE_SPECS,
                  }
                : {
                    jsonSchema: buildLunaGrammarJsonSchemaNK(
                      markerCount,
                      answerCount,
                    ) as unknown as { name: string; strict: boolean; schema: unknown },
                    bridgeSpecs: LUNA_GRAMMAR_NK_BRIDGE_SPECS,
                  }
              : blankCount >= 2
                ? {
                    jsonSchema: buildLunaMultiBlankJsonSchema(
                      blankCount === 3 ? 3 : 2,
                    ) as unknown as { name: string; strict: boolean; schema: unknown },
                    bridgeSpecs: LUNA_MULTIBLANK_BRIDGE_SPECS,
                  }
                : {
                    jsonSchema: LUNA_BLANK_JSON_SCHEMA as unknown as {
                      name: string;
                      strict: boolean;
                      schema: unknown;
                    },
                    bridgeSpecs: LUNA_BLANK_BRIDGE_SPECS,
                  };
          // luna JSON 출력 → Md*Question 어댑트 + 결정형 코어스(재번호·마커 삽입)
          // → 기존 스냅·게이트·교사 준수 게이트 그대로. JSON 절단 등 파싱 실패는
          // 게이트 이슈로 변환해 기존 재생성 정책이 흡수하게 한다.
          const lunaParseAndGate = (text: string): MdLaneParsed => {
            try {
              // 레인 유형: ext 가 JSON→레인 동형 산출물로 어댑트하고 레인의 스냅·
              // 게이트를 그대로 태운다(어댑터·후처리는 아래 공통 경로).
              if (laneCtx && lunaExt) return lunaExt.parseAndGate(text, laneCtx);
              if (subType === "GRAMMAR_ERROR") {
                // 표준(5·1)과 비표준(N·K)은 JSON 계약이 다르다(answer/fix 단수 vs
                // answers/fixes 배열) — 어댑터만 갈리고 스냅·게이트는 동일 경로.
                const adapted = lunaGrammarStandard
                  ? adaptLunaGrammarJson(text)
                  : adaptLunaGrammarJsonNK(text);
                const snapped = autoSnapGrammarMarks(adapted.question, passage.content);
                return {
                  question: snapped.question,
                  gateIssues: [
                    ...adapted.issues,
                    ...gateMdQuestion(snapped.question, passage.content, {
                      markerCount,
                      answerCount,
                    }),
                    ...teacherPointComplianceIssues(snapped.question, teacherPoints),
                  ],
                  corrections: [
                    ...snapped.corrections,
                    ...(adapted.renumbered ? ["luna: 라벨 등장순 재번호"] : []),
                    ...adapted.markerInserted.map((l) => `luna: ${l} 마커 자동삽입`),
                  ],
                };
              }
              if (blankCount >= 2) {
                // 다중 빈칸 — 전용 게이트에 설정 실값(blankCount)을 강제해 파싱
                // 개수 드리프트를 반려(레거시 경로와 동일 계약) + 교사 준수 게이트.
                // O223 A축: 레거시·단일 luna 경로에만 있던 축자 스냅(0원 보정)이
                // 이 경로에만 빠져 같은 반려 계통이 재생성 콜을 소모하던 누락 봉합.
                const adapted = adaptLunaMultiBlankJson(text);
                const snapped = autoSnapMultiBlankExpressions(
                  adapted.question,
                  passage.content,
                );
                return {
                  question: snapped.question,
                  gateIssues: [
                    ...gateMdMultiBlank(snapped.question, passage.content, {
                      blankCount,
                    }),
                    ...teacherPointComplianceIssues(snapped.question, teacherPoints),
                  ],
                  corrections: snapped.corrections,
                };
              }
              const adapted = adaptLunaBlankJson(text);
              const snapped = autoSnapBlankExpression(adapted.question, passage.content);
              return {
                question: snapped.question,
                gateIssues: [
                  ...gateMdQuestion(snapped.question, passage.content),
                  ...teacherPointComplianceIssues(snapped.question, teacherPoints),
                ],
                corrections: snapped.corrections,
              };
            } catch (parseErr) {
              return {
                question: null as unknown as MdAnyQuestion,
                gateIssues: [
                  `luna JSON 파싱 실패: ${
                    parseErr instanceof Error ? parseErr.message : String(parseErr)
                  }`,
                ],
                corrections: [],
              };
            }
          };
          // 전송 계층 재시도(26-08-14) — 게이트 재생성과 별개 층이다. luna 는
          // 본문 델타를 한 자도 안 보내고 스트림을 닫는 계통(EMPTY_BODY)이
          // 3.5% 실측되며(gemini 0%), 이 계통은 게이트 이슈가 아니라 예외라
          // 재생성 정책이 못 잡고 곧장 실패·환불이 된다. 예산이 남아 있을 때만
          // 1회 재전송한다.
          // v2 표시 필터 팩토리 — 콜(시도)마다 새 인스턴스(줄 상태기계 초기화).
          const makeDisplayFilter = () =>
            grammarKillerV2
              ? new GrammarKillerV2DisplayFilter((textOut) =>
                  emit({ t: "c", d: sanitizeAiModelDisclosureText(textOut) }),
                )
              : undefined;
          const streamWithTransportRetry = async (prompt: string) => {
            try {
              return await streamOnce({
                prompt,
                modelId,
                timeoutMs: Math.min(240_000, budgetMs()),
                emit,
                luna: lunaOpts,
                displayFilter: makeDisplayFilter(),
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              if (!message.startsWith("EMPTY_BODY") || budgetMs() < 60_000) throw err;
              console.warn("[md-stream] EMPTY_BODY — 전송 재시도 1회");
              emit({ t: "retry", reason: "빈 응답 — 다시 생성합니다" });
              return streamOnce({
                prompt,
                modelId,
                timeoutMs: Math.min(240_000, budgetMs()),
                emit,
                luna: lunaOpts,
                displayFilter: makeDisplayFilter(),
              });
            }
          };
          // O223 A축: finish=length(사고가 max_tokens 잠식) 절단이 "파싱 실패"로
          // 위장되던 계통에 원인 표식을 붙인다 — 포렌식·원장에서 예산 결함과
          // 품질 결함을 구분 가능하게.
          const withTruncationHint = (
            p: MdLaneParsed,
            c: StreamCallResult,
          ): MdLaneParsed =>
            c.finishReason === "length" && p.gateIssues.length > 0
              ? {
                  ...p,
                  gateIssues: p.gateIssues.map((i) =>
                    i.includes("파싱 실패")
                      ? `${i} [finish=length: 출력 예산 절단]`
                      : i,
                  ),
                }
              : p;
          let call = await streamWithTransportRetry(buildPrompt(null));
          callResults.push(call);
          await recordGenerationCost(0, call);
          const formatCounts = { blankCount, markerCount, answerCount };
          let parsedMd: MdLaneParsed = withTruncationHint(
            lunaLane
              ? lunaParseAndGate(call.text)
              : laneCtx && mdLane
                ? mdLane.parseAndGate(call.text, laneCtx)
                : parseAndGate(
                    subType,
                    call.text,
                    passage.content,
                    teacherPoints,
                    formatCounts,
                    { grammarKillerV2, requestedDifficulty: mdDifficulty },
                  ),
            call,
          );
          let firstGateIssues: string[] | null = null;
          // 재생성 적격: 어법(기존 정책 유지) + 다중 빈칸(위 정책 주석 근거).
          // 26-07-27 정책 개정(사용자 확정 · 세미나 실측 근거): 단일 빈칸도
          // 재생성 1회를 허용한다. 종전 "단일 빈칸 = 원큐" 정책의 근거는
          // "48h 실패율 7%" 였으나, 7/26 오프라인 세미나 실사용 1시간
          // (14개 학원·208건)에서 빈칸 실패율이 **14%**(10/74)로 근거치의 2배가
          // 나왔다. 같은 시간 어법은 31건 전건 성공(0%) — 유일한 구조 차이가
          // 재생성 유무였다. 반려 사유 실측도 재생성으로 흡수될 계통이 다수였다
          // (오답해설 1개 누락 3건 · 선지/정답/해설 형식 붕괴 1건).
          // 비용은 반려 시에만 콜 1회 추가이며 예산 가드(budgetMs>30s)가 그대로 적용된다.
          const retryEligible = mdLane
            ? mdLane.retryEligible
            : subType === "GRAMMAR_ERROR" || subType === "BLANK_INFERENCE";
          if (
            retryEligible &&
            parsedMd.gateIssues.length > 0 &&
            budgetMs() > 30_000
          ) {
            firstGateIssues = parsedMd.gateIssues;
            console.error(
              "[md-stream] gate rejected — retry",
              parsedMd.gateIssues,
            );
            emit({
              t: "retry",
              reason: parsedMd.gateIssues.join(", ").slice(0, 200),
            });
            const retryCall = await streamWithTransportRetry(
              buildPrompt(parsedMd.gateIssues.join(", ")),
            );
            callResults.push(retryCall);
            await recordGenerationCost(1, retryCall);
            const retryParsed: MdLaneParsed = withTruncationHint(
              lunaLane
                ? lunaParseAndGate(retryCall.text)
                : laneCtx && mdLane
                  ? mdLane.parseAndGate(retryCall.text, laneCtx)
                  : parseAndGate(
                      subType,
                      retryCall.text,
                      passage.content,
                      teacherPoints,
                      formatCounts,
                      { grammarKillerV2, requestedDifficulty: mdDifficulty },
                    ),
              retryCall,
            );
            // 재생성이 더 나빠지지 않았을 때만 채택 — 남은 반려는 아래 공통
            // 반려 블록이 실패·환불 처리한다(재재생성 없음).
            if (retryParsed.gateIssues.length <= parsedMd.gateIssues.length) {
              call = retryCall;
              parsedMd = retryParsed;
            }
          }
          // 반려 확정 = 즉시 실패·환불(단일 빈칸은 원큐, 어법·다중 빈칸은
          // 재생성 1회 소진 후).
          // 깨진 문항은 저장하지 않고, 재시도는 사용자의 다음 클릭이다(양치기).
          // 반려 사유 원문은 지문 조각을 포함할 수 있어 사용자 표면에는 내지
          // 않되, 실패 계통 추적을 위해 잡 result 에 남긴다(FAILED 잡의 result
          // 는 UI 미소비 — 콘솔 휘발로 포렌식이 막혔던 구멍의 봉합).
          if (parsedMd.gateIssues.length > 0) {
            console.error(
              "[md-stream] integrity gate rejected",
              parsedMd.gateIssues,
            );
            await prisma.workbenchAiJob
              .update({
                where: { id: job.id },
                data: {
                  result: {
                    mdStream: true,
                    lunaLane,
                    grammarKillerV2,
                    // 형식 메타(26-07-23 스펙 v1) — 실패 계통을 형식별로 추적.
                    mdFormat: (laneCtx && mdLane
                      ? mdLane.mdFormat(laneCtx)
                      : subType === "BLANK_INFERENCE"
                        ? { blankCount }
                        : { markerCount, answerCount }) as Prisma.InputJsonObject,
                    gateIssues: parsedMd.gateIssues.map((i) => i.slice(0, 300)),
                    ...(firstGateIssues
                      ? {
                          firstGateIssues: firstGateIssues.map((i) =>
                            i.slice(0, 300),
                          ),
                        }
                      : {}),
                    // 반려된 모델 원본 출력(선두 8k) — 26-07-26 실사용 반려
                    // ("어휘쌍 3개 (5개 필요)") 조사에서 드러난 포렌식 공백의
                    // 봉합이다. 이게 없으면 "모델이 형식을 어겼나 / 파서가 못
                    // 읽었나"를 구분할 수 없어 원인 규명이 추측이 된다.
                    // FAILED 잡의 result 는 UI 미소비 — 사용자 표면 노출 없음.
                    mdRawText: call.text.slice(0, 8000),
                    mdRawLength: call.text.length,
                    // O223 A축: 콜별 finish_reason — length 면 예산 절단 계통.
                    // errorChunk 는 미드스트림 에러(레이트리밋·모더레이션 등)가
                    // EMPTY_BODY/절단으로 위장되던 계통의 원인 텍스트 보존.
                    finishReasons: callResults.map((c) => c.finishReason),
                    errorChunks: callResults.map((c) => c.errorChunk),
                  },
                },
              })
              .catch(() => undefined);
            throw new Error(
              "생성물이 무결성 검사에서 반려되어 저장하지 않았어요. 크레딧은 환불되었습니다. 한 번 더 생성해 주세요.",
            );
          }

          // ── 어댑터 → 프로덕션 후처리 → 검증(기록만) → 셔플 ────────────────
          // 신형 유형은 레인이 어댑팅한다. 정본 경로는 MdAnyQuestion 유니언으로
          // 좁혀 기존 분기를 그대로 태운다(캐스트는 타입 단언이라 런타임 무영향).
          const legacyQuestion = parsedMd.question as MdAnyQuestion;
          const adapt =
            laneCtx && mdLane
              ? mdLane.adapt(parsedMd, laneCtx)
              : legacyQuestion.kind === "blank"
              ? adaptMdBlankToAiQuestion(
                  legacyQuestion,
                  passage.content,
                  effectiveDifficulty,
                  blankDoubleNegative
                    ? "DOUBLE_NEGATIVE"
                    : blankParaphrase
                      ? "PARAPHRASE"
                      : "SOURCE_EXACT",
                )
              : legacyQuestion.kind === "multiBlank"
                ? adaptMdMultiBlankToAiQuestion(
                    legacyQuestion,
                    passage.content,
                    effectiveDifficulty,
                    // DN 은 단일 빈칸 전용(리졸버 강제) — 두 모드만 존재한다.
                    blankParaphrase ? "PARAPHRASE" : "SOURCE_EXACT",
                  )
                : adaptMdGrammarToAiQuestion(
                    legacyQuestion,
                    passage.content,
                    effectiveDifficulty,
                  );
          if (!adapt.ok || !adapt.aiQuestion) {
            throw new Error(`생성 결과 변환 실패: ${adapt.error ?? "unknown"}`);
          }
          const pp = postProcessQuestion(
            subType,
            passage.content,
            adapt.aiQuestion,
          );
          if (!pp.success || !pp.data) {
            throw new Error(`후처리 실패: ${pp.error ?? "unknown"}`);
          }
          const mapped: Record<string, unknown> = {
            ...(pp.data as Record<string, unknown>),
            _typeId: subType,
            _typeLabel: TYPE_LABELS[subType] || subType,
            _generationPlan: effectiveGenerationPlan,
            difficulty: effectiveDifficulty,
          };
          const finalQuestion = shuffleQuestionOptionsForDiversity(
            mapped,
            subType,
          );
          const qualityIssues = validateQuestionQuality({
            typeId: subType,
            question: finalQuestion,
            passage: passage.content,
            requestedDifficulty: effectiveDifficulty,
            // 26-07-23 스펙 v1: 5·1 하드코딩 제거 — resolved 실값으로 검증한다
            // (기본 5·1이면 종전과 동일 값). 다중 빈칸은 blankCount·paraphrase
            // 실값을 넘겨 멀티 검증기 라우팅·모드 판정을 정확히 태운다(단일
            // 빈칸은 종전대로 미주입 — 기존 기록 동작 무회귀).
            ...(laneCtx && mdLane
              ? mdLane.qualityArgs(laneCtx)
              : subType === "GRAMMAR_ERROR"
                ? { grammarMarkerCount: markerCount, grammarAnswerCount: answerCount }
                : blankCount >= 2
                  ? {
                      blankInferenceBlankCount: blankCount,
                      blankInferenceParaphraseAnswer: blankParaphrase,
                    }
                  : {}),
          });
          const tags = mergeQuestionGenerationPlanTag(
            [],
            effectiveGenerationPlan,
          );
          const questionForDisplay: Record<string, unknown> = {
            ...finalQuestion,
            _generationPlan: effectiveGenerationPlan,
            tags,
          };

          // ── 저장 → 원장 → 잡 완료 (fast 규약) ─────────────────────────────
          const createdQuestionIds = await saveGeneratedQuestionsForJob({
            academyId: job.academyId,
            passageId: passage.id,
            questions: [questionForDisplay],
            generationPlan: effectiveGenerationPlan,
            skipPassageEligibilityCheck: true,
          });
          const completedAt = new Date();
          const debugTiming = {
            queueWaitMs: 0,
            creditMs: 0,
            planningMs: 0,
            generationAttempts: callResults.length,
            generationMs: callResults.reduce((a, c) => a + c.durationMs, 0),
            persistenceMs: 0,
            totalRunMs: Date.now() - requestStartedAt,
          };
          await prisma.workbenchAiJob.update({
            where: { id: job.id },
            data: {
              status: "COMPLETED",
              successCount: 1,
              failedCount: 0,
              resultCount: 1,
              result: JSON.parse(
                JSON.stringify({
                  passageId: passage.id,
                  questions: [questionForDisplay],
                  questionIds: createdQuestionIds,
                  rationale: "",
                  generationPlan: effectiveGenerationPlan,
                  debugTiming,
                  fastPath: true,
                  mdStream: true,
                  lunaLane,
                  grammarKillerV2,
                  // 형식 메타(26-07-23 스펙 v1) — 신형식(다중 빈칸·어법 비표준)
                  // 산출물의 형식별 계측·포렌식용.
                  mdFormat:
                    laneCtx && mdLane
                      ? mdLane.mdFormat(laneCtx)
                      : subType === "BLANK_INFERENCE"
                        ? { blankCount }
                        : { markerCount, answerCount },
                  mdCorrections: parsedMd.corrections,
                  // 레인이 "설계상 예상된" 코드를 걸러낼 수 있다(미구현이면 전량 기록).
                  qualityIssues: (() => {
                    const codes = qualityIssues
                      .filter((issue) => issue.severity === "error")
                      .map((issue) => issue.code);
                    return laneCtx && mdLane?.filterQualityIssues
                      ? mdLane.filterQualityIssues(codes, laneCtx)
                      : codes;
                  })(),
                }),
              ),
              completedAt,
            },
          });
          emit({
            t: "done",
            jobId: job.id,
            status: "COMPLETED",
            questions: [questionForDisplay],
            questionIds: createdQuestionIds,
            generationPlan: effectiveGenerationPlan,
            creditsRemaining: credit.balanceAfter,
            createdAt: job.createdAt.toISOString(),
            completedAt: completedAt.toISOString(),
            debugTiming,
          });
          finish();
        } catch (err) {
          // 내부 계통 표식(EMPTY_BODY:)은 사용자 표면에 내지 않는다 — 재시도까지
          // 소진하고 도달한 경우이므로 일시 장애 문구로 흡수시킨다.
          const rawMessage = (
            err instanceof Error ? err.message : "Question generation failed."
          ).replace(
            /^EMPTY_BODY:\s*/,
            "일시적인 AI 서비스 문제로 생성에 실패했어요(빈 응답). ",
          );
          // 내부 오류 원문(스택·업스트림 상세)은 서버 로그에만 — 사용자 표면·DB 는
          // fast 와 동일하게 새니타이즈한다.
          console.error("[md-stream] generation failed", rawMessage);
          const message = toUserFacingQuestionGenerationError(rawMessage);
          if (err instanceof InsufficientCreditsError) {
            await prisma.workbenchAiJob
              .update({
                where: { id: job.id },
                data: {
                  status: "FAILED",
                  failedCount: 1,
                  errorMessage: `Insufficient credits: have ${err.currentBalance}, need ${err.requiredCredits}`,
                  completedAt: new Date(),
                },
              })
              .catch(() => undefined);
            emit({ t: "error", message: "Insufficient credits" });
            finish();
            return;
          }
          if (creditTxId) {
            await refundCredits(
              job.academyId,
              operationType,
              creditTxId,
              "md-stream question generation failed",
              creditCost,
            ).catch((refundErr) => {
              console.error("[md-stream] refund failed", refundErr);
            });
          }
          await prisma.workbenchAiJob
            .update({
              where: { id: job.id },
              data: {
                status: "FAILED",
                failedCount: 1,
                errorMessage: message.slice(0, 500),
                completedAt: new Date(),
              },
            })
            .catch(() => undefined);
          emit({ t: "error", message });
          finish();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // 프록시(nginx 등) 응답 버퍼링 방지 — 델타가 실시간으로 흘러야 한다.
      "X-Accel-Buffering": "no",
    },
  });
}
