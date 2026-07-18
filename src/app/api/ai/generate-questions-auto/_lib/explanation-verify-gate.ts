// ============================================================================
// 해설 사실검증 게이트 (E-gate, 캠페인 20260716 X3 — 연구노트 O153/O155/O156)
// ============================================================================
// Phase A 독립 평가 실측: 수락 문항의 지배적 치명 결함은 V4(해설 사실성) —
// 정답은 맞는데 해설이 실제 문장 구조와 다른 주장을 한다(명사 while 을 '접속사
// while'로 해설, 함정 인과 반전, '수술어'류 비단어, 지문에 없는 한정 첨가 등).
// flash 검증기는 재현율 64%로 부족(O155). pro 검증 → flash 표적수리 → pro 재검증
// (X3)은 수락 문항 V4 를 24%→12.5%(빈칸 0%)로 줄였다(O156).
//
//   - 검증·수리 대상은 해설 필드(explanation/wrongOptionExplanations/keyPoints)뿐
//     — 문항 본체(선지·정답·밑줄)는 절대 바꾸지 않는다.
//   - 대상 유형(W2-F 확장): 어법·빈칸 + 선택형(TITLE·TOPIC·MAIN_IDEA·
//     TOPIC_MAIN_IDEA·IMPLIED_MEANING·CONTENT_MATCH). W2-E 통합 라우팅의 PREMIUM
//     표와 동일 집합이라 PREMIUM=enforce 로 자연 정합. 구조형·서술형은 기본 제외
//     (무결성 게이트가 담당). env EXPLANATION_VERIFY_GATE_TYPES 로 오버라이드
//     (콤마 구분, "ALL"=전 유형).
//   - 검증기/수리기 모델(W2-F): 기본 x-ai/grok-4.5(실측 O184: gemini-3.1-pro 적발
//     0/12 vs grok@high 10/12·오경보 0). grok 콜에는 reasoning=high 를 콜 단위로
//     명시 전달한다(범용 env 미의존). env EXPLANATION_VERIFY_MODEL_ID /
//     EXPLANATION_VERIFY_REPAIR_MODEL_ID / EXPLANATION_VERIFY_REASONING_EFFORT.
//   - 비용: 검증 콜 회당 ~44원(선택형 확장 포함), 결함 시 수리+재검증 추가.
//     콜당 maxTokens 는 상한 관리를 위해 고정(verify 6k·repair 4k), 추가 콜 없음.
//   - never-fail 보존: 게이트 자체 장애(타임아웃 등)는 무판정 통과. scarce/salvage
//     사다리에서는 호출자 측에서 생략.
//   - 모드(env EXPLANATION_VERIFY_GATE_MODE): "off"(기본, 기존 바이트 동일) |
//     "warn"(재검증 실패 시 경고 부착·수리본은 PASS 시에만 채택) |
//     "enforce"(strict 레인에서 재검증 실패를 blocking 반려).
// ============================================================================

import { z } from "zod";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import { isQuestionGenerationAssignmentBudgetError } from "@/lib/atlas-production-assignment-fetch-boundary";
import { QUESTION_GENERATION_RESEARCH_STAGES } from "@/lib/question-generation-research-runtime";

const EXPLANATION_VERIFY_SCHEMA = z.object({
  claims: z
    .array(
      z.object({
        quote: z.string().describe("해설에서 인용한 검증 대상 주장(원문 그대로)"),
        kind: z.enum([
          "GRAMMAR_ANALYSIS",
          "TRAP_CAUSALITY",
          "TERMINOLOGY",
          "PASSAGE_ATTRIBUTION",
          "KOREAN_WELLFORMEDNESS",
        ]),
        verdict: z.enum(["OK", "WRONG", "UNSUPPORTED"]),
        evidence: z
          .string()
          .describe("실제 문장/지문 근거 — WRONG/UNSUPPORTED 면 무엇이 실제인지"),
      }),
    )
    .min(1),
  koreanTextIssues: z
    .array(z.string())
    .describe("비단어·손상된 용어 풀이·어투 혼용 등 한국어 표면 결함"),
  overallVerdict: z.enum(["PASS", "FAIL"]),
});

