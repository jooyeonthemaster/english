import type { TaskAdapter } from "../types";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { extractionAdapter } from "./extraction-adapter";
import { webtoonAdapter } from "./webtoon-adapter";
import { similarExamAdapter } from "./similar-exam-adapter";
import {
  workbenchPassageAnalysisAdapter,
  workbenchQuestionGenerationAdapter,
} from "./workbench-ai-adapter";

export const ALL_ADAPTERS: TaskAdapter[] = [
  extractionAdapter,
  workbenchPassageAnalysisAdapter,
  workbenchQuestionGenerationAdapter,
  ...(FEATURE_FLAGS.SHOW_SIMILAR_EXAM_GENERATION ? [similarExamAdapter] : []),
  webtoonAdapter,
];
