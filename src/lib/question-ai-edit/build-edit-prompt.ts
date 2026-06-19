// ============================================================================
// AI 문제 수정 — 프롬프트 조립
// ============================================================================
// 생성 프롬프트(buildGenerationPrompt)와 같은 빌딩블록(유형 규칙서·난이도 루브릭·표시
// 정확도 규칙·품질 계약·구조화 출력 규칙)을 재사용하되, "프리 생성"이 아니라
// "현재 문제(베이스라인)를 두고 지시한 부분만 고치는 제약 재생성"으로 재구성한다.
// 핵심은 EDIT CONTRACT: 유형 고정 · 구조 카운트 고정 · 미언급 부분 보존 · 정합 재정렬 ·
// 누설 금지.
// ============================================================================

import { getTypeQualityRubric } from "@/lib/question-quality";
import { buildQuestionGenerationPromptContract } from "@/lib/question-generation-prompt-contract";
import { STRUCTURED_TYPE_PROMPTS } from "@/lib/question-schemas";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";

import {
  DIFFICULTY_RUBRIC,
  MARKING_RUBRIC,
  TYPE_LABELS,
} from "@/app/api/ai/generate-questions-auto/_lib/constants";
import { STRUCTURED_OUTPUT_INSTRUCTIONS } from "@/app/api/ai/generate-questions-auto/_lib/prompts";

import { serializeBaselineForEdit } from "./serialize-baseline";
import type { StructuredQuestionLike } from "./types";

export interface BuildEditPromptInput {
  subType: string;
  schoolType: string;
  gradeInfo?: string;
  passageContent: string;
  baseline: StructuredQuestionLike;
  instruction: string;
  difficulty: string;
  generationPlan: QuestionGenerationPlan;
  /** 직전 시도의 거절 사유 — 교정 지시로 주입(맹목 재시도 방지). */
  previousFeedback?: string;
}

// 유형별 누설/주의 1줄 리마인더(핵심만). 나머지는 유형 규칙서가 커버한다.
const TYPE_EDIT_GUARDS: Record<string, string> = {
  SUMMARY_WRITING:
    "정답 계열(blanks.answer·modelAnswer·acceptableVariants·requiredLemmas)은 학생에게 보이는 요약문/보기/첫글자 단서에 절대 노출하지 마세요. 빈칸은 빈칸으로 남깁니다.",
  GRAMMAR_ERROR:
    "밑줄(expression)은 최소 문법 단위(1~4단어)만. 절·문장 통밑줄 금지. 정답 1개(설정상 다르면 그 수)만 isError=true.",
  GRAMMAR_CHOICE_COMBO:
    "각 슬롯의 correctExpression/wrongExpression 은 원문 정합. 슬롯 간 pointCode 는 서로 다르게.",
  VOCAB_CHOICE:
    "vocabDisplayMode 가 SYNONYM_VARIANT 면 정답 외 단어도 동의어로 표시(원문 단어 암기 방지). 정답 표시만 부적절 단어.",
  BLANK_INFERENCE:
    "originalExpression 은 원문에서 토씨 하나 안 바꾸고 복사. 정답 선지 text 는 모드(SOURCE_EXACT/PARAPHRASE)에 맞춤.",
  SENTENCE_INSERT:
    "givenSentence 는 지문에서 빼낸 한 문장. 정답 위치(①~⑤)는 논리적으로 유일해야 함.",
  IRRELEVANT:
    "무관 문장 정답은 첫/끝 문장이 아닌 중간(1~n-2)에서 선택. 나머지 문장은 자연스러운 흐름 유지.",
  GRAMMAR_CORRECTION:
    "각 밑줄 구간은 isError=true, errorPart≠correctedPart, correctedPart 는 sourceText 안에서 정정 가능해야 함. correctAnswer 는 '(A) X, (B) Y' 형식.",
  ANTONYM:
    "정확히 한 쌍만 isIncorrectPair=true(반의어 오류). 나머지는 올바른 반의어 쌍.",
};

