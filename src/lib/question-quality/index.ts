// Barrel — preserves "@/lib/question-quality" import path.
export type { QuestionQualityIssue, QuestionQualitySeverity } from "./core";
export type { PassageFeasibility } from "./feasibility";
export { buildQuestionTargetCandidateBlock } from "./candidate-blocks/index";
export { SHIP_FIRST_WARNING_CODES } from "./core";
export { validateQuestionQuality } from "./dispatcher";
export { preflightQuestionFeasibility } from "./feasibility";
export { getTypeQualityRubric } from "./rubric";
export { analyzeEnglishPassageIntegrity } from "./passage-integrity";
