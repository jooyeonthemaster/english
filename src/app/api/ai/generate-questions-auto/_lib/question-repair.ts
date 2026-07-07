import { z } from "zod";

import type { GenerateQuestionObjectResult } from "@/lib/question-generation-llm";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type { QuestionQualityIssue } from "@/lib/question-quality";

import { generateWithRetry } from "./generate-with-retry";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface RepairCandidateInput {
  subType: string;
  /** 후처리 직전(AI 출력 레벨)의 탈락 초안 — 교정 출력도 동일 후처리를 다시 탄다. */
  draft: Record<string, unknown>;
  /** 이 후보를 탈락시킨 A(차단) 품질 결함들 */
  blockingIssues: QuestionQualityIssue[];
  passageContent: string;
  /** 원 생성과 동일한 응답 스키마(구조 유효성 보장 — 마이크로 스키마 불필요) */
  responseSchema: z.ZodType;
  generationPlan: QuestionGenerationPlan;
  perQuestionTokenFloor: number;
  deadlineAt?: number;
  /** PREMIUM 캐시용 정적 system 프리앰블(원 생성과 동일) */
  system?: string;
  /** strict 구조화 출력을 생략하고 프롬프트 인라인 JSON 모드로 교정 (Wave-3 SW/TSW PREMIUM — 원 생성 라우팅과 동일) */
  forceJsonFallback?: boolean;
  onModelUsage?: (result: GenerateQuestionObjectResult<unknown>) => void;
}

/**
 * SHIP-FIRST 부분 repair — A(차단) 결함으로 탈락한 단일 후보를 문항 전체를 처음부터
 * 재생성(full regen)하는 대신 "이 초안에서 이 결함만 고쳐라"로 1회 교정 재생성한다.
 *
 * 왜 full regen 보다 나은가: 모델에게 (1) 깨진 초안 자체와 (2) 구체적 실패 코드/메시지를
 * 줘서 맹목 재생성보다 적중률을 높인다. 동일 응답 스키마를 재사용하므로 구조 유효성은
 * 그대로 보장되고(마이크로 스키마 불필요), 정답·밑줄·마커의 원문 일치 같은 불변식만
 * 다시 맞추면 된다. 비용은 단건 페이로드라 full regen 대비 작다.
 *
 * 호출자(run-question-generation 루프)는 교정 출력을 신뢰하지 않고 반드시 후처리+품질
 * 게이트를 재실행한다. 데드라인 초과/실패/형식 불일치 시 null 을 반환해 호출자가 기존
 * 재생성 경로로 폴백하게 한다(무회귀 — happy-path 와 다중결함 케이스는 건드리지 않음).
 * 근거: docs/GENERATION-ENGINE-REDESIGN-ROADMAP.md §4 WS3.
 */
export async function repairQuestionCandidate(
  input: RepairCandidateInput,
): Promise<Record<string, unknown> | null> {
  const {
    subType,
    draft,
    blockingIssues,
    passageContent,
    responseSchema,
    generationPlan,
    perQuestionTokenFloor,
    deadlineAt,
    system,
    forceJsonFallback,
    onModelUsage,
  } = input;

  if (blockingIssues.length === 0) return null;
  if (deadlineAt && Date.now() >= deadlineAt) return null;

  const defectLines = blockingIssues
    .slice(0, 6)
    .map((issue) => `- [${issue.code}] ${issue.message}`)
    .join("\n");

  // 디코이 조합 위반(정답 pointCode 반복·코드 편중)만으로 탈락한 어법 초안은
  // 정답 설계가 무결하다 — 정답까지 갈아엎는 과잉 교정을 막고 미끼 자리만
  // 옮기게 지시한다 (26-07-06 실측: 통과본은 반려본에서 미끼 2개만 교체).
  const decoyOnlyGrammarRepair =
    subType === "GRAMMAR_ERROR" &&
    blockingIssues.every((issue) =>
      ["grammar-killer-answer-point-repeated", "grammar-decoy-point-monotony", "grammar-decoy-point-diversity"].includes(
        issue.code ?? "",
      ),
    );

  const repairPrompt = [
    `아래는 ${subType} 유형 문항 초안입니다. 품질 검사에서 다음 결함으로 탈락했습니다.`,
    `## 반드시 교정할 결함`,
    defectLines,
    decoyOnlyGrammarRepair
      ? `## 교정 범위 제한 (중요)\n정답 밑줄(오류 자리)·correction·해설의 정답 분석은 이미 통과 품질입니다 — 절대 바꾸지 마세요. 위 결함은 미끼(비정답) 밑줄의 pointCode 조합 위반이므로, 충돌하는 미끼 밑줄만 지문의 다른 문법 포인트 자리(정답과 다른 pointCode, 코드당 최대 2회)로 옮기고 그 미끼의 wrongOptionExplanations 항목만 새 자리에 맞게 다시 쓰세요. pointCode 는 항상 그 자리의 실제 문법 성격대로 정직하게 기재해야 합니다.`
      : "",
    `## 지문 (원문 — 정답·밑줄·마커·원문 인용은 반드시 이 원문과 정확히 일치해야 함)`,
    passageContent,
    `## 탈락한 초안 (JSON)`,
    JSON.stringify(draft),
    `위 결함만 정확히 해소하고 나머지(형식·필드 구조·정답 외 보기)는 최대한 보존하세요. ` +
      `교정된 문항 1개만 questions 배열에 담아 동일한 형식으로 출력하세요. 같은 실수를 반복하지 마세요.`,
  ].filter(Boolean).join("\n\n");

  try {
    const object = await generateWithRetry(
      responseSchema,
      repairPrompt,
      generationPlan,
      Math.min(
        20_000,
        Math.max(1, perQuestionTokenFloor, generationPlan === "PREMIUM" ? 12_288 : 0),
      ),
      undefined,
      onModelUsage,
      { system, deadlineAt, forceJsonFallback },
    );
    if (isRecord(object) && Array.isArray(object.questions)) {
      const first = object.questions.find(isRecord);
      return (first as Record<string, unknown> | undefined) ?? null;
    }
    return null;
  } catch {
    // 교정 호출 실패는 치명적이지 않다 — 호출자가 기존 재생성 경로로 폴백한다.
    return null;
  }
}