export function buildEditPrompt({
  subType,
  schoolType,
  gradeInfo = "",
  passageContent,
  baseline,
  instruction,
  difficulty,
  generationPlan,
  previousFeedback,
}: BuildEditPromptInput): { system?: string; prompt: string } {
  const typePrompt =
    STRUCTURED_TYPE_PROMPTS[subType] || `${subType} 유형의 문제입니다.`;
  const typeQualityRubric = getTypeQualityRubric(subType, difficulty);
  const typeLabel = TYPE_LABELS[subType] || subType;
  const providerContract = buildQuestionGenerationPromptContract(generationPlan);
  const difficultyRubric =
    DIFFICULTY_RUBRIC[difficulty] || DIFFICULTY_RUBRIC.INTERMEDIATE;
  const typeGuard = TYPE_EDIT_GUARDS[subType];

  // 정적 system 프리앰블(유형 규칙·루브릭·계약·수정 계약) — Claude cache_control 적중용.
  // 호출마다 바뀌는 지문/베이스라인/지시는 user 프롬프트로 내린다.
  const system = `당신은 한국 영어 내신/수능 시험 출제·검수 전문가입니다. 이미 출제된 문제를 선생님의 수정 지시에 따라 고치는 일을 합니다.

## 대상 유형: ${typeLabel} (${subType}) — 절대 다른 유형으로 바꾸지 마세요.

## 이 유형의 출제 규칙
${typePrompt}${typeQualityRubric ? `\n${typeQualityRubric}` : ""}
${STRUCTURED_OUTPUT_INSTRUCTIONS}

## 난이도 기준
${difficultyRubric}
${MARKING_RUBRIC}
${providerContract}

## ⭐ 수정 계약 (가장 중요 — 위반 시 실패)
1. 유형은 ${typeLabel}로 고정입니다. 발문 형식·선지 구조·필드 구성을 이 유형 스키마 그대로 유지하세요.
2. 표시 개수(밑줄/번호/선지/빈칸 수)는 현재 문제와 동일하게 유지하세요. 개수를 늘리거나 줄이지 마세요.
3. 수정 지시에 직접 언급된 부분만 바꾸고, **언급하지 않은 부분은 현재 문제 그대로 유지**하세요(불필요한 재작성 금지).
4. 한 부분을 바꾸면 그에 의해 영향받는 **선지·정답·해설·오답해설을 모두 정합하게 다시 맞추세요.** (예: 어법 포인트를 조동사·시제로 바꾸면 밑줄·정답·오답해설이 전부 그 포인트와 일치해야 함.)
5. correctAnswer 는 객관식이면 정답 선지 label, 서술형이면 정답 텍스트로 정확히 채우세요. 정답과 선지/밑줄/빈칸이 100% 일치해야 합니다.
6. 해설(explanation)은 한국어로 지문 근거와 함께, keyPoints 는 학습 포인트 3개로 작성하세요. 객관식은 정답을 제외한 모든 오답에 wrongOptionExplanations 를 작성하세요.
7. passageWithBlank·passageWithMarkers·passageWithUnderline·passageWithNumbers 같은 "지문 전체 복사" 필드는 생성하지 마세요. 서버가 자동 생성합니다.
8. 난이도 변경 지시가 없으면 difficulty 는 "${difficulty}"를 유지하세요.${typeGuard ? `\n9. ${typeGuard}` : ""}

반드시 questions 배열에 **정확히 1개**의 수정된 문제만 담아 출력하세요.`;

  const baselineBlock = serializeBaselineForEdit(baseline);

  const prompt = `대상: 한국 ${schoolType}${gradeInfo ? ` ${gradeInfo}` : ""} 영어 시험.

## 연결된 지문
${passageContent?.trim() ? passageContent.trim() : "(이 문제는 지문에 직접 의존하지 않습니다.)"}

## 현재 문제 (이것을 베이스라인으로 두고 수정)
${baselineBlock}

## 선생님의 수정 지시
${instruction.trim()}
${previousFeedback ? `\n## 직전 시도의 문제점(반드시 교정)\n${previousFeedback}` : ""}

위 "수정 계약"을 지켜, 지시한 부분만 반영하고 나머지는 현재 문제를 최대한 유지한 수정본 1개를 questions 배열로 출력하세요. difficulty 필드에는 ${"\"" + difficulty + "\""} 또는 지시된 난이도를 넣으세요.`;

  return { system, prompt };
}
