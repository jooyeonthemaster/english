import type { TaskAdapter } from "../types";
import { extractionAdapter } from "./extraction-adapter";
import { webtoonAdapter } from "./webtoon-adapter";
import {
  passageAnalysisAdapter,
  questionGenerationAdapter,
  examGenerationAdapter,
} from "./stub-adapters";

export const ALL_ADAPTERS: TaskAdapter[] = [
  extractionAdapter,
  passageAnalysisAdapter,
  questionGenerationAdapter,
  examGenerationAdapter,
  webtoonAdapter,
];
