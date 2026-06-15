import "server-only";

// ── 경계: 동형(similar-exam-generation) 코드는 import 만 하고 절대 수정하지 않는다. ──
// 분석 엔진은 동형 쪽이 소유/관리하므로, 이 한 파일에서만 의존을 모아 seam 으로 둔다.
// (동형 API 가 바뀌면 여기만 고치면 됨.) 데이터(QuestionAnalysis)만 받아간다.
import { analyzeQuestionItem } from "@/lib/similar-exam-generation/question-analysis/analyzer";
import type { QuestionAnalysis } from "@/lib/similar-exam-generation/question-analysis/schema";

export type { QuestionAnalysis };

export interface AnalyzeForCustomTypeArgs {
  /** 업로드된 참조 문항 페이지 이미지(있으면). */
  images?: Array<{ data: Buffer; mediaType: string }>;
  /** 텍스트로 직접 들어온 문항(이미지 대신/병행). */
  inputText?: string;
  gradeInfo?: string;
  /** 사용자 수동 크롭 입력. 동형 분석기의 자동 bbox/crop 보강을 우회한다. */
  manualCropOnly?: boolean;
}

export interface AnalyzedCustomTypeSource {
  /** 커스텀 유형 1개의 토대가 되는 대표 문항(여러 개면 첫 문항). */
  primary: QuestionAnalysis;
  /** 입력에서 추출된 모든 문항(유형 후보). P1 은 primary 만 사용. */
  questions: QuestionAnalysis[];
  /** 분석 수행 모델 ID(데이터에 남겨 비교/디버깅용). */
  model: string;
  /** DocAI OCR 원문(있으면) — 2차 포맷 분석의 전사 안정화(하이브리드 입력)에 재사용. */
  referenceText?: string;
}

/**
 * 참조 문항을 분석해 커스텀 유형의 토대(QuestionAnalysis)를 얻는다.
 * 동형 analyzeQuestionItem 를 import-only 로 호출(무수정).
 */
export async function analyzeForCustomType(
  args: AnalyzeForCustomTypeArgs,
): Promise<AnalyzedCustomTypeSource> {
  const result = await analyzeQuestionItem({
    images: args.images,
    inputText: args.inputText,
    gradeInfo: args.gradeInfo,
    manualCropOnly: args.manualCropOnly,
  });

  const questions = result.analysis.groups.flatMap((group) => group.questions);
  const primary = questions[0];
  if (!primary) {
    throw new Error("분석 결과에서 문항을 찾지 못했습니다.");
  }

  return { primary, questions, model: result.model, referenceText: result.referenceText };
}
