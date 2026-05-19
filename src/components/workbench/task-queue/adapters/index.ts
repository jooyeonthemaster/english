import type { TaskAdapter } from "../types";
import { extractionAdapter } from "./extraction-adapter";
import { webtoonAdapter } from "./webtoon-adapter";
import { examGenerationAdapter } from "./stub-adapters";
import {
  workbenchPassageAnalysisAdapter,
  workbenchQuestionGenerationAdapter,
} from "./workbench-ai-adapter";

export const ALL_ADAPTERS: TaskAdapter[] = [
  extractionAdapter,
  workbenchPassageAnalysisAdapter,
  workbenchQuestionGenerationAdapter,
  examGenerationAdapter,
  webtoonAdapter,
];
