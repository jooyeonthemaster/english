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
import { buildBlankPointGuidance } from "@/lib/blank-point-catalog";
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
  buildMdBlankPrompt,
  buildMdGrammarPrompt,
  type MdDifficulty,
} from "@/lib/md-qgen/prompts";
import {
  autoSnapBlankExpression,
  autoSnapGrammarMarks,
  gateMdQuestion,
  normalizeWs,
  parseMdBlank,
  parseMdGrammar,
  type MdQuestion,
} from "@/lib/md-qgen/parser";
import {
  adaptMdBlankToAiQuestion,
  adaptMdGrammarToAiQuestion,
} from "@/lib/md-qgen/adapter";
import { TYPE_LABELS } from "@/app/api/ai/generate-questions-auto/_lib/constants";

// ============================================================================
// md-stream — 빈칸·어법 전용 "마크다운 원큐 + SSE 스트리밍" 생성 라우트.
// (26-07-21 심플 스택 1·2단계) 기존 fast 라우트는 바이트 무변경으로 두고, 적격
// 요청(빈칸 단일 / 어법 5마커·1정답)만 클라이언트가 이 라우트로 보낸다. 교사
// 지정 포인트(포인트 짚어주기)도 이 레인이 처리한다(26-07-23 — 프롬프트 강제
// 공유 블록 + 결정론 준수 게이트). 부적격·오류 시 클라이언트는 fast 로 폴백한다
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

const MD_STREAM_SUBTYPES = new Set(["BLANK_INFERENCE", "GRAMMAR_ERROR"]);

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

