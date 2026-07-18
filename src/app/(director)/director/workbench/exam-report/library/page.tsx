// 내신 리포트 관리(라이브러리) 페이지 골격 — 인증은 (director) 레이아웃이 담당한다.
// 목록 데이터는 library-client 가 GET /api/exam-report/analyses?view=summary 로 로드.

import { ExamReportLibraryClient } from "@/components/exam-report/library/library-client";

export default function ExamReportLibraryPage() {
  return <ExamReportLibraryClient />;
}
