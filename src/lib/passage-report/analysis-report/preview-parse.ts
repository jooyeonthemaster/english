import { analysisReportSchema, type AnalysisReport } from "./schema";
import { koAnalysisReportSchema } from "./ko-schema";
import { isKoAnalysisReportShape } from "./ko-report-detect";

/**
 * 학습지 미리보기용 보고서 파싱 게이트 — 과목별 스키마 분기.
 *
 * 미리보기 표면(learning-sheet-preview-modal 등)이 보고서 JSON 을 영어
 * analysisReportSchema 로 직파싱하면 PRIME_KO 보고서는 무조건 실패해 프리뷰가
 * 비어 버린다. 여기서 모양(subject/KO 섹션 kind)을 먼저 판별해:
 *  - KO 모양 → koAnalysisReportSchema 로 파싱 (실패 시 null)
 *  - 그 외(영어) → 기존 analysisReportSchema 그대로 (영어 경로 동작 무변경)
 *
 * 렌더러(ReportPages → section-flow)는 KO 섹션을 자체 게이트로 디스패치하므로
 * KO 보고서도 AnalysisReport 자리에서 그대로 렌더된다(캐스팅만 여기서 흡수).
 */
export function parseAnalysisReportForPreview(
  raw: unknown,
): AnalysisReport | null {
  if (isKoAnalysisReportShape(raw)) {
    const ko = koAnalysisReportSchema.safeParse(raw);
    return ko.success ? (ko.data as unknown as AnalysisReport) : null;
  }
  const en = analysisReportSchema.safeParse(raw);
  return en.success ? en.data : null;
}