const EXPLANATION_REPAIR_SCHEMA = z.object({
  explanation: z.string(),
  wrongOptionExplanations: z.array(
    z.object({ label: z.string(), explanation: z.string() }),
  ),
  keyPoints: z.array(z.string()).length(3),
});

export type ExplanationVerifyGateMode = "off" | "warn" | "enforce";

function parseMode(raw: string | undefined): ExplanationVerifyGateMode | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === "off" || v === "warn" || v === "enforce") return v;
  return undefined;
}

/**
 * 플랜별 모드 결정 (Phase C 확증, 연구노트 O160):
 * - PREMIUM 기본 enforce — 사다리+솔버+E-gate 구성의 출하분 F 0/11 (V4 0) vs
 *   현행 사다리 단독 F 5/18. 반려는 outer retry/salvage 가 흡수(never-fail 불변).
 * - STANDARD 기본 warn — 저가 티어의 수율 보존. 수리본이 재검증을 통과하면 채택,
 *   실패 시 경고만 부착(sentinel 실측: 반려 0, 해설 수리 채택 다수).
 * - env 로 강제 가능: EXPLANATION_VERIFY_GATE_MODE(전역) >
 *   EXPLANATION_VERIFY_GATE_MODE_PREMIUM / _STANDARD(플랜별) > 위 기본값.
 */
export function getExplanationVerifyGateMode(
  generationPlan?: string,
): ExplanationVerifyGateMode {
  const global = parseMode(process.env.EXPLANATION_VERIFY_GATE_MODE);
  if (global) return global;
  if (generationPlan === "PREMIUM") {
    return parseMode(process.env.EXPLANATION_VERIFY_GATE_MODE_PREMIUM) ?? "enforce";
  }
  if (generationPlan === "STANDARD") {
    return parseMode(process.env.EXPLANATION_VERIFY_GATE_MODE_STANDARD) ?? "warn";
  }
  return "off";
}

// 검증기·수리기 기본 모델 (W2-F, 실측 O184): gemini-3.1-pro 는 해설 결함을 거의
// 못 잡았고(적발 0/12), x-ai/grok-4.5 를 reasoning=high 로 돌리면 10/12 적발·오경보
// 0. env 로 개별 오버라이드(EXPLANATION_VERIFY_MODEL_ID / _REPAIR_MODEL_ID).
const DEFAULT_EXPLANATION_VERIFY_MODEL_ID = "x-ai/grok-4.5";

function resolveVerifierModelId(): string {
  const raw = process.env.EXPLANATION_VERIFY_MODEL_ID?.trim();
  return raw || DEFAULT_EXPLANATION_VERIFY_MODEL_ID;
}

function resolveRepairModelId(): string {
  const raw = process.env.EXPLANATION_VERIFY_REPAIR_MODEL_ID?.trim();
  return raw || DEFAULT_EXPLANATION_VERIFY_MODEL_ID;
}

// grok 검증·수리 콜에 실을 reasoning 강도 — O184 는 high 에서만 결함을 적발했다.
// 범용 env(OPENROUTER_REASONING_EFFORT)에 의존하지 않고 콜 단위로 명시 전달한다.
// env EXPLANATION_VERIFY_REASONING_EFFORT 로 조정(기본 high).
function resolveVerifierReasoningEffort(): string {
  return process.env.EXPLANATION_VERIFY_REASONING_EFFORT?.trim() || "high";
}

// 인라인 예산 가드 최소치 — verify→repair→재검증(X3, grok@high)은 회당 수십 초라,
// 남은 시간예산이 얇으면 검증/수리 콜이 abort→catch(fail-open) 되어 무판정 통과·
// 침묵 출하된다(O153 근인). 남은 예산이 이 값 미만이면 판정을 건너뛰고 호출자가
// SKIPPED_BUDGET 로 표시하게 한다. env EXPLANATION_VERIFY_MIN_BUDGET_MS 로 조정.
const DEFAULT_EXPLANATION_VERIFY_MIN_BUDGET_MS = 190_000;

