// 학생 시험 리포트 허브 — 인테이크 카드 3종 + 최근 분석.
// 인증은 (director) 레이아웃이 담당하나, 방어적으로 세션을 한 번 더 확인한다.

import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { HubClient } from "@/components/exam-report/hub/hub-client";

export default async function ExamReportHubPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");
  return <HubClient />;
}
