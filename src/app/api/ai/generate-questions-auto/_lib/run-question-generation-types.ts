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

// "scarce" = 구제(salvage) 최선 생성 모드 — relaxed 에서 전 유형의 "완성도(craft)"
// 게이트(디코이 매력도·킬러 깊이·obvious/얕음·해설 취향 계열, SALVAGE_RELAXABLE_CODES)
// 까지 경고로 강등해 문항을 출하하되, 정답 유일성·누출·렌더 무결성 게이트는 그대로
// 차단한다. 출하물에는 사유 notice·검수 권장이 부착된다. (26-07-06 유저 결정:
// "생성 실패"는 최악의 결과 — 경고를 달고서라도 반드시 문항을 만들어야 한다.)
export type QualityMode = "strict" | "relaxed" | "scarce";

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

// 품질 게이트에서 탈락했지만 구조는 완성된 후보의 보존본 — never-fail 구제 사다리가
// "완성도(craft) 결함만 있는 최선 후보"를 경고 부착으로 재승인할 때 쓴다.
// F급(정답 무효·누출·렌더 파손) 코드가 하나라도 섞인 후보는 절대 재승인되지 않는다.
export interface RejectedQuestionCandidate {
  subType: string;
  qualityMode: QualityMode;
  attemptIndex: number;
  question: Record<string, unknown>;
  blockingCodes: string[];
  blockingIssues: Array<{ code: string; message: string; severity: string }>;
  warnings: Array<{ code: string; message: string; severity: string }>;
}

export interface RejectionRecorder {
  issues: QuestionGenerationRejectionIssue[];
  /** quality 단계 탈락 후보 풀(상한 있음) — 구제 사다리 전용. */
  pool?: RejectedQuestionCandidate[];
}
