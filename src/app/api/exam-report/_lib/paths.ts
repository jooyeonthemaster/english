// ============================================================================
// exam-report API 공용 경로 검증 — 학생 마킹 사진 스토리지 키 검증.
//
// 분석 페이지 키(pages/NNNN)는 lib/exam-report/schemas.isExamReportPagePath 가
// 담당한다. 학생 마킹 사진은 layout 이 다르므로(students/{studentId}/NNNN) 여기서
// 앵커드 정규식으로 검증한다 — startsWith 프리픽스는 '{prefix}../..' 로 상위 경로를
// 뚫을 수 있어, academyId/analysisId/studentId 를 이스케이프해 정확 형식만 통과시킨다.
// storage.examReportStudentPageKey 레이아웃과 반드시 일치해야 한다.
// ============================================================================

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 학생 마킹 사진 스토리지 키가 이 학생 전용 프리픽스의 정확한 형식과 일치하는지 검증.
 *   {academyId}/exam-reports/{analysisId}/students/{studentId}/NNNN.jpg
 * upload-urls(발급)·students/source-urls(서명)·read(다운로드)가 이 단일 규칙을 공유한다.
 */
export function isExamReportStudentPagePath(
  path: string,
  academyId: string,
  analysisId: string,
  studentId: string,
): boolean {
  const pattern = new RegExp(
    `^${escapeRegExp(academyId)}/exam-reports/${escapeRegExp(analysisId)}/students/${escapeRegExp(studentId)}/\\d{4}\\.jpg$`,
  );
  return pattern.test(path);
}