function resolveMinBudgetMs(): number {
  const raw = process.env.EXPLANATION_VERIFY_MIN_BUDGET_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_EXPLANATION_VERIFY_MIN_BUDGET_MS;
}

// E-gate 대상 유형 기본 집합 (W2-F): 어법·빈칸 + 선택형(대의파악 계열·함축·
// 내용일치). W2-E resolveUnifiedGenerationPlan 의 PREMIUM 표와 동일 집합이라 통합
// 라우팅(유형→플랜)과 자연 정합한다(전부 PREMIUM=enforce 레인). 구조형·서술형은
// 무결성 게이트가 담당하므로 기본 제외.
const DEFAULT_EXPLANATION_VERIFY_GATE_TYPES: ReadonlySet<string> = new Set([
  "GRAMMAR_ERROR",
  "BLANK_INFERENCE",
  "TITLE",
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "IMPLIED_MEANING",
  "CONTENT_MATCH",
]);

/**
 * env EXPLANATION_VERIFY_GATE_TYPES 오버라이드 파싱. "ALL"(대소문자 무관)은 전
 * 유형 대상을 뜻하는 sentinel null 로 반환하고, 콤마 구분 목록은 대문자 정규화
 * Set 으로, 미설정/빈값/유효 항목 0개는 기본 집합으로 폴백한다.
 */
function resolveExplanationVerifyGateTypes(): ReadonlySet<string> | null {
  const raw = process.env.EXPLANATION_VERIFY_GATE_TYPES?.trim();
  if (!raw) return DEFAULT_EXPLANATION_VERIFY_GATE_TYPES;
  if (raw.toUpperCase() === "ALL") return null;
  const parsed = raw
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);
  return parsed.length > 0
    ? new Set(parsed)
    : DEFAULT_EXPLANATION_VERIFY_GATE_TYPES;
}

/**
 * 이 subType 이 E-gate(해설 사실검증) 대상인지 판정하는 단일 소스. run-question-
 * generation.ts 의 훅 조건과 게이트 내부 가드가 모두 이 함수에 위임한다(대상 판정
 * 중복 금지). null/undefined/"" 는 비대상(false).
 */
export function isExplanationVerifyGateTargetType(
  subType: string | null | undefined,
): boolean {
  if (!subType) return false;
  const types = resolveExplanationVerifyGateTypes();
  return types === null || types.has(subType);
}

export interface ExplanationVerifyUsageResult {
  usage?: unknown;
  provider: string;
  modelId: string;
  attempts: number;
  durationMs: number;
}

export interface RunExplanationVerifyGateInput {
  /** 대상 판정은 isExplanationVerifyGateTargetType 이 수행(어법·빈칸 + 선택형, env 오버라이드). */
  subType: string;
  /** 플랜별 기본 모드 결정에 사용 (PREMIUM=enforce, STANDARD=warn). */
  generationPlan?: string;
  question: Record<string, unknown>;
  passage: string;
  researchParentCandidate?: Record<string, unknown>;
  deadlineAt?: number;
  onModelUsage?: (result: ExplanationVerifyUsageResult) => void;
}

export interface ExplanationVerifyIssue {
  severity: "error";
  code: "explanation-verify-failed";
  message: string;
}

export interface ExplanationVerifyGateResult {
  /** enforce 모드에서 재검증까지 실패한 경우에만 non-null. */
  issue: ExplanationVerifyIssue | null;
  /** 수리본이 재검증을 통과한 경우 해설 필드가 교체된 문항(원본은 불변). */
  updatedQuestion?: Record<string, unknown>;
  /** warn 모드에서 부착할 경고 메시지(재검증 실패 시). */
  warning?: string;
  /** 남은 시간예산이 최소치 미만이라 판정을 건너뛴 경우 true(호출자가 SKIPPED_BUDGET 표시). */
  skippedInsufficientBudget?: boolean;
}

function renderForVerifier(question: Record<string, unknown>): string {
  const passageField =
    (typeof question.passageWithMarkers === "string" && question.passageWithMarkers) ||
    (typeof question.passageWithBlank === "string" && question.passageWithBlank) ||
    "";
  const direction = typeof question.direction === "string" ? question.direction : "";
  const options = Array.isArray(question.options)
    ? (question.options as { label?: unknown; text?: unknown }[])
        .map((o) => `${String(o.label ?? "")} ${String(o.text ?? "")}`)
        .join("\n")
    : "";
  return `${passageField}\n\n${direction}\n${options}`;
}

