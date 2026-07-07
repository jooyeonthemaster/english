// ============================================================================
// 학생 시험 리포트 — Supabase Storage 키 헬퍼 (extraction-sources 버킷)
//
// 레이아웃(supabase-storage.ts 관례 답습, padStart(4,'0')):
//   {academyId}/exam-reports/{analysisId}/pages/{0000}.jpg           — 시험지 페이지
//   {academyId}/exam-reports/{analysisId}/students/{studentId}/{0000}.jpg — 학생 마킹 사진
// ============================================================================

export const EXAM_REPORT_STORAGE_PREFIX = "exam-reports";

function pad4(index: number): string {
  return Math.max(0, Math.trunc(index)).toString().padStart(4, "0");
}

/** 시험지 페이지 이미지 키 */
export function examReportPageKey(
  academyId: string,
  analysisId: string,
  index: number,
): string {
  return `${academyId}/${EXAM_REPORT_STORAGE_PREFIX}/${analysisId}/pages/${pad4(index)}.jpg`;
}

/** 학생 마킹 사진(자동채점 소스) 키 */
export function examReportStudentPageKey(
  academyId: string,
  analysisId: string,
  studentId: string,
  index: number,
): string {
  return `${academyId}/${EXAM_REPORT_STORAGE_PREFIX}/${analysisId}/students/${studentId}/${pad4(index)}.jpg`;
}
