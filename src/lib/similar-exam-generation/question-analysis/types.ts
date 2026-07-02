import type { SingleItemAnalysis } from "./schema";

export interface QuestionAnalysisImage {
  data: Buffer;
  mediaType: string;
}

export interface AnalyzeQuestionItemArgs {
  /** 업로드된 문항 사진/파일 페이지 이미지(있으면). */
  images?: QuestionAnalysisImage[];
  /** 텍스트로 직접 들어온 문항(이미지 대신/병행). */
  inputText?: string;
  schoolType?: string;
  gradeInfo?: string;
  /** User-cropped reference image. Bypass legacy full-page bbox crop follow-up. */
  manualCropOnly?: boolean;
  /** 원가 기록 귀속용 학원 ID(백그라운드 잡 페이로드에서 전달). */
  academyId?: string | null;
}

export interface QuestionAnalysisResult {
  analysis: SingleItemAnalysis;
  attempts: number;
  /** 이 분석을 수행한 모델 ID — 어떤 모델로 분석했는지 데이터에 남겨 테스트 비교를 쉽게. */
  model: string;
  /** docai 모드에서 분석에 넘긴 OCR 텍스트(검증용 — 분석이 실제로 본 입력). 비-docai 면 undefined. */
  referenceText?: string;
  stats: QuestionAnalysisStats;
}

export interface TargetQuestionAnalysis {
  ordinal: number;
  total: number;
  questionNumber?: number | null;
}

export interface QuestionAnalysisStats {
  inventoryCount: number;
  detailedCountBeforeFilter: number;
  detailedCountAfterFilter: number;
  incompleteRemovedCount: number;
  incompleteRemovedSummaries: string[];
  missingInventoryCount: number;
  recoveredMissingCount: number;
  cropMismatchCount: number;
  followUpFallbackCount: number;
  warnings: string[];
}
