import type { TaskAdapter } from "../types";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { extractionAdapter } from "./extraction-adapter";
import { passageAuthoringAdapter } from "./authoring-adapter";
import { webtoonAdapter } from "./webtoon-adapter";
import { similarExamAdapter } from "./similar-exam-adapter";
import { examReportAdapter } from "./exam-report-adapter";
import {
  workbenchPassageAnalysisAdapter,
  workbenchQuestionGenerationAdapter,
} from "./workbench-ai-adapter";

export const ALL_ADAPTERS: TaskAdapter[] = [
  extractionAdapter,
  passageAuthoringAdapter,
  workbenchPassageAnalysisAdapter,
  workbenchQuestionGenerationAdapter,
  examReportAdapter,
  ...(FEATURE_FLAGS.SHOW_SIMILAR_EXAM_GENERATION ? [similarExamAdapter] : []),
  webtoonAdapter,
];