function explanationBundle(question: Record<string, unknown>) {
  return {
    explanation: question.explanation,
    wrongOptionExplanations: question.wrongOptionExplanations,
    keyPoints: question.keyPoints,
  };
}

async function verifyOnce(
  input: RunExplanationVerifyGateInput,
  question: Record<string, unknown>,
  round: number,
): Promise<z.infer<typeof EXPLANATION_VERIFY_SCHEMA>> {
  const result = await generateQuestionObject({
    schema: EXPLANATION_VERIFY_SCHEMA,
    prompt: [
      "너는 해설 사실검증관이다. 아래 문항의 해설이 실제 영어 문장·지문과 일치하는지 주장 단위로 검증하라.",
      "각 주장을 실제 문장을 직접 파싱해 판정하고(해설의 단정을 믿지 마라), 함정 인과의 방향, 문법 용어의 정확성, 지문 인용·문장 귀속, 오답 해설과 실제 선지 내용의 대응, 한국어 비단어·손상 용어를 모두 본다.",
      "WRONG/UNSUPPORTED 가 하나라도 있거나 koreanTextIssues 가 있으면 overallVerdict=FAIL. 애매하면 FAIL(보수적).",
      `## 원지문\n${input.passage}`,
      `## 문항 (학생 노출 형태)\n${renderForVerifier(question)}`,
      `## 선언 정답\n${String(question.correctAnswer ?? "")}`,
      `## 검증 대상 해설\n${JSON.stringify(explanationBundle(question), null, 1)}`,
    ].join("\n\n"),
    generationPlan: "PREMIUM",
    modelId: resolveVerifierModelId(),
    // grok 은 high 추론에서만 결함을 적발(O184) — 콜 단위로 명시 전달(범용 env 미의존).
    reasoningEffort: resolveVerifierReasoningEffort(),
    logPrefix: `EXPL-VERIFY-R${round}`,
    maxTokens: 6_000,
    deadlineAt: input.deadlineAt,
    researchStage: {
      key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_SOLVER,
      purpose: "evaluation",
      derivationParentValue: input.researchParentCandidate,
    },
  });
  input.onModelUsage?.({
    usage: result.usage,
    provider: result.provider,
    modelId: result.modelId,
    attempts: result.attempts,
    durationMs: result.durationMs,
  });
  return result.object;
}

/**
 * 해설 사실검증 게이트: grok 검증 → (FAIL 시) grok 표적수리 → grok 재검증(모두
 * reasoning=high, env 로 모델·강도 오버라이드 가능). 게이트 자체 장애는 무판정
 * 통과(never-fail). 문항 본체는 절대 수정하지 않고 해설 필드만 교체한다.
 */
