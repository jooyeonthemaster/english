import { type FormatAnnotation, parseFormatAnnotations } from "./format-spec";

// CustomQuestionTypeVersion.source 페이로드 리더.
// v1: source = QuestionAnalysis 그대로. v2: { analysis, annotations, analysisJobId, analysisModel }.
// 클라이언트(랩 UI)와 서버(샘플 생성) 양쪽에서 쓰므로 server-only 금지.

export interface CustomTypeSourcePayload {
  /** 1차 내용 분석(QuestionAnalysis 형태 — 구조는 호출부에서 신뢰 가능한 만큼만 사용). */
  analysis: Record<string, unknown> | null;
  /** 해부 뷰 어노테이션(v2). */
  annotations: FormatAnnotation[];
  /** 원본 크롭 이미지를 서빙하는 분석 잡 ID(v2). /api/custom-question-types/analysis-jobs/{id}/image */
  analysisJobId: string | null;
  analysisModel: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function readCustomTypeSource(source: unknown): CustomTypeSourcePayload {
  if (!isRecord(source)) {
    return { analysis: null, annotations: [], analysisJobId: null, analysisModel: null };
  }
  // v2 페이로드 판별: analysis 필드가 객체로 존재.
  if (isRecord(source.analysis)) {
    return {
      analysis: source.analysis,
      annotations: parseFormatAnnotations(source.annotations),
      analysisJobId: typeof source.analysisJobId === "string" ? source.analysisJobId : null,
      analysisModel: typeof source.analysisModel === "string" ? source.analysisModel : null,
    };
  }
  // v1: source 자체가 QuestionAnalysis.
  return { analysis: source, annotations: [], analysisJobId: null, analysisModel: null };
}

/** 원본 분석에서 '원본 지문'을 최대한 복원(스튜디오 샘플 생성의 기본 지문). */
export function readSourcePassage(analysis: Record<string, unknown> | null): string {
  if (!analysis) return "";
  const src = isRecord(analysis.source) ? analysis.source : null;
  const passage = src && typeof src.passage === "string" ? src.passage : "";
  return passage.trim();
}

/** 원본 분석에서 발문/선지 등 요약 추출(해부 뷰 폴백 카드). */
export function readSourceDirection(analysis: Record<string, unknown> | null): string {
  if (!analysis) return "";
  const src = isRecord(analysis.source) ? analysis.source : null;
  return src && typeof src.direction === "string" ? src.direction.trim() : "";
}
