// ============================================================================
// KO 난도5 독립 솔버 게이트 (KO-DESIGN-SPEC §7 — needsSolverGate 유형 전용)
// ============================================================================
// KO_RD_APPLY·KO_LIT_BOGI 처럼 <보기> 적용 추론이 걸린 3점급 유형은 결정론
// 게이트만으로 단일정답성을 보증하기 어렵다. 품질검증 통과 후보를 "학생 시점"
// (지문+보기+발문+선지만 — 해설·정답 미제공)으로 독립 LLM 솔버에게 1회 풀려,
// 솔버 답 ≠ correctAnswer 면 ko-solver-mismatch(blocking)로 반려해 재시도를
// 유도한다. 통과해도 호출자가 '검수 권장'(_reviewRecommended) 플래그를 남긴다.
//
//   - 비용: 후보당 LLM 1회 — 반드시 meta.needsSolverGate 유형만 태울 것(호출자 게이트).
//   - strict 모드 전용: relaxed 폴백은 수율 보존을 위해 생략(호출자 판단).
//   - 솔버 호출 자체가 실패(타임아웃 등)하면 무판정 통과 — 이미 결정론 게이트를
//     통과한 후보이므로 게이트 장애가 생성 전체를 죽이지 않게 한다(우아한 강등).
// ============================================================================

import { z } from "zod";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import { QUESTION_GENERATION_RESEARCH_STAGES } from "@/lib/question-generation-research-runtime";
import type { KoQualityIssue, KoTypeModule } from "../registry/type-module";

const KO_SOLVER_SCHEMA = z.object({
  answer: z.enum(["①", "②", "③", "④", "⑤"]).describe("고른 정답 라벨"),
  reasoning: z
    .string()
    .describe("정답 결정 근거 2~4문장 (한국어, 지문/보기 구절 직접 인용 포함)"),
});

export interface KoSolverUsageResult {
  usage?: unknown;
  provider: string;
  modelId: string;
  attempts: number;
  durationMs: number;
}

export interface RunKoSolverGateInput {
  question: Record<string, unknown>;
  /** Exact provider-returned candidate that the rendered solver item derives from. */
  researchParentCandidate?: Record<string, unknown>;
  passage: string;
  mod: KoTypeModule;
  generationPlan: QuestionGenerationPlan;
  deadlineAt?: number;
  onModelUsage?: (result: KoSolverUsageResult) => void;
}

/** 학생 시점 프롬프트 — 렌더모델을 재사용해 마킹지문·보기·선지만 담는다. */
function buildKoSolverPrompt(input: RunKoSolverGateInput): string {
  const { question, passage, mod } = input;
  const model = mod.toRenderModel(question, { passage });

  const sections: string[] = [
    "당신은 대학수학능력시험 국어 영역에 응시한 최상위권 수험생입니다. 아래 문항을 지문(과 <보기>)의 문면 근거만으로 풀어 정답 라벨 하나를 고르십시오. 배경지식·추측에 기대지 마십시오.",
  ];

  if (model.passage?.parts.length) {
    sections.push(
      `## 지문\n${model.passage.parts
        .map((part) => `${part.label ? `${part.label}\n` : ""}${part.text}`)
        .join("\n\n")}`,
    );
  } else if (passage.trim()) {
    sections.push(`## 지문\n${passage.trim()}`);
  }

  if (model.bogi) {
    sections.push(`## 〈${model.bogi.label}〉\n${model.bogi.lines.join("\n")}`);
  }

  // 부정어 밑줄(__ __)은 솔버 입력에서는 평문으로 푼다 — 지문 마커 밑줄은 유지.
  sections.push(`## 발문\n${model.stem.text.replace(/__([^_]+)__/g, "$1")}`);

  if (model.options?.length) {
    sections.push(
      `## 선지\n${model.options.map((option) => `${option.label} ${option.text}`).join("\n")}`,
    );
  }

  sections.push(
    '표기 안내: 지문의 "㉠__…__" / "ⓐ__…__" 는 그 구절/단어에 마커와 밑줄이 있다는 뜻입니다.',
    "정답 라벨(①~⑤) 하나와 결정 근거만 JSON 스키마대로 반환하십시오.",
  );

  return sections.join("\n\n");
}

/**
 * 독립 솔버 1회 실행. 불일치 → blocking KoQualityIssue, 일치/무판정 → null.
 */
export async function runKoSolverGate(
  input: RunKoSolverGateInput,
): Promise<KoQualityIssue | null> {
  const correctAnswer =
    typeof input.question.correctAnswer === "string"
      ? input.question.correctAnswer
      : "";
  // 객관식 규격 밖 후보는 판정 불가 — 공통 게이트(ko-correct-answer-invalid)의 몫.
  if (!["①", "②", "③", "④", "⑤"].includes(correctAnswer)) return null;

  try {
    const result = await generateQuestionObject({
      schema: KO_SOLVER_SCHEMA,
      prompt: buildKoSolverPrompt(input),
      generationPlan: input.generationPlan,
      logPrefix: "KO-SOLVER",
      maxTokens: 2_048,
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
    if (result.object.answer !== correctAnswer) {
      return {
        severity: "error",
        code: "ko-solver-mismatch",
        message: `독립 솔버가 ${result.object.answer}를 골랐습니다(정답 키 ${correctAnswer}) — 단일정답성 의심. 솔버 근거: ${result.object.reasoning.slice(0, 160)}`,
      };
    }
    return null;
  } catch (error) {
    console.warn(
      `[KO-SOLVER] solver call failed for ${input.mod.meta.typeId}; passing without verdict: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}