export async function runExplanationVerifyGate(
  input: RunExplanationVerifyGateInput,
): Promise<ExplanationVerifyGateResult> {
  const mode = getExplanationVerifyGateMode(input.generationPlan);
  if (mode === "off") return { issue: null };
  // 대상 유형 판정은 단일 소스(isExplanationVerifyGateTargetType)에 위임한다 —
  // 호출측 훅 조건과 여기 가드가 반드시 같은 집합을 봐야 한다(env 오버라이드 포함).
  if (!isExplanationVerifyGateTargetType(input.subType)) {
    return { issue: null };
  }
  if (typeof input.question.explanation !== "string" || !input.question.explanation) {
    return { issue: null };
  }
  // 인라인 예산 가드: 남은 시간예산이 최소치 미만이면 검증을 건너뛴다. 얇은 예산에서
  // verify/repair grok 콜이 abort→catch(fail-open) 되어 무판정 통과·침묵 출하되는 것을
  // 막고, 호출자가 SKIPPED_BUDGET 로 표시해 async 경로가 이어받게 한다(반려는 아님).
  if (
    input.deadlineAt !== undefined &&
    input.deadlineAt - Date.now() < resolveMinBudgetMs()
  ) {
    return { issue: null, skippedInsufficientBudget: true };
  }

  try {
    const first = await verifyOnce(input, input.question, 1);
    if (first.overallVerdict === "PASS") return { issue: null };

    const bad = first.claims.filter((c) => c.verdict !== "OK");
    // 수리 모델(W2-F): 기본 grok(DEFAULT_EXPLANATION_VERIFY_MODEL_ID). 과거 잔존
    // V4 의 근인이 "flash 가 자신이 오분석한 구조를 수리에서도 똑같이 오분석"이었고,
    // O184 에서 grok@high 가 그 결함을 적발했으므로 수리도 grok 로 올린다. env
    // EXPLANATION_VERIFY_REPAIR_MODEL_ID 로 오버라이드. modelId 오버라이드가 플랜
    // 모델 매핑을 대체하므로 generationPlan 은 timeout/배관용 PREMIUM 고정이며,
    // reasoning=high 는 grok 에만 실린다(gemini/claude 오버라이드 시 자동 무시).
    const repairModelId = resolveRepairModelId();
    const repair = await generateQuestionObject({
      schema: EXPLANATION_REPAIR_SCHEMA,
      prompt: [
        "너는 해설 교정 전문가다. 아래 문항의 문제 본체는 확정이다 — 해설 필드만 다시 쓴다.",
        `독립 검증에서 발견된 해설 결함:\n${JSON.stringify({ claims: bad, koreanTextIssues: first.koreanTextIssues }, null, 1)}`,
        "교정 원칙: ① 각 결함을 실제 문장 구조에 맞게 바로잡는다(스스로 다시 파싱해 확인). ② 해설 200~450자, 합니다체 통일, 4단 구조(근거/구조 → 판정 → 교정·정답 확정 → 함정 1문장). ③ wrongOptionExplanations 는 정답 제외 각 라벨의 실제 내용에 대응하는 합니다체 한 문장. ④ keyPoints 3개는 \"(라벨) 주제 — 근거\" 형식으로 이 문항에 실존하는 포인트만.",
        `## 원지문\n${input.passage}`,
        `## 문항\n${renderForVerifier(input.question)}`,
        `## 선언 정답\n${String(input.question.correctAnswer ?? "")}`,
        `## 현재 해설(결함 있음)\n${JSON.stringify(explanationBundle(input.question), null, 1)}`,
      ].join("\n\n"),
      generationPlan: "PREMIUM",
      modelId: repairModelId,
      reasoningEffort: resolveVerifierReasoningEffort(),
      logPrefix: "EXPL-VERIFY-FIX",
      maxTokens: 4_000,
      deadlineAt: input.deadlineAt,
      researchStage: {
        key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_CANDIDATE_REPAIR,
        purpose: "design",
        derivationParentValue: input.researchParentCandidate,
      },
    });
    input.onModelUsage?.({
      usage: repair.usage,
      provider: repair.provider,
      modelId: repair.modelId,
      attempts: repair.attempts,
      durationMs: repair.durationMs,
    });
    const repaired: Record<string, unknown> = {
      ...input.question,
      ...repair.object,
      _explanationRepaired: true,
    };

    const second = await verifyOnce(input, repaired, 2);
    if (second.overallVerdict === "PASS") {
      return { issue: null, updatedQuestion: repaired };
    }

    const summary = second.claims
      .filter((c) => c.verdict !== "OK")
      .slice(0, 2)
      .map((c) => `${c.kind}: ${c.quote.slice(0, 60)}`)
      .join(" | ");
    if (mode === "enforce") {
      return {
        issue: {
          severity: "error",
          code: "explanation-verify-failed",
          message: `해설 사실검증 재검증 실패 — ${summary || "결함 잔존"}`,
        },
      };
    }
    return {
      issue: null,
      warning: `해설 사실검증 실패(수리 후에도 잔존): ${summary || "결함 잔존"}`,
    };
  } catch (error) {
    if (isQuestionGenerationAssignmentBudgetError(error)) throw error;
    console.warn(
      `[EXPL-VERIFY] gate call failed; passing without verdict: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { issue: null };
  }
}
