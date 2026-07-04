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
  /**
   * KO(국어) 지문 갈래(KoPassageKind 값). KO_ 유형 생성 시에만 소비 — 프롬프트의
   * 갈래 라벨과 koContext.passageKind 주입에 쓰인다. 미전달/영어 경로는 무영향.
   */
  koPassageKind?: string;
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
