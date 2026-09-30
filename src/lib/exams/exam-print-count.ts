// ============================================================================
// exam-print-count — 시험지 인쇄 횟수(exams.printCount) +1 의 단일 경로 (26-09-30 LEGACY-CLEANUP, COH-15).
//
// 인쇄·HWPX·DOCX 내보내기는 시험지 「수정」이 아니다. 예전의 `prisma.exam.update({ printCount: { increment } })` 는
// Prisma @updatedAt 을 함께 올려서
//   (1) 목록 카드의 「마지막 수정」 시각이 인쇄할 때마다 바뀌었고(운영 SELECT 26-09-30: 내보내기 이력이 있는 267개
//       시험지 중 237개의 updatedAt 이 마지막 내보내기 시각과 5초 안 — 사실상 「마지막 인쇄」였다),
//   (2) 카드 썸네일·인쇄 대화상자의 데이터 캐시(exam-preview-data-cache — 키 examId+updatedAt)가 인쇄 한 번마다
//       무효가 됐다.
// 그래서 원시 UPDATE 로 printCount 만 올린다(@updatedAt 은 Prisma 클라이언트가 채우는 값이라 원시 SQL 에는 끼지 않는다.
// exams 테이블에 updatedAt 트리거 없음 — pg_trigger 확인). 학원 범위를 WHERE 에 건다(남의 학원 시험지는 0행).
// ============================================================================
import { prisma } from "@/lib/prisma";

/**
 * printCount 를 1 올린다 — exams."updatedAt" 은 그대로. 반환값 = 바뀐 행 수(0 = 없는 시험지이거나 다른 학원).
 * 실패는 호출부가 판단한다(내보내기 라우트는 파일을 이미 만들었으므로 삼키고, 인쇄 집계 액션은 오류로 돌려준다).
 */
export async function incrementExamPrintCountRow(examId: string, academyId: string): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "exams"
    SET "printCount" = "printCount" + 1
    WHERE "id" = ${examId} AND "academyId" = ${academyId}
  `;
}
