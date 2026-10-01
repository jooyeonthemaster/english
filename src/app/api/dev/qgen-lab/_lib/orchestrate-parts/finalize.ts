// 복제: md-stream/route.ts:1571-1649 (어법 분기만) — 게이트 통과 문항 → 어댑터 → 프로덕션 후처리 →
// 매핑 → 셔플(어법 no-op) → 품질 검증(기록만) → 태그. 저장·잡 갱신은 랩에서 생략(DB 0).
// throw 조건 2개(변환 실패·후처리 실패)는 원문 메시지 그대로 — 오케스트레이터가 status "error" 로 기록.
import { adaptMdGrammarToAiQuestion } from "@/lib/md-qgen/adapter";
import type { MdGrammarQuestion } from "@/lib/md-qgen/parser";
import { postProcessQuestion } from "@/lib/question-postprocess";
import { validateQuestionQuality } from "@/lib/question-quality";
import { shuffleQuestionOptionsForDiversity } from "@/lib/question-diversity";
import {
  mergeQuestionGenerationPlanTag,
  resolveEffectiveGenerationPlan,
} from "@/lib/question-generation-plans";
import { TYPE_LABELS } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import type { LabDifficulty } from "@/lib/qgen-lab/types";

const SUB_TYPE = "GRAMMAR_ERROR";

export function finalizeGrammarQuestion(
  q: MdGrammarQuestion,
  passageText: string,
  difficulty: LabDifficulty,
): { display: Record<string, unknown>; qualityIssues: string[] } {
  // 프로덕션은 요청 generationPlan(보통 미지정) + 난이도 → 티어(KILLER=PREMIUM).
  const effectiveGenerationPlan = resolveEffectiveGenerationPlan(undefined, difficulty);
  const adapt = adaptMdGrammarToAiQuestion(q, passageText, difficulty);
  if (!adapt.ok || !adapt.aiQuestion) {
    throw new Error(`생성 결과 변환 실패: ${adapt.error ?? "unknown"}`);
  }
  const pp = postProcessQuestion(SUB_TYPE, passageText, adapt.aiQuestion);
  if (!pp.success || !pp.data) {
    throw new Error(`후처리 실패: ${pp.error ?? "unknown"}`);
  }
  const mapped: Record<string, unknown> = {
    ...(pp.data as Record<string, unknown>),
    _typeId: SUB_TYPE,
    _typeLabel: TYPE_LABELS[SUB_TYPE] || SUB_TYPE,
    _generationPlan: effectiveGenerationPlan,
    difficulty,
  };
  const finalQuestion = shuffleQuestionOptionsForDiversity(mapped, SUB_TYPE);
  const quality = validateQuestionQuality({
    typeId: SUB_TYPE,
    question: finalQuestion,
    passage: passageText,
    requestedDifficulty: difficulty,
    grammarMarkerCount: 5,
    grammarAnswerCount: 1,
  });
  const tags = mergeQuestionGenerationPlanTag([], effectiveGenerationPlan);
  return {
    display: { ...finalQuestion, _generationPlan: effectiveGenerationPlan, tags },
    // 프로덕션 잡 기록은 severity=error 코드만 남기지만, 랩은 전량을 "[severity] CODE — message" 로 남긴다.
    qualityIssues: quality.map((i) => `[${i.severity}] ${i.code} — ${i.message}`),
  };
}
