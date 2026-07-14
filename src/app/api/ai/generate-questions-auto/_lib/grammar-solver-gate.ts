// ============================================================================
// 어법(GRAMMAR_ERROR) 독립 솔버 게이트 (26-07-14 round-6 — KO solver-gate 미러)
// ============================================================================
// round-2~5 실측: 결정론 오형 게이트는 유형별 봉인(was→were·singular they·비단어
// 등)에는 성공하지만, "치환 결과가 여전히 정문"인 신종 심기(형식가정법·수동+양태
// 부사·동일문장 이중답)를 열거로는 못 막는다(히드라). 품질검증 통과 후보를
// "학생 시점"(마킹 지문+발문만 — 정답·해설 미제공)으로 독립 LLM 솔버에게 1회
// 풀려서, ①솔버 답 ≠ 정답 키 ②"틀린 것 없음(NONE)" ③"둘 이상/동률(MULTIPLE)"
// 이면 grammar-solver-mismatch(blocking)로 반려해 재시도를 유도한다.
//
//   - 비용: 후보당 LLM 1회(STANDARD flash ~5-10원) — 결정론 게이트 통과 후에만.
//   - strict + relaxed 두 레인에서 실행(F는 relaxed로도 출하 금지). scarce/salvage
//     최후 사다리는 생략 — never-fail 계약 보존.
//   - 솔버 호출 실패(타임아웃 등)는 무판정 통과 — 게이트 장애가 생성을 못 죽인다.
// ============================================================================

import { z } from "zod";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";

const GRAMMAR_SOLVER_SCHEMA = z.object({
  answer: z
    .enum(["(A)", "(B)", "(C)", "(D)", "(E)", "NONE", "MULTIPLE"])
    .describe(
      "어법상 틀린 밑줄 하나. 다섯 밑줄이 전부 정문으로 방어 가능하면 NONE, 둘 이상이 틀렸거나 서로 다른 밑줄을 고쳐도 각각 정문이 되는 동률이면 MULTIPLE.",
    ),
  runnerUp: z
    .string()
    .describe("답을 다투는 차점 밑줄 라벨(없으면 빈 문자열)"),
  reasoning: z
    .string()
    .describe("판정 근거 2~4문장 — 문법 구조 근거만, 배경지식 금지"),
});

export interface GrammarSolverUsageResult {
  usage?: unknown;
  provider: string;
  modelId: string;
  attempts: number;
  durationMs: number;
}

export interface RunGrammarSolverGateInput {
  question: Record<string, unknown>;
  generationPlan: QuestionGenerationPlan;
  deadlineAt?: number;
  onModelUsage?: (result: GrammarSolverUsageResult) => void;
}

export interface GrammarSolverIssue {
  severity: "error";
  code: "grammar-solver-mismatch";
  message: string;
}

function buildGrammarSolverPrompt(question: Record<string, unknown>): string {
  const passageWithMarkers =
    typeof question.passageWithMarkers === "string" ? question.passageWithMarkers : "";
  const direction =
    typeof question.direction === "string" && question.direction.trim()
      ? question.direction.trim()
      : "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?";
  return [
    "당신은 대학수학능력시험 영어 영역에 응시한 최상위권 수험생이자 문법 전문가입니다. 아래 어법 문항을 지문 문면의 문법 구조 근거만으로 푸십시오.",
    `## 발문\n${direction}`,
    `## 지문 (밑줄 = (A)~(E) 마커 바로 뒤 표현)\n${passageWithMarkers}`,
    [
      "판정 규칙:",
      "- 정확히 하나의 밑줄만 어법상 틀렸다고 확신되면 그 라벨을 answer 로.",
      "- 다섯 밑줄이 전부 표준 영어(현대 용법 포함: singular they, 형식 가정법 were, 관용 통용형 등)로 방어 가능하면 answer=NONE.",
      '- 둘 이상이 틀렸거나, 서로 다른 밑줄을 각각 고쳐도 문장이 정문이 되는 "동률" 상황이면 answer=MULTIPLE (예: 같은 문장의 정동사/분사 쌍이 둘 다 밑줄인 경우).',
      "- 이의신청 심사위원처럼 엄격하게: 규범문법으로만 겨우 틀렸다고 우길 수 있는 자리는 틀린 것으로 치지 마십시오.",
    ].join("\n"),
  ].join("\n\n");
}

/** 독립 솔버 1회. 불일치/NONE/MULTIPLE → blocking issue, 일치·무판정 → null. */
export async function runGrammarSolverGate(
  input: RunGrammarSolverGateInput,
): Promise<GrammarSolverIssue | null> {
  const correctAnswer =
    typeof input.question.correctAnswer === "string" ? input.question.correctAnswer : "";
  if (!["(A)", "(B)", "(C)", "(D)", "(E)"].includes(correctAnswer)) return null;
  if (typeof input.question.passageWithMarkers !== "string" || !input.question.passageWithMarkers)
    return null;

  try {
    const result = await generateQuestionObject({
      schema: GRAMMAR_SOLVER_SCHEMA,
      prompt: buildGrammarSolverPrompt(input.question),
      generationPlan: input.generationPlan,
      logPrefix: "GRAMMAR-SOLVER",
      maxTokens: 2_048,
      deadlineAt: input.deadlineAt,
    });
    input.onModelUsage?.({
      usage: result.usage,
      provider: result.provider,
      modelId: result.modelId,
      attempts: result.attempts,
      durationMs: result.durationMs,
    });
    const solved = result.object.answer;
    if (solved === correctAnswer) return null;
    const detail =
      solved === "NONE"
        ? "독립 솔버가 '틀린 밑줄 없음'으로 판정 — 심은 오형이 정문으로 방어 가능(답 없음 이의신청 각)"
        : solved === "MULTIPLE"
          ? "독립 솔버가 '복수 정답/동률'로 판정 — 다른 밑줄을 고쳐도 정문이 되어 정답 유일성 파괴"
          : `독립 솔버가 ${solved}를 골랐습니다(정답 키 ${correctAnswer}) — 단일정답성 의심`;
    return {
      severity: "error",
      code: "grammar-solver-mismatch",
      message: `${detail}. 솔버 근거: ${result.object.reasoning.slice(0, 160)}`,
    };
  } catch (error) {
    console.warn(
      `[GRAMMAR-SOLVER] solver call failed; passing without verdict: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}
