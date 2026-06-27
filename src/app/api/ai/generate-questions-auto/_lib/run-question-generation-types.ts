import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type { QuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";
import type { QuestionDiversityContext } from "@/lib/question-diversity";
import type { PlanResult } from "./schemas";
export interface RunGenerationInput {
  plan: PlanResult["plan"];
  schoolType: string;
  gradeInfo: string;
  passageContent: string;
  teacherIntentBlock: string;
  analysisContext: string;
  diffLabel: string;
  diffInstruction: string;
  generationPlan: QuestionGenerationPlan;
  customPrompt?: string;
  typeSettings?: QuestionTypeGenerationSettings;
  /**
   * 반복 생성 다양성 컨텍스트 (기사용 타깃 회피 + 정답 위치 스티어링 + 보기 셔플).
   * 미전달 시 기존 동작과 100% 동일 — 동형/커스텀/세트 등 다른 호출자는 무영향.
   */
  diversity?: QuestionDiversityContext;
  onModelUsage?: (event: QuestionGenerationUsageEvent) => void;
}

export type QualityMode = "strict" | "relaxed";

export type RejectionPhase = "model" | "postprocess" | "quality";

export interface QuestionGenerationUsageEvent {
  phase: "question_generation";
  subType: string;
  qualityMode: QualityMode;
  difficulty: string;
  generationPlan: QuestionGenerationPlan;
  usage?: unknown;
  provider: string;
  modelId: string;
  attempts: number;
  durationMs: number;
}

export interface QuestionGenerationRejectionIssue {
  phase: RejectionPhase;
  qualityMode: QualityMode;
  subType: string;
  message: string;
  codes?: string[];
  sample?: Record<string, unknown>;
}

export interface QuestionGenerationRejectionSummary {
  total: number;
  phaseCounts: Record<RejectionPhase, number>;
  topCodes: Array<{ code: string; count: number }>;
  lastIssue?: QuestionGenerationRejectionIssue;
  message: string;
}

export interface RejectionRecorder {
  issues: QuestionGenerationRejectionIssue[];
}