/** OpenRouter 직접 스트림 1콜 — 사고/본문 델타를 emit 으로 흘리고 최종 usage 를 회수. */
async function streamOnce(args: {
  prompt: string;
  modelId: string;
  timeoutMs: number;
  emit: (payload: Record<string, unknown>) => void;
}): Promise<StreamCallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");
  const startedAt = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.modelId,
      messages: [{ role: "user", content: args.prompt }],
      // 사고+출력이 상한을 공유한다 — 6k 절단 실측(O208 계열) 후 14k.
      max_tokens: 14_000,
      stream: true,
      usage: { include: true },
      reasoning: { enabled: true, effort: "high", exclude: false },
    }),
    signal: AbortSignal.timeout(Math.max(10_000, args.timeoutMs)),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`generation upstream ${res.status}: ${detail.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let reasoningChars = 0;
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
        const delta = j.choices?.[0]?.delta ?? {};
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
          args.emit({ t: "c", d: sanitizeAiModelDisclosureText(contentDelta) });
        }
        if (j.usage) usage = j.usage;
      } catch {
        /* partial SSE line */
      }
    }
  }
  if (!text.trim()) {
    throw new Error("모델이 본문 출력을 내지 않았습니다.");
  }
  return {
    text,
    reasoningChars,
    costUsd:
      typeof usage?.cost === "number" && usage.cost > 0 ? usage.cost : null,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    durationMs: Date.now() - startedAt,
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
 * 여야 한다. 어법: 지정 표현마다 밑줄 5개 중 하나에 포함돼야 한다(원형·표시형
 * 모두 허용). 위반은 무결성 게이트와 동일 경로 — 어법은 1회 재생성 피드백으로
 * 전달되고, 빈칸은 원큐 규약대로 실패·환불된다.
 */
function teacherPointComplianceIssues(
  q: MdQuestion,
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
): { question: MdQuestion; gateIssues: string[]; corrections: string[] } {
  if (subType === "BLANK_INFERENCE") {
    let q = parseMdBlank(text);
    // 0원 자동 보정(어법 스냅의 빈칸 대칭) — 반려 주계통 "빈칸원문 축자 부재"를
    // 보수 가드 하에 지문 축자로 교정한다. 실패하면 그대로 게이트가 반려.
    const snapped = autoSnapBlankExpression(q, passage);
    q = snapped.question;
    return {
      question: q,
      gateIssues: [
        ...gateMdQuestion(q, passage),
        ...teacherPointComplianceIssues(q, teacherPoints),
      ],
      corrections: snapped.corrections,
    };
  }
  let q = parseMdGrammar(text);
  const snapped = autoSnapGrammarMarks(q, passage);
  q = snapped.question;
  return {
    question: q,
    gateIssues: [
      ...gateMdQuestion(q, passage),
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
  // 26-07-23 교사 포인트 md 승차: "포인트 짚어주기" 생성도 md 스트리밍 레인을
  // 탄다(기존엔 fast 로 보내 스트리밍이 없었음 — 실사용 지적). 포인트는 아래에서
  // fast 와 동일 계약(클램프+축자 필터)으로 읽어 프롬프트 강제 + 결정론 준수
  // 게이트로 집행한다.
  // 부정-부정(DOUBLE_NEGATIVE) 공예는 md 프롬프트에 미탑재 — 설정 계약 보존을
  // 위해 fast(전용 공예 보유)로 보낸다.
  const mdEligible =
    (subType === "BLANK_INFERENCE" && blankCount === 1 && !blankDoubleNegative) ||
    (subType === "GRAMMAR_ERROR" && markerCount === 5 && answerCount === 1);
  if (!mdEligible) {
    return NextResponse.json(
      { error: "md-stream ineligible settings", code: "MD_STREAM_INELIGIBLE" },
      { status: 400 },
    );
  }

  const effectiveGenerationPlan = resolveEffectiveGenerationPlan(
    config.generationPlan,
  );
  // 26-07-22 프리미엄 md 승차(O213 벤치 근거): 빈칸·어법 PREMIUM 도 동일한 md
  // 원큐 구조로 처리한다 — 차이는 모델뿐(아래 modelId 플랜 분기). 이원 티어
  // 복귀(QUESTION_GENERATION_SINGLE_TIER=off) 전에는 resolveEffectiveGenerationPlan
  // 이 STANDARD 로 클램프하므로 현행 동작 무변경.

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

  const operationType: OperationType = "QUESTION_GEN_SINGLE";
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

  // 플랜별 모델 분기 — 구조(프롬프트·파서·게이트·원큐/어법 재생성 정책)는 동일,
  // 모델만 다르다. PREMIUM 은 env PREMIUM_QGEN_MODEL_ID(예: gemini-3.6-flash)로
  // 지정하며 미설정 시 코드 기본(flash3)이라 사실상 STANDARD 와 동일 동작.
  const modelId =
    effectiveGenerationPlan === "PREMIUM"
      ? ATLAS_PREMIUM_QGEN_MODEL_ID
      : ATLAS_STANDARD_QGEN_MODEL_ID;
  const mdDifficulty: MdDifficulty =
    effectiveDifficulty === "BASIC" || effectiveDifficulty === "INTERMEDIATE"
      ? effectiveDifficulty
      : "KILLER";

  // 교사 지정 포인트(포인트 짚어주기) — fast 동일 계약으로 읽는다. 있으면
  // 프롬프트 강제 블록 + 결정론 준수 게이트가 함께 작동한다.
  const teacherPoints = readMdTeacherPoints(
    subType,
    config.questionTypeSettings,
    passage.content,
  );

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
        if (Array.isArray(record.markedExpressions)) {
          const err = (record.markedExpressions as Array<Record<string, unknown>>).find(
            (m) => m?.isError === true,
          );
          if (typeof err?.expression === "string" && err.expression.trim()) {
            targets.push(err.expression.trim().slice(0, 90));
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
      subType === "BLANK_INFERENCE"
        ? buildMdBlankPrompt(passage.content, "full", mdDifficulty)
        : buildMdGrammarPrompt(passage.content, "full", mdDifficulty);
    const extras: string[] = [];
    // ── 유형 세부 설정 블록(26-07-23) — fast 와 같은 계약을 md 프롬프트로 집행 ──
    if (subType === "BLANK_INFERENCE") {
      if (!blankParaphrase) {
        extras.push(
          `## 정답 형식 (필수 — 위의 '추상 패러프레이즈' 지시보다 우선한다)\n- '빈칸 변형' 미사용 설정이다: 정답 선지는 빈칸원문을 **한 글자도 바꾸지 말고 그대로** 써라.\n- 오답 4개는 정답과 같은 문법 형식·길이·추상 층위로 설계해, 원문 축자 정답이 형식만으로 표나지 않게 하라. 오답 기제 4종 규칙은 그대로 적용한다.`,
        );
      }
      if (blankGranularity !== "auto") {
        const label =
          blankGranularity === "word"
            ? "단어"
            : blankGranularity === "clause"
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
    } else if (grammarPointFocus) {
      const guidance = buildGrammarPointGuidance({ pointFocus: true });
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
    if (feedback) {
      extras.push(
        `[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${feedback}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라.`,
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

          // ── 생성 정책 (26-07-22 사용자 확정): 빈칸 = 원큐(스냅 보정이 주계통
          // 커버, 48h 실패율 7%) / 어법 = 게이트 반려 시 1회 자동 재생성(반려가
          // 품질이 아니라 기계 파손이고 콜당 ~10~20% 확률 꼬리라, 실패 카드
          // 대신 재생성으로 흡수 — 48h 실패율 21% 근거).
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
                durationMs: result.durationMs,
              },
            });
          };
          let call = await streamOnce({
            prompt: buildPrompt(null),
            modelId,
            timeoutMs: Math.min(240_000, budgetMs()),
            emit,
          });
          callResults.push(call);
          await recordGenerationCost(0, call);
          let parsedMd = parseAndGate(subType, call.text, passage.content, teacherPoints);
          let firstGateIssues: string[] | null = null;
          if (
            subType === "GRAMMAR_ERROR" &&
            parsedMd.gateIssues.length > 0 &&
            budgetMs() > 30_000
          ) {
            firstGateIssues = parsedMd.gateIssues;
            console.error(
              "[md-stream] gate rejected — grammar retry",
              parsedMd.gateIssues,
            );
            emit({
              t: "retry",
              reason: parsedMd.gateIssues.join(", ").slice(0, 200),
            });
            const retryCall = await streamOnce({
              prompt: buildPrompt(parsedMd.gateIssues.join(", ")),
              modelId,
              timeoutMs: Math.min(240_000, budgetMs()),
              emit,
            });
            callResults.push(retryCall);
            await recordGenerationCost(1, retryCall);
            const retryParsed = parseAndGate(
              subType,
              retryCall.text,
              passage.content,
              teacherPoints,
            );
            // 재생성이 더 나빠지지 않았을 때만 채택 — 남은 반려는 아래 공통
            // 반려 블록이 실패·환불 처리한다(재재생성 없음).
            if (retryParsed.gateIssues.length <= parsedMd.gateIssues.length) {
              call = retryCall;
              parsedMd = retryParsed;
            }
          }
          // 반려 확정 = 즉시 실패·환불(빈칸은 원큐, 어법은 재생성 1회 소진 후).
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
                    gateIssues: parsedMd.gateIssues.map((i) => i.slice(0, 300)),
                    ...(firstGateIssues
                      ? {
                          firstGateIssues: firstGateIssues.map((i) =>
                            i.slice(0, 300),
                          ),
                        }
                      : {}),
                  },
                },
              })
              .catch(() => undefined);
            throw new Error(
              "생성물이 무결성 검사에서 반려되어 저장하지 않았어요. 크레딧은 환불되었습니다. 한 번 더 생성해 주세요.",
            );
          }

          // ── 어댑터 → 프로덕션 후처리 → 검증(기록만) → 셔플 ────────────────
          const adapt =
            parsedMd.question.kind === "blank"
              ? adaptMdBlankToAiQuestion(
                  parsedMd.question,
                  passage.content,
                  effectiveDifficulty,
                  blankParaphrase ? "PARAPHRASE" : "SOURCE_EXACT",
                )
              : adaptMdGrammarToAiQuestion(
                  parsedMd.question,
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
            ...(subType === "GRAMMAR_ERROR"
              ? { grammarMarkerCount: 5, grammarAnswerCount: 1 }
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
                  mdCorrections: parsedMd.corrections,
                  qualityIssues: qualityIssues
                    .filter((issue) => issue.severity === "error")
                    .map((issue) => issue.code),
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
          const rawMessage =
            err instanceof Error ? err.message : "Question generation failed.";
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
