// ============================================================================
// buildKoGenerationPrompt — 국어 문항 생성 프롬프트 (KO-DESIGN-SPEC §6)
// ============================================================================
// 영어 buildGenerationPrompt(prompts.ts)와 동일한 입출력 형태의 드롭인 빌더.
// run-question-generation.ts 의 KO_ 게이트가 이 빌더로 위임한다 — 영어 빌더는
// 무접촉(anthropic cache_control byte-identical 보존).
//   - PREMIUM: system(안정 블록 — 페르소나+품질계약, 캐시 대상) / prompt(가변)
//   - STANDARD: 단일 prompt
// ============================================================================

import { KO_QUESTION_QUALITY_CONTRACT } from "./contract";
import { KO_DIFFICULTY_RUBRIC, KO_EXAM_MODE_RUBRIC, KO_MARKING_RUBRIC } from "./rubrics";
import type { KoDifficulty, KoExamMode } from "../registry/type-module";

export interface KoGenerationPromptInput {
  schoolType?: string;
  gradeInfo?: string;
  passageContent: string;
  teacherIntentBlock?: string;
  analysisContext?: string;
  targetPoints?: string[];
  typePrompt: string;
  structuredInstructions?: string;
  targetCandidateBlock?: string;
  typeQualityRubric?: string;
  typeCount: number;
  diffLabel: string;
  diffInstruction?: string;
  generationPlan: string; // "STANDARD" | "PREMIUM"
  customPrompt?: string;
  /** KO 전용 — 게이트가 resolved 설정에서 주입. 생략 시 SUNEUNG. */
  examMode?: KoExamMode;
  /** KO 전용 — 지문 갈래 라벨 (예: "현대소설", "독서·사회"). */
  passageKindLabel?: string;
}

/**
 * PREMIUM 캐시 안정성을 위해 system 은 입력과 무관한 고정 문자열이어야 한다.
 * (persona + 품질 계약 — 유형·지문·설정은 전부 user prompt 쪽.)
 */
const KO_GENERATION_SYSTEM = `당신은 한국 고등학교 국어 시험 출제 전문가입니다. 대학수학능력시험(평가원)과 고등학교 내신 지필평가의 출제·검토 경력을 가진 국어교육 전공자로서, 지문 근거주의와 단일정답성 원칙을 철저히 지키는 문항을 설계합니다.
${KO_QUESTION_QUALITY_CONTRACT}`;

function normalizeDifficulty(diffLabel: string): KoDifficulty {
  return diffLabel === "BASIC" || diffLabel === "KILLER" ? diffLabel : "INTERMEDIATE";
}

export function buildKoGenerationPrompt(input: KoGenerationPromptInput): {
  system?: string;
  prompt: string;
} {
  const {
    schoolType = "",
    gradeInfo = "",
    passageContent,
    teacherIntentBlock,
    analysisContext,
    targetPoints = [],
    typePrompt,
    structuredInstructions,
    targetCandidateBlock,
    typeQualityRubric,
    typeCount,
    diffLabel,
    diffInstruction,
    generationPlan,
    customPrompt,
    examMode = "SUNEUNG",
    passageKindLabel,
  } = input;

  const difficulty = normalizeDifficulty(diffLabel);
  const analysisBlock = analysisContext?.trim()
    ? analysisContext
    : "없음. 원문 지문만으로 출제하십시오.";
  const targetPointBlock = targetPoints.length
    ? `\n\n## 필수 출제 포인트\n${targetPoints.map((p) => `- ${p}`).join("\n")}`
    : "";

  const userPrompt = `대상: ${[schoolType, gradeInfo].filter(Boolean).join(" ") || "고등학생"} 국어${passageKindLabel ? ` — 지문 갈래: ${passageKindLabel}` : ""}

## 지문
${passageContent}
${targetCandidateBlock?.trim() ? `\n${targetCandidateBlock}` : ""}
${teacherIntentBlock?.trim() ? `\n\n## 교사 주석\n${teacherIntentBlock}` : ""}

## 저장된 지문 분석
${analysisBlock}
${targetPointBlock}

## 문항 유형 지시
${typePrompt}
${typeQualityRubric?.trim() ? `\n${typeQualityRubric}` : ""}

## 출제 기준(모드)
${KO_EXAM_MODE_RUBRIC[examMode]}

## 난이도
- 요구 난이도: ${diffLabel}${diffInstruction ? ` (${diffInstruction})` : ""}
${KO_DIFFICULTY_RUBRIC[difficulty]}

## 출력 스키마 요구
- 제공된 JSON 스키마와 정확히 일치하게 반환하십시오. 스키마에 없는 필드 금지.
${structuredInstructions?.trim() ? `${structuredInstructions}\n` : ""}- direction·explanation·wrongOptionExplanations·keyPoints·tags 는 전부 한국어.
- correctAnswer: 객관식은 정답 라벨(예: "③"), 서답형은 정답 텍스트.
- difficulty 필드는 정확히 "${diffLabel}".

## 마킹 규약
${KO_MARKING_RUBRIC}
${customPrompt?.trim() ? `\n## 교사 지시사항\n${customPrompt}` : ""}

정확히 ${typeCount}개의 문항을 생성하십시오.`;

  if (generationPlan === "PREMIUM") {
    return { system: KO_GENERATION_SYSTEM, prompt: userPrompt };
  }
  // STANDARD(Gemini): system 미지원 경로 대비 단일 프롬프트로 합성
  return { prompt: `${KO_GENERATION_SYSTEM}\n\n---\n\n${userPrompt}` };
}
