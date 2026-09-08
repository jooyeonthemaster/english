// 학생 시험 리포트 허브 — 인테이크 카드 3종 + 최근 분석.
// 인증은 (director) 레이아웃이 담당하나, 방어적으로 세션을 한 번 더 확인한다.
//
// 26-09-01: 구 「내신 리포트 관리」 탭을 여기로 통합했다. 인테이크 접힘 선호값을
// 쿠키에서 읽어 초기값으로 주입한다 — 클라이언트에서만 읽으면 SSR HTML 이 늘
// "펼침"이라 접어둔 사용자에게 패널이 번쩍인다(ui-prefs 주석 참조).

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getStaffSession } from "@/lib/auth";
import { HubClient } from "@/components/exam-report/hub/hub-client";
import {
  INTAKE_COLLAPSED_COOKIE,
  parseIntakeCollapsed,
} from "@/lib/exam-report/ui-prefs";

export default async function ExamReportHubPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const jar = await cookies();
  const initialIntakeCollapsed = parseIntakeCollapsed(
    jar.get(INTAKE_COLLAPSED_COOKIE)?.value,
  );

  return <HubClient initialIntakeCollapsed={initialIntakeCollapsed} />;
}
