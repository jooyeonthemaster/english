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
//   - 비용: 검증 콜(기본 pro-preview) 회당 ~$0.01-0.02, 결함 시 수리+재검증 추가.
//   - never-fail 보존: 게이트 자체 장애(타임아웃 등)는 무판정 통과. scarce/salvage
//     사다리에서는 호출자 측에서 생략.
//   - 모드(env EXPLANATION_VERIFY_GATE_MODE): "off"(기본, 기존 바이트 동일) |
//     "warn"(재검증 실패 시 경고 부착·수리본은 PASS 시에만 채택) |
//     "enforce"(strict 레인에서 재검증 실패를 blocking 반려).
// ============================================================================

import { z } from "zod";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import { isQuestionGenerationAssignmentBudgetError } from "@/lib/atlas-production-assignment-fetch-boundary";
import { ATLAS_PREMIUM_QGEN_MODEL_ID } from "@/lib/atlas-ai";
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

function resolveVerifierModelId(): string {
  const raw = process.env.EXPLANATION_VERIFY_MODEL_ID?.trim();
  return raw || ATLAS_PREMIUM_QGEN_MODEL_ID;
}

export interface ExplanationVerifyUsageResult {
  usage?: unknown;
  provider: string;
  modelId: string;
  attempts: number;
  durationMs: number;
}

export interface RunExplanationVerifyGateInput {
  subType: "GRAMMAR_ERROR" | "BLANK_INFERENCE" | string;
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
 * 해설 사실검증 게이트: pro 검증 → (FAIL 시) flash 표적수리 → pro 재검증.
 * 게이트 자체 장애는 무판정 통과(never-fail). 문항 본체는 절대 수정하지 않는다.
 */
export async function runExplanationVerifyGate(
  input: RunExplanationVerifyGateInput,
): Promise<ExplanationVerifyGateResult> {
  const mode = getExplanationVerifyGateMode(input.generationPlan);
  if (mode === "off") return { issue: null };
  if (input.subType !== "GRAMMAR_ERROR" && input.subType !== "BLANK_INFERENCE") {
    return { issue: null };
  }
  if (typeof input.question.explanation !== "string" || !input.question.explanation) {
    return { issue: null };
  }

  try {
    const first = await verifyOnce(input, input.question, 1);
    if (first.overallVerdict === "PASS") return { issue: null };

    const bad = first.claims.filter((c) => c.verdict !== "OK");
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
      generationPlan: "STANDARD",
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
