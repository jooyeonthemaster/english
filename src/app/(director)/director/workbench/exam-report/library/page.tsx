// 구 「내신 리포트 관리」(라이브러리) — 26-09-01 허브로 통합, 이 경로는 리다이렉트만 남는다.
//
// 폐기 이유: 라이브러리는 허브(/workbench/exam-report)의 진부분집합이었다.
//   · 같은 훅 useExamReportActivity → 같은 GET /api/exam-report/analyses?view=summary (take 50)
//   · 같은 <AnalysesBoard> (검색·상태필터·삭제·재분석 전부 보드 내장)
//   · 차이는 "인테이크 업로드 패널이 위에 붙어 있냐" 하나뿐이었고, 라이브러리의
//     [새 시험지 분석]·[이어서 등록]은 어차피 허브로 router.push 하고 있었다.
//   · 오히려 허브에만 있는 낙관 카드/DRAFT 보정이 빠져 상태가 덜 신선했다.
// 목록 전용 뷰가 필요하면 허브에서 인테이크를 접으면 된다(선택은 localStorage 에 영속).
//
// 라우트를 지우지 않고 남기는 이유: 기존 북마크·외부 링크 보존. 그리고 이 세그먼트는
// @modal/(.)[id] 의 NON_ANALYSIS_SEGMENTS 가드가 참조하므로 형제 라우트로 계속 존재한다.

import { redirect } from "next/navigation";

export default function ExamReportLibraryPage() {
  redirect("/director/workbench/exam-report");
}
